/**
 * ---
 * purpose: Write validation records from a registry eval run into registry/index.json.
 * ---
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contract } from '../packages/cli/src/contract.ts';
import { findEntry, parseCatalog } from '../packages/cli/src/registry.ts';
import { summarizeValidation, type RegistryRow } from './validation.ts';

const [dir] = process.argv.slice(2);
if (!dir) throw new Error('Usage: npm run eval:validate -- evals/results/<registry run directory>');
const rows = readFileSync(join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.mode === 'registry') as RegistryRow[];
if (!rows.length) throw new Error(`No registry runs in ${dir}.`);

const indexPath = new URL('../registry/index.json', import.meta.url);
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const date = new Date().toISOString().slice(0, 10);
for (const tool of new Set(rows.map(row => row.tool))) {
  const entry = findEntry(tool);
  const validation = summarizeValidation(rows.filter(row => row.tool === tool), { sha256: entry.sha256, clipVersion: contract.version, date });
  index.items.find((item: { id: string }) => item.id === tool).validation = validation;
  console.log(`${tool}: ${validation.validated ? 'validated' : 'not validated'}, ${validation.passed}/${validation.runs} with the schema, ${validation.baselinePassed}/${validation.baselineRuns} without`);
}
parseCatalog(index);
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
