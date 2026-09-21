# Commands

## Checks

- Lint: `npm run lint` #safe #ci
- Types: `npm run check` #safe #ci
- Test: `npm run test` #safe
- Coverage: `npm run test:coverage` — tests with the 85% line floor #safe #ci
- Build: `npm run build` — compiles the CLI into `packages/cli/dist` #safe #ci
- Registry check: `npm run registry:check` — `clip lint` over every schema #safe #ci
- Commands check: `node packages/cli/dist/main.js commands check` — validates this file; build first #safe #ci

## Registry

- Update digests: `node scripts/update-registry.mjs` — after editing a schema #writes
- Site catalog: `node scripts/site-registry.mjs` — regenerates `site/data` and `site/static/registry`; CI fails if it's stale #writes

## Site

- Site install: `npm --prefix site ci` #writes
- Site dev: `npm --prefix site run dev` #safe #long-running
- Site build: `npm --prefix site run build` #safe #slow
- Site types: `npm --prefix site run typecheck` #safe

## Evals

- Eval: `npm run eval` — runs real Claude sessions and costs money; ask first #destructive #slow
- Eval report: `npm run eval:report` #safe
- Record validation: `npm run eval:validate -- evals/results/<run>` — writes registry validation into `registry/index.json` #writes

## Other

- Demo: `npm run demo` — re-records `docs/demo.svg` after CLI output changes #writes
- Release dry run: `npm run release:npm:dry` — inspect the tarball #safe
- Release: `npm run release:npm` — first release only; later releases go through a `v<version>` tag #destructive #interactive
