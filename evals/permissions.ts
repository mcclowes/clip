/**
 * ---
 * purpose: Replay recorded Bash calls against clip permissions rules to count the prompts an allowlist would avoid.
 * related:
 *   - ../packages/cli/src/permissions.ts - Generates the rules replayed here.
 * ---
 */
import { proposeRules } from '../packages/cli/src/permissions.ts';
import type { Schema } from '../packages/cli/src/schema.ts';
import { clipSchema } from './fixture/spec.ts';

/** The harness registers brindle by a per-run temp path, which `clip permissions` covers with its own path rule. */
const brindlePath = /^\S*\/clip-eval-[^/\s]+\/bin\/brindle(?=\s|$)/;
const shellOperator = /&&|\|\||[;|\n]/;
const prefix = (rule: string) => rule.match(/^Bash\((.*):\*\)$/)?.[1];

export const brindleRules = () => proposeRules([{ name: 'brindle', executable: 'brindle', purpose: '', schema: clipSchema() as Schema, source: { kind: 'file' } }], () => true).allow;

/** Mirrors Claude Code: a prefix rule matches the bare command or the command plus arguments. */
const matches = (segment: string, prefixes: string[]) => prefixes.some(item => segment === item || segment.startsWith(`${item} `));

/**
 * Splitting ignores quoting, which can only over-split a quoted filter into segments that match nothing.
 * A call recorded truncated fails to parse, and counts as prompted.
 */
function avoidsPrompt(input: string, prefixes: string[]): boolean {
  let command: unknown;
  try { command = JSON.parse(input).command; } catch { return false; }
  if (typeof command !== 'string') return false;
  return command.split(shellOperator).every(segment => matches(segment.trim().replace(brindlePath, 'brindle'), prefixes));
}

export function promptCount(calls: string[], rules: string[]): { bash: number; avoided: number } {
  const prefixes = rules.map(prefix).filter((item): item is string => Boolean(item));
  const inputs = calls.filter(call => call.startsWith('Bash ')).map(call => call.slice('Bash '.length));
  return { bash: inputs.length, avoided: inputs.filter(input => avoidsPrompt(input, prefixes)).length };
}
