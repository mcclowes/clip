/**
 * ---
 * purpose: Reload registered capability schemas from their recorded sources.
 * ---
 */
import { readFileSync } from 'node:fs';
import { validateSchema } from './schema.ts';
import { executablePath, probeSchema } from './discovery.ts';
import { findEntry, registrySchema, registrySource } from './registry.ts';
import { activeSchema, type Registration } from './store.ts';
import { renderedSkillFiles } from './skills.ts';
import type { Operation } from './schema.ts';

export const refreshable = (tool: Registration) => tool.source.kind !== 'manual';

export function refreshRegistration(tool: Registration): Registration {
  const refreshed = reloadSource(tool);
  if (refreshed.schema?.name !== tool.name) throw new Error(`Schema tool name changed: expected ${tool.name}, received ${refreshed.schema?.name}.`);
  activeSchema(refreshed);
  return refreshed;
}

export type MutationMarker = boolean | 'unknown';
export type RegistryReview = {
  name: string;
  from_digest?: string;
  to_digest?: string;
  mutations: { command: string; from: MutationMarker; to: MutationMarker }[];
  diff: { file: string; text: string }[];
};

/** Reload a registry entry and expose every change that would reach an agent before it is adopted. */
export function reviewRegistryUpdate(tool: Registration): { replacement: Registration; review?: RegistryReview } {
  const replacement = refreshRegistration(tool);
  if (fingerprint(tool) === fingerprint(replacement)) return { replacement };
  return {
    replacement,
    review: {
      name: tool.name,
      ...(tool.source.sha256 ? { from_digest: tool.source.sha256 } : {}),
      ...(replacement.source.sha256 ? { to_digest: replacement.source.sha256 } : {}),
      mutations: changedMutations(tool, replacement),
      diff: renderedDiff(tool, replacement),
    },
  };
}

function reloadSource(tool: Registration): Registration {
  switch (tool.source.kind) {
    case 'file': {
      if (!tool.source.path) throw new Error(`File source for ${tool.name} has no path.`);
      return { ...tool, schema: validateSchema(JSON.parse(readFileSync(tool.source.path, 'utf8'))) };
    }
    case 'native': {
      if (!tool.source.command) throw new Error(`Native source for ${tool.name} has no probe command.`);
      return { ...tool, schema: probeSchema(tool.executable, tool.source.command) };
    }
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

function renderedDiff(before: Registration, after: Registration): { file: string; text: string }[] {
  const beforeFiles = renderedSkillFiles(before);
  const afterFiles = renderedSkillFiles(after);
  const paths = new Set([...beforeFiles.keys(), ...afterFiles.keys()]);
  return [...paths].flatMap(file => {
    const oldText = beforeFiles.get(file) ?? '';
    const newText = afterFiles.get(file) ?? '';
    return oldText === newText ? [] : [{ file, text: lineDiff(file, oldText, newText) }];
  });
}

function lineDiff(file: string, before: string, after: string): string {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  let start = 0;
  while (oldLines[start] === newLines[start]) start++;
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) { oldEnd--; newEnd--; }
  return [`--- ${file}`, `+++ ${file}`, ...oldLines.slice(start, oldEnd + 1).map(line => `-${line}`), ...newLines.slice(start, newEnd + 1).map(line => `+${line}`)].join('\n');
}

function changedMutations(before: Registration, after: Registration): RegistryReview['mutations'] {
  const previous = mutationMarkers(before);
  const next = mutationMarkers(after);
  const paths = new Set([...previous.keys(), ...next.keys()]);
  return [...paths].flatMap(command => {
    const from = previous.get(command) ?? 'unknown';
    const to = next.get(command) ?? 'unknown';
    return from === to ? [] : [{ command, from, to }];
  });
}

function mutationMarkers(tool: Registration): Map<string, MutationMarker> {
  const markers = new Map<string, MutationMarker>();
  function visit(items: Operation[], parent = ''): void {
    for (const operation of items) {
      const path = parent ? `${parent} ${operation.name}` : operation.name;
      markers.set(path, operation.mutating ?? 'unknown');
      if (operation.subcommands) visit(operation.subcommands, path);
    }
  }
  const schema = activeSchema(tool);
  if (schema) visit(schema.commands ?? schema.capabilities!);
  return markers;
}

export function diagnoseRegistration(tool: Registration): Diagnosis {
  const subject = { name: tool.name, source: tool.source.kind ?? 'unknown' };
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
