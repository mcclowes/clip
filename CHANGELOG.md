# Changelog

All notable changes to the CLIP CLI and its bundled registry. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and CLIP uses [semantic versioning](https://semver.org/). Before 1.0, minor versions may change the CLI or schema format.

## [Unreleased]

### Changed

- `clip discover` lists only installed tools with a registry schema by default, and counts the rest. A query or `--all` searches all of PATH.

## [0.3.0] - 2026-09-21

### Added

- Community schemas for ripgrep, fd, curl, Docker, npm, uv, kubectl, Terraform, and yq.
- An eval harness comparing the bare CLI, a CLIP skill, and MCP for agent tasks.
- `clip sync` and `clip refresh` maintain a marker-delimited pointer block in `AGENTS.md`, one line per tool with its purpose and skill path. `--target skills|agents-md` syncs one target and `--agents-file` picks the file.
- The project commands file, `.clip/commands.md`: a Markdown runbook adopted from Saggar, with agent decorators for effect (`#safe`, `#writes`, `#destructive`), lifetime (`#long-running`, `#slow`), `#interactive`, and `#ci`. `clip commands` lists it, `clip commands check` validates it for CI, `clip commands init` starts one, and `clip sync` lists its commands in `AGENTS.md`. Saggar's `.saggar/commands.md` is read until a project moves it.
- `clip commands init` seeds commands from local `package.json`, Makefile, justfile, Taskfile, and mise task declarations without executing their runners. Seeded commands have no effect decorator; review them before use.
- `clip commands check` warns when supported task manifests and `.clip/commands.md` drift. `--strict` makes drift and missing effect decorators fail CI. `<!-- clip:ignore <command> -->` excludes a manifest task from agent guidance.
- `clip list` reports each registration's `trust`: `reviewed` only for an unmodified bundled registry schema, `unreviewed` for everything else.
- `clip lint <schema-file|tool|registry-id>` checks a schema offline: instruction-like text, and examples that chain, pipe, redirect, or substitute commands outside quotes, are errors; undocumented args, missing mutation markers, unbounded first read examples, oversized skill files, overlong free text, and links outside documentation fields are warnings. `npm run registry:check` runs it with registry rules.
- `clip sync` installs a bundled `clip-schema-authoring` skill that guides an agent through drafting a schema from `--help` output, with conservative mutation markers and a loop on `clip lint` until clean.
- `clip permissions` proposes Claude Code allow rules for commands marked `mutating: false` in reviewed schemas, or tools passed with `--trust`, and merges them into `.claude/settings.local.json` with `--write`. Mutating, unknown, parent, and non-literal commands never get a rule.
- Optional `gotchas` on a schema and its commands: short statements of fact, rendered in the skill beside what they describe, that head off known wrong guesses. `clip lint` applies the prose checks with a 200-character limit.
- Agent validation for registry entries. `npm run eval -- registry` runs a schema against its real tool on read-only scratch fixtures (git, jq, and rg so far), and `npm run eval:validate` records the result on the entry, pinned to the schema's digest. `clip registry search` reports `agent_validation` as `validated`, `failed`, `stale`, or `unvalidated`, and the site's tool pages show it.
- npm distribution as `@mcclowes/clip`, with provenance, and build attestations for release archives.
- Registry refreshes now show the exact agent-facing skill diff before adoption. Mutation-marker changes are highlighted, `--accept <tool>` adopts a reviewed update, and `--accept-all` is available for CI.

### Changed

- Bundled registry schemas now mark ripgrep file listing read-only and explain why the other audited inspection commands retain unknown mutation status.
- The docs site is at https://clip.marginalutility.dev.
- Bundled registry schemas lead every read command with a bounded, machine-readable example, and `npm run registry:check` enforces it.
- Generated skills list a usage line per command, with the first example beside read commands.
- Generated skills put argument descriptions, output notes, and examples in `commands/<group>.md` and no longer include `schema.json`. Tools past 24,000 characters of usage lines get an index in `SKILL.md` instead.
- The skill ownership marker lists every file CLIP wrote. `clip sync` upgrades older skills in place.

### Fixed

- `clip sync` keeps global registrations and absolute executable paths out of the committed `AGENTS.md` block.
- `clip sync` refuses dangling symlinks inside a skill, which it previously wrote through.

## [0.2.0] - 2026-09-09

### Added

- Interactive terminal UI.
- Scoped tool configuration: local, shared project, and global registrations.
- `clip refresh` reloads file, native-probe, and registry schemas and synchronizes skills.

### Changed

- The docs site moved to Docusaurus.

### Fixed

- Updating a tool's purpose no longer drops its capability schema.

## [0.1.0] - 2026-09-09

### Added

- Register CLI tools and generate portable agent skills.
- Discover executables on PATH and probe native capabilities.
- Install versioned community capability schemas from the bundled registry.
- Docs site and searchable tool directory.

[Unreleased]: https://github.com/mcclowes/clip/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/mcclowes/clip/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mcclowes/clip/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mcclowes/clip/releases/tag/v0.1.0
