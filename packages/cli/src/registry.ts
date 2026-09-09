/**
 * ---
 * purpose: Load the bundled community catalog and verify capability documents before registration.
 * ---
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateSchema, toolName } from './schema.ts';
export type Entry = { id: string; name: string; executable: string; purpose: string; category: string; maintainer: string; version: string; upstream: string; documentation: string; schema: string; sha256: string; coverage: string };
const root = existsSync(new URL('./registry/index.json', import.meta.url)) ? new URL('./registry/', import.meta.url) : new URL('../../../registry/', import.meta.url);
export function catalog(): Entry[] {
  const data = JSON.parse(readFileSync(new URL('index.json', root), 'utf8'));
  if (data.version !== 1 || !Array.isArray(data.items)) throw new Error('Unsupported registry format.');
  const ids = new Set<string>();
  for (const item of data.items) {
    for (const key of ['id', 'name', 'executable', 'purpose', 'category', 'maintainer', 'version', 'upstream', 'documentation', 'schema', 'sha256', 'coverage']) if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`Registry entry requires ${key}.`);
    toolName(item.id); toolName(item.executable);
    if (ids.has(item.id)) throw new Error(`Duplicate registry ID: ${item.id}`);
    ids.add(item.id);
    if (!/^schemas\/[a-zA-Z0-9._-]+\.json$/.test(item.schema) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid registry schema path or digest.');
    if (![item.upstream, item.documentation].every(url => new URL(url).protocol === 'https:')) throw new Error('Registry links must use HTTPS.');
  }
  return data.items;
}
export function registrySchema(entry: Entry) {
  const bytes = readFileSync(new URL(entry.schema, root));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Schema checksum mismatch: ${entry.id}`);
  const schema = validateSchema(JSON.parse(bytes.toString('utf8')));
  if (schema.name !== entry.executable) throw new Error(`Schema tool name mismatch: ${entry.id}`);
  return schema;
}
