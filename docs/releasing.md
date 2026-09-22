# Releasing CLIP

1. Update the version in `packages/cli/package.json` and `packages/cli/src/contract.ts`. Rename the `Unreleased` section of `CHANGELOG.md` to the new version and date, and add a fresh empty `Unreleased` section. The release notes come from this section. Review community schema updates and bump their independent versions.
2. Run `npm ci`, `npm test`, `npm run build`, and `npm run registry:check`. Regenerate site data with `node scripts/site-registry.mjs` and build the site.
3. Commit the release changes. Push the reviewed commit, then tag it as `vX.Y.Z` and push the tag. The release workflow checks the version, builds a dependency-free archive, attests its build provenance, and publishes it with its SHA-256 digest. Two independent jobs then ship it to both channels, so a failure in one never blocks the other:
   - `npm` publishes `@mcclowes/clip` with provenance through trusted publishing.
   - `homebrew` verifies the archive's checksum and attestation, points `Formula/clip.rb` in `mcclowes/homebrew-clip` at it, installs, tests, and audits the formula on macOS, then pushes it with the `HOMEBREW_TAP_DEPLOY_KEY` deploy key.
4. Check both jobs passed. A failed channel job can be re-run on its own; the Homebrew job skips the push when the formula is already current.
5. The docs site is served by Vercel from `site/` (see `site/vercel.json`). The source registry lives at the repository root; run `node scripts/site-registry.mjs` and commit the regenerated `site/data` and `site/static/registry` before the site builds, since CI fails when they're stale.

Never replace a release asset under an existing version. Publish a new version for fixes. The catalog is bundled in the CLI archive, and installed registrations retain the exact schema and checksum they were installed with.
