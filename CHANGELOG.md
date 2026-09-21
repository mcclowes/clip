# Changelog

All notable changes to the CLIP CLI and its bundled registry. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and CLIP uses [semantic versioning](https://semver.org/). Before 1.0, minor versions may change the CLI or schema format.

## [Unreleased]

### Added

- Community schemas for ripgrep, fd, curl, Docker, npm, uv, kubectl, Terraform, and yq.
- An eval harness comparing the bare CLI, a CLIP skill, and MCP for agent tasks.
- `clip sync` and `clip refresh` maintain a marker-delimited pointer block in `AGENTS.md`, one line per tool with its purpose and skill path. `--target skills|agents-md` syncs one target and `--agents-file` picks the file.
- npm distribution as `@mcclowes/clip`, with provenance, and build attestations for release archives.

### Changed

- The docs site is at https://clip.marginalutility.dev.
- Bundled registry schemas lead every read command with a bounded, machine-readable example, and `npm run registry:check` enforces it.
- Generated skills list a usage line per command, with the first example beside read commands.
- Generated skills put argument descriptions, output notes, and examples in `commands/<group>.md` and no longer include `schema.json`. Tools past 24,000 characters of usage lines get an index in `SKILL.md` instead.
- The skill ownership marker lists every file CLIP wrote. `clip sync` upgrades older skills in place.

### Fixed

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

[Unreleased]: https://github.com/mcclowes/clip/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mcclowes/clip/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mcclowes/clip/releases/tag/v0.1.0
