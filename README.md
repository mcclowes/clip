# CLIP

Command Line Interface Protocol. Register CLI tools, describe their capabilities, and generate skills that let agents use the same tools you do.

CLIP keeps execution on the command line. It doesn't proxy commands or manage credentials. Agents call the original executable with its existing authentication and permissions.

[Documentation and tool directory](https://clip-protocol.mcclowes.chatgpt.site) · [CLI Spec v0.2](https://clispec.dev/spec/v0.2/) · [Implementation issue](https://github.com/mcclowes/clip/issues/1)

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

This writes `.agents/skills/clip-git/SKILL.md` and its `schema.json` in your project. Adding a registry schema requires the executable to be installed already. It doesn't install or execute the tool.

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
clip register mytool --purpose "Manage deployments" --schema mytool.json
clip sync
```

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

Use `clip list` and `clip remove mytool` to maintain registrations. Inside a Git project, changes default to the uncommitted `.clip/tools.local.json`. Use `--scope shared` for the repository's `.clip/tools.json`, or `--scope global` for `~/.config/clip/tools.json`. Local registrations override shared registrations, which override global ones. Removing an inherited tool disables it in the selected project scope.

Run `clip sync` after changes. Set `--skills-dir` to your agent's skills directory. CLIP refuses to replace unowned skill directories; generated files should be edited through their source schemas.

After updating registered tools or CLIP's bundled registry, run `clip doctor` to check for missing executables and schema drift. Run `clip refresh` to reload file, native-probe, and registry schemas, update registrations, and synchronize skills. Manual registrations have no schema source to refresh. Native diagnosis and refresh rerun the explicitly registered, bounded probe command.

## CLI behavior

- `clip schema` and `clip capabilities` describe CLIP offline without configuration.
- `--output auto|json|text` selects output; pipes default to JSON.
- List results use an `items` envelope with `total` and `truncated`. `--limit` defaults to 100.
- Failures exit 1 and write a structured error to stderr.
- Discovery scans PATH without executing tools. Native probing is explicit, shell-free, and bounded to five seconds and 1 MiB.
- Registrations merge from global, shared project, and local project configuration. `CLIP_HOME` changes the global directory.
- The first release bundles the community registry. Upgrade CLIP, then run `clip refresh` to adopt catalog updates. Local schema files and native probes use the same refresh workflow.

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

The CLI is TypeScript with no runtime dependencies. The site uses React and the Next.js App Router API through Vinext, with a static export. Registry JSON is the source of truth for both surfaces.

See [the specification](docs/spec.md), [contributing](CONTRIBUTING.md), and [release instructions](docs/releasing.md).
