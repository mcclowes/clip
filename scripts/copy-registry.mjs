import { cpSync, chmodSync } from 'node:fs';
cpSync(new URL('../registry/', import.meta.url), new URL('../packages/cli/dist/registry/', import.meta.url), { recursive: true });
chmodSync(new URL('../packages/cli/dist/main.js', import.meta.url), 0o755);
