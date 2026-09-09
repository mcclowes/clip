# CLIP: Command Line Interface Protocol

CLIP makes installed CLI tools discoverable to people and agents through portable capability descriptions and generated skills. Agents execute the original CLI directly, using its existing authentication and permissions.

## First release

- Discover executables on PATH without executing them. Registration is opt-in.
- Register a tool with a user-defined purpose and a capability document supplied locally or obtained through an explicit `schema` or `capabilities` probe.
- Preserve CLI Spec documents, including nested commands. Accept a minimal capability list when a tool has no native introspection.
- Generate a starter schema for manual authoring. Never invent verified capabilities from help output.
- Merge registrations by tool name from global `CLIP_HOME/tools.json`, shared project `.clip/tools.json`, and local project `.clip/tools.local.json`, with local taking precedence. Project changes default to local scope; `--scope shared|global` selects another scope. Shared registrations store executable names rather than machine-specific paths. Regenerate portable Agent Skills under a chosen directory; the default is `.agents/skills` in the current project.
- Search a curated, Git-backed directory and add versioned community capability documents. Adding a schema doesn't install or execute its CLI.
- Publish docs and a searchable tool directory backed by the same registry files.
- Distribute the dependency-free TypeScript CLI through a Homebrew tap, with tagged source releases and CI.

## Commands

`clip discover [query]`, `clip register <executable> --purpose <text> [--schema <file> | --probe schema|capabilities] [--scope local|shared|global]`, `clip list`, `clip remove <name> [--scope local|shared|global]`, `clip schema`, `clip capabilities`, `clip schema show <id>`, `clip schema init <name> --purpose <text> --file <path>`, `clip sync [--skills-dir <path>]`, `clip registry search [query]`, and `clip registry add <id> --purpose <text> [--scope local|shared|global]`.

All commands accept `--output auto|json|text`. Non-TTY output defaults to JSON. Errors are structured on stderr. Schema and capabilities work without configuration or network. Registry additions use the bundled catalog, which updates with CLIP releases; community contributions go through GitHub pull requests.

## Capability contract

Documents identify a tool with `name` and describe invocable operations in `commands` (CLI Spec) or `capabilities` (minimal CLIP format). Each operation needs a name and description. Optional arguments, output fields, examples, version, and mutation markers retain their original meaning. Missing mutation markers mean unknown. A CLI Spec claim is preserved, never inferred or added to third-party descriptions.

Registry entries include a stable ID, purpose, executable, upstream URL, maintainer, schema version, schema file, and SHA-256 digest. Locally installed registrations record this provenance. The digest detects accidental changes; it doesn't establish that the maintainer or command is trustworthy.

## Boundaries

No MCP server, command proxy, credentials store, remote code execution, telemetry, or automatic package installation. Probing is explicit, shell-free, bounded, and timed out. Generated skills are guidance, not authorization. CLIP owns only skill directories it generated, refuses collisions, and removes stale owned skills on sync. Configuration writes use a lock and atomic replacement.

## Validation

Exercise the public CLI in temporary directories: registration and purpose updates, schema validation and probing, discovery without execution, skill creation/update/removal and collision protection, registry integrity and additions, structured errors, and offline introspection. Build and type-check the CLI and site. Validate release packaging and the Homebrew formula against a tagged release before reporting installation as available.

## References

- https://clispec.dev/spec/v0.2/
- https://skills.sh/

## Publishing

Source: https://github.com/mcclowes/clip. Homebrew tap: https://github.com/mcclowes/homebrew-clip. Initial release: v0.1.0. Implementation is tracked in issue #1. The docs and directory are hosted through Sites, with public access awaiting the owner's audience choice. No existing repository or files were present at task start.
