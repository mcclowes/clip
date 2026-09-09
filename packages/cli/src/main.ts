#!/usr/bin/env node
/**
 * ---
 * purpose: Expose CLIP registration and portable skill generation through a shell-free CLI.
 * ---
 */
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { validateSchema, toolName } from './schema.ts';
import { readTools, updateTools, type Registration } from './store.ts';
import { syncSkills } from './skills.ts';
import { discover, executablePath, probeSchema } from './discovery.ts';
import { catalog, registrySchema } from './registry.ts';
import { contract } from './contract.ts';
import { renderText } from './output.ts';
import { runUi } from './ui.ts';

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    purpose: { type: 'string' }, schema: { type: 'string' }, 'skills-dir': { type: 'string' },
    probe: { type: 'string' }, limit: { type: 'string', default: '100' },
    file: { type: 'string' }, version: { type: 'boolean' },
    output: { type: 'string', short: 'o', default: 'auto' }, help: { type: 'boolean', short: 'h' },
  } });
  if (!['auto', 'json', 'text'].includes(values.output!)) throw new Error('Output must be auto, json, or text.');
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('--limit must be an integer from 1 to 10000.');
  const [command = 'help', name, id] = positionals;
  const maxArgs = command === 'registry' ? 3 : ['list', 'sync', 'capabilities', 'help'].includes(command) ? 1 : 2;
  if (positionals.length > maxArgs) throw new Error('Unexpected positional arguments. Run clip --help.');
  let result: unknown;
  if (values.version) result = { name: 'clip', version: contract.version };
  else if (values.help || command === 'help' || command === 'capabilities' || (command === 'schema' && !name)) result = contract;
  else if (command === 'register') {
    if (!name || !values.purpose?.trim()) throw new Error('register requires an executable and --purpose.');
    const executable = executablePath(name);
    if (values.schema && values.probe) throw new Error('Choose --schema or --probe.');
    const schema = values.schema ? validateSchema(JSON.parse(readFileSync(values.schema, 'utf8'))) : values.probe ? probeSchema(executable, values.probe) : undefined;
    updateTools(tools => {
      const previous = tools.find(tool => tool.executable === executable && (!schema || schema.name === tool.name));
      const id = toolName(schema?.name ?? previous?.name ?? basename(executable));
      const registration: Registration = { name: id, executable, purpose: values.purpose!, schema: schema ?? previous?.schema, source: schema ? { kind: values.probe ? 'native' : 'file', ...(values.schema ? { path: resolve(values.schema) } : {}), ...(values.probe ? { command: values.probe } : {}) } : previous?.source ?? { kind: 'manual' } };
      result = registration;
      return [...tools.filter(tool => tool.name !== id), registration];
    });
  } else if (command === 'discover') result = discover(name, limit);
  else if (command === 'list') { const tools = readTools(); result = { items: tools.slice(0, limit), total: tools.length, truncated: tools.length > limit }; }
  else if (command === 'schema') {
    const tool = readTools().find(tool => tool.name === name);
    if (!tool?.schema) throw new Error(`No schema registered for ${name}.`);
    result = tool.schema;
  } else if (command === 'remove') {
    if (!name) throw new Error('remove requires a registered tool name.');
    updateTools(tools => tools.filter(tool => tool.name !== name));
    result = { removed: name };
  } else if (command === 'schema-init') {
    if (!name || !values.purpose?.trim() || !values.file) throw new Error('schema-init requires a name, --purpose, and --file.');
    const schema = { name: toolName(name), description: values.purpose, commands: [] };
    writeFileSync(values.file, JSON.stringify(schema, null, 2) + '\n', { flag: 'wx' });
    result = { file: resolve(values.file), next: 'Add command names, descriptions, arguments, and mutation markers before registering this draft.' };
  } else if (command === 'registry') {
    if (name === 'search') {
      const items = catalog().filter(item => `${item.id} ${item.name} ${item.purpose} ${item.category}`.toLowerCase().includes((id ?? '').toLowerCase()));
      result = { items: items.slice(0, limit), total: items.length, truncated: items.length > limit };
    } else {
      if (!['show', 'install'].includes(name ?? '')) throw new Error('Use registry search, show, or install.');
      const entry = catalog().find(item => item.id === id);
      if (!entry) throw new Error(`Unknown registry entry: ${id}`);
      const schema = registrySchema(entry);
      if (name === 'show') result = { ...entry, capabilities: schema };
      else {
        if (!values.purpose?.trim()) throw new Error('registry install requires --purpose.');
        const registration: Registration = { name: schema.name, executable: executablePath(entry.executable), purpose: values.purpose, schema, source: { kind: 'registry', id: entry.id, version: entry.version, maintainer: entry.maintainer, sha256: entry.sha256 } };
        updateTools(tools => [...tools.filter(tool => tool.name !== registration.name), registration]);
        result = registration;
      }
    }
  } else if (command === 'sync') result = syncSkills(readTools(), values['skills-dir'] ?? '.agents/skills');
  else if (command === 'ui') await runUi({ input: process.stdin, output: process.stdout, skillsDir: values['skills-dir'] });
  else throw new Error(`Unknown command: ${command}`);
  if (command !== 'ui') {
    const json = values.output === 'json' || (values.output === 'auto' && !process.stdout.isTTY);
    process.stdout.write((json ? JSON.stringify(result) : renderText(result)) + '\n');
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { kind: 'invalid_request', message: error instanceof Error ? error.message : String(error) } }) + '\n');
  process.exitCode = 1;
}
