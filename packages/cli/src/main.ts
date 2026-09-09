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
import { defaultScope, readTools, removeTool, updateTools, type Registration, type Scope } from './store.ts';
import { syncSkills } from './skills.ts';
import { discover, executablePath, probeSchema } from './discovery.ts';
import { catalog, registrySchema } from './registry.ts';
import { contract } from './contract.ts';
import { renderText } from './output.ts';
import { runUi } from './ui.ts';
import { diagnoseRegistration, refreshRegistration } from './refresh.ts';

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    purpose: { type: 'string' }, schema: { type: 'string' }, 'skills-dir': { type: 'string' },
    probe: { type: 'string' }, limit: { type: 'string', default: '100' },
    file: { type: 'string' }, scope: { type: 'string' }, version: { type: 'boolean' },
    output: { type: 'string', short: 'o', default: 'auto' }, help: { type: 'boolean', short: 'h' },
  } });
  if (!['auto', 'json', 'text'].includes(values.output!)) throw new Error('Output must be auto, json, or text.');
  if (values.scope && !['local', 'shared', 'global'].includes(values.scope)) throw new Error('Scope must be local, shared, or global.');
  const scope = (values.scope as Scope | undefined) ?? defaultScope();
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('--limit must be an integer from 1 to 10000.');
  const [command = 'help', name, id] = positionals;
  const maxArgs = ['registry', 'schema'].includes(command) ? 3 : ['list', 'sync', 'refresh', 'doctor', 'ui', 'capabilities', 'help'].includes(command) ? 1 : 2;
  if (positionals.length > maxArgs) throw new Error('Unexpected positional arguments. Run clip --help.');
  let result: unknown;
  if (values.version) result = { name: 'clip', version: contract.version };
  else if (values.help || command === 'help' || command === 'capabilities' || (command === 'schema' && !name)) result = contract;
  else if (command === 'register') {
    if (!name || !values.purpose?.trim()) throw new Error('register requires an executable and --purpose.');
    if (scope === 'shared' && name.includes('/')) throw new Error('Shared registrations require an executable name from PATH, not a path.');
    const executable = executablePath(name);
    if (values.schema && values.probe) throw new Error('Choose --schema or --probe.');
    const schema = values.schema ? validateSchema(JSON.parse(readFileSync(values.schema, 'utf8'))) : values.probe ? probeSchema(executable, values.probe) : undefined;
    const previous = readTools().find(tool => (tool.executable === executable || tool.executable === name) && (!schema || schema.name === tool.name));
    updateTools(tools => {
      const id = toolName(schema?.name ?? previous?.name ?? basename(executable));
      const registration: Registration = { name: id, executable: scope === 'shared' ? name : executable, purpose: values.purpose!, schema: schema ?? previous?.schema, source: schema ? { kind: values.probe ? 'native' : 'file', ...(values.schema ? { path: resolve(values.schema) } : {}), ...(values.probe ? { command: values.probe } : {}) } : previous?.source ?? { kind: 'manual' } };
      result = registration;
      return [...tools.filter(tool => tool.name !== id), registration];
    }, scope);
  } else if (command === 'discover') result = discover(name, limit);
  else if (command === 'list') { const tools = readTools(); result = { items: tools.slice(0, limit), total: tools.length, truncated: tools.length > limit }; }
  else if (command === 'schema') {
    if (!['show', 'init'].includes(name ?? '')) throw new Error('Use schema show or init.');
    if (name === 'show') {
      const entry = catalog().find(item => item.id === id);
      if (!entry) throw new Error(`Unknown registry entry: ${id}`);
      result = { ...entry, capabilities: registrySchema(entry) };
    } else {
      if (!id || !values.purpose?.trim() || !values.file) throw new Error('schema init requires a name, --purpose, and --file.');
      const schema = { name: toolName(id), description: values.purpose, commands: [] };
      writeFileSync(values.file, JSON.stringify(schema, null, 2) + '\n', { flag: 'wx' });
      result = { file: resolve(values.file), next: 'Add command names, descriptions, arguments, and mutation markers before registering this draft.' };
    }
  } else if (command === 'remove') {
    if (!name) throw new Error('remove requires a registered tool name.');
    removeTool(name, scope);
    result = { removed: name, scope };
  } else if (command === 'registry') {
    if (name === 'search') {
      const items = catalog().filter(item => `${item.id} ${item.name} ${item.purpose} ${item.category}`.toLowerCase().includes((id ?? '').toLowerCase()));
      result = { items: items.slice(0, limit), total: items.length, truncated: items.length > limit };
    } else {
      if (name !== 'add') throw new Error('Use registry search or add.');
      const entry = catalog().find(item => item.id === id);
      if (!entry) throw new Error(`Unknown registry entry: ${id}`);
      const schema = registrySchema(entry);
      if (!values.purpose?.trim()) throw new Error('registry add requires --purpose.');
      const resolvedExecutable = executablePath(entry.executable);
      const registration: Registration = { name: schema.name, executable: scope === 'shared' ? entry.executable : resolvedExecutable, purpose: values.purpose, schema, source: { kind: 'registry', id: entry.id, version: entry.version, maintainer: entry.maintainer, sha256: entry.sha256 } };
      updateTools(tools => [...tools.filter(tool => tool.name !== registration.name), registration], scope);
      result = registration;
    }
  } else if (command === 'sync') result = syncSkills(readTools(), values['skills-dir'] ?? '.agents/skills');
  else if (command === 'refresh') {
    const refreshed = readTools().map(refreshRegistration);
    for (const targetScope of ['global', 'shared', 'local'] as const) {
      const replacements = refreshed.filter(tool => tool.scope === targetScope);
      if (replacements.length) updateTools(tools => tools.map(tool => replacements.find(item => item.name === tool.name) ?? tool), targetScope);
    }
    const synced = syncSkills(readTools(), values['skills-dir'] ?? '.agents/skills');
    result = { refreshed: refreshed.filter(tool => tool.source.kind !== 'manual').map(tool => tool.name), skipped: refreshed.filter(tool => tool.source.kind === 'manual').map(tool => tool.name), ...synced };
  }
  else if (command === 'doctor') {
    const items = readTools().map(diagnoseRegistration);
    result = { healthy: items.every(item => ['current', 'unrefreshable'].includes(item.status)), items };
  }
  else if (command === 'ui') await runUi({ input: process.stdin, output: process.stdout, skillsDir: values['skills-dir'], scope });
  else throw new Error(`Unknown command: ${command}`);
  if (command !== 'ui') {
    const json = values.output === 'json' || (values.output === 'auto' && !process.stdout.isTTY);
    process.stdout.write((json ? JSON.stringify(result) : renderText(result)) + '\n');
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { kind: 'invalid_request', message: error instanceof Error ? error.message : String(error) } }) + '\n');
  process.exitCode = 1;
}
