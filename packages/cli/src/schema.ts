/**
 * ---
 * purpose: Validate portable capability documents without discarding native CLI Spec metadata.
 * ---
 */
export type Operation = { name: string; description: string; mutating?: boolean; subcommands?: Operation[]; [key: string]: unknown };
export type Schema = { name: string; commands?: Operation[]; capabilities?: Operation[]; [key: string]: unknown };
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
    if (depth > 16) throw new Error('Schema command nesting exceeds 16 levels.');
    const names = new Set<string>();
    for (const item of items) {
      if (++count > 2000) throw new Error('Schema exceeds 2000 operations.');
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

export function describeOperations(schema: Schema): string[] {
  const result: string[] = [];
  function visit(items: Operation[], prefix = '') {
    for (const item of items) {
      const path = `${prefix}${item.name}`;
      result.push(`- ${path}: ${item.description} (mutation: ${item.mutating === undefined ? 'unknown' : item.mutating ? 'yes' : 'no'})`);
      if (item.subcommands) visit(item.subcommands, `${path} `);
    }
  }
  visit(schema.commands ?? schema.capabilities!);
  return result;
}
