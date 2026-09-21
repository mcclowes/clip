---
sidebar_position: 5
title: Project commands
description: The commands file, a Markdown runbook that tells people and agents what a project's commands do.
---

# Project commands

A repository's scripts are invisible to an agent unless it knows to look, and the manifests that exist say what runs, not when to run it. `npm test` could take a second or ten minutes. `npm run deploy` could be a dry run or production.

The commands file fixes both. It's a Markdown runbook in the repository: one bullet per command, with trailing decorators that say what the command does. `clip sync` copies it into the `AGENTS.md` block, so agents see it without looking. Launchers such as [Saggar](https://saggar.marginalutility.dev) read the same file to turn it into buttons.

```bash
clip commands init       # write .clip/commands.md
clip commands            # list what it describes
clip commands check      # validate it; exits 1 on errors
clip sync                # list the commands in AGENTS.md
```

## Example

```markdown
# Commands

- Dev server: `npm run dev` — the one you leave running #long-running
- Check: `npm run check` — types, lint, and tests #safe #slow #ci
- Format: `npm run format` #writes
- Deploy: `npm run deploy` — production #destructive
- Sign in: `vercel login` #interactive
```

`clip sync` writes this into the `AGENTS.md` block:

```markdown
Project commands from `.clip/commands.md`. Run them from the project root. Tags: `safe` runs without asking; `writes` edits tracked files, so expect a diff; `destructive` can't be undone, so ask the user first; `long-running` never exits, so run it in the background; `slow` takes minutes; `interactive` needs a person, so ask the user to run it; `ci` is what CI checks, so run it before calling work done.

- Dev server: `npm run dev` [long-running] — the one you leave running.
- Check: `npm run check` [safe, slow, ci] — types, lint, and tests.
- Format: `npm run format` [writes]
- Deploy: `npm run deploy` [destructive] — production.
- Sign in: `vercel login` [interactive]
```

The legend only explains tags the file uses.

## Location

The file lives at `.clip/commands.md` in the project root, which is the nearest directory with `.git`. Commit it.

Readers also accept `.saggar/commands.md`, Saggar's original location, when `.clip/commands.md` doesn't exist. Writers create `.clip/commands.md`. To move an existing file, run `git mv .saggar/commands.md .clip/commands.md`.

## Grammar

The file is Markdown. Readers find commands in it and treat everything else as prose.

- **Lines.** CRLF and CR endings read as LF. Lines inside fenced blocks (```` ``` ```` or `~~~`) are skipped.
- **Commands.** A command is a list item (`-`, `*`, or `+`, at any indent) containing a code span. The first code span is the command. The text before it is the name, and the text after it is the note.
- **Not commands.** A list item with no code span is prose. A list item with an unclosed or empty code span is not a command, and `clip commands check` warns about it.
- **Names.** Trailing `:`, `-`, `–`, and `—` are removed, as is surrounding `*` or `_` emphasis. With no name, the command is its own name. Names are case-insensitive keys within a section. A layout can repeat a name from outside it.
- **Notes.** A leading `:`, `-`, `–`, `—`, or `//` is removed. Only a doubled slash introduces a note, so a note that opens with a path keeps it.
- **Decorators.** A decorator is a `#` followed by a letter, then letters, digits, `_`, or `-`, with an optional `:value`. Decorators are read from the end of the item and must be preceded by whitespace. Reading stops at the first token that doesn't match, so `covers #42` stays in the note. Keywords are case-insensitive, and values keep their case.
- **Commands are opaque.** The command is shell text for the project root. A command starting with `@` (`@claude review this`) is launcher shorthand for starting an agent with a prompt, not a shell command. Agents don't run these, and `clip sync` leaves them out.

## Decorators

Every decorator is optional. An undecorated command means the author said nothing, not that the command is safe.

### For agents

| Decorator | Meaning | What an agent does |
| --- | --- | --- |
| `#safe` | Changes nothing outside build output and caches. | Runs it without asking. |
| `#writes` | Edits tracked files, such as a formatter or code generator. | Runs it, expecting a diff to review. |
| `#destructive` | Can't be undone, or reaches beyond this machine: deploys, publishes, and database resets. | Asks the user first. |
| `#long-running` | Never exits on its own, such as a dev server or watcher. | Runs it in the background, and never waits for it. |
| `#slow` | Exits, but takes minutes. | Prefers a narrower command while iterating. |
| `#interactive` | Needs a person at the terminal, such as a login or prompt. | Asks the user to run it. |
| `#ci` | The local equivalent of CI's required checks. | Runs it before calling work done. |

Choose at most one effect (`#safe`, `#writes`, or `#destructive`) and at most one lifetime (`#long-running` or `#slow`). If a file declares more than one, readers use the most cautious reading, and `clip commands check` reports an error.

### For launchers

These are reserved so every reader agrees on where a note ends. CLIP reads them and leaves their meaning to launchers.

| Decorator | Meaning |
| --- | --- |
| `#primary` `#companion` `#monitor` `#background` `#quick` | Where the command's terminal opens: the main pane, beside the current one, the dock, the menu without taking focus, or a panel that folds away on success. Choose one. |
| `#browser` `#simulator` | The live surface a remote client reveals after starting the command. Choose one. |
| `#dashboard` | Shown as a dashboard rather than a task. |
| `#icon:<name>` | The icon a launcher shows. The value belongs to the launcher. |

### Unknown decorators

Readers ignore decorators they don't know, and `clip commands check` warns about them. So a new decorator never spills into another reader's note, and older readers keep working.

## The layout section

The commands under a level-2 `## Layout` heading are the ones a launcher opens together when the project opens. They're ordinary commands otherwise. The section ends at the next heading.

Add `#auto` to the heading (`## Layout #auto`) to open the layout automatically. Without a role decorator, a layout command opens in the launcher's menu rather than its main pane. A layout can't place a `#quick` command.

## Retired forms

Readers accept these older spellings, and writers never produce them:

- `## Startup` as the layout heading.
- `[auto]` in place of `#auto` on the layout heading.
- A trailing `[role]`, such as `[monitor]`, in place of a role decorator on an item with no decorators.

## Checks

`clip commands check` reads the file and reports each issue with its line number.

Errors, which exit 1:

- More than one effect, lifetime, role, surface, or icon.
- `#ci` with `#long-running`, since a check has to exit.

Warnings:

- Unknown decorators.
- A name repeated within a section.
- A list item with an unclosed or empty code span.
- `#quick` in the layout section, or `#quick` with `#long-running`.

Add it to CI to keep the file readable:

```yaml
- run: clip commands check
```
