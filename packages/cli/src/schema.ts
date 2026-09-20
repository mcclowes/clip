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
export function validateSchema(value: unknown): Schema {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Schema must be a JSON object.');
  const schema = value as Schema;
  if (typeof schema.name !== 'string') throw new Error('Schema requires a tool name.');
  toolName(schema.name);
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
      if (item.subcommands !== undefined) {
        if (!Array.isArray(item.subcommands)) throw new Error('Subcommands must be a list.');
        validate(item.subcommands, depth + 1);
      }
    }
  }
  validate(operations, 0);
  return schema;
}

type Arg = { name: string; type?: string; required?: boolean; positional?: boolean; enum?: readonly string[] };

function argToken(arg: Arg): string {
  if (arg.positional || !arg.name.startsWith('-')) return `<${arg.name}>`;
  if (arg.type === 'boolean') return arg.name;
  if (arg.enum?.length) return `${arg.name} ${arg.enum.join('|')}`;
  return `${arg.name} <${arg.type === 'integer' ? 'n' : arg.name.replace(/^-+/, '')}>`;
}

function mutationTag(mutating: boolean | undefined): string {
  if (mutating === undefined) return ' **[mutation unknown]**';
  return mutating ? ' **[mutating]**' : '';
}

/** One usage line per invocable command: required arguments bare, optional ones bracketed, the first example beside read commands. */
export function signatureLines(schema: Schema): string[] {
  const result: string[] = [];
  function visit(items: Operation[], path: string) {
    for (const item of items) {
      const name = `${path} ${item.name}`;
      if (item.subcommands?.length) {
        visit(item.subcommands, name);
        continue;
      }
      const args = Array.isArray(item.args) ? (item.args as Arg[]) : undefined;
      const usage = [name, ...(args ?? []).map(arg => (arg.required ? argToken(arg) : `[${argToken(arg)}]`))].join(' ');
      const example = !item.mutating && Array.isArray(item.examples) && typeof item.examples[0] === 'string' ? ` Example: \`${item.examples[0]}\`` : '';
      const help = args ? '' : ` Arguments: \`${name} --help\`.`;
      result.push(`- \`${usage}\`${mutationTag(item.mutating)} — ${item.description.replace(/\.?$/, '.')}${example}${help}`);
    }
  }
  visit(schema.commands ?? schema.capabilities!, schema.name);
  return result;
}
