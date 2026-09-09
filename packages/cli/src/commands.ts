/**
 * ---
 * purpose: Implement each CLIP command as a handler keyed by its contract name.
 * related:
 *   - ./contract.ts - Public command names and arguments these handlers implement.
 *   - ./main.ts - Parses arguments, dispatches here, and prints results.
 * ---
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { validateSchema, toolName, type Schema } from './schema.ts';
import { readTools, removeTool, scopes, updateTools, upsertTool, type Registration, type Scope } from './store.ts';
import { defaultSkillsDir, syncSkills } from './skills.ts';
import { discover, executablePath, probeSchema } from './discovery.ts';
import { catalog, findEntry, registryRegistration, registrySchema } from './registry.ts';
import { contract } from './contract.ts';
import { page } from './output.ts';
import { runUi } from './ui.ts';
import { diagnoseRegistration, healthyStatuses, refreshRegistration, refreshable } from './refresh.ts';

export type Options = { purpose?: string; schema?: string; probe?: string; file?: string; 'skills-dir'?: string };
export type Invocation = { args: string[]; options: Options; scope: Scope; limit: number };
type Command = { positionals: number; interactive?: true; run: (invocation: Invocation) => unknown };

const skillsDir = (options: Options) => options['skills-dir'] ?? defaultSkillsDir;
const names = (tools: Registration[]) => tools.map(tool => tool.name);
function requirePurpose(options: Options, message: string): string {
  if (!options.purpose?.trim()) throw new Error(message);
  return options.purpose;
}

const commands: Record<string, Command> = {
  help: { positionals: 0, run: () => contract },
  capabilities: { positionals: 0, run: () => contract },
  schema: { positionals: 2, run: ({ args }) => { if (args.length) throw new Error('Use schema show or init.'); return contract; } },
  registry: { positionals: 2, run: () => { throw new Error('Use registry search or add.'); } },
  discover: { positionals: 1, run: ({ args: [query], limit }) => discover(query, limit) },
  list: { positionals: 0, run: ({ limit }) => page(readTools(), limit) },
  register: { positionals: 1, run: register },
  remove: { positionals: 1, run: ({ args: [name], scope }) => {
    if (!name) throw new Error('remove requires a registered tool name.');
    removeTool(name, scope);
    return { removed: name, scope };
  } },
  'schema show': { positionals: 1, run: ({ args: [id] }) => {
    const entry = findEntry(id);
    return { ...entry, capabilities: registrySchema(entry) };
  } },
  'schema init': { positionals: 1, run: ({ args: [name], options }) => {
    if (!name || !options.purpose?.trim() || !options.file) throw new Error('schema init requires a name, --purpose, and --file.');
    const schema = { name: toolName(name), description: options.purpose, commands: [] };
    writeFileSync(options.file, JSON.stringify(schema, null, 2) + '\n', { flag: 'wx' });
    return { file: resolve(options.file), next: 'Add command names, descriptions, arguments, and mutation markers before registering this draft.' };
  } },
  'registry search': { positionals: 1, run: ({ args: [query = ''], limit }) => {
    const needle = query.toLowerCase();
    return page(catalog().filter(item => `${item.id} ${item.name} ${item.purpose} ${item.category}`.toLowerCase().includes(needle)), limit);
  } },
  'registry add': { positionals: 1, run: ({ args: [id], options, scope }) => {
    const entry = findEntry(id);
    const purpose = requirePurpose(options, 'registry add requires --purpose.');
    return upsertTool(registryRegistration(entry, purpose, scope), scope);
  } },
  sync: { positionals: 0, run: ({ options }) => syncSkills(readTools(), skillsDir(options)) },
  refresh: { positionals: 0, run: refresh },
  doctor: { positionals: 0, run: () => {
    const items = readTools().map(diagnoseRegistration);
    return { healthy: items.every(item => healthyStatuses.includes(item.status)), items };
  } },
  ui: { positionals: 0, interactive: true, run: ({ options, scope }) => runUi({ input: process.stdin, output: process.stdout, skillsDir: options['skills-dir'], scope }) },
};

/** Two-word commands such as `schema show` take precedence over their one-word parent. */
export function resolveCommand(positionals: string[]): { command: Command; args: string[] } {
  const [first = 'help', second] = positionals;
  const nested = second === undefined ? undefined : commands[`${first} ${second}`];
  const command = nested ?? commands[first];
  if (!command) throw new Error(`Unknown command: ${first}`);
  const args = positionals.slice(nested ? 2 : 1);
  if (args.length > command.positionals) throw new Error('Unexpected positional arguments. Run clip --help.');
  return { command, args };
}

function register({ args: [name], options, scope }: Invocation): Registration {
  if (!name || !options.purpose?.trim()) throw new Error('register requires an executable and --purpose.');
  if (scope === 'shared' && name.includes('/')) throw new Error('Shared registrations require an executable name from PATH, not a path.');
  const executable = executablePath(name);
  const loaded = loadSchema(executable, options);
  const previous = readTools().find(tool => (tool.executable === executable || tool.executable === name) && (!loaded || loaded.schema.name === tool.name));
  const registration: Registration = {
    name: toolName(loaded?.schema.name ?? previous?.name ?? basename(executable)),
    executable: scope === 'shared' ? name : executable,
    purpose: options.purpose,
    schema: loaded?.schema ?? previous?.schema,
    source: loaded?.source ?? previous?.source ?? { kind: 'manual' },
  };
  return upsertTool(registration, scope);
}

function loadSchema(executable: string, options: Options): { schema: Schema; source: Registration['source'] } | undefined {
  if (options.schema && options.probe) throw new Error('Choose --schema or --probe.');
  if (options.schema) return { schema: validateSchema(JSON.parse(readFileSync(options.schema, 'utf8'))), source: { kind: 'file', path: resolve(options.schema) } };
  if (options.probe) return { schema: probeSchema(executable, options.probe), source: { kind: 'native', command: options.probe } };
  return undefined;
}

function refresh({ options }: Invocation) {
  const refreshed = readTools().map(refreshRegistration);
  for (const scope of scopes) {
    const replacements = refreshed.filter(tool => tool.scope === scope);
    if (replacements.length) updateTools(tools => tools.map(tool => replacements.find(item => item.name === tool.name) ?? tool), scope);
  }
  const synced = syncSkills(readTools(), skillsDir(options));
  return { refreshed: names(refreshed.filter(refreshable)), skipped: names(refreshed.filter(tool => !refreshable(tool))), ...synced };
}
