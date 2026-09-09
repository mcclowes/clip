import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('registry/index.json', root), 'utf8'));
const data = catalog.items.map(item => ({ ...item, capabilities: JSON.parse(readFileSync(new URL(`registry/${item.schema}`, root), 'utf8')) }));
mkdirSync(new URL('site/data/', root), { recursive: true });
writeFileSync(new URL('site/data/registry.json', root), JSON.stringify(data, null, 2) + '\n');
cpSync(new URL('registry/', root), new URL('site/static/registry/', root), { recursive: true });
