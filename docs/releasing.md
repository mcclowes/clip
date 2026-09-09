# Releasing CLIP

1. Update the version in `packages/cli/package.json` and `packages/cli/src/contract.ts`. Review community schema updates and bump their independent versions.
2. Run `npm ci`, `npm test`, `npm run build`, and `npm run registry:check`. Regenerate site data with `node scripts/site-registry.mjs` and build the site.
3. Commit the release changes. Push the reviewed commit, then tag it as `vX.Y.Z` and push the tag. The release workflow checks the version, builds a dependency-free archive, and publishes it with its SHA-256 digest.
4. Update `Formula/clip.rb` in `mcclowes/homebrew-clip` with the release URL and checksum. Validate using `brew install mcclowes/clip/clip` and `brew test mcclowes/clip/clip` before publishing the formula update.
5. Publish the static docs through Sites using `site/.openai/hosting.json`. The source registry lives at the repository root; run `node scripts/site-registry.mjs` before building. The hosting archive contains only `site/dist/client` and hosting metadata.

Never replace a release asset under an existing version. Publish a new version for fixes. The catalog is bundled in the CLI archive, and installed registrations retain the exact schema and checksum they were installed with.
