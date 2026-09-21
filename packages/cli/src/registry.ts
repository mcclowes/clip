/**
 * ---
 * purpose: Load the bundled community catalog, verify capability documents, and build registrations from entries.
 * ---
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateSchema, toolName } from './schema.ts';
import { executablePath } from './discovery.ts';
import { storedExecutable, type Registration, type Scope } from './store.ts';
const entryFields = ['id', 'name', 'executable', 'purpose', 'category', 'maintainer', 'version', 'upstream', 'documentation', 'schema', 'sha256', 'coverage'] as const;
/** One agent eval run against this entry. It holds only for the schema digest it ran against. */
export type Validation = {
  validated: boolean; sha256: string; date: string; model: string; claudeVersion: string; clipVersion: string; toolVersion: string;
  passed: number; runs: number; baselinePassed: number; baselineRuns: number;
};
export type Entry = Record<(typeof entryFields)[number], string> & { validation?: Validation };
export type ValidationStatus = 'validated' | 'failed' | 'stale' | 'unvalidated';
const root = existsSync(new URL('./registry/index.json', import.meta.url)) ? new URL('./registry/', import.meta.url) : new URL('../../../registry/', import.meta.url);
export const catalog = (): Entry[] => parseCatalog(JSON.parse(readFileSync(new URL('index.json', root), 'utf8')));
export function parseCatalog(input: unknown): Entry[] {
  const data = input as { version?: unknown; items?: unknown };
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('Unsupported registry format.');
  const ids = new Set<string>();
  for (const item of data.items) {
    validateEntry(item);
    if (ids.has(item.id)) throw new Error(`Duplicate registry ID: ${item.id}`);
    ids.add(item.id);
  }
  return data.items;
}
function validateEntry(item: Record<string, unknown>): asserts item is Entry {
  for (const key of entryFields) if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`Registry entry requires ${key}.`);
  const entry = item as Entry;
  toolName(entry.id); toolName(entry.executable);
  if (!/^schemas\/[a-zA-Z0-9._-]+\.json$/.test(entry.schema) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid registry schema path or digest.');
  if (![entry.upstream, entry.documentation].every(url => new URL(url).protocol === 'https:')) throw new Error('Registry links must use HTTPS.');
  if (entry.validation !== undefined) validateValidation(entry.validation);
}
function validateValidation(input: unknown) {
  const record = input as Record<string, unknown> | null;
  const valid: Record<keyof Validation, (value: unknown) => boolean> = {
    validated: value => typeof value === 'boolean',
    sha256: value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    date: value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
    model: nonEmpty, claudeVersion: nonEmpty, clipVersion: nonEmpty, toolVersion: nonEmpty,
    passed: count, runs: count, baselinePassed: count, baselineRuns: count,
  };
  for (const [key, check] of Object.entries(valid)) if (!check(record?.[key])) throw new Error(`Registry validation requires ${key}.`);
}
const nonEmpty = (value: unknown) => typeof value === 'string' && !!value.trim();
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
/** A schema edit invalidates its validation, so a changed schema never inherits a result it did not earn. */
export function validationStatus(entry: Entry): ValidationStatus {
  if (!entry.validation) return 'unvalidated';
  if (entry.validation.sha256 !== entry.sha256) return 'stale';
  return entry.validation.validated ? 'validated' : 'failed';
}
export function findEntry(id: string | undefined): Entry {
  const entry = catalog().find(item => item.id === id);
  if (!entry) throw new Error(`Unknown registry entry: ${id}`);
  return entry;
}
export function registrySchema(entry: Entry) {
  const bytes = readFileSync(new URL(entry.schema, root));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Schema checksum mismatch: ${entry.id}`);
  const schema = validateSchema(JSON.parse(bytes.toString('utf8')));
  if (schema.name !== entry.executable) throw new Error(`Schema tool name mismatch: ${entry.id}`);
  return schema;
}
export function registrySource(entry: Entry): Registration['source'] {
  return { kind: 'registry', id: entry.id, version: entry.version, maintainer: entry.maintainer, sha256: entry.sha256 };
}
export type Trust = 'reviewed' | 'unreviewed';
/** Reviewed means the stored schema is the bundled one, unmodified. A source claiming the registry proves nothing alone, since tools.json is editable. */
export function trustOf(tool: Registration): Trust {
  if (tool.source.kind !== 'registry' || !tool.schema) return 'unreviewed';
  const entry = catalog().find(item => item.id === tool.source.id);
  if (!entry || entry.sha256 !== tool.source.sha256) return 'unreviewed';
  return JSON.stringify(registrySchema(entry)) === JSON.stringify(tool.schema) ? 'reviewed' : 'unreviewed';
}
/** Verifies the executable is installed without running it. */
export function registryRegistration(entry: Entry, purpose: string, scope: Scope): Registration {
  const schema = registrySchema(entry);
  const resolved = executablePath(entry.executable);
  return { name: schema.name, executable: storedExecutable(scope, entry.executable, resolved), purpose, schema, source: registrySource(entry) };
}
