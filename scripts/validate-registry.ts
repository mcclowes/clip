/**
 * ---
 * purpose: Validate bundled registry entries and enforce the bounded example rule on read commands.
 * ---
 */
import { catalog, registrySchema } from '../packages/cli/src/registry.ts';
import type { Operation, Schema } from '../packages/cli/src/schema.ts';

/** Flags that cap how much a command returns. */
const capFlag = /^(--limit|--last|--tail|--head|--max-count|--max-filesize|--max-time|--max-results|-n|-m)$/;
/** Flags that select an output form another program can parse. */
const formatFlag = /^(--json|-json|--format|--output|--output-format|--porcelain|--oneline|--raw-output|--compact-output|--write-out|--name-only|-o|-raw)$/;

const quote = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uses = (example: string, token: string) => new RegExp(`(^|\\s)${quote(token)}(=|\\s|$)`).test(example);

function flagNames(args: unknown): string[] {
  if (!Array.isArray(args)) return [];
  const named = args.flatMap((arg: { name?: unknown; aliases?: unknown }) => [arg?.name, ...(Array.isArray(arg?.aliases) ? arg.aliases : [])]);
  return named.filter((name): name is string => typeof name === 'string' && name.startsWith('-'));
}

/** Command path words, skipping placeholders such as `<filter>`, `[path...]`, and bare flags. */
const pathWords = (path: string[]) => path.join(' ').split(' ').filter(word => /^[a-z][a-z0-9-]*$/.test(word));

function checkOperations(schema: Schema, operations: Operation[], prefix: string[], problems: string[]) {
  const globals = flagNames(schema.global_args);
  for (const operation of operations) {
    const path = [...prefix, operation.name];
    if (operation.subcommands?.length) {
      checkOperations(schema, operation.subcommands, path, problems);
      continue;
    }
    if (operation.mutating === true) continue;
    const report = (message: string) => problems.push(`${path.join(' ')}: ${message}`);
    const examples = operation.examples;
    const example = Array.isArray(examples) && typeof examples[0] === 'string' ? examples[0].trim() : '';
    if (!example) {
      report('a read command needs a first example that is bounded and machine-readable.');
      continue;
    }
    if (!new RegExp(`^${quote(schema.name)}(\\s|$)`).test(example)) report(`the first example must invoke ${schema.name}.`);
    for (const word of pathWords(path)) if (!uses(example, word)) report(`the first example must run the command; it is missing "${word}".`);
    const flags = [...flagNames(operation.args), ...globals];
    const caps = flags.filter(flag => capFlag.test(flag));
    if (caps.length && !caps.some(flag => uses(example, flag))) report(`the first example must bound its output with one of ${caps.join(', ')}.`);
    const formats = flags.filter(flag => formatFlag.test(flag));
    if (formats.length && !formats.some(flag => uses(example, flag))) report(`the first example must ask for a machine-readable form with one of ${formats.join(', ')}.`);
  }
}

/** Reports first examples that are unbounded or human-formatted; see the example rule in CONTRIBUTING.md. */
export function exampleProblems(schema: Schema): string[] {
  const problems: string[] = [];
  checkOperations(schema, (schema.commands ?? schema.capabilities)!, [], problems);
  return problems;
}

if (import.meta.filename === process.argv[1]) {
  let failed = false;
  for (const entry of catalog()) {
    const problems = exampleProblems(registrySchema(entry));
    console.log(`${entry.id}@${entry.version}: ${problems.length ? 'example rule violations' : 'valid'}`);
    for (const problem of problems) console.log(`  - ${problem}`);
    failed ||= problems.length > 0;
  }
  if (failed) {
    console.log('\nThe first example of every read command must be bounded and machine-readable. See "Bounded examples" in CONTRIBUTING.md.');
    process.exitCode = 1;
  }
}
