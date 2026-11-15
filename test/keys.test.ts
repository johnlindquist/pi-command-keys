import { expect, test } from "bun:test";
import {
	commandKind, DEFAULT_KEYS, defaultLayer, findClashes, keyLabel, keysCompletions, keysHelp, keysHint, mergeLayers, missingMessage,
	normalizeCommand, normalizeKey, readEnvironmentText, readSettingsText, setInSettingsText, unsetInSettingsText,
} from "../keys.ts";

const key = (text: string) => { const r = normalizeKey(text); return r.ok ? r.key : `error: ${r.error}`; };

test("the defaults are the video's: Option+1 → /split, Option+2 → /lab", () => {
	expect(DEFAULT_KEYS).toEqual({ "alt+1": "/split", "alt+2": "/lab" });
	expect(mergeLayers([defaultLayer()]).bindings).toEqual([
		{ key: "alt+1", command: "/split", source: "default" },
		{ key: "alt+2", command: "/lab", source: "default" },
	]);
});

test("a key is read the way people write it and comes out in Pi's spelling", () => {
	for (const text of ["alt+1", "Option+1", "opt+1", "option-1", "⌥1", "⌥+1", "Meta+1", " ALT+1 "]) expect(key(text)).toBe("alt+1");
	expect(key("shift+ctrl+P")).toBe("ctrl+shift+p");
	expect(key("alt+ctrl+x")).toBe("ctrl+alt+x");
	expect(key("cmd+k")).toBe("super+k");
	expect(key("ctrl+-")).toBe("ctrl+-");
	expect(key("alt+PageUp")).toBe("alt+pageUp");
	expect(key("f5")).toBe("f5");
	expect(key("alt+return")).toBe("alt+enter");
});

test("a key you type with, or one Pi does not know, is refused with an example", () => {
	expect(key("1")).toContain("would take a key you type with");
	expect(key("shift+a")).toContain("would take a key you type with");
	expect(key("alt+banana")).toContain("is not a key Pi knows");
	expect(key("")).toContain("No key given");
	expect(key("alt+")).toContain("is not a key Pi knows");
});

test("key labels say Option on a Mac and Alt elsewhere", () => {
	expect(keyLabel("alt+1", "darwin")).toBe("Option+1");
	expect(keyLabel("alt+1", "linux")).toBe("Alt+1");
	expect(keyLabel("ctrl+shift+k", "darwin")).toBe("Ctrl+Shift+K");
	expect(keyLabel("super+pageUp", "darwin")).toBe("Command+PageUp");
});

test("a command is one line and gets its slash", () => {
	expect(normalizeCommand("split")).toEqual({ ok: true, command: "/split" });
	expect(normalizeCommand(' /split "Tests" ')).toEqual({ ok: true, command: '/split "Tests"' });
	expect(normalizeCommand("").ok).toBe(false);
	expect(normalizeCommand("/").ok).toBe(false);
	expect(normalizeCommand("/a\n/b").ok).toBe(false);
});

test("order of precedence: defaults < user file < project file < environment", () => {
	const user = readSettingsText("user file", "user.json", '{"keys": {"option+1": "/agent", "alt+3": "/user"}}');
	const project = readSettingsText("project file", "project.json", '{"keys": {"alt+3": "/project", "alt+4": "/four"}}');
	const env = readEnvironmentText("alt+4=/env");
	// The order the layers are passed in does not matter.
	const { bindings, problems } = mergeLayers([env, project, defaultLayer(), user]);
	expect(problems).toEqual([]);
	expect(Object.fromEntries(bindings.map(b => [b.key, `${b.command} from ${b.source}`]))).toEqual({
		"alt+1": "/agent from user file",
		"alt+2": "/lab from default",
		"alt+3": "/project from project file",
		"alt+4": "/env from environment",
	});
});

test("null turns off a key that a weaker layer binds", () => {
	const user = readSettingsText("user file", "user.json", '{"keys": {"alt+2": null}}');
	expect(mergeLayers([defaultLayer(), user]).bindings.map(b => b.key)).toEqual(["alt+1"]);
	expect(mergeLayers([defaultLayer(), readEnvironmentText("alt+1=")]).bindings.map(b => b.key)).toEqual(["alt+2"]);
});

test("an unknown setting is reported, and the rest of the file is still used", () => {
	const layer = readSettingsText("user file", "user.json", '{"model": "x", "keys": {"alt+3": "/agent", "q": "/quit", "alt+5": 7}}');
	expect(layer.keys).toEqual({ "alt+3": "/agent" });
	expect(layer.problems).toHaveLength(3);
	expect(layer.problems.join("\n")).toContain('unknown setting "model"');
	expect(layer.problems.join("\n")).toContain("would take a key you type with");
	expect(layer.problems.join("\n")).toContain("alt+5 must be text");
});

test("a broken file is a named problem and the defaults are still used", () => {
	const broken = readSettingsText("user file", "/home/me/config.json", "{ keys: ");
	expect(broken.problems[0]).toStartWith("/home/me/config.json: not valid JSON");
	const { bindings, problems } = mergeLayers([defaultLayer(), broken]);
	expect(bindings.map(b => b.command)).toEqual(["/split", "/lab"]);
	expect(problems).toHaveLength(1);
	expect(readSettingsText("user file", "x.json", "[]").problems[0]).toContain("must be an object");
	expect(readSettingsText("user file", "x.json", undefined)).toEqual({ source: "user file", place: "x.json", keys: {}, problems: [] });
});

test("the environment takes pairs or JSON", () => {
	expect(readEnvironmentText("alt+1=/split; opt+3=/agent now").keys).toEqual({ "alt+1": "/split", "alt+3": "/agent now" });
	expect(readEnvironmentText('{"alt+9": "/nine"}').keys).toEqual({ "alt+9": "/nine" });
	expect(readEnvironmentText("nonsense").problems[0]).toContain("must look like alt+1=/split");
	expect(readEnvironmentText("{oops").problems[0]).toContain("not valid JSON");
	expect(readEnvironmentText(undefined).keys).toEqual({});
});

test("set writes the file text, keeps other entries and replaces other spellings of the key", () => {
	expect(JSON.parse(setInSettingsText(undefined, "alt+3", "/agent"))).toEqual({ keys: { "alt+3": "/agent" } });
	const next = JSON.parse(setInSettingsText('{"$schema": "s", "keys": {"Option+3": "/old", "alt+4": "/four"}}', "alt+3", "/agent"));
	expect(next).toEqual({ $schema: "s", keys: { "alt+4": "/four", "alt+3": "/agent" } });
	expect(() => setInSettingsText("{ broken", "alt+3", "/agent")).toThrow();
	// What was written reads back as the same binding.
	expect(readSettingsText("user file", "f", setInSettingsText(undefined, "alt+3", "/agent")).keys).toEqual({ "alt+3": "/agent" });
});

test("unset removes the entry, or writes null when a weaker layer still binds the key", () => {
	expect(JSON.parse(unsetInSettingsText('{"keys": {"alt+3": "/agent"}}', "alt+3", false))).toEqual({ keys: {} });
	expect(JSON.parse(unsetInSettingsText(undefined, "alt+1", true))).toEqual({ keys: { "alt+1": null } });
});

test("clashes: Pi keeps a reserved key, and loses any other key to the binding", () => {
	const piKeys = { "app.model.select": "ctrl+l", "tui.editor.yankPop": "alt+y", "app.message.followUp": ["alt+enter"], "app.session.new": undefined, "app.model.cycleBackward": "shift+ctrl+p" };
	const bindings = [
		{ key: "ctrl+l", command: "/split", source: "user file" as const },
		{ key: "alt+y", command: "/lab", source: "user file" as const },
		{ key: "alt+enter", command: "/x", source: "user file" as const },
		{ key: "ctrl+shift+p", command: "/p", source: "user file" as const },
		{ key: "alt+1", command: "/split", source: "default" as const },
	];
	expect(findClashes(bindings, piKeys)).toEqual([
		{ key: "ctrl+l", command: "/split", action: "app.model.select", piKeepsKey: true },
		{ key: "alt+y", command: "/lab", action: "tui.editor.yankPop", piKeepsKey: false },
		{ key: "alt+enter", command: "/x", action: "app.message.followUp", piKeepsKey: true },
		{ key: "ctrl+shift+p", command: "/p", action: "app.model.cycleBackward", piKeepsKey: true },
	]);
	expect(findClashes(bindings, {})).toEqual([]);
});

test("a command is installed, one of Pi's own, or missing", () => {
	expect(commandKind("/split", ["split", "lab"])).toBe("installed");
	expect(commandKind('/split "Tests"', ["split"])).toBe("installed");
	expect(commandKind("/review", ["review:1", "review:2"])).toBe("installed");
	expect(commandKind("/skill:pdf", ["skill:pdf"])).toBe("installed");
	expect(commandKind("/model", [])).toBe("pi");
	expect(commandKind("/split", [])).toBe("missing");
});

test("pressing a key whose command is missing says so and names the install line", () => {
	const message = missingMessage({ key: "alt+1", command: "/split", source: "default" }, "darwin");
	expect(message).toBe("Option+1 is set to /split, but /split is not installed. Install it with: pi install git:github.com/johnlindquist/herdr-pi-split  then run /reload. To use the key for something else: /keys set alt+1 <command>");
	expect(missingMessage({ key: "alt+2", command: "/lab", source: "default" }, "darwin")).toContain("pi install git:github.com/johnlindquist/herdr-pi-lab");
	expect(missingMessage({ key: "alt+7", command: "/mine now", source: "user file" }, "linux")).toBe("Alt+7 is set to /mine now, but /mine is not installed. Install the extension that provides /mine, then run /reload. To use the key for something else: /keys set alt+7 <command>");
});

test("hints while typing /keys", () => {
	expect(keysHint("/keys")).toBe("[set <key> <command> | unset <key> | check] · Space: examples · Enter: list the keys");
	expect(keysHint("/keys ")).toContain("↑/↓ + Tab: insert example");
	expect(keysHint("/keys se")).toBeUndefined();
	expect(keysHint("/keys set ")).toBe("<key> <command>, e.g. alt+3 /agent (Option is written alt)");
	expect(keysHint("/keys set alt+3 ")).toBe("<command>, e.g. /agent");
	expect(keysHint("/keys set alt+3 /agent")).toContain("works after /reload");
	expect(keysHint("/keys unset ")).toBe("<key>, e.g. alt+2");
	expect(keysHint("/keys check")).toBeUndefined();
	expect(keysHint("/keys check ")).toBe("Find clashing keys and missing commands");
	expect(keysHint("/keysmith")).toBeUndefined();
	expect(keysHint("hello")).toBeUndefined();
});

test("examples after a space, the bound keys after unset, nothing once the command is finished", () => {
	expect(keysCompletions("")?.map(item => item.value)).toEqual(["", "set alt+3 /agent", "set alt+1 /split --project", "unset alt+2", "check", "path", "--help"]);
	expect(keysCompletions("ch")?.map(item => item.value)).toEqual(["check"]);
	expect(keysCompletions("check")).toBeNull();
	expect(keysCompletions("set alt+9 /mine")).toBeNull();
	const bindings = mergeLayers([defaultLayer()]).bindings;
	expect(keysCompletions("unset ", bindings)?.map(item => item.value)).toEqual(["unset alt+1", "unset alt+2"]);
	expect(keysCompletions("unset alt+1", bindings)).toBeNull();
	expect(keysHelp()).toStartWith("Keyboard shortcuts for slash commands");
	expect(keysHelp()).toContain("/keys check — find keys Pi already uses and commands that are not installed");
});
