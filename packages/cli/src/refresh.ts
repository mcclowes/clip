/**
 * ---
 * purpose: Reload registered capability schemas from their recorded sources.
 * ---
 */
import { readFileSync } from 'node:fs';
import { validateSchema } from './schema.ts';
import { executablePath, probeSchema } from './discovery.ts';
import { findEntry, registrySchema, registrySource } from './registry.ts';
import type { Registration } from './store.ts';

export const refreshable = (tool: Registration) => tool.source.kind !== 'manual';

export function refreshRegistration(tool: Registration): Registration {
  const refreshed = reloadSource(tool);
  if (refreshed.schema?.name !== tool.name) throw new Error(`Schema tool name changed: expected ${tool.name}, received ${refreshed.schema?.name}.`);
  return refreshed;
}

function reloadSource(tool: Registration): Registration {
  switch (tool.source.kind) {
    case 'file': return { ...tool, schema: validateSchema(JSON.parse(readFileSync(tool.source.path, 'utf8'))) };
    case 'native': return { ...tool, schema: probeSchema(tool.executable, tool.source.command) };
    case 'registry': {
      const entry = findEntry(tool.source.id);
      return { ...tool, schema: registrySchema(entry), source: registrySource(entry) };
    }
    default: return tool;
  }
}

export type Diagnosis = { name: string; source: string; status: 'current' | 'drifted' | 'missing' | 'unrefreshable' | 'error'; message?: string };
export const healthyStatuses: Diagnosis['status'][] = ['current', 'unrefreshable'];

const fingerprint = ({ schema, source }: Registration) => JSON.stringify([schema, source]);
const hasDrifted = (before: Registration, after: Registration) => fingerprint(before) !== fingerprint(after);

export function diagnoseRegistration(tool: Registration): Diagnosis {
  const subject = { name: tool.name, source: tool.source.kind };
  try {
    executablePath(tool.executable);
  } catch (error) {
    return { ...subject, status: 'missing', message: (error as Error).message };
  }
  if (!refreshable(tool)) return { ...subject, status: 'unrefreshable' };
  try {
    return { ...subject, status: hasDrifted(tool, refreshRegistration(tool)) ? 'drifted' : 'current' };
  } catch (error) {
    return { ...subject, status: 'error', message: (error as Error).message };
  }
}
