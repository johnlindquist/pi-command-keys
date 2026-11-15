/**
 * pi-command-keys: press a key, run a slash command.
 * This file talks to Pi and to the settings files; the rules live in keys.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, getKeybindings, type KeyId, stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	type Binding, commandKind, commandName, defaultLayer, findClashes, INSTALL_LINES, keyLabel, keysCompletions, keysHelp,
	keysHint, KEYS_USAGE, type Layer, mergeLayers, missingMessage, normalizeCommand, normalizeKey, readEnvironmentText,
	readSettingsText, setInSettingsText, type Settings, unsetInSettingsText,
} from "./keys.ts";

/** The user's settings file: `PI_COMMAND_KEYS_CONFIG`, or ~/.config/pi-command-keys/config.json. */
export const userFile = (env: NodeJS.ProcessEnv = process.env): string =>
	env.PI_COMMAND_KEYS_CONFIG || join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "pi-command-keys", "config.json");
/** The project's settings file. */
export const projectFile = (cwd: string): string => join(cwd, ".pi", "command-keys.json");

const readText = (path: string): string | undefined => {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
};

function readFileLayer(source: "user file" | "project file", path: string): Layer {
	try {
		return readSettingsText(source, path, readText(path));
	} catch (error) {
		return { source, place: path, keys: {}, problems: [`${path}: could not be read (${error instanceof Error ? error.message : String(error)}). It was ignored.`] };
	}
}

/** defaults < user file < project file < PI_COMMAND_KEYS. */
export function loadSettings(cwd: string, env: NodeJS.ProcessEnv = process.env): Settings {
	return mergeLayers([defaultLayer(), readFileLayer("user file", userFile(env)), readFileLayer("project file", projectFile(cwd)), readEnvironmentText(env.PI_COMMAND_KEYS)]);
}

export default function commandKeysExtension(pi: ExtensionAPI): void {
	/** The keys Pi was given when this extension loaded. Pi reads shortcuts once per load, so a new key needs /reload. */
	const loaded = loadSettings(process.cwd());
	const registered = new Set<string>();
	let current = loaded;

	const installedCommands = (): string[] => pi.getCommands().map(command => command.name);

	const press = (key: string, ctx: ExtensionContext): void => {
		// Read again on every press: a changed command for a key Pi already knows works at once.
		current = loadSettings(ctx.cwd);
		const binding = current.bindings.find(item => item.key === key);
		if (!binding) {
			ctx.ui.notify(`${keyLabel(key)} is not set to a command any more. Run /reload to free the key, or /keys set ${key} <command>.`, "warning");
			return;
		}
		const kind = commandKind(binding.command, installedCommands());
		if (kind === "missing") {
			ctx.ui.notify(missingMessage(binding), "warning");
			return;
		}
		if (kind === "pi") {
			// Pi runs its own commands only from the input box, so the key fills the box.
			if (ctx.ui.getEditorText().trim()) ctx.ui.notify(`${keyLabel(key)} is set to ${binding.command}, one of Pi's own commands. Clear the input and press the key again, then Enter.`, "info");
			else {
				ctx.ui.setEditorText(binding.command);
				ctx.ui.notify(`${keyLabel(key)}: ${binding.command} is one of Pi's own commands. Press Enter to run it.`, "info");
			}
			return;
		}
		pi.sendUserMessage(binding.command, ctx.isIdle() ? { expandPromptTemplates: true } : { expandPromptTemplates: true, deliverAs: "followUp" });
	};

	for (const binding of loaded.bindings) {
		registered.add(binding.key);
		pi.registerShortcut(binding.key as KeyId, {
			description: `${binding.command} (pi-command-keys, ${binding.source})`,
			handler: ctx => press(binding.key, ctx),
		});
	}

	const piKeys = (): Record<string, string | readonly string[] | undefined> => {
		// Pi's keys as they are now, with the person's keybindings.json applied.
		try {
			const manager = getKeybindings() as ReturnType<typeof getKeybindings> & { getEffectiveConfig?: () => Record<string, string | string[] | undefined> };
			return manager.getEffectiveConfig?.() ?? manager.getResolvedBindings();
		} catch {
			return {};
		}
	};

	const stateOf = (binding: Binding): string => {
		const notes: string[] = [];
		const kind = commandKind(binding.command, installedCommands());
		if (kind === "missing") notes.push(`/${commandName(binding.command)} is not installed`);
		if (kind === "pi") notes.push("Pi's own command: the key fills it in, Enter runs it");
		if (!registered.has(binding.key)) notes.push("works after /reload");
		const clash = findClashes([binding], piKeys())[0];
		if (clash) notes.push(clash.piKeepsKey ? `Pi keeps this key for ${clash.action}` : `taken from Pi's ${clash.action}`);
		return notes.length ? ` · ${notes.join(" · ")}` : "";
	};

	const list = (cwd: string): string => {
		current = loadSettings(cwd);
		const width = Math.max(0, ...current.bindings.map(binding => keyLabel(binding.key).length + binding.key.length + 3));
		const rows = current.bindings.map(binding => `${`${keyLabel(binding.key)} (${binding.key})`.padEnd(width)}  →  ${binding.command}   [${binding.source}]${stateOf(binding)}`);
		const gone = [...registered].filter(key => !current.bindings.some(binding => binding.key === key)).map(key => `${keyLabel(key)} (${key}) was removed · free again after /reload`);
		return [
			"Keyboard shortcuts for slash commands",
			"",
			...(rows.length ? rows : ["No keys are set. Try: /keys set alt+1 /split"]),
			...gone,
			...(current.problems.length ? ["", "Problems in the settings (the rest is still used):", ...current.problems.map(problem => `- ${problem}`)] : []),
			"",
			"Change: /keys set <key> <command> · /keys unset <key> · Check: /keys check · All of Pi's shortcuts: /hotkeys",
		].join("\n");
	};

	const paths = (cwd: string): string => [
		`User file:    ${userFile()}${existsSync(userFile()) ? "" : " (not created yet)"}${process.env.PI_COMMAND_KEYS_CONFIG ? " (from PI_COMMAND_KEYS_CONFIG)" : ""}`,
		`Project file: ${projectFile(cwd)}${existsSync(projectFile(cwd)) ? "" : " (not created yet)"}`,
		`Environment:  PI_COMMAND_KEYS${process.env.PI_COMMAND_KEYS ? `=${process.env.PI_COMMAND_KEYS}` : " (not set), e.g. PI_COMMAND_KEYS='alt+1=/split;alt+3=/agent'"}`,
		"Order: defaults < user file < project file < environment.",
	].join("\n");

	const check = (cwd: string): string => {
		current = loadSettings(cwd);
		const lines: string[] = [];
		for (const clash of findClashes(current.bindings, piKeys())) {
			lines.push(clash.piKeepsKey
				? `✗ ${keyLabel(clash.key)} (${clash.key}) → ${clash.command}: Pi keeps this key for ${clash.action}, so the binding is skipped. Pick another key.`
				: `! ${keyLabel(clash.key)} (${clash.key}) → ${clash.command}: Pi uses this key for ${clash.action}. The binding wins and Pi's action loses the key.`);
		}
		const installed = installedCommands();
		for (const binding of current.bindings) {
			const kind = commandKind(binding.command, installed);
			const name = commandName(binding.command);
			if (kind === "missing") lines.push(`✗ ${keyLabel(binding.key)} (${binding.key}) → ${binding.command}: /${name} is not installed.${INSTALL_LINES[name] ? ` Install: ${INSTALL_LINES[name]}` : ""}`);
			if (kind === "pi") lines.push(`! ${keyLabel(binding.key)} (${binding.key}) → ${binding.command}: one of Pi's own commands. The key fills it into the input; press Enter to run it.`);
			if (!registered.has(binding.key)) lines.push(`! ${keyLabel(binding.key)} (${binding.key}) → ${binding.command}: not active yet. Run /reload.`);
		}
		lines.push(...current.problems.map(problem => `✗ ${problem}`));
		const good = current.bindings.length - new Set(lines.map(line => /\((\S+)\) →/.exec(line)?.[1]).filter(Boolean)).size;
		return [
			`Checked ${current.bindings.length} key${current.bindings.length === 1 ? "" : "s"}: ${good} fine, ${lines.length} finding${lines.length === 1 ? "" : "s"}.`,
			...lines,
			"",
			"Not checked: keys bound by other extensions. Pi warns about those under [Extension issues] when it starts, and /hotkeys lists every extension shortcut.",
			"Not checked: whether your terminal sends the key. If Option+1 types ¡, set Option to act as Alt/Meta in the terminal.",
		].join("\n");
	};

	const change = (args: string[], cwd: string, unset: boolean): { text: string; level: "info" | "error" } => {
		const toProject = args.includes("--project");
		const words = args.filter(word => word !== "--project");
		const usage = unset ? "Usage: /keys unset <key> [--project]" : "Usage: /keys set <key> <command> [--project], e.g. /keys set alt+3 /agent";
		if (!words[0] || (!unset && !words[1])) return { text: usage, level: "error" };
		const key = normalizeKey(words[0]);
		if (!key.ok) return { text: `${key.error}\n${usage}`, level: "error" };
		const command = unset ? undefined : normalizeCommand(words.slice(1).join(" "));
		if (command && !command.ok) return { text: `${command.error}\n${usage}`, level: "error" };
		const path = toProject ? projectFile(cwd) : userFile();
		const before = loadSettings(cwd);
		const lower = mergeLayers([defaultLayer(), ...(toProject ? [readFileLayer("user file", userFile())] : [])]);
		try {
			const text = readText(path);
			const next = command?.ok ? setInSettingsText(text, key.key, command.command) : unsetInSettingsText(text, key.key, lower.bindings.some(binding => binding.key === key.key));
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, next);
		} catch (error) {
			return { text: `Nothing was changed: ${path} could not be updated (${error instanceof Error ? error.message : String(error)}). Fix or remove the file and try again.`, level: "error" };
		}
		current = loadSettings(cwd);
		const now = current.bindings.find(binding => binding.key === key.key);
		const label = `${keyLabel(key.key)} (${key.key})`;
		const lines: string[] = [];
		if (command?.ok) {
			lines.push(`Saved: ${label} → ${command.command} in ${path}`);
			if (now && now.command !== command.command) lines.push(`But the ${now.source} sets ${label} → ${now.command}, and it wins.`);
			else if (registered.has(key.key)) lines.push("Pi already knows this key, so it works now.");
			else lines.push("Run /reload to make the key work: Pi reads shortcuts only when it loads extensions.");
			const kind = commandKind(command.command, installedCommands());
			if (kind === "missing") lines.push(`Note: /${commandName(command.command)} is not installed, so the key will say so when pressed.`);
			if (kind === "pi") lines.push(`Note: ${command.command} is one of Pi's own commands. The key fills it into the input; press Enter to run it.`);
			const clash = findClashes([{ key: key.key, command: command.command, source: "user file" }], piKeys())[0];
			if (clash) lines.push(clash.piKeepsKey ? `Clash: Pi keeps ${label} for ${clash.action}, so this binding will be skipped. Pick another key.` : `Clash: Pi uses ${label} for ${clash.action}. This binding takes the key from it.`);
		} else {
			const was = before.bindings.find(binding => binding.key === key.key);
			if (!was) lines.push(`${label} was not set. Nothing to remove.`);
			else if (now) lines.push(`Removed from ${path}, but the ${now.source} still sets ${label} → ${now.command}.`);
			else lines.push(`Removed: ${label} (was ${was.command}) in ${path}`, "The key does nothing from now on. Run /reload to hand it back to Pi and take it out of /hotkeys.");
		}
		return { text: lines.join("\n"), level: "info" };
	};

	pi.registerCommand("keys", {
		description: `Keyboard shortcuts for slash commands: ${KEYS_USAGE}`,
		getArgumentCompletions: prefix => keysCompletions(prefix, current.bindings),
		handler: async (rawArgs, ctx) => {
			const args = rawArgs.trim().split(/\s+/).filter(Boolean);
			const [verb, ...rest] = args;
			if (!verb || verb === "list") ctx.ui.notify(list(ctx.cwd), "info");
			else if (verb === "--help" || verb === "-h" || verb === "help") ctx.ui.notify(keysHelp(), "info");
			else if (verb === "check") ctx.ui.notify(check(ctx.cwd), "info");
			else if (verb === "path") ctx.ui.notify(paths(ctx.cwd), "info");
			else if (verb === "set" || verb === "unset") {
				const result = change(rest, ctx.cwd, verb === "unset");
				ctx.ui.notify(result.text, result.level);
			} else ctx.ui.notify(`/keys does not know "${verb}".\n${KEYS_USAGE}`, "error");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (loaded.problems.length && ctx.hasUI) ctx.ui.notify(`pi-command-keys settings:\n${loaded.problems.map(problem => `- ${problem}`).join("\n")}\nThe rest is still used. See /keys.`, "warning");
		installKeysGuidance(ctx, () => current.bindings);
	});
}

/** Examples on Tab and dim hint text after the cursor while `/keys …` is typed. */
function installKeysGuidance(ctx: ExtensionContext, bindings: () => readonly Binding[]): void {
	if (ctx.mode !== "tui") return;
	// Pi's own argument completions handle typing; an explicit Tab would otherwise ask for file paths.
	ctx.ui.addAutocompleteProvider(inner => ({
		triggerCharacters: inner.triggerCharacters,
		getSuggestions(lines, line, col, options) {
			const before = (lines[line] ?? "").slice(0, col);
			if (options.force && line === 0 && lines.length === 1 && before.startsWith("/keys ") && before === lines[0]) {
				const prefix = before.slice(6);
				const items = keysCompletions(prefix, bindings());
				if (items) return Promise.resolve({ prefix, items });
			}
			return inner.getSuggestions(lines, line, col, options);
		},
		shouldTriggerFileCompletion: (lines, line, col) => (line === 0 && lines.length === 1 && lines[0].slice(0, col).startsWith("/keys ")) || (inner.shouldTriggerFileCompletion?.(lines, line, col) ?? true),
		applyCompletion: (lines, line, col, item, prefix) => inner.applyCompletion(lines, line, col, item, prefix),
	}));

	// Pi has no per-command hint, so the hint is drawn into the blank space after the cursor.
	// The editor another extension installed (for example /split's) is kept and wrapped.
	const prior = ctx.ui.getEditorComponent();
	ctx.ui.setEditorComponent((tui, theme, keys) => {
		const editor = prior?.(tui, theme, keys) ?? new CustomEditor(tui, theme, keys, { embedWorkingStatus: true });
		const render = editor.render.bind(editor);
		editor.render = width => {
			const rows = render(width);
			const hint = keysHint(editor.getText());
			if (!hint) return rows;
			const i = rows.findIndex(row => row.includes(CURSOR_MARKER));
			if (i < 0) return rows;
			const row = rows[i];
			const tail = row.slice(row.indexOf(CURSOR_MARKER) + CURSOR_MARKER.length);
			if (stripTerminalSequences(tail).trim()) return rows; // the cursor is before typed text
			const base = row.trimEnd();
			const room = Math.min(width - visibleWidth(base), row.length - base.length);
			if (room < 4) return rows;
			const suffix = truncateToWidth(hint, room);
			rows[i] = base + ctx.ui.theme.fg("dim", suffix) + " ".repeat(room - visibleWidth(suffix));
			return rows;
		};
		return editor;
	});
}
