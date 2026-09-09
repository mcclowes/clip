/**
 * ---
 * purpose: Persist registrations with atomic writes and protect concurrent CLI updates with a lock.
 * ---
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { toolName, validateSchema, type Schema } from './schema.ts';

export type Scope = 'global' | 'shared' | 'local';
export type Registration = { name: string; executable: string; purpose: string; schema?: Schema; source: Record<string, string>; scope?: Scope };
type ToolDocument = { version: 1; tools: Registration[]; disabled?: string[] };
export const configDir = () => process.env.CLIP_HOME ?? join(homedir(), '.config', 'clip');
export function projectRoot(cwd = process.cwd()): string | undefined {
  let directory = resolve(cwd);
  while (true) {
    if (existsSync(join(directory, '.git'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}
export function defaultScope(cwd = process.cwd()): Scope {
  return projectRoot(cwd) ? 'local' : 'global';
}
function configPath(scope: Scope, cwd = process.cwd()): string {
  if (scope === 'global') return join(configDir(), 'tools.json');
  const root = projectRoot(cwd);
  if (!root) throw new Error(`${scope} scope requires a project with a .git directory.`);
  return join(root, '.clip', scope === 'shared' ? 'tools.json' : 'tools.local.json');
}
function readDocument(path: string): ToolDocument {
  if (!existsSync(path)) return { version: 1, tools: [] };
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.version !== 1 || !Array.isArray(data.tools)) throw new Error('Unsupported or invalid CLIP configuration.');
  for (const tool of data.tools) {
    if (typeof tool.name !== 'string' || typeof tool.executable !== 'string' || typeof tool.purpose !== 'string') throw new Error('Invalid tool registration.');
    toolName(tool.name);
    if (tool.schema) validateSchema(tool.schema);
  }
  if (data.disabled !== undefined && (!Array.isArray(data.disabled) || data.disabled.some((name: unknown) => typeof name !== 'string'))) throw new Error('Invalid disabled tool list.');
  return data;
}
export function readTools(cwd = process.cwd()): Registration[] {
  const merged = new Map<string, Registration>();
  for (const scope of ['global', 'shared', 'local'] as const) {
    if (scope !== 'global' && !projectRoot(cwd)) continue;
    const document = readDocument(configPath(scope, cwd));
    for (const name of document.disabled ?? []) merged.delete(name);
    for (const tool of document.tools) merged.set(tool.name, { ...tool, scope });
  }
  return [...merged.values()];
}
function updateDocument(change: (document: ToolDocument) => ToolDocument, scope: Scope, cwd: string): ToolDocument {
  const path = configPath(scope, cwd);
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, 'write.lock');
  let fd: number;
  try { fd = openSync(lock, 'wx', 0o600); } catch { throw new Error(`CLIP configuration is locked. If no CLIP process is running, remove ${lock}.`); }
  const temp = join(dir, `tools.${process.pid}.tmp`);
  try {
    const current = readDocument(path);
    const updated = change(current);
    writeFileSync(temp, JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, path);
    return updated;
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
    closeSync(fd);
    unlinkSync(lock);
  }
}
export function updateTools(change: (tools: Registration[]) => Registration[], scope = defaultScope(), cwd = process.cwd()): Registration[] {
  return updateDocument(current => {
    const tools = change(current.tools).map(({ scope: _scope, ...tool }) => tool);
    const names = new Set(tools.map(tool => tool.name));
    const disabled = (current.disabled ?? []).filter(name => !names.has(name));
    return { version: 1, tools, ...(disabled.length ? { disabled } : {}) };
  }, scope, cwd).tools;
}
export function removeTool(name: string, scope = defaultScope(), cwd = process.cwd()): void {
  updateDocument(current => {
    const tools = current.tools.filter(tool => tool.name !== name);
    const disabled = scope === 'global' ? [] : [...new Set([...(current.disabled ?? []), name])];
    return { version: 1, tools, ...(disabled.length ? { disabled } : {}) };
  }, scope, cwd);
}
