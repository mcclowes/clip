/**
 * ---
 * purpose: Validate portable capability documents without discarding native CLI Spec metadata.
 * ---
 */
export type Operation = { name: string; description: string; mutating?: boolean; subcommands?: Operation[]; [key: string]: unknown };
export type Schema = { name: string; commands?: Operation[]; capabilities?: Operation[]; [key: string]: unknown };
const maxDepth = 16;
const maxOperations = 2000;
export function toolName(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)) throw new Error('Tool names must contain only letters, numbers, dots, underscores, and hyphens.');
  return value;
}
function validateGotchas(gotchas: unknown) {
  if (gotchas === undefined) return;
  if (!Array.isArray(gotchas) || !gotchas.every(item => typeof item === 'string' && item.trim())) throw new Error('Gotchas must be a list of nonempty strings.');
}
export function validateSchema(value: unknown): Schema {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Schema must be a JSON object.');
  const schema = value as Schema;
  if (typeof schema.name !== 'string') throw new Error('Schema requires a tool name.');
  toolName(schema.name);
  validateGotchas(schema.gotchas);
  const operations = schema.commands ?? schema.capabilities;
  if (!Array.isArray(operations) || !operations.length) throw new Error('Schema requires a nonempty commands or capabilities list.');
  let count = 0;
  function validate(items: Operation[], depth: number) {
    if (depth > maxDepth) throw new Error(`Schema command nesting exceeds ${maxDepth} levels.`);
    const names = new Set<string>();
    for (const item of items) {
      if (++count > maxOperations) throw new Error(`Schema exceeds ${maxOperations} operations.`);
      if (!item || typeof item.name !== 'string' || !item.name.trim() || typeof item.description !== 'string' || !item.description.trim()) throw new Error('Every operation needs a name and description.');
      if (names.has(item.name)) throw new Error(`Duplicate operation: ${item.name}`);
      names.add(item.name);
      if (item.mutating !== undefined && typeof item.mutating !== 'boolean') throw new Error('Mutation markers must be booleans.');
      validateGotchas(item.gotchas);
      if (item.subcommands !== undefined) {
        if (!Array.isArray(item.subcommands)) throw new Error('Subcommands must be a list.');
        validate(item.subcommands, depth + 1);
      }
    }
  }
  validate(operations, 0);
  validateProfiles(schema.profiles, new Set(operationPaths(operations)));
  return schema;
}

const profileName = /^[a-z0-9][a-z0-9-]{0,39}$/;
const profilesOf = (schema: Schema) => (schema.profiles ?? {}) as Record<string, string[]>;

function operationPaths(items: Operation[], parent = ''): string[] {
  return items.flatMap(item => {
    const path = parent ? `${parent} ${item.name}` : item.name;
    return [path, ...operationPaths(item.subcommands ?? [], path)];
  });
}

function validateProfiles(profiles: unknown, paths: Set<string>) {
  if (profiles === undefined) return;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) throw new Error('Profiles must be an object of command lists.');
  for (const [name, commands] of Object.entries(profiles)) {
    if (!profileName.test(name)) throw new Error('Profile names must be lowercase letters, numbers, and hyphens.');
    if (!Array.isArray(commands) || !commands.length || !commands.every(item => typeof item === 'string')) throw new Error(`Profile ${name} must list at least one command.`);
    const unknown = commands.find(item => !paths.has(item));
    if (unknown !== undefined) throw new Error(`Profile ${name} names an unknown command: ${unknown}`);
  }
}

/** Keeps a listed command with its whole subtree, and a command with a listed descendant with only that branch. */
export function applyProfile(schema: Schema, profile: string | undefined): Schema {
  if (profile === undefined) return schema;
  const profiles = profilesOf(schema);
  if (!Object.hasOwn(profiles, profile)) throw new Error(`Unknown profile ${profile} for ${schema.name}. Available: ${Object.keys(profiles).join(', ') || 'none'}.`);
  const listed = new Set(profiles[profile]);
  function keep(items: Operation[], parent: string): Operation[] {
    return items.flatMap(item => {
      const path = parent ? `${parent} ${item.name}` : item.name;
      if (listed.has(path)) return [item];
      const subcommands = keep(item.subcommands ?? [], path);
      return subcommands.length ? [{ ...item, subcommands }] : [];
    });
  }
  const { profiles: _profiles, commands, capabilities, ...rest } = schema;
  const key = commands ? 'commands' : 'capabilities';
  return { ...rest, [key]: keep((commands ?? capabilities)!, '') } as Schema;
}
