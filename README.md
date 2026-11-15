# Pi Command Keys

Press a key, run a slash command. This [Pi](https://pi.dev/) extension binds **Option+1** to `/split` and **Option+2** to `/lab`, and gives you `/keys` to bind any other key to any other command.

This is the small example for the keyboard-shortcut tip in MEGA.dev Week 4, Day 2. The lesson asks you to have your own agent assign the shortcuts in your own harness; this repository is a finished Pi version to compare with.

## Requirements

| You need | Why | Without it |
|---|---|---|
| [Pi](https://github.com/earendil-works/pi) 1.4 or newer (checked on 1.5.0) | This is a Pi extension | It cannot be installed |
| A terminal that sends Option as Alt | Pi only sees Option+1 when the terminal sends it as Alt+1 | Option+1 types `¡` into the input. See [Troubleshooting](#troubleshooting) |
| The commands you bind | The defaults run `/split` ([herdr-pi-split](https://github.com/johnlindquist/herdr-pi-split)) and `/lab` ([herdr-pi-lab](https://github.com/johnlindquist/herdr-pi-lab)) | The key says the command is not installed and shows the install line. Nothing else happens |
| `git` | `pi install` clones this repository | The install fails |

It calls no model and costs nothing to run. Checked on macOS only.

## Install

```sh
pi install git:github.com/johnlindquist/pi-command-keys
```

Then run `/reload` in Pi, or start Pi again. The install has no dependencies to download.

- Update: `pi update --extensions`
- Try once without installing: `pi -e git:github.com/johnlindquist/pi-command-keys`
- Remove: `pi remove git:github.com/johnlindquist/pi-command-keys`

## Walkthrough, in the video's order

1. **Ask your agent for it.** This is the lesson's own route, and it works without this repository. Start an agent inside your harness repository and say:

   > Please assign the Option 1 keyboard shortcut to /split and Option 2 to /lab.

   With this extension installed, the same thing is one line each: `/keys set alt+1 /split` and `/keys set alt+2 /lab`. Those two are already the defaults.
2. **Run `/hotkeys`.** Pi lists every shortcut that is already bound. At the bottom, under **Extensions**, are yours:

   ```
   Extensions
   │ Option+1 │ /split (pi-command-keys, default) │
   │ Option+2 │ /lab (pi-command-keys, default)   │
   ```

   Browse the list for what is taken, or ask your agent to suggest a key that is free.
3. **Press Option+1.** `/split` runs, exactly as if you had typed it and pressed Enter. If `/split` is not installed you read this instead:

   ```
   Option+1 is set to /split, but /split is not installed. Install it with: pi install
   git:github.com/johnlindquist/herdr-pi-split  then run /reload. To use the key for something else: /keys set alt+1 <command>
   ```

4. **Organize it your way.** `/keys set alt+3 /agent`, then `/reload`. Option+3 now runs `/agent`.

The next step in the lesson, a command bar, is your own challenge and is not part of this repository.

## The `/keys` command

| Type | What happens |
|---|---|
| `/keys` | Lists each key, its command, and where the binding came from: `default`, `user file`, `project file` or `environment` |
| `/keys set alt+3 /agent` | Binds Option+3 to `/agent` in your user file. The command can have arguments: `/keys set alt+3 /split "Tests"` |
| `/keys set alt+3 /agent --project` | Saves it in this project's `.pi/command-keys.json` instead |
| `/keys unset alt+2` | Removes a binding. For a default, this writes `"alt+2": null` so the default stays off |
| `/keys check` | Reports keys that Pi already uses and commands that are not installed |
| `/keys path` | Shows the settings files and the environment variable |
| `/keys --help` | Prints the guide |

Option is written `alt`, the name Pi uses. `option+1`, `opt+1` and `⌥1` are accepted and saved as `alt+1`. A key needs `ctrl`, `alt` or `super` (Command), or is a function key, so it cannot take a key you type with.

**When a change takes effect.** Pi reads extension shortcuts once, when it loads extensions. So:

- A **new key** works after `/reload`. `/keys set` tells you so.
- A **different command for a key that is already bound** works at once, with no reload.
- A **removed key** stops running its command at once, and goes back to Pi after `/reload`.

**Hints as you type.** Type `/keys` and dim text after the cursor shows what can follow: `[set <key> <command> | unset <key> | check] · Space: examples · Enter: list the keys`. Type a space for a menu of examples; **↑/↓** moves and **Tab** inserts one so you can edit it. The dim text is never part of the command.

**Pi's own commands.** A key bound to a command that Pi itself provides, such as `/model`, `/tree` or `/hotkeys`, puts the command in the input and you press Enter. Pi runs its own commands only from the input, not from an extension. Commands from extensions, prompt templates and skills run straight away. If the agent is working when you press the key, the command is queued as a follow-up.

### What `/keys check` reports

```
Checked 6 keys: 2 fine, 5 findings.
✗ Ctrl+L (ctrl+l) → /split: Pi keeps this key for app.model.select, so the binding is skipped. Pick another key.
! Option+Y (alt+y) → /lab: Pi uses this key for tui.editor.yankPop. The binding wins and Pi's action loses the key.
✗ Option+2 (alt+2) → /lab: /lab is not installed. Install: pi install git:github.com/johnlindquist/herdr-pi-lab
✗ Option+Y (alt+y) → /lab: /lab is not installed. Install: pi install git:github.com/johnlindquist/herdr-pi-lab
! Option+4 (alt+4) → /hotkeys: one of Pi's own commands. The key fills it into the input; press Enter to run it.
```

- **✗ Pi keeps this key.** Pi protects a short list of its keys (Escape, Ctrl+C, Ctrl+D, Ctrl+L, Ctrl+O, Ctrl+P, Enter and a few more) and skips an extension that asks for one.
- **! Pi uses this key.** For any other key of Pi's, the extension wins and Pi's own action stops working. Pick another key unless you mean it.
- **Another extension's key.** Pi gives extensions no way to see each other's shortcuts, so `/keys check` cannot report these. Pi does: when two extensions ask for one key it prints a warning under **[Extension issues]** at startup and after `/reload`, and the extension loaded last gets the key. `/hotkeys` lists them all.

## Settings

One setting, `keys`: a map from a key to the command line it runs, or to `null` to turn off a key that a weaker layer binds.

| Where | Path | Changed by |
|---|---|---|
| Defaults | built in: `alt+1` → `/split`, `alt+2` → `/lab` | |
| User file | `~/.config/pi-command-keys/config.json`, or the path in `PI_COMMAND_KEYS_CONFIG` | `/keys set` |
| Project file | `<project>/.pi/command-keys.json` | `/keys set … --project` |
| Environment | `PI_COMMAND_KEYS='alt+1=/split;alt+3=/agent'`, or the same JSON as `keys` | your shell |

Each one overrides the ones above it: defaults < user file < project file < environment.

```json
{
  "keys": {
    "alt+1": "/split",
    "alt+3": "/agent",
    "ctrl+shift+k": "/split \"Tests\"",
    "alt+2": null
  }
}
```

A file that is not valid JSON, an unknown setting, a key Pi does not know and a command that is not text are each reported by name, at startup and in `/keys`. The rest of the settings, and the defaults, are still used.

## Troubleshooting

- **Option+1 types `¡` and nothing runs.** Your terminal is sending the character macOS gives Option+1, not Alt+1. Pi runs the binding only when it receives Escape followed by `1`, or the extended form `CSI 49;3u`; a plain `¡` is text. Tell the terminal that Option is Alt:
  - **Ghostty:** `macos-option-as-alt = true` in its config. Ghostty's own documentation says the default is already on for the U.S. Standard and U.S. International layouts, and off for other layouts.
  - **Herdr:** `option_as_alt` in Herdr's `settings.json` (`"auto"`, `"on"`, `"off"`, `"left"`, `"right"`), also under Settings > Keyboard. `"auto"` sends Option as Alt on US layouts.
  - **Terminal.app and iTerm2** each have their own setting for this (Terminal: "Use Option as Meta key" under Profiles > Keyboard; iTerm2: the Option key set to "Esc+" under Profiles > Keys). These two were not checked for this repository.
  - Or bind a key without Option: `/keys set ctrl+shift+1 /split`, or a function key, `/keys set f5 /split`.
- **You need Option to type characters** (`@`, `[`, `€` on many keyboards). Make only one Option key act as Alt (Ghostty and Herdr both take `left` or `right`), or use a key without Option.
- **The key does nothing and types nothing.** The workspace or terminal took it before Pi saw it. For example, Herdr's default keys on Windows and Linux use Alt+1 to Alt+9 to select a space. Free the key there, or pick another one here.
- **A key you just set does nothing.** Run `/reload`. `/keys` marks such a key "works after /reload".
- **"… is not installed."** Install the extension that provides the command (the message names the line for `/split`, `/lab` and `/agent`), then `/reload`.
- **Inside tmux**, Pi warns when `extended-keys` is off. Option+digit still arrives as Escape followed by the digit and works; the warning is about keys such as Shift+Enter.
- **`/keys` is not in the menu after install.** Run `/reload`. `pi list` should show this repository.

## How it is built

| File | What it holds |
|---|---|
| `index.ts` | The extension. Reads the settings files, registers one shortcut per binding (`pi.registerShortcut`), runs the command when the key is pressed (`pi.sendUserMessage(command, { expandPromptTemplates: true })`), and registers `/keys` with its hints. |
| `keys.ts` | The rules, with no file or Pi access: reading a key name, merging the settings layers, finding clashes, and every sentence the extension says. |
| `test/keys.test.ts` | Tests for the rules. |

How one key press runs:

1. **Load.** When Pi loads extensions, the settings are merged and each key is handed to Pi with a description. That description is what `/hotkeys` shows.
2. **Press.** Pi calls the shortcut's handler. It reads the settings again, so an edited command is used at once.
3. **Look up.** `pi.getCommands()` lists the commands that extensions, prompt templates and skills provide. If the command is not there, the handler says so and stops.
4. **Run.** The command line is sent as if typed. Pi finds the command and runs it; no message goes to the model unless the command itself sends one.

## Build the same thing for another harness or workspace

The tip is one sentence to your agent, in your harness repository:

> Please assign the Option 1 keyboard shortcut to /split or Option 2 to /lab.

It needs one of two things: a harness that lets a key run a command, or a workspace that can type the command for you.

- **Pi without this extension.** `pi.registerShortcut("alt+1", { description, handler })` in any extension, and `pi.sendUserMessage("/split", { expandPromptTemplates: true })` in the handler. See Pi's [extension docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) and [keybindings reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/keybindings.md).
- **Claude Code.** Run `/keybindings` to open `~/.claude/keybindings.json`. A `command:<name>` action runs `/<name>`, and changes apply without a restart ([docs](https://code.claude.com/docs/en/keybindings)):

  ```json
  { "bindings": [ { "context": "Chat", "bindings": { "meta+1": "command:split" } } ] }
  ```

- **tmux.** Let tmux type it. `-n` binds a key without the prefix, and `send-keys` types into the current pane ([manual](https://man7.org/linux/man-pages/man1/tmux.1.html)). This works for any harness, and types into whatever program the pane is running:

  ```
  bind-key -n M-1 send-keys "/split" Enter
  ```

- **Herdr.** A `send:<text>` action in `keys.json` types into the focused terminal; the format is described in the keys section of Herdr's mod guide (`defaults/AGENTS.md` in [herdr-app](https://github.com/herdrdev/herdr-app)):

  ```json
  { "terminal": { "alt-1": "send:/split\r" } }
  ```

A key the workspace types for you does not know whether the command exists, and it types into any program. A key the harness owns, like this extension's, can check first and say what is missing.

## Tested

What was checked for 0.1.0, on 2026-11-15, macOS, Pi 1.5.0:

- **Unit tests and type check** from a clean clone: `bun install`, `bun test` (17 tests), `bunx tsc --noEmit`.
- **A clean install in a separate Pi.** Pi was given its own empty settings folder and its own config folder, and this repository was installed from a local clone with `pi install <folder>`. Pi ran inside tmux, and keys were sent with `tmux send-keys`, which sends Option+1 as Escape followed by `1`.
  - `/hotkeys` listed `Option+1 │ /split (pi-command-keys, default)` and `Option+2 │ /lab (pi-command-keys, default)` under Extensions.
  - **Option+1 with `/split` not installed** showed the "is not installed" message above, with the install line. The same message came back for the extended form `CSI 49;3u`. A plain `¡` was typed into the input as text.
  - **Option+1 with a stand-in `/split` installed** (a three-line extension that prints a line) ran it: the pane showed `STAND-IN /split ran`.
  - `/keys set option+3 /split From-a-key` saved `alt+3` and said to run `/reload`. Before the reload Option+3 did nothing; after `/reload` it showed `STAND-IN /split ran with: From-a-key`.
  - `/keys set alt+1 /split Live-change` on the already-bound key worked at once, with no reload.
  - **A deliberate clash:** after `/keys set ctrl+l /split` and `/keys set alt+y /lab`, `/keys check` printed the report shown above, and Pi itself printed `Extension shortcut 'ctrl+l' … conflicts with built-in shortcut. Skipping.` under [Extension issues].
  - A key set to `/hotkeys` filled the input with `/hotkeys` and said to press Enter.
  - `/keys unset alt+2` wrote `"alt+2": null`; Option+2 then said it is not set to a command any more.
  - A project file, `PI_COMMAND_KEYS`, a broken user file and an unknown setting each showed up in `/keys` with the right source or a named problem, and the other keys kept working.
- **Not checked:** a real key press in Ghostty, Herdr, iTerm2 or Terminal.app (the keys were sent by tmux); the real `/split` and `/lab` (a stand-in was used); pressing a key while the agent is working (no model was signed in); Windows and Linux; the Claude Code, tmux `bind-key` and Herdr lines above, which are taken from each tool's documentation.

```sh
bun install
bun test
```

## License

[MIT](LICENSE)
