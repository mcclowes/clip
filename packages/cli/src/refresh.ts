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

export function diagnoseRegistration(tool: Registration): Diagnosis {
  const source = tool.source.kind;
  try {
    executablePath(tool.executable);
  } catch (error) {
    return { name: tool.name, source, status: 'missing', message: (error as Error).message };
  }
  if (!refreshable(tool)) return { name: tool.name, source, status: 'unrefreshable' };
  try {
    const refreshed = refreshRegistration(tool);
    const drifted = JSON.stringify(refreshed.schema) !== JSON.stringify(tool.schema) || JSON.stringify(refreshed.source) !== JSON.stringify(tool.source);
    return { name: tool.name, source, status: drifted ? 'drifted' : 'current' };
  } catch (error) {
    return { name: tool.name, source, status: 'error', message: (error as Error).message };
  }
}
