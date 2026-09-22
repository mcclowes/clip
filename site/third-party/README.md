# Third-party licenses

These files cover third-party code that the docs site ships to browsers. They don't license CLIP itself, which is MIT. The published CLI has no runtime dependencies; `packages/cli/src/package.test.ts` fails if one is added.

`licenses.json` is the reviewed inventory. The `third-party-licenses` plugin in `site/plugins/` collects every npm package with code in the client bundle during `docusaurus build`, then fails the build when a package is unrecorded, unapproved, at a different version, under a different license, or has different license text than was reviewed. It also fails for a reviewed package that no longer ships. Build-time tooling that never reaches the browser, such as loaders, isn't listed.

The build writes the notices to `build/third-party-notices.txt`, served at `/third-party-notices.txt` and linked from the footer. Don't commit a copy.

When a dependency changes:

1. Run `npm run licenses:update` in `site/`. It rewrites `licenses.json` from the bundle. A record stays approved when only its version changed; new packages and changed license terms or text are set to `"reviewed": false`.
2. Review each unapproved record's license and notice files in `node_modules`. A package's headline license isn't enough when it bundles code under other terms.
3. Licenses outside `allowedLicenses` need a `reviewNote` explaining why the terms are acceptable for a public static site.
4. A package that ships no license file needs its upstream license copied verbatim into `notices/` and listed under `supplementalNotices`, with the upstream URL at that version. Approval of these records is withdrawn on every version bump.
5. Set `"reviewed": true`, then run `npm run build`.
