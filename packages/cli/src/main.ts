#!/usr/bin/env node
/**
 * ---
 * purpose: Parse CLIP arguments, dispatch to a command handler, and print the result for people or agents.
 * related:
 *   - ./commands.ts - Command handlers keyed by contract name.
 * ---
 */
import { parseArgs } from 'node:util';
import { defaultScope, scopes, type Scope } from './store.ts';
import { contract } from './contract.ts';
import { renderText, renderVersion } from './output.ts';
import { resolveCommand, type Options } from './commands.ts';

const outputFormats = ['auto', 'json', 'text'] as const;
const maxLimit = 10000;
type Format = (typeof outputFormats)[number];

try {
  const { positionals, options, format, scope, limit } = parseCli();
  if (options.version) print({ name: 'clip', version: contract.version }, format, renderVersion);
  else {
    const { command, args } = resolveCommand(options.help ? ['help'] : positionals);
    const result = await command.run({ args, options: options as Options, scope, limit });
    if (!command.interactive) print(result, format);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: { kind: 'invalid_request', message: error instanceof Error ? error.message : String(error) } })}\n`);
  process.exitCode = 1;
}

function parseCli() {
  const { positionals, values: options } = parseArgs({ allowPositionals: true, options: {
    purpose: { type: 'string' }, schema: { type: 'string' }, 'skills-dir': { type: 'string' },
    probe: { type: 'string' }, limit: { type: 'string', default: '100' },
    target: { type: 'string' }, 'agents-file': { type: 'string' },
    file: { type: 'string' }, trust: { type: 'string', multiple: true }, write: { type: 'boolean' }, scope: { type: 'string' }, version: { type: 'boolean' },
    output: { type: 'string', short: 'o', default: 'auto' }, help: { type: 'boolean', short: 'h' },
  } });
  if (!outputFormats.includes(options.output as Format)) throw new Error('Output must be auto, json, or text.');
  if (options.scope && !scopes.includes(options.scope as Scope)) throw new Error('Scope must be local, shared, or global.');
  const limit = Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new Error(`--limit must be an integer from 1 to ${maxLimit}.`);
  return { positionals, options, format: options.output as Format, scope: (options.scope as Scope | undefined) ?? defaultScope(), limit };
}

/** Piped output defaults to JSON so agents parse it; a terminal gets text. */
function print(result: unknown, format: Format, text: (result: unknown) => string = renderText): void {
  const json = format === 'json' || (format === 'auto' && !process.stdout.isTTY);
  process.stdout.write(`${json ? JSON.stringify(result) : text(result)}\n`);
}
