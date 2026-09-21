## What changed

<!-- One or two sentences. Link the issue: Fixes #123 -->

## How you tested it

<!-- Commands you ran. For schemas, the upstream version and docs you verified against. -->

## Checklist

- [ ] `npm run lint`, `npm run check`, `npm test`, `npm run build`, and `npm run registry:check` pass
- [ ] `CHANGELOG.md` has an entry under `Unreleased`, if users will notice the change
- [ ] Schema changes bump the schema version, update the digest, and regenerate site data
- [ ] Every changed `mutating: false` marker cites the documentation or check that shows it has no side effects
- [ ] Schema prose describes the tool and doesn't instruct the agent (see [review requirements](../CONTRIBUTING.md#review-requirements))
