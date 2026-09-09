/**
 * ---
 * purpose: Reload registered capability schemas from their recorded sources.
 * ---
 */
import { readFileSync } from 'node:fs';
import { validateSchema } from './schema.ts';
import { executablePath, probeSchema } from './discovery.ts';
import { catalog, registrySchema } from './registry.ts';
import type { Registration } from './store.ts';

export function refreshRegistration(tool: Registration): Registration {
  let refreshed: Registration;
  if (tool.source.kind === 'file') {
    refreshed = { ...tool, schema: validateSchema(JSON.parse(readFileSync(tool.source.path, 'utf8'))) };
  } else if (tool.source.kind === 'native') {
    refreshed = { ...tool, schema: probeSchema(tool.executable, tool.source.command) };
  } else if (tool.source.kind === 'registry') {
    const entry = catalog().find(item => item.id === tool.source.id);
    if (!entry) throw new Error(`Unknown registry entry: ${tool.source.id}`);
    refreshed = { ...tool, schema: registrySchema(entry), source: { kind: 'registry', id: entry.id, version: entry.version, maintainer: entry.maintainer, sha256: entry.sha256 } };
  } else return tool;
  if (refreshed.schema?.name !== tool.name) throw new Error(`Schema tool name changed: expected ${tool.name}, received ${refreshed.schema?.name}.`);
  return refreshed;
}

export type Diagnosis = { name: string; source: string; status: 'current' | 'drifted' | 'missing' | 'unrefreshable' | 'error'; message?: string };

export function diagnoseRegistration(tool: Registration): Diagnosis {
  const source = tool.source.kind;
  try {
    executablePath(tool.executable);
  } catch (error) {
    return { name: tool.name, source, status: 'missing', message: (error as Error).message };
  }
  if (source === 'manual') return { name: tool.name, source, status: 'unrefreshable' };
  try {
    const refreshed = refreshRegistration(tool);
    const drifted = JSON.stringify(refreshed.schema) !== JSON.stringify(tool.schema) || JSON.stringify(refreshed.source) !== JSON.stringify(tool.source);
    return { name: tool.name, source, status: drifted ? 'drifted' : 'current' };
  } catch (error) {
    return { name: tool.name, source, status: 'error', message: (error as Error).message };
  }
}
