#!/usr/bin/env node
/**
 * ---
 * purpose: Expose CLIP registration and portable skill generation through a shell-free CLI.
 * ---
 */
import { parseArgs } from 'node:util';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { basename, delimiter, join, resolve } from 'node:path';
import { validateSchema, toolName } from './schema.ts';
import { readTools, updateTools, type Registration } from './store.ts';
import { syncSkills } from './skills.ts';

export function executablePath(command: string): string {
  for (const path of command.includes('/') ? [resolve(command)] : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(dir => resolve(dir, command))) {
    try { accessSync(path, constants.X_OK); if (statSync(path).isFile()) return path; } catch {}
  }
  throw new Error(`Executable not found: ${command}`);
}

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    purpose: { type: 'string' }, schema: { type: 'string' }, 'skills-dir': { type: 'string' },
    output: { type: 'string', short: 'o', default: 'auto' }, help: { type: 'boolean', short: 'h' },
  } });
  if (!['auto', 'json', 'text'].includes(values.output!)) throw new Error('Output must be auto, json, or text.');
  const [command = 'help', name] = positionals;
  let result: unknown;
  if (values.help || command === 'help') result = { name: 'clip', description: 'Command Line Interface Protocol', commands: ['register <executable> --purpose <text> [--schema <file>]', 'list', 'schema <name>', 'sync [--skills-dir <path>]'] };
  else if (command === 'register') {
    if (!name || !values.purpose?.trim()) throw new Error('register requires an executable and --purpose.');
    const executable = executablePath(name);
    const schema = values.schema ? validateSchema(JSON.parse(readFileSync(values.schema, 'utf8'))) : undefined;
    const id = toolName(schema?.name ?? basename(executable));
    const registration: Registration = { name: id, executable, purpose: values.purpose, schema, source: { kind: schema ? 'file' : 'manual', ...(values.schema ? { path: resolve(values.schema) } : {}) } };
    updateTools(tools => [...tools.filter(tool => tool.name !== id), registration]);
    result = registration;
  } else if (command === 'list') result = { items: readTools() };
  else if (command === 'schema') {
    const tool = readTools().find(tool => tool.name === name);
    if (!tool?.schema) throw new Error(`No schema registered for ${name}.`);
    result = tool.schema;
  } else if (command === 'sync') result = syncSkills(readTools(), values['skills-dir'] ?? '.agents/skills');
  else throw new Error(`Unknown command: ${command}`);
  const json = values.output === 'json' || (values.output === 'auto' && !process.stdout.isTTY);
  process.stdout.write(JSON.stringify(result, null, json ? undefined : 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { kind: 'invalid_request', message: error instanceof Error ? error.message : String(error) } }) + '\n');
  process.exitCode = 1;
}
