/**
 * The rules of pi-command-keys, with no file, terminal or Pi access:
 * how a key name is read, how the settings layers merge, and what counts as a clash.
 */

/** Where a binding came from. The order is the order of precedence, weakest first. */
export const SOURCES = ["default", "user file", "project file", "environment"] as const;
export type Source = (typeof SOURCES)[number];

/** The bindings of the MEGA.dev Day 2 video. */
export const DEFAULT_KEYS: Readonly<Record<string, string>> = { "alt+1": "/split", "alt+2": "/lab" };

/** Commands this extension can name an install line for. */
export const INSTALL_LINES: Readonly<Record<string, string>> = {
	split: "pi install git:github.com/johnlindquist/herdr-pi-split",
	lab: "pi install git:github.com/johnlindquist/herdr-pi-lab",
	agent: "pi install git:github.com/johnlindquist/herdr-pi-role",
};

/** Pi's own commands. Pi runs these only when they are typed, so a key can only fill them in. */
export const PI_COMMANDS: readonly string[] = [
	"settings", "model", "thinking", "scoped-models", "login", "logout", "llama", "new", "resume", "name", "session",
	"tree", "fork", "clone", "compact", "import", "copy", "export", "share", "bug", "trust", "mcp", "reload",
	"hotkeys", "changelog", "quit",
];

/**
 * Pi's actions an extension may not take a key from: Pi skips the extension's shortcut.
 * Any other Pi action loses its key to the extension, with a warning at startup.
 */
export const RESERVED_ACTIONS: readonly string[] = [
	"app.interrupt", "app.clear", "app.exit", "app.suspend", "app.thinking.cycle", "app.model.cycleForward",
	"app.model.cycleBackward", "app.model.select", "app.tools.expand", "app.thinking.toggle", "app.editor.external",
	"app.message.copy", "app.message.followUp", "tui.input.submit", "tui.select.confirm", "tui.select.cancel",
	"tui.input.copy", "tui.editor.deleteToLineEnd",
];

const MODIFIERS = ["ctrl", "shift", "alt", "super"] as const;
type Modifier = (typeof MODIFIERS)[number];
const MODIFIER_WORDS: Readonly<Record<string, Modifier>> = {
	ctrl: "ctrl", control: "ctrl", "⌃": "ctrl",
	shift: "shift", "⇧": "shift",
	alt: "alt", option: "alt", opt: "alt", meta: "alt", "⌥": "alt",
	super: "super", cmd: "super", command: "super", win: "super", "⌘": "super",
};
const NAMED_KEYS: Readonly<Record<string, string>> = {
	escape: "escape", esc: "escape", enter: "enter", return: "enter", tab: "tab", space: "space",
	backspace: "backspace", delete: "delete", insert: "insert", clear: "clear", home: "home", end: "end",
	pageup: "pageUp", pagedown: "pageDown", up: "up", down: "down", left: "left", right: "right",
};
const SYMBOLS = "`-=[]\\;',./!@#$%^&*()_+|~{}:<>?";

export type KeyResult = { ok: true; key: string } | { ok: false; error: string };

/**
 * Reads a key the way a person writes it ("Option+1", "opt-1", "⌥1", "ctrl+shift+k")
 * and returns Pi's spelling ("alt+1", "ctrl+shift+k"). Modifiers come out in one fixed order,
 * so two spellings of the same key compare equal.
 */
export function normalizeKey(text: string): KeyResult {
	let rest = text.trim().toLowerCase();
	if (!rest) return { ok: false, error: "No key given. Write it like alt+1 (Option+1) or ctrl+shift+k." };
	const found = new Set<Modifier>();
	for (;;) {
		const symbol = MODIFIER_WORDS[rest[0]];
		if (symbol && rest.length > 1 && !/[a-z]/.test(rest[0])) {
			found.add(symbol);
			rest = rest.slice(1).replace(/^[+-]/, "");
			continue;
		}
		const match = /^([a-z]+)[+-](?=.)/.exec(rest);
		const word = match ? MODIFIER_WORDS[match[1]] : undefined;
		if (!match || !word) break;
		found.add(word);
		rest = rest.slice(match[0].length);
	}
	const base = NAMED_KEYS[rest] ?? (/^f([1-9]|1[0-2])$/.test(rest) || /^[a-z0-9]$/.test(rest) || (rest.length === 1 && SYMBOLS.includes(rest)) ? rest : undefined);
	if (!base) return { ok: false, error: `"${text.trim()}" is not a key Pi knows. Write it like alt+1 (Option+1), ctrl+shift+k or f5.` };
	const isFunctionKey = /^f\d+$/.test(base);
	if (!isFunctionKey && !found.has("ctrl") && !found.has("alt") && !found.has("super")) {
		return { ok: false, error: `"${text.trim()}" would take a key you type with. Add ctrl, alt (Option) or super (Command), for example alt+${base.length === 1 ? base : "1"}.` };
	}
	return { ok: true, key: [...MODIFIERS.filter(name => found.has(name)), base].join("+") };
}

/** "alt+1" → "Option+1" on a Mac, "Alt+1" elsewhere. */
export function keyLabel(key: string, platform: string = process.platform): string {
	const mac = platform === "darwin";
	const names: Record<string, string> = { ctrl: "Ctrl", shift: "Shift", alt: mac ? "Option" : "Alt", super: mac ? "Command" : "Super" };
	return key.split("+").map(part => names[part] ?? (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1))).join("+");
}

export type CommandResult = { ok: true; command: string } | { ok: false; error: string };

/** A command line is one line starting with a slash; the slash is added when it was left off. */
export function normalizeCommand(text: string): CommandResult {
	const line = text.trim();
	if (!line || line === "/") return { ok: false, error: "No command given. Write it like /split." };
	if (/[\r\n]/.test(line)) return { ok: false, error: "A command is one line." };
	const command = line.startsWith("/") ? line : `/${line}`;
	if (!/^\/[^\s/]+/.test(command)) return { ok: false, error: `"${line}" is not a command. Write it like /split.` };
	return { ok: true, command };
}

/** "/split "Tests"" → "split". */
export function commandName(command: string): string {
	return command.slice(1).split(/\s/, 1)[0];
}

/** One settings layer after reading: `null` turns a key off that a weaker layer binds. */
export interface Layer {
	source: Source;
	/** Where the layer lives, for messages: a file path or a variable name. */
	place?: string;
	keys: Record<string, string | null>;
	problems: string[];
}

function readKeysMap(source: Source, place: string | undefined, map: unknown): Layer {
	const layer: Layer = { source, place, keys: {}, problems: [] };
	const where = place ?? source;
	if (map === undefined) return layer;
	if (typeof map !== "object" || map === null || Array.isArray(map)) {
		layer.problems.push(`${where}: "keys" must be an object such as {"alt+1": "/split"}.`);
		return layer;
	}
	for (const [rawKey, rawCommand] of Object.entries(map)) {
		const key = normalizeKey(rawKey);
		if (!key.ok) { layer.problems.push(`${where}: ${key.error}`); continue; }
		if (rawCommand === null || rawCommand === false || rawCommand === "") { layer.keys[key.key] = null; continue; }
		if (typeof rawCommand !== "string") { layer.problems.push(`${where}: the command for ${rawKey} must be text such as "/split", or null to turn the key off.`); continue; }
		const command = normalizeCommand(rawCommand);
		if (!command.ok) { layer.problems.push(`${where}: ${rawKey}: ${command.error}`); continue; }
		layer.keys[key.key] = command.command;
	}
	return layer;
}

/** Reads a settings file's text. A missing file is an empty layer; a broken one is a named problem. */
export function readSettingsText(source: Source, place: string, text: string | undefined): Layer {
	if (text === undefined || !text.trim()) return { source, place, keys: {}, problems: [] };
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		return { source, place, keys: {}, problems: [`${place}: not valid JSON (${error instanceof Error ? error.message : String(error)}). It was ignored.`] };
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return { source, place, keys: {}, problems: [`${place}: must be an object such as {"keys": {"alt+1": "/split"}}. It was ignored.`] };
	}
	const layer = readKeysMap(source, place, (data as Record<string, unknown>).keys);
	for (const name of Object.keys(data)) {
		if (name !== "keys" && name !== "$schema") layer.problems.push(`${place}: unknown setting "${name}". The only setting is "keys".`);
	}
	return layer;
}

/** Reads `PI_COMMAND_KEYS`: `alt+1=/split;alt+3=/agent`, or the same JSON as the file's "keys". An empty command turns a key off. */
export function readEnvironmentText(text: string | undefined, place = "PI_COMMAND_KEYS"): Layer {
	if (!text?.trim()) return { source: "environment", place, keys: {}, problems: [] };
	if (text.trim().startsWith("{")) {
		try {
			return readKeysMap("environment", place, JSON.parse(text));
		} catch (error) {
			return { source: "environment", place, keys: {}, problems: [`${place}: not valid JSON (${error instanceof Error ? error.message : String(error)}). It was ignored.`] };
		}
	}
	const map: Record<string, string> = {};
	const problems: string[] = [];
	for (const pair of text.split(";").map(part => part.trim()).filter(Boolean)) {
		const at = pair.indexOf("=");
		if (at < 1) problems.push(`${place}: "${pair}" must look like alt+1=/split.`);
		else map[pair.slice(0, at)] = pair.slice(at + 1);
	}
	const layer = readKeysMap("environment", place, map);
	layer.problems.unshift(...problems);
	return layer;
}

export const defaultLayer = (): Layer => ({ source: "default", keys: { ...DEFAULT_KEYS }, problems: [] });

export interface Binding { key: string; command: string; source: Source }
export interface Settings { bindings: Binding[]; problems: string[] }

/** defaults < user file < project file < environment. A stronger layer replaces or turns off a key. */
export function mergeLayers(layers: readonly Layer[]): Settings {
	const ordered = [...layers].sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
	const byKey = new Map<string, Binding>();
	for (const layer of ordered) {
		for (const [key, command] of Object.entries(layer.keys)) {
			if (command === null) byKey.delete(key);
			else byKey.set(key, { key, command, source: layer.source });
		}
	}
	return { bindings: [...byKey.values()], problems: ordered.flatMap(layer => layer.problems) };
}

/** The new text of a settings file after `/keys set`. Other settings in the file are kept. */
export function setInSettingsText(text: string | undefined, key: string, command: string | null): string {
	let data: Record<string, unknown> = {};
	if (text?.trim()) {
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("the file must hold a JSON object");
		data = parsed as Record<string, unknown>;
	}
	const current = typeof data.keys === "object" && data.keys !== null && !Array.isArray(data.keys) ? data.keys as Record<string, unknown> : {};
	const keys: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(current)) {
		const normal = normalizeKey(name);
		if (!normal.ok || normal.key !== key) keys[name] = value; // drop other spellings of the same key
	}
	if (command !== undefined) keys[key] = command;
	return `${JSON.stringify({ ...data, keys }, null, 2)}\n`;
}

/** The new text after `/keys unset`: the entry goes, or becomes `null` when a weaker layer still binds the key. */
export function unsetInSettingsText(text: string | undefined, key: string, boundBelow: boolean): string {
	if (boundBelow) return setInSettingsText(text, key, null);
	const data = JSON.parse(setInSettingsText(text, key, null)) as { keys: Record<string, unknown> };
	delete data.keys[key];
	return `${JSON.stringify(data, null, 2)}\n`;
}

export interface Clash {
	key: string;
	command: string;
	/** Pi's action that has the key, such as "app.model.select". */
	action: string;
	/** true: Pi keeps the key and skips the binding. false: the binding takes the key from Pi. */
	piKeepsKey: boolean;
}

/** Bindings whose key one of Pi's own actions already has. `piKeys` is action → keys, as in Pi's keybindings.json. */
export function findClashes(bindings: readonly Binding[], piKeys: Readonly<Record<string, string | readonly string[] | undefined>>): Clash[] {
	const clashes: Clash[] = [];
	for (const binding of bindings) {
		const actions: string[] = [];
		for (const [action, keys] of Object.entries(piKeys)) {
			for (const piKey of keys === undefined ? [] : typeof keys === "string" ? [keys] : keys) {
				const normal = normalizeKey(piKey);
				if ((normal.ok ? normal.key : piKey.toLowerCase()) === binding.key) actions.push(action);
			}
		}
		if (!actions.length) continue;
		const reserved = actions.find(action => RESERVED_ACTIONS.includes(action));
		clashes.push({ key: binding.key, command: binding.command, action: reserved ?? actions[0], piKeepsKey: reserved !== undefined });
	}
	return clashes;
}

export type CommandKind = "installed" | "pi" | "missing";

/** Is the command one an extension, prompt or skill provides, one of Pi's own, or not there at all? */
export function commandKind(command: string, installed: readonly string[]): CommandKind {
	const name = commandName(command);
	if (installed.some(known => known === name || known.replace(/:\d+$/, "") === name)) return "installed";
	return PI_COMMANDS.includes(name) ? "pi" : "missing";
}

/** What the person reads when they press a key whose command is not there. */
export function missingMessage(binding: Binding, platform: string = process.platform): string {
	const name = commandName(binding.command);
	const install = INSTALL_LINES[name];
	const fix = install ? `Install it with: ${install}  then run /reload.` : `Install the extension that provides /${name}, then run /reload.`;
	return `${keyLabel(binding.key, platform)} is set to ${binding.command}, but /${name} is not installed. ${fix} To use the key for something else: /keys set ${binding.key} <command>`;
}

// ---------------------------------------------------------------------------------------------
// What `/keys` says while you type it.

export const KEYS_USAGE = "/keys [set <key> <command> [--project] | unset <key> [--project] | check | path | --help]";

export interface Example { value: string; label: string; description: string }

const examples: (Example & { guide: string })[] = [
	{ value: "", label: "/keys", description: "List the keys and where each came from", guide: "list the keys and where each came from" },
	{ value: "set alt+3 /agent", label: "/keys set alt+3 /agent", description: "Option+3 runs /agent", guide: "bind a key to a command (Option is written alt)" },
	{ value: "set alt+1 /split --project", label: "/keys set … --project", description: "Save in this project's .pi/command-keys.json", guide: "save it for this project only" },
	{ value: "unset alt+2", label: "/keys unset alt+2", description: "Option+2 does nothing again", guide: "remove a binding" },
	{ value: "check", label: "/keys check", description: "Find clashing keys and missing commands", guide: "find keys Pi already uses and commands that are not installed" },
	{ value: "path", label: "/keys path", description: "Show the settings files", guide: "show the settings files" },
	{ value: "--help", label: "/keys --help", description: "Show this guide", guide: "show this guide" },
];

export function keysHelp(): string {
	return [
		"Keyboard shortcuts for slash commands",
		"",
		...examples.map(item => `/keys${item.value ? ` ${item.value}` : ""} — ${item.guide}`),
		"",
		"A new key works after /reload. /hotkeys lists every shortcut Pi has, these included.",
		"Type a space after /keys for examples; use ↑/↓ and Tab to insert one and edit it.",
	].join("\n");
}

/** The examples menu after "/keys ". `null` means: nothing to offer, Enter runs what was typed. */
export function keysCompletions(prefix: string, bindings: readonly Binding[] = []): Example[] | null {
	if (!prefix.trim()) return examples;
	const unset = /^unset\s+(\S*)$/.exec(prefix);
	if (unset) {
		const items = bindings.filter(binding => binding.key.startsWith(unset[1].toLowerCase()) && binding.key !== unset[1].toLowerCase())
			.map(binding => ({ value: `unset ${binding.key}`, label: `unset ${binding.key}`, description: `${keyLabel(binding.key)} → ${binding.command}` }));
		return items.length ? items : null;
	}
	if (examples.some(item => item.value === prefix)) return null;
	const matches = examples.filter(item => item.value && item.value.toLowerCase().startsWith(prefix.toLowerCase()));
	return matches.length ? matches : null;
}

/** The dim text after the cursor while `/keys …` is being typed. */
export function keysHint(text: string): string | undefined {
	if (!/^\/keys(?: |$)/.test(text) || /[\r\n]/.test(text)) return undefined;
	const args = text.slice(5).trimStart();
	if (!args) return text === "/keys" ? "[set <key> <command> | unset <key> | check] · Space: examples · Enter: list the keys" : "set <key> <command> | unset <key> | check · ↑/↓ + Tab: insert example";
	const words = args.split(/\s+/);
	const typing = /\s$/.test(args) ? "" : words.pop() ?? "";
	const done = words.filter(Boolean);
	if (done.length === 0) return ["set", "unset", "check", "path", "--help"].some(word => word.startsWith(typing)) ? undefined : "set | unset | check | path | --help";
	if (done[0] === "set") {
		if (done.length === 1) return typing ? "<command>, e.g. /split" : "<key> <command>, e.g. alt+3 /agent (Option is written alt)";
		if (done.length === 2 && !typing) return "<command>, e.g. /agent";
		return "Enter: save · works after /reload · --project: this project only";
	}
	if (done[0] === "unset") return done.length === 1 && !typing ? "<key>, e.g. alt+2" : "Enter: remove · works after /reload";
	if (done[0] === "check") return "Find clashing keys and missing commands";
	if (done[0] === "path") return "Show the settings files";
	return undefined;
}
