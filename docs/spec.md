# CLIP: Command Line Interface Protocol

CLIP makes installed CLI tools discoverable to people and agents through portable capability descriptions and generated skills. Agents execute the original CLI directly, using its existing authentication and permissions.

## First release

- Discover executables on PATH without executing them. Registration is opt-in.
- Register a tool with a user-defined purpose and a capability document supplied locally or obtained through an explicit `schema` or `capabilities` probe.
- Preserve CLI Spec documents, including nested commands. Accept a minimal capability list when a tool has no native introspection.
- Generate a starter schema for manual authoring. Never invent verified capabilities from help output.
- Merge registrations by tool name from global `CLIP_HOME/tools.json`, shared project `.clip/tools.json`, and local project `.clip/tools.local.json`, with local taking precedence. Project changes default to local scope; `--scope shared|global` selects another scope. Shared registrations store executable names rather than machine-specific paths. Regenerate portable Agent Skills under a chosen directory; the default is `.agents/skills` in the current project. Each skill renders one usage line per invocable command (required arguments bare, optional bracketed, enums inline, mutation marker, first example for read commands). Argument descriptions, output notes, and examples go in `commands/<group>.md` beside `SKILL.md`, grouped by leading words and split on the next word above 15 commands. Past 24,000 characters of usage lines, `SKILL.md` becomes an index of group files. Skills don't ship `schema.json`. The ownership marker lists every file CLIP wrote, and sync refuses unlisted files and symlinks.
- Maintain a pointer block in `AGENTS.md` alongside the skills, one line per registered tool: its name, purpose, and where to get usage detail (the skill path, or `--help` when no CLIP skill exists). `--target skills|agents-md` narrows sync to one target; `--agents-file` picks another file. CLIP edits only between its `<!-- clip:begin -->` and `<!-- clip:end -->` markers, appends the block when neither exists, and refuses a missing, duplicated, or out-of-order marker, or a symlinked file, before writing any target. The pointer exists for discovery: in the evals, a one-line mention took prompts that name no tool from 0 to 9 of 9, in a form every harness reads.
- Own the project commands file, specified in [project commands](../site/docs/commands.md): a Markdown runbook at `.clip/commands.md` (read from Saggar's `.saggar/commands.md` until a project moves it) whose bullets name a command, and whose trailing decorators say what it does. The agent decorators are `#safe`, `#writes`, `#destructive`, `#long-running`, `#slow`, `#interactive`, and `#ci`. Saggar's launcher decorators are reserved, and unknown decorators are ignored, so no reader's note absorbs another's decorator. `clip commands` lists the file, `clip commands check` exits 1 on conflicting decorators, `clip commands init` writes a starter file, and `clip sync` lists the shell commands in the `AGENTS.md` block with a legend for the tags in use.
- Search a curated, Git-backed directory and add versioned community capability documents. Adding a schema doesn't install or execute its CLI.
- Publish docs and a searchable tool directory backed by the same registry files.
- Distribute the dependency-free TypeScript CLI through a Homebrew tap, with tagged source releases and CI.

## Commands

`clip discover [query]`, `clip register <executable> --purpose <text> [--schema <file> | --probe schema|capabilities] [--scope local|shared|global]`, `clip list`, `clip remove <name> [--scope local|shared|global]`, `clip schema`, `clip capabilities`, `clip schema show <id>`, `clip schema init <name> --purpose <text> --file <path>`, `clip lint <schema-file|tool|registry-id>`, `clip sync [--skills-dir <path>] [--target all|skills|agents-md] [--agents-file <path>]`, `clip refresh [--skills-dir <path>] [--target all|skills|agents-md] [--agents-file <path>]`, `clip doctor`, `clip commands [--file <path>]`, `clip commands check [--file <path>]`, `clip commands init [--file <path>]`, `clip registry search [query]`, and `clip registry add <id> --purpose <text> [--scope local|shared|global]`.

All commands accept `--output auto|json|text`. Non-TTY output defaults to JSON. Errors are structured on stderr. Schema and capabilities work without configuration or network. Registry additions use the bundled catalog, which updates with CLIP releases; community contributions go through GitHub pull requests.

## Capability contract

Documents identify a tool with `name` and describe invocable operations in `commands` (CLI Spec) or `capabilities` (minimal CLIP format). Each operation needs a name and description. Optional arguments, output fields, examples, version, and mutation markers retain their original meaning. Missing mutation markers mean unknown. A CLI Spec claim is preserved, never inferred or added to third-party descriptions.

Bundled registry schemas carry one rule beyond the contract: the first example of every read command is bounded and machine-readable, such as `gh pr list --json number,title --limit 20` rather than `gh pr list`, so an agent copying it doesn't pull an unfiltered listing through context. `npm run registry:check` enforces the mechanical part through `clip lint`'s checks, failing on any lint error, and [contributing](../CONTRIBUTING.md#bounded-examples) states the rule.

Registry entries include a stable ID, purpose, executable, upstream URL, maintainer, schema version, schema file, and SHA-256 digest. Locally installed registrations record this provenance. The digest detects accidental changes; it doesn't establish that the maintainer or command is trustworthy.

## Threat model

The registry is a supply chain into agent context. Every free-text field in a schema (descriptions, argument notes, output notes, examples) is rendered into a skill that an agent reads, and mutation markers decide how carefully it acts. A malicious or careless contribution can therefore inject instructions, steer an agent to a link or a chained command, or mark a destructive command as safe.

- **Prompt injection through prose.** `clip lint` rejects text that addresses the agent or tries to change its policy, and examples that are more than one invocation. It warns on long fields and on links outside documentation fields. These checks are heuristics that raise the cost of an attack; review is the control.
- **False mutation markers.** A wrong `mutating: false` is a safety defect, not a typo, and is dangerous because `clip permissions` turns it into an allow rule. Markers need evidence from the upstream behavior, and a missing marker stays unknown.
- **Mitigation, not control.** Generated skills tell agents to treat schema text as reference data. That lowers the impact of text that gets through; it doesn't make that text safe.
- **Trust.** Only an unmodified bundled registry schema is `reviewed`. Local files, probes, manual registrations, and edited registry schemas are `unreviewed`, and features that act on markers must require `reviewed` or an explicit opt-in.
- **Integrity.** The SHA-256 digest detects changes between review and install. It doesn't establish that the maintainer or the content is trustworthy.

## Permission rules

`clip permissions` proposes agent allow rules from mutation markers, to cut permission prompts on read-only work. It is a friction feature, not a safety one: evals found agents didn't need markers to avoid unrequested writes (see [evals](evals.md#mutation-safety)).

- Targets are adapters. The first, `claude`, emits `Bash(<tool> <command path>:*)` into `permissions.allow` of `.claude/settings.local.json`, or `--file`.
- A command gets a rule only when it is a leaf, marked `mutating: false`, and every word of its path is literal. Parent commands, placeholders such as `<url>`, and flag-first paths would widen the prefix to commands the marker doesn't describe.
- Only `reviewed` schemas are eligible, plus tools the user names with `--trust`. Unknown markers are never allowed, and nothing emits `ask` rules, since the agent already asks by default and an `ask` rule would override the user's own broader allows.
- The default run prints the rules it would add and the reason each other command was skipped. `--write` merges the added rules, keeps every other setting, and never removes a rule.

## Boundaries

No MCP server, command proxy, credentials store, remote code execution, telemetry, or automatic package installation. Probing is explicit, shell-free, bounded, and timed out. Generated skills are guidance, not authorization. CLIP owns only skill directories it generated and the marker-delimited block in the agents file, refuses collisions, and removes stale owned skills on sync. Configuration writes use a lock and atomic replacement.

Refresh reloads file schemas, reruns explicitly registered native probes, adopts bundled registry updates, persists validated registrations, and synchronizes generated skills. It rejects schema name changes. Doctor performs the same source checks without writing configuration or skills, and reports missing executables, drift, source errors, and manual registrations that cannot be refreshed.

## Validation

Exercise the public CLI in temporary directories: registration and purpose updates, schema validation and probing, discovery without execution, skill creation/update/removal and collision protection, registry integrity and additions, structured errors, and offline introspection. Build and type-check the CLI and site. Validate release packaging and the Homebrew formula against a tagged release before reporting installation as available.

## References

- https://clispec.dev/spec/v0.2/
- https://skills.sh/

## Publishing

Source: https://github.com/mcclowes/clip. Homebrew tap: https://github.com/mcclowes/homebrew-clip. Initial release: v0.1.0. Implementation is tracked in issue #1. The docs and directory are hosted through Sites, with public access awaiting the owner's audience choice. No existing repository or files were present at task start.
