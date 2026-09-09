#!/usr/bin/env node
/**
 * ---
 * purpose: Expose CLIP registration and portable skill generation through a shell-free CLI.
 * ---
 */
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { validateSchema, toolName } from './schema.ts';
import { readTools, updateTools, type Registration } from './store.ts';
import { syncSkills } from './skills.ts';
import { discover, executablePath, probeSchema } from './discovery.ts';

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    purpose: { type: 'string' }, schema: { type: 'string' }, 'skills-dir': { type: 'string' },
    probe: { type: 'string' }, limit: { type: 'string', default: '100' },
    output: { type: 'string', short: 'o', default: 'auto' }, help: { type: 'boolean', short: 'h' },
  } });
  if (!['auto', 'json', 'text'].includes(values.output!)) throw new Error('Output must be auto, json, or text.');
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('--limit must be an integer from 1 to 10000.');
  const [command = 'help', name] = positionals;
  let result: unknown;
  if (values.help || command === 'help') result = { name: 'clip', description: 'Command Line Interface Protocol', commands: ['register <executable> --purpose <text> [--schema <file>]', 'list', 'schema <name>', 'sync [--skills-dir <path>]'] };
  else if (command === 'register') {
    if (!name || !values.purpose?.trim()) throw new Error('register requires an executable and --purpose.');
    const executable = executablePath(name);
    if (values.schema && values.probe) throw new Error('Choose --schema or --probe.');
    const schema = values.schema ? validateSchema(JSON.parse(readFileSync(values.schema, 'utf8'))) : values.probe ? probeSchema(executable, values.probe) : undefined;
    const id = toolName(schema?.name ?? basename(executable));
    const registration: Registration = { name: id, executable, purpose: values.purpose, schema, source: { kind: values.probe ? 'native' : schema ? 'file' : 'manual', ...(values.schema ? { path: resolve(values.schema) } : {}), ...(values.probe ? { command: values.probe } : {}) } };
    updateTools(tools => [...tools.filter(tool => tool.name !== id), registration]);
    result = registration;
  } else if (command === 'discover') result = discover(name, limit);
  else if (command === 'list') { const tools = readTools(); result = { items: tools.slice(0, limit), total: tools.length, truncated: tools.length > limit }; }
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
