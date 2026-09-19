# Changelog

All notable changes to the CLIP CLI and its bundled registry. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and CLIP uses [semantic versioning](https://semver.org/). Before 1.0, minor versions may change the CLI or schema format.

## [Unreleased]

### Added

- Community schemas for ripgrep, fd, curl, Docker, npm, uv, kubectl, Terraform, and yq.
- An eval harness comparing the bare CLI, a CLIP skill, and MCP for agent tasks.
- npm distribution as `@mcclowes/clip`, with provenance, and build attestations for release archives.

### Changed

- The docs site is at https://clip.marginalutility.dev.

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
