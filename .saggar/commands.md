# Commands

Shortcuts for CLIP's TypeScript CLI, registry, and Docusaurus site. The full project command catalog is in [.clip/commands.md](../.clip/commands.md).

## Setup

Use Node.js 24 or later. Install dependencies once per checkout before running checks or opening the docs preview.

- Install CLI dependencies: `npm ci` #quick #writes
- Install site dependencies: `npm --prefix site ci` #quick #writes

## Checks and builds

- Tests: `npm test` - runs the CLI, eval harness, scripts, and site plugin tests #quick #safe
- Lint: `npm run lint` #quick #safe #ci
- Types: `npm run check` #quick #safe #ci
- Build: `npm run build` - compiles the CLI and copies its registry #quick #safe #ci
- Registry check: `npm run registry:check` #quick #safe #ci
- Site build: `npm --prefix site run build` - builds docs and checks bundled dependency licenses #quick #safe #ci
- Site types: `npm --prefix site run typecheck` #quick #safe #ci

## Registry

- Site catalog: `node scripts/site-registry.mjs` - regenerates the site's registry data after schema changes #quick #writes

## Layout

Open this layout for a docs preview in the monitor dock and a shell in the main pane. Saggar supplies the shell when no primary command is declared. The layout starts only when requested.

- Docs preview: `npm --prefix site run dev` - serves Docusaurus at http://localhost:3000 #monitor #browser #safe #long-running
