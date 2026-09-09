import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const path = new URL('../registry/index.json', import.meta.url);
const catalog = JSON.parse(readFileSync(path, 'utf8'));
for (const item of catalog.items) item.sha256 = createHash('sha256').update(readFileSync(new URL(`../registry/${item.schema}`, import.meta.url))).digest('hex');
writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n');
