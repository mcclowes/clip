#!/usr/bin/env node
/**
 * ---
 * purpose: Parse CLIP arguments, dispatch to a command handler, and print the result for people or agents.
 * related:
 *   - ./commands.ts - Command handlers keyed by contract name.
 * ---
 */
import { parseArgs } from 'node:util';
import { defaultScope, type Scope } from './store.ts';
import { contract } from './contract.ts';
import { renderText } from './output.ts';
import { resolveCommand, type Options } from './commands.ts';

const outputFormats = ['auto', 'json', 'text'] as const;
const scopeNames = ['local', 'shared', 'global'] as const;
const maxLimit = 10000;
type Format = (typeof outputFormats)[number];

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    purpose: { type: 'string' }, schema: { type: 'string' }, 'skills-dir': { type: 'string' },
    probe: { type: 'string' }, limit: { type: 'string', default: '100' },
    file: { type: 'string' }, scope: { type: 'string' }, version: { type: 'boolean' },
    output: { type: 'string', short: 'o', default: 'auto' }, help: { type: 'boolean', short: 'h' },
  } });
  if (!outputFormats.includes(values.output as Format)) throw new Error('Output must be auto, json, or text.');
  if (values.scope && !scopeNames.includes(values.scope as Scope)) throw new Error('Scope must be local, shared, or global.');
  const scope = (values.scope as Scope | undefined) ?? defaultScope();
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new Error(`--limit must be an integer from 1 to ${maxLimit}.`);
  const format = values.output as Format;

  if (values.version) print({ name: 'clip', version: contract.version }, format);
  else if (values.help) print(contract, format);
  else {
    const { command, args } = resolveCommand(positionals);
    const result = await command.run({ args, options: values as Options, scope, limit });
    if (!command.interactive) print(result, format);
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { kind: 'invalid_request', message: error instanceof Error ? error.message : String(error) } }) + '\n');
  process.exitCode = 1;
}

/** Piped output defaults to JSON so agents parse it; a terminal gets text. */
function print(result: unknown, format: Format): void {
  const json = format === 'json' || (format === 'auto' && !process.stdout.isTTY);
  process.stdout.write((json ? JSON.stringify(result) : renderText(result)) + '\n');
}
