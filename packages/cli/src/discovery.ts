/**
 * ---
 * purpose: Discover PATH executables without execution and explicitly probe bounded native schema output.
 * ---
 */
import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateSchema } from './schema.ts';
import { page } from './output.ts';

export function executablePath(command: string): string {
  for (const path of command.includes('/') ? [resolve(command)] : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(dir => resolve(dir, command))) {
    try { accessSync(path, constants.X_OK); if (statSync(path).isFile()) return path; } catch {}
  }
  throw new Error(`Executable not found: ${command}`);
}
export function discover(query = '', limit = 100) {
  const found = new Map<string, { name: string; executable: string }>();
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    let names: string[];
    try { names = readdirSync(directory); } catch { continue; }
    for (const name of names.sort()) {
      if (!name.toLowerCase().includes(query.toLowerCase()) || found.has(name)) continue;
      try {
        const executable = executablePath(resolve(directory, name));
        found.set(name, { name, executable });
      } catch {}
    }
  }
  return page([...found.values()].sort((a, b) => a.name.localeCompare(b.name)), limit);
}
export function probeSchema(executable: string, command: string) {
  if (!['schema', 'capabilities'].includes(command)) throw new Error('--probe must be schema or capabilities.');
  const result = spawnSync(executable, [command], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(`Schema probe failed: ${result.error?.message ?? `exit ${result.status}`}. Supply --schema with a local capability document instead.`);
  try { return validateSchema(JSON.parse(result.stdout)); } catch (error) {
    throw new Error(`Invalid schema probe response: ${(error as Error).message}`);
  }
}
