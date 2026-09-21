# CLIP

[![CI](https://github.com/mcclowes/clip/actions/workflows/ci.yml/badge.svg)](https://github.com/mcclowes/clip/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/mcclowes/clip)](https://github.com/mcclowes/clip/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Command Line Interface Protocol. Register CLI tools, describe their capabilities, and generate skills that let agents use the same tools you do.

CLIP keeps execution on the command line. It doesn't proxy commands or manage credentials. Agents call the original executable with its existing authentication and permissions.

![Searching the registry, adding git, and syncing its agent skill](docs/demo.svg)

[Documentation and tool directory](https://clip.marginalutility.dev) · [CLI Spec v0.2](https://clispec.dev/spec/v0.2/)

## Install

```sh
brew install mcclowes/clip/clip
clip --version
```

The Homebrew formula installs Node.js 24 or later. No runtime npm dependencies are needed.

## Use

```sh
clip discover
clip registry search git
clip schema show git
clip registry add git --purpose "Review repository changes"
clip sync
```

This writes `.agents/skills/clip-git/SKILL.md`, with a usage line per command and reference files in `commands/`, to your project, and adds a one-line pointer to it in `AGENTS.md`. Adding a registry schema requires the executable to be installed already. It doesn't install or execute the tool.

If you need to install a CLI first, [getcli](https://getcli.dev/) provides a separate registry for discovering, installing, and verifying command-line tools. CLIP can then describe the installed tool and generate its agent skill.

For tools with native introspection:

```sh
clip register mytool --purpose "Manage deployments" --probe schema
# Or: --probe capabilities
clip sync
```

For tools without it:

```sh
clip schema init mytool --purpose "Manage deployments" --file mytool.json
# Add real operations to the draft's commands list.
clip lint mytool.json
clip register mytool --purpose "Manage deployments" --schema mytool.json
clip sync
```

Or let your agent draft it. `clip sync` installs a `clip-schema-authoring` skill that walks the tool's `--help` output, sets mutation markers conservatively, and loops on `clip lint` until the draft is clean.

A minimal capability document:

```json
{
  "name": "mytool",
  "commands": [
    { "name": "list", "description": "List deployments", "mutating": false }
  ]
}
```

CLIP accepts `capabilities` instead of `commands`, and preserves richer native CLI Spec fields, including nested commands. Missing mutation markers mean unknown. Schemas describe capabilities; they never grant authorization.

### Fewer permission prompts

```sh
clip permissions            # proposes Claude Code allow rules, writes nothing
clip permissions --write    # merges them into .claude/settings.local.json
```

Each command marked `mutating: false` becomes a rule such as `Bash(gh pr list:*)`, so your agent stops asking before read-only calls. Only reviewed bundled schemas qualify; add `--trust <tool>` for one you wrote. Mutating commands, unknown markers, parent commands, and paths with placeholders or flags never get a rule, so they keep prompting. The output lists the rules it would add and why everything else was skipped.

Use `clip list` and `clip remove mytool` to maintain registrations. Inside a Git project, changes default to the uncommitted `.clip/tools.local.json`. Use `--scope shared` for the repository's `.clip/tools.json`, or `--scope global` for `~/.config/clip/tools.json`. Local registrations override shared registrations, which override global ones. Removing an inherited tool disables it in the selected project scope.

Run `clip sync` after changes. Set `--skills-dir` to your agent's skills directory. CLIP refuses to replace unowned skill directories; generated files should be edited through their source schemas.

Sync also keeps a block in `AGENTS.md` listing project registrations with their purpose and skill path, so harnesses without skill support still find them. Global registrations are kept out of this shared file. CLIP edits only between its `<!-- clip:begin -->` and `<!-- clip:end -->` markers and refuses a damaged block. Use `--agents-file CLAUDE.md` for another file, or `--target skills` or `--target agents-md` to sync just one.

For the project's own scripts, describe them in `.clip/commands.md`, a Markdown runbook whose decorators tell agents what each command does:

```markdown
- Check: `npm run check` — what CI runs #safe #ci
- Deploy: `npm run deploy` #destructive
```

Run `clip commands init` to seed one from local task manifests without running their tools, `clip commands check` in CI to validate it, and `clip sync` to list the commands in `AGENTS.md`. The seed leaves effects unknown, so review and decorate each command. See [project commands](https://clip.marginalutility.dev/docs/commands).

After updating registered tools or CLIP's bundled registry, run `clip doctor` to check for missing executables and schema drift. `clip refresh` reloads file and native-probe schemas, then shows the rendered agent-facing diff for each registry update without adopting it. Mutation-marker changes are called out separately. Run `clip refresh --accept <tool>` to adopt a reviewed update, or `clip refresh --accept-all` in CI. Manual registrations have no schema source to refresh. Native diagnosis and refresh rerun the explicitly registered, bounded probe command.

## CLI behavior

- `clip schema` and `clip capabilities` describe CLIP offline without configuration.
- `--output auto|json|text` selects output; pipes default to JSON.
- List results use an `items` envelope with `total` and `truncated`. `--limit` defaults to 100.
- Failures exit 1 and write a structured error to stderr.
- Discovery scans PATH without executing tools. Native probing is explicit, shell-free, and bounded to five seconds and 1 MiB.
- Registrations merge from global, shared project, and local project configuration. `CLIP_HOME` changes the global directory.
- The first release bundles the community registry. Upgrade CLIP, review the `clip refresh` output, then accept catalog updates explicitly. Local schema files and native probes use the same refresh workflow.

## Development

```sh
npm ci
npm test
npm run build
npm run registry:check
node packages/cli/dist/main.js --help

node scripts/site-registry.mjs
cd site
npm ci
npm run dev
```

The CLI is TypeScript with no runtime dependencies. The docs site is a static Docusaurus build. Registry JSON is the source of truth for both surfaces.

See [the specification](docs/spec.md), [eval findings](docs/evals.md), [contributing](CONTRIBUTING.md), [the changelog](CHANGELOG.md), and [release instructions](docs/releasing.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
