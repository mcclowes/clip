# Contributing

Start with a GitHub issue for a new feature or a substantial change. Keep pull requests focused and describe what changed and how you tested it. Add a line under `Unreleased` in `CHANGELOG.md` for any change users will notice. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md); report security issues as described in [SECURITY.md](SECURITY.md), not in public issues.

## Add or improve a community schema

1. Add a JSON file under `registry/schemas/`. Identify the tool with `name`; describe operations using `commands` or `capabilities`. Every operation needs a name and description.
2. Add an entry to `registry/index.json` with an ID, executable, purpose, category, maintainer, schema version, upstream and documentation URLs, schema path, coverage description, and SHA-256 digest.
3. Document only verified behavior. State partial coverage. Include useful arguments, output contracts, examples, and version constraints. Cite official documentation. Never label an operation non-mutating unless you have checked its actual behavior, including default hooks and side effects. Examples follow the [bounded example rule](#bounded-examples).
4. Update the digest with `node scripts/update-registry.mjs`, then run `npm run registry:check` (it runs `clip lint` over every entry and fails on errors), `npm test`, and `node scripts/site-registry.mjs`.
5. Open a pull request describing the commands covered and the upstream versions or documentation used to verify them. Bump the schema version for every schema change.

### Bounded examples

The first example of every read command — every command not marked `mutating: true` — must be bounded and machine-readable. Write `gh pr list --json number,title --limit 20`, not `gh pr list`. Agents copy the first example, and in real sessions the output a command returns usually costs more context than the schema describing it does; an unfiltered listing can also overflow the harness and derail the run into reading a spill file. [docs/evals.md](docs/evals.md) has the measurements.

- Cap the results whenever the command has a flag for it, such as `--limit`, `-n`, `--tail`, `--last`, `--max-count`, or `--max-filesize`. `npm run registry:check` fails when a command declares a cap flag and its first example skips it.
- Ask for a form another program can parse whenever the command has a flag for it, such as `--json`, `--format`, `--output`, `--output-format`, `--porcelain`, `--oneline`, or `--raw-output`. The check enforces this too.
- Pick the narrowest value the flag accepts. `kubectl get pods --output name` beats `--output json` for a listing; keep the whole object for a single named resource.
- A command with no cap flag whose default output is already one short record per line, such as `terraform state list`, can lead with the plain invocation.
- Unbounded or human-formatted invocations are still worth documenting. Put them second; only the first example is constrained.

The check is mechanical: it reads the flags a command declares and looks for them in the first example. It can't tell `--output name` from `--output json`, so reviewers judge the value.

Schemas are data, not scripts or agent policy. Don't include secrets, instructions to bypass permissions, installation hooks, or claims of official endorsement. A CLI Spec version claim belongs to the upstream tool only when it conforms; a partial community schema should omit it.

### Review requirements

Registry schemas reach agents as trusted context, so reviewers treat a schema change like a code change. See the [threat model](docs/spec.md#threat-model).

- **Mutation markers.** Every `mutating: false` needs evidence: the upstream documentation, or a note on how you checked the behavior, including hooks, caches, and network side effects. Say so in the pull request. A `false` marker must hold under every flag, since `clip permissions` allows the command by prefix: `gh api` and `git log --output` write under some flags, so they carry no marker. Leave a marker out when you aren't sure; unknown is safer than wrong. Reviewers check each changed marker individually.
- **Prose.** Descriptions say what the tool does. They don't address the agent, set policy, or tell it what to do next. `clip lint` catches the obvious cases; reviewers read every changed field for the rest.
- **Examples.** One invocation of the tool, using example.com for hosts, with no chaining, pipes, redirects, or command substitution outside quotes.
- **Links.** Official documentation only, over HTTPS, in `documentation` or `upstream`.

The catalog is bundled into CLIP releases. Maintainers review contributions in GitHub; there is no automatic remote schema execution or unreviewed publishing path.

## Checks

If the tool can run safely against a local scratch fixture, add tasks to `evals/registry.ts` and follow [registry validation](evals/README.md#registry-validation) to record an agent-validated result. It's optional, and a schema change clears it.

Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, and `npm run registry:check` at the repository root. CI also enforces 85% line coverage through `npm run test:coverage`. For site changes, regenerate the catalog and run `npm ci`, `npm run build`, and `npm run typecheck` in `site/`. When a site dependency changes what ships to the browser, the build fails until you follow [the third-party license process](site/third-party/README.md).

The README demo, `docs/demo.svg`, is recorded from a real session in a throwaway project. Run `npm run demo` to regenerate it after changing the output of `registry search`, `sync`, or generated skills.

## Release

Releases are driven by tags; [docs/releasing.md](docs/releasing.md) has the full checklist. Bump `version` in `packages/cli/package.json` and `packages/cli/src/contract.ts`, move the `Unreleased` entries in `CHANGELOG.md` under the new version, then push a matching `v<version>` tag. The release workflow builds, checks that the tag matches the manifest, attaches the archive to a GitHub release, then publishes to npm with provenance and updates the Homebrew formula in separate jobs.

Publishing by hand is only for the first release of a package, because npm can't be configured as a trusted publisher until the package exists. Run `npm run release:npm` from the repository root, after `npm login`; use `npm run release:npm:dry` to inspect the tarball first. Don't run `npm publish` from `packages/cli` by hand — publishing from the repository root instead picks up the private workspace manifest and fails with a confusing `Cannot read properties of null (reading 'prerelease')`.
