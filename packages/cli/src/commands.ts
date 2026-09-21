/**
 * ---
 * purpose: Implement each CLIP command as a handler keyed by its contract name.
 * related:
 *   - ./contract.ts - Public command names and arguments these handlers implement.
 *   - ./main.ts - Parses arguments, dispatches here, and prints results.
 * ---
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { validateSchema, toolName, type Schema } from './schema.ts';
import { activeSchema, projectRoot, readTools, removeTool, scopes, storedExecutable, updateTools, upsertTool, type Registration, type Scope } from './store.ts';
import { defaultSkillsDir, existingSkillFile, skillFile, syncSkills } from './skills.ts';
import { defaultAgentsFile, planAgentsMd, type ProjectCommands } from './agents-md.ts';
import { checkCommands, commandsPath, findCommandsFile, parseCommands, seededCommandsTemplate } from './commands-md.ts';
import { discover, executablePath, probeSchema } from './discovery.ts';
import { catalog, findEntry, registryRegistration, registrySchema, trustOf, validationStatus } from './registry.ts';
import { contract } from './contract.ts';
import { page } from './output.ts';
import { lintSchema } from './lint.ts';
import { runUi } from './ui.ts';
import { mergeClaudeSettings, proposeRules } from './permissions.ts';
import { diagnoseRegistration, healthyStatuses, refreshRegistration, refreshable, reviewRegistryUpdate } from './refresh.ts';

export type Options = { purpose?: string; profile?: string; schema?: string; probe?: string; file?: string; 'skills-dir'?: string; target?: string; 'agents-file'?: string; trust?: string[]; accept?: string[]; 'accept-all'?: boolean; all?: boolean; write?: boolean; strict?: boolean };
export type Invocation = { args: string[]; options: Options; scope: Scope; limit: number };
type Command = { positionals: number; interactive?: true; run: (invocation: Invocation) => unknown };

const skillsDir = (options: Options) => options['skills-dir'] ?? defaultSkillsDir;
const syncTargets = ['all', 'skills', 'agents-md'] as const;
const names = (tools: Registration[]) => tools.map(tool => tool.name);
function requirePurpose(options: Options, message: string): string {
  if (!options.purpose?.trim()) throw new Error(message);
  return options.purpose;
}

/** Without a query, show only installed tools CLIP already has a schema for; the rest of PATH is mostly noise. */
function discoverTools(query: string | undefined, all: boolean, limit: number) {
  const known = new Map(catalog().map(entry => [entry.executable, entry.id]));
  const registered = new Set(names(readTools()));
  const onPath = discover(query).map(tool => ({ ...tool, registry: known.get(tool.name), registered: registered.has(tool.name) }));
  if (query || all) return page(onPath, limit);
  const items = onPath.filter(tool => tool.registry);
  return { ...page(items, limit), unlisted: onPath.length - items.length };
}

const commands: Record<string, Command> = {
  help: { positionals: 0, run: () => contract },
  capabilities: { positionals: 0, run: () => contract },
  schema: { positionals: 2, run: ({ args }) => { if (args.length) throw new Error('Use schema show or init.'); return contract; } },
  registry: { positionals: 2, run: () => { throw new Error('Use registry search or add.'); } },
  discover: { positionals: 1, run: ({ args: [query], options, limit }) => discoverTools(query, Boolean(options.all), limit) },
  list: { positionals: 0, run: ({ limit }) => page(readTools().map(tool => ({ ...tool, trust: trustOf(tool) })), limit) },
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
    writeFileSync(options.file, `${JSON.stringify(schema, null, 2)}\n`, { flag: 'wx' });
    return { file: resolve(options.file), next: `Add command names, descriptions, arguments, and mutation markers, then run clip lint ${options.file} until it reports no errors. The clip-schema-authoring skill from clip sync walks through drafting from --help.` };
  } },
  lint: { positionals: 1, run: ({ args: [target], limit }) => {
    if (!target) throw new Error('lint requires a schema file, registered tool name, or registry entry ID.');
    const { source, schema, registry } = lintTarget(target);
    const issues = lintSchema(schema, { registry });
    const errors = issues.filter(issue => issue.severity === 'error').length;
    if (errors) process.exitCode = 1;
    return { target, source, healthy: !errors, errors, warnings: issues.length - errors, ...page(issues, limit) };
  } },
  permissions: { positionals: 0, run: permissions },
  'registry search': { positionals: 1, run: ({ args: [query = ''], limit }) => {
    const needle = query.toLowerCase();
    const matches = catalog().filter(item => `${item.id} ${item.name} ${item.purpose} ${item.category}`.toLowerCase().includes(needle));
    return page(matches.map(item => ({ ...item, agent_validation: validationStatus(item) })), limit);
  } },
  'registry add': { positionals: 1, run: ({ args: [id], options, scope }) => {
    const entry = findEntry(id);
    const purpose = requirePurpose(options, 'registry add requires --purpose.');
    return upsertTool(withProfile(registryRegistration(entry, purpose, scope), options.profile), scope);
  } },
  sync: { positionals: 0, run: ({ options }) => sync(readTools(), options) },
  refresh: { positionals: 0, run: refresh },
  doctor: { positionals: 0, run: () => {
    const items = readTools().map(diagnoseRegistration);
    return { healthy: items.every(item => healthyStatuses.includes(item.status)), items };
  } },
  commands: { positionals: 0, run: ({ options, limit }) => {
    const { file, text } = readCommandsFile(options);
    return { file, ...page(parseCommands(text), limit) };
  } },
  'commands check': { positionals: 0, run: ({ options, limit }) => {
    const { file, text } = readCommandsFile(options);
    const issues = checkCommands(text, { root: projectRootOrCwd(), strict: Boolean(options.strict) });
    const healthy = issues.every(issue => issue.severity !== 'error');
    if (!healthy) process.exitCode = 1;
    return { file, healthy, ...page(issues, limit) };
  } },
  'commands init': { positionals: 0, run: ({ options }) => {
    const root = projectRootOrCwd();
    const found = findCommandsFile(root);
    if (!options.file && found.exists) throw new Error(`${relative(root, found.path)} already exists.${found.legacy ? ` Move it to ${commandsPath} with git mv.` : ''}`);
    const file = resolve(options.file ?? join(root, commandsPath));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, seededCommandsTemplate(root), { flag: 'wx' });
    return { file, next: 'Review the commands and decorate each with its effect before relying on them.' };
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
    executable: storedExecutable(scope, name, executable),
    purpose: options.purpose,
    schema: loaded?.schema ?? previous?.schema,
    source: loaded?.source ?? previous?.source ?? { kind: 'manual' },
  };
  return upsertTool(withProfile(registration, options.profile ?? previous?.profile), scope);
}

/** Checked at registration, so a skill never renders from a profile the schema lacks. */
function withProfile(registration: Registration, profile: string | undefined): Registration {
  if (profile === undefined) return registration;
  if (!registration.schema) throw new Error('--profile requires a schema.');
  const profiled = { ...registration, profile };
  activeSchema(profiled);
  return profiled;
}

function loadSchema(executable: string, options: Options): { schema: Schema; source: Registration['source'] } | undefined {
  if (options.schema && options.probe) throw new Error('Choose --schema or --probe.');
  if (options.schema) return { schema: validateSchema(JSON.parse(readFileSync(options.schema, 'utf8'))), source: { kind: 'file', path: resolve(options.schema) } };
  if (options.probe) return { schema: probeSchema(executable, options.probe), source: { kind: 'native', command: options.probe } };
  return undefined;
}

/** A file path wins over a registered name, which wins over a registry ID; registry schemas get registry rules. */
function lintTarget(target: string): { source: 'file' | 'registered' | 'registry'; schema: Schema; registry: boolean } {
  if (existsSync(target)) return { source: 'file', schema: validateSchema(JSON.parse(readFileSync(target, 'utf8'))), registry: false };
  const tool = readTools().find(item => item.name === target);
  if (tool?.schema) return { source: 'registered', schema: tool.schema, registry: tool.source.kind === 'registry' };
  if (tool) throw new Error(`${target} is registered without a schema to lint.`);
  const entry = catalog().find(item => item.id === target);
  if (entry) return { source: 'registry', schema: registrySchema(entry), registry: true };
  throw new Error(`No schema file, registered tool, or registry entry named ${target}.`);
}

function refresh({ options }: Invocation) {
  const requested = new Set(options.accept ?? []);
  const accepted: string[] = [];
  const pending: NonNullable<ReturnType<typeof reviewRegistryUpdate>['review']>[] = [];
  const refreshed = readTools().map(tool => {
    if (tool.source.kind !== 'registry') return refreshRegistration(tool);
    const result = reviewRegistryUpdate(tool);
    if (!result.review) return result.replacement;
    if (options['accept-all'] || requested.has(tool.name)) {
      accepted.push(tool.name);
      return result.replacement;
    }
    pending.push(result.review);
    return tool;
  });
  const unknown = [...requested].filter(name => !accepted.includes(name));
  if (unknown.length) throw new Error(`No pending registry update for: ${unknown.join(', ')}.`);
  for (const scope of scopes) {
    const replacements = refreshed.filter(tool => tool.scope === scope);
    if (replacements.length) updateTools(tools => tools.map(tool => replacements.find(item => item.name === tool.name) ?? tool), scope);
  }
  const synced = sync(readTools(), options);
  const pendingNames = new Set(pending.map(review => review.name));
  return { refreshed: names(refreshed.filter(tool => refreshable(tool) && !pendingNames.has(tool.name))), accepted, pending, skipped: names(refreshed.filter(tool => !refreshable(tool))), ...synced };
}

/** The agents file is checked before skills are written, so a damaged block leaves every target untouched. */
function sync(tools: Registration[], options: Options) {
  const target = options.target ?? 'all';
  if (!syncTargets.includes(target as (typeof syncTargets)[number])) throw new Error('--target must be all, skills, or agents-md.');
  const directory = skillsDir(options);
  const withSkills = target !== 'agents-md';
  const usage = (tool: Registration) => (withSkills ? skillFile(tool, directory) : existingSkillFile(tool, directory));
  const agents = target === 'skills' ? undefined : planAgentsMd(tools.filter(tool => tool.scope !== 'global'), options['agents-file'] ?? defaultAgentsFile, usage, projectCommands());
  const skills = withSkills ? syncSkills(tools, directory) : {};
  const { write, ...agentsMd } = agents ?? {};
  return { ...skills, ...(write ? { agents_md: { ...agentsMd, changed: write() } } : {}) };
}

/** Proposes by default so a person sees every rule before it grants anything; schemas alone never authorize. */
function permissions({ options }: Invocation) {
  const target = options.target ?? 'claude';
  if (target !== 'claude') throw new Error('--target must be claude.');
  const trusted = new Set(options.trust ?? []);
  const tools = readTools();
  const unknown = [...trusted].filter(name => !tools.some(tool => tool.name === name));
  if (unknown.length) throw new Error(`--trust names no registered tool: ${unknown.join(', ')}.`);
  const { allow, skipped } = proposeRules(tools,tool => trusted.has(tool.name) || trustOf(tool) === 'reviewed');
  const file = resolve(options.file ?? join(projectRootOrCwd(), '.claude', 'settings.local.json'));
  const merged = mergeClaudeSettings(existsSync(file) ? readFileSync(file, 'utf8') : undefined, allow);
  const written = Boolean(options.write && merged.added.length);
  if (written) {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, merged.text);
    renameSync(temp, file);
  }
  return { target, file, written, added: merged.added, existing: merged.existing, skipped };
}

const projectRootOrCwd = () => projectRoot() ?? process.cwd();

function readCommandsFile(options: Options): { file: string; text: string } {
  const file = options.file ? resolve(options.file) : findCommandsFile(projectRootOrCwd()).path;
  if (!existsSync(file)) throw new Error(`No commands file at ${file}. Run clip commands init to start one.`);
  return { file, text: readFileSync(file, 'utf8') };
}

function projectCommands(): ProjectCommands | undefined {
  const found = findCommandsFile(projectRootOrCwd());
  return found.exists ? { file: found.path, entries: parseCommands(readFileSync(found.path, 'utf8')) } : undefined;
}
