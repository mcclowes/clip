import { catalog, registrySchema } from '../packages/cli/src/registry.ts';
for (const entry of catalog()) { registrySchema(entry); console.log(`${entry.id}@${entry.version}: valid`); }
