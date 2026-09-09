/**
 * ---
 * purpose: Persist registrations with atomic writes and protect concurrent CLI updates with a lock.
 * ---
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { toolName, validateSchema, type Schema } from './schema.ts';

export type Registration = { name: string; executable: string; purpose: string; schema?: Schema; source: Record<string, string> };
export const configDir = () => process.env.CLIP_HOME ?? join(homedir(), '.config', 'clip');
export function readTools(): Registration[] {
  const path = join(configDir(), 'tools.json');
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.version !== 1 || !Array.isArray(data.tools)) throw new Error('Unsupported or invalid CLIP configuration.');
  for (const tool of data.tools) {
    if (typeof tool.name !== 'string' || typeof tool.executable !== 'string' || typeof tool.purpose !== 'string') throw new Error('Invalid tool registration.');
    toolName(tool.name);
    if (tool.schema) validateSchema(tool.schema);
  }
  return data.tools;
}
export function updateTools(change: (tools: Registration[]) => Registration[]): Registration[] {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, 'write.lock');
  let fd: number;
  try { fd = openSync(lock, 'wx', 0o600); } catch { throw new Error(`CLIP configuration is locked. If no CLIP process is running, remove ${lock}.`); }
  const temp = join(dir, `tools.${process.pid}.tmp`);
  try {
    const tools = change(readTools());
    writeFileSync(temp, JSON.stringify({ version: 1, tools }, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, join(dir, 'tools.json'));
    return tools;
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
    closeSync(fd);
    unlinkSync(lock);
  }
}
