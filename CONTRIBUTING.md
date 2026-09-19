# Contributing

Start with a GitHub issue for a new feature or a substantial change. Keep pull requests focused and describe what changed and how you tested it. Add a line under `Unreleased` in `CHANGELOG.md` for any change users will notice. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md); report security issues as described in [SECURITY.md](SECURITY.md), not in public issues.

## Add or improve a community schema

1. Add a JSON file under `registry/schemas/`. Identify the tool with `name`; describe operations using `commands` or `capabilities`. Every operation needs a name and description.
2. Add an entry to `registry/index.json` with an ID, executable, purpose, category, maintainer, schema version, upstream and documentation URLs, schema path, coverage description, and SHA-256 digest.
3. Document only verified behavior. State partial coverage. Include useful arguments, output contracts, examples, and version constraints. Cite official documentation. Never label an operation non-mutating unless you have checked its actual behavior, including default hooks and side effects.
4. Update the digest with `node scripts/update-registry.mjs`, then run `npm run registry:check`, `npm test`, and `node scripts/site-registry.mjs`.
5. Open a pull request describing the commands covered and the upstream versions or documentation used to verify them. Bump the schema version for every schema change.

Schemas are data, not scripts or agent policy. Don't include secrets, instructions to bypass permissions, installation hooks, or claims of official endorsement. A CLI Spec version claim belongs to the upstream tool only when it conforms; a partial community schema should omit it.

The catalog is bundled into CLIP releases. Maintainers review contributions in GitHub; there is no automatic remote schema execution or unreviewed publishing path.

## Checks

Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, and `npm run registry:check` at the repository root. CI also enforces 85% line coverage through `npm run test:coverage`. For site changes, regenerate the catalog and run `npm ci`, `npm run build`, and `npm run typecheck` in `site/`.
