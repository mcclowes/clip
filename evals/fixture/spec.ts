/**
 * ---
 * purpose: Single source of truth for the fictional brindle tool, so its help text, CLIP schema, and MCP tools stay in parity.
 * ---
 */
export type Atmosphere = 'oxidation' | 'reduction' | 'neutral';
export type LoadStatus = 'queued' | 'firing' | 'cooling' | 'done' | 'cancelled';
export type Load = { id: string; kiln: string; cone: string; atmosphere: Atmosphere; pieces: number; status: LoadStatus; fired_on?: string; cancel_reason?: string };
export type Kiln = { id: string; name: string; capacity: number; hold_until?: string };
export type State = { kilns: Kiln[]; loads: Load[] };

export type Arg = { name: string; type: 'string' | 'integer' | 'boolean'; description: string; required?: boolean; positional?: boolean; enum?: readonly string[] };
export type Values = Record<string, string | number | boolean | undefined>;
export type Command = { name: string; description: string; mutating: boolean; args: Arg[]; examples: string[]; run: (state: State, values: Values) => unknown };

export class UsageError extends Error {}

const cones = ['06', '04', '6', '10'] as const;
const atmospheres = ['oxidation', 'reduction', 'neutral'] as const;
const statuses = ['queued', 'firing', 'cooling', 'done', 'cancelled'] as const;
const dryRun: Arg = { name: '--dry-run', type: 'boolean', description: 'Report the effect without changing anything.' };

function findKiln(state: State, id: unknown): Kiln {
  const kiln = state.kilns.find(item => item.id === id);
  if (!kiln) throw new UsageError(`Unknown kiln: ${id}. Kiln ids look like K-01; names are not accepted.`);
  return kiln;
}

function findLoad(state: State, id: unknown): Load {
  const load = state.loads.find(item => item.id === id);
  if (!load) throw new UsageError(`Unknown load: ${id}. Load ids look like LD-0001.`);
  return load;
}

function assertQueued(load: Load, action: string): void {
  if (load.status !== 'queued') throw new UsageError(`Cannot ${action} ${load.id}: status is ${load.status}. Only queued loads can change.`);
}

function assertAvailable(kiln: Kiln): void {
  if (kiln.hold_until) throw new UsageError(`Kiln ${kiln.id} is on hold until ${kiln.hold_until}.`);
}

const nextLoadId = (state: State) => `LD-${String(Math.max(0, ...state.loads.map(load => Number(load.id.slice(3)))) + 1).padStart(4, '0')}`;

export const commands: Command[] = [
  {
    name: 'kiln list', description: 'List kilns with their ids, names, capacity, and any maintenance hold.', mutating: false, args: [],
    examples: ['brindle kiln list'],
    run: state => ({ items: state.kilns }),
  },
  {
    name: 'kiln hold', description: 'Put a kiln on maintenance hold. Refused while the kiln has queued loads; move or cancel them first.', mutating: true,
    args: [
      { name: 'kiln', type: 'string', positional: true, required: true, description: 'Kiln id, such as K-02.' },
      { name: '--until', type: 'string', required: true, description: 'Hold end date as YYYY-MM-DD.' },
      dryRun,
    ],
    examples: ['brindle kiln hold K-02 --until 2026-10-01 --dry-run'],
    run: (state, values) => {
      const kiln = findKiln(state, values.kiln);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(values.until))) throw new UsageError('--until must be a date as YYYY-MM-DD.');
      const blocking = state.loads.filter(load => load.kiln === kiln.id && load.status === 'queued').map(load => load.id);
      if (values['dry-run']) return { dry_run: true, kiln: kiln.id, blocking_loads: blocking, would_succeed: !blocking.length };
      if (blocking.length) throw new UsageError(`Kiln ${kiln.id} has queued loads: ${blocking.join(', ')}. Move or cancel them first.`);
      kiln.hold_until = String(values.until);
      return kiln;
    },
  },
  {
    name: 'load list', description: 'List firing loads, optionally filtered.', mutating: false,
    args: [
      { name: '--status', type: 'string', enum: statuses, description: 'Only loads with this status.' },
      { name: '--kiln', type: 'string', description: 'Only loads in this kiln id.' },
      { name: '--atmosphere', type: 'string', enum: atmospheres, description: 'Only loads with this firing atmosphere.' },
    ],
    examples: ['brindle load list --status queued --atmosphere reduction'],
    run: (state, values) => {
      const items = state.loads.filter(load => (!values.status || load.status === values.status) && (!values.kiln || load.kiln === values.kiln) && (!values.atmosphere || load.atmosphere === values.atmosphere));
      return { items, total: items.length };
    },
  },
  {
    name: 'load show', description: 'Show one load.', mutating: false,
    args: [{ name: 'load', type: 'string', positional: true, required: true, description: 'Load id, such as LD-0007.' }],
    examples: ['brindle load show LD-0007'],
    run: (state, values) => findLoad(state, values.load),
  },
  {
    name: 'load queue', description: 'Queue a new firing load in a kiln.', mutating: true,
    args: [
      { name: '--kiln', type: 'string', required: true, description: 'Kiln id, such as K-01. Names are not accepted.' },
      { name: '--cone', type: 'string', required: true, enum: cones, description: 'Target pyrometric cone.' },
      { name: '--atmosphere', type: 'string', required: true, enum: atmospheres, description: 'Firing atmosphere.' },
      { name: '--pieces', type: 'integer', required: true, description: 'Number of pieces. Must not exceed the kiln capacity.' },
    ],
    examples: ['brindle load queue --kiln K-01 --cone 6 --atmosphere oxidation --pieces 12'],
    run: (state, values) => {
      const kiln = findKiln(state, values.kiln);
      assertAvailable(kiln);
      const pieces = Number(values.pieces);
      if (pieces < 1 || pieces > kiln.capacity) throw new UsageError(`--pieces must be between 1 and the capacity of ${kiln.id} (${kiln.capacity}).`);
      const load: Load = { id: nextLoadId(state), kiln: kiln.id, cone: String(values.cone), atmosphere: values.atmosphere as Atmosphere, pieces, status: 'queued' };
      state.loads.push(load);
      return load;
    },
  },
  {
    name: 'load move', description: 'Move a queued load to another kiln, keeping its settings.', mutating: true,
    args: [
      { name: 'load', type: 'string', positional: true, required: true, description: 'Load id.' },
      { name: '--to', type: 'string', required: true, description: 'Destination kiln id.' },
    ],
    examples: ['brindle load move LD-0009 --to K-01'],
    run: (state, values) => {
      const load = findLoad(state, values.load);
      assertQueued(load, 'move');
      const kiln = findKiln(state, values.to);
      assertAvailable(kiln);
      if (load.pieces > kiln.capacity) throw new UsageError(`${load.id} has ${load.pieces} pieces; ${kiln.id} holds ${kiln.capacity}.`);
      load.kiln = kiln.id;
      return load;
    },
  },
  {
    name: 'load cancel', description: 'Cancel a queued load. Loads that are firing, cooling, or done cannot be cancelled.', mutating: true,
    args: [
      { name: 'load', type: 'string', positional: true, required: true, description: 'Load id.' },
      { name: '--reason', type: 'string', required: true, description: 'Why the load is cancelled.' },
      dryRun,
    ],
    examples: ['brindle load cancel LD-0011 --reason "cracked greenware"'],
    run: (state, values) => {
      const load = findLoad(state, values.load);
      assertQueued(load, 'cancel');
      if (values['dry-run']) return { dry_run: true, would_cancel: load.id };
      load.status = 'cancelled';
      load.cancel_reason = String(values.reason);
      return load;
    },
  },
  {
    name: 'report usage', description: 'Total pieces in completed (done) loads fired on or after a date, grouped by kiln or atmosphere.', mutating: false,
    args: [
      { name: '--since', type: 'string', required: true, description: 'Earliest firing date as YYYY-MM-DD.' },
      { name: '--group-by', type: 'string', required: true, enum: ['kiln', 'atmosphere'], description: 'Grouping key.' },
    ],
    examples: ['brindle report usage --since 2026-08-01 --group-by atmosphere'],
    run: (state, values) => {
      const key = values['group-by'] as 'kiln' | 'atmosphere';
      const groups: Record<string, number> = {};
      for (const load of state.loads) if (load.status === 'done' && load.fired_on! >= String(values.since)) groups[load[key]] = (groups[load[key]] ?? 0) + load.pieces;
      return { since: values.since, group_by: key, pieces: groups };
    },
  },
];

/** Inert clones that let the context measurement scale the tool count without changing behavior. */
export function paddedCommands(extra: number): Command[] {
  const clones = Array.from({ length: extra }, (_, index) => {
    const source = commands[index % commands.length]!;
    return { ...source, name: `${source.name} v${index + 2}`, description: `${source.description} (archive ${index + 2})` };
  });
  return [...commands, ...clones];
}

const flagKey = (arg: Arg) => arg.name.replace(/^--/, '');

/** Shared by the CLI and MCP server, so both reject the same inputs with the same messages. */
export function validate(command: Command, values: Values): Values {
  const known = new Set(command.args.map(flagKey));
  for (const key of Object.keys(values)) if (!known.has(key)) throw new UsageError(`Unknown argument for ${command.name}: ${key}.`);
  const result: Values = {};
  for (const arg of command.args) {
    const key = flagKey(arg);
    let value = values[key];
    if (value === undefined) {
      if (arg.required) throw new UsageError(`Missing required argument: ${arg.name}.`);
      continue;
    }
    if (arg.type === 'integer') {
      value = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(value)) throw new UsageError(`${arg.name} must be an integer.`);
    } else if (arg.type === 'boolean') {
      if (typeof value !== 'boolean') throw new UsageError(`${arg.name} is a flag and takes no value.`);
    } else value = String(value);
    if (arg.enum && !arg.enum.includes(String(value))) throw new UsageError(`${arg.name} must be one of: ${arg.enum.join(', ')}.`);
    result[key] = value;
  }
  return result;
}

export const toolDescription = 'Schedule and inspect pottery kiln firings for the studio.';

export function clipSchema(list: Command[] = commands) {
  return {
    name: 'brindle', version: '1.0.0', description: toolDescription, command_layout: 'flat', output: { tty: 'json', piped: 'json' },
    commands: list.map(({ name, description, mutating, args, examples }) => ({ name, description, mutating, args: args.map(arg => ({ ...arg })), examples })),
  };
}

export const mcpToolName = (command: Command) => command.name.replaceAll(' ', '_');

export function mcpTools(list: Command[] = commands) {
  return list.map(command => ({
    name: mcpToolName(command),
    description: command.description,
    annotations: { readOnlyHint: !command.mutating, destructiveHint: command.mutating },
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(command.args.map(arg => [flagKey(arg).replaceAll('-', '_'), { type: arg.type, description: arg.description, ...(arg.enum ? { enum: arg.enum } : {}) }])),
      required: command.args.filter(arg => arg.required).map(arg => flagKey(arg).replaceAll('-', '_')),
      additionalProperties: false,
    },
  }));
}

function argUsage(arg: Arg): string {
  const label = arg.positional ? `<${arg.name}>` : arg.type === 'boolean' ? arg.name : `${arg.name} <${arg.enum ? arg.enum.join('|') : arg.type}>`;
  return `  ${label}${arg.required ? ' (required)' : ''}\n      ${arg.description}`;
}

export function helpText(list: Command[], name?: string): string {
  const command = list.find(item => item.name === name);
  if (!command) {
    return ['brindle', toolDescription, '', 'Usage: brindle <command> [arguments]', '', 'Commands:',
      ...list.map(item => `  ${item.name.padEnd(14)} ${item.description}${item.mutating ? ' [mutating]' : ''}`),
      '', 'Run "brindle <command> --help" for arguments. Output is JSON. Usage errors exit 2.', ''].join('\n');
  }
  return [`brindle ${command.name}`, `${command.description}${command.mutating ? ' [mutating]' : ''}`, '',
    ...(command.args.length ? ['Arguments:', ...command.args.map(argUsage), ''] : []), 'Examples:', ...command.examples.map(example => `  ${example}`), ''].join('\n');
}
