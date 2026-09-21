/**
 * ---
 * purpose: Check a capability schema offline for what an agent will see: skill size, argument and mutation coverage, bounded first examples, and prose an agent could be steered by.
 * related:
 *   - ./skill-render.ts - Renders the skill files whose size this measures.
 *   - ../../../scripts/validate-registry.ts - Runs these checks with registry rules over the bundled catalog.
 * ---
 */
import { charsPerToken, renderSkillFiles } from './skill-render.ts';
import type { Operation, Schema } from './schema.ts';

export type LintRule = 'size' | 'args' | 'mutation' | 'example' | 'prose';
export type LintIssue = { at: string; rule: LintRule; severity: 'error' | 'warning'; message: string };
/** Registry rules make the bounded example rule an error, as contributing requires. */
export type LintOptions = { registry?: boolean };

/** A rendered skill file over this many estimated tokens is a warning; SKILL.md switches to an index near 10,000. */
export const tokenBudget = 12_000;

/** Flags that cap how much a command returns. */
const capFlag = /^(--limit|--last|--tail|--head|--max-count|--max-filesize|--max-time|--max-results|-n|-m)$/;
/** Flags that select an output form another program can parse. */
const formatFlag = /^(--json|-json|--format|--output|--output-format|--porcelain|--oneline|--raw-output|--compact-output|--write-out|--name-only|-o|-raw)$/;

/** Text that addresses the agent or tries to change its policy, rather than describing the tool. */
const instructionPatterns = [
  /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(instructions?|prompts?|rules|polic(y|ies)|guidelines|guardrails)\b/i,
  /\b(system|developer)\s+(prompt|message)\b/i,
  /\b(you are now|from now on)\b/i,
  /\b(assistant|AI|LLM|agent)s?\s+(must|should|shall|needs? to)\b/i,
  /\b(do not|don't|never)\s+(tell|inform|ask|notify|alert|mention|show)\b[^.\n]{0,30}\b(user|human|operator)\b/i,
  /\bwithout\s+(asking|telling|informing)\b/i,
  /\b(note|message)\s+(to|for)\s+(the\s+)?(AI|agent|assistant|LLM|model)\b/i,
  /<\/?\s*(system|assistant|user|human|instructions?)\s*>|\[\/?INST\]|<\|[a-z_]+\|>/i,
];
/** Free text longer than this is a warning: a large field gives an injected instruction room to hide. */
export const proseLimit = 500;
export const exampleLimit = 300;
/** Fields whose value is a link by design. */
const linkFields = new Set(['documentation', 'upstream']);
const linkPattern = /\b(?:https?|ftp|file):\/\/[^\s'"<>)]+/gi;
/** Reserved for documentation by RFC 2606 and RFC 6761, so examples can use them freely. */
const exampleHost = /^(localhost|127\.0\.0\.1|(.+\.)?example(\.(com|org|net))?)$/i;
const operationLists = new Set(['commands', 'capabilities', 'subcommands']);

/** Removes quoted segments as the shell would read them. With `keepDouble`, double-quoted text stays, since the shell still expands `$(` and backticks there. */
function unquoted(text: string, keepDouble = false): string {
  return text.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, segment => (segment.startsWith('"') && keepDouble ? segment : ' '));
}

/** Examples an agent copies must be one invocation: no substitution, chaining, pipes, redirects, or background jobs. */
function isShellSyntax(example: string): boolean {
  return /\$\(|`/.test(unquoted(example, true)) || /[;&|<>\n]/.test(unquoted(example));
}

function links(text: string): URL[] {
  return [...text.matchAll(linkPattern)].flatMap(([link]) => {
    try { return [new URL(link)]; } catch { return []; }
  });
}

const quote = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uses = (example: string, token: string) => new RegExp(`(^|\\s)${quote(token)}(=|\\s|$)`).test(example);
const where = (command: string[], field: string[]) => [command.join(' '), field.join('.')].filter(Boolean).join(': ');

function flagNames(args: unknown): string[] {
  if (!Array.isArray(args)) return [];
  const named = args.flatMap((arg: { name?: unknown; aliases?: unknown }) => [arg?.name, ...(Array.isArray(arg?.aliases) ? arg.aliases : [])]);
  return named.filter((name): name is string => typeof name === 'string' && name.startsWith('-'));
}

/** Command path words, skipping placeholders such as `<filter>`, `[path...]`, and bare flags. */
const pathWords = (path: string[]) => path.join(' ').split(' ').filter(word => /^[a-z][a-z0-9-]*$/.test(word));

function leaves(operations: Operation[], prefix: string[] = []): { path: string[]; operation: Operation }[] {
  return operations.flatMap(operation => {
    const path = [...prefix, operation.name];
    return operation.subcommands?.length ? leaves(operation.subcommands, path) : [{ path, operation }];
  });
}

/** Problems with the first example of a read command; see "Bounded examples" in CONTRIBUTING.md. */
function exampleProblems(schema: Schema, path: string[], operation: Operation): string[] {
  const examples = operation.examples;
  const example = Array.isArray(examples) && typeof examples[0] === 'string' ? examples[0].trim() : '';
  if (!example) return ['A read command needs a first example that is bounded and machine-readable.'];
  const problems: string[] = [];
  if (!new RegExp(`^${quote(schema.name)}(\\s|$)`).test(example)) problems.push(`The first example must invoke ${schema.name}.`);
  for (const word of pathWords(path)) if (!uses(example, word)) problems.push(`The first example must run the command; it is missing "${word}".`);
  const flags = [...flagNames(operation.args), ...flagNames(schema.global_args)];
  const caps = flags.filter(flag => capFlag.test(flag));
  if (caps.length && !caps.some(flag => uses(example, flag))) problems.push(`The first example must bound its output with one of ${caps.join(', ')}.`);
  const formats = flags.filter(flag => formatFlag.test(flag));
  if (formats.length && !formats.some(flag => uses(example, flag))) problems.push(`The first example must ask for a machine-readable form with one of ${formats.join(', ')}.`);
  return problems;
}

function commandIssues(schema: Schema, options: LintOptions): LintIssue[] {
  return leaves((schema.commands ?? schema.capabilities)!).flatMap(({ path, operation }): LintIssue[] => {
    const at = path.join(' ');
    const issues: LintIssue[] = [];
    if (!Array.isArray(operation.args)) issues.push({ at, rule: 'args', severity: 'warning', message: 'Document the arguments, or set "args": [] when there are none.' });
    if (operation.mutating === undefined) issues.push({ at, rule: 'mutation', severity: 'warning', message: 'No mutation marker, so agents see mutation unknown. Set "mutating" after checking its behavior.' });
    if (operation.mutating !== true) {
      const severity = options.registry ? 'error' : 'warning';
      for (const message of exampleProblems(schema, path, operation)) issues.push({ at, rule: 'example', severity, message });
    }
    return issues;
  });
}

type FreeText = { text: string; at: string; example: boolean; link: boolean };

function freeText(value: unknown, command: string[], field: string[], found: FreeText[]) {
  if (typeof value === 'string') found.push({ text: value, at: where(command, field), example: /(^|\.)examples\[/.test(field.join('.')), link: linkFields.has(field.at(-1) ?? '') });
  else if (Array.isArray(value)) {
    const key = field.at(-1) ?? '';
    value.forEach((item, index) => {
      const name = typeof item?.name === 'string' ? item.name : undefined;
      if (name && operationLists.has(key)) freeText(item, [...command, name], [], found);
      else freeText(item, command, [...field.slice(0, -1), name ? `${key}.${name}` : `${key}[${index}]`], found);
    });
  } else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) freeText(item, command, [...field, key], found);
}

function textProblems({ text, example, link }: FreeText): Omit<LintIssue, 'at' | 'rule'>[] {
  if (link) return links(text).every(url => url.protocol === 'https:') ? [] : [{ severity: 'warning', message: 'Link to documentation over HTTPS.' }];
  const problems: Omit<LintIssue, 'at' | 'rule'>[] = [];
  if (instructionPatterns.some(pattern => pattern.test(text))) problems.push({ severity: 'error', message: 'This reads as an instruction to the agent. Describe the tool instead.' });
  if (example && isShellSyntax(text)) problems.push({ severity: 'error', message: 'Examples must be a single invocation, without command substitution, chaining, pipes, redirects, or background jobs outside quotes.' });
  const limit = example ? exampleLimit : proseLimit;
  if (text.length > limit) problems.push({ severity: 'warning', message: `${text.length} characters, over the ${limit} limit. Keep ${example ? 'examples' : 'free text'} short enough to review.` });
  if (links(text).some(url => !exampleHost.test(url.hostname))) problems.push({ severity: 'warning', message: 'Links belong in "documentation". Use example.com in examples; an agent may follow any other link.' });
  return problems;
}

function proseIssues(schema: Schema): LintIssue[] {
  const found: FreeText[] = [];
  freeText(schema, [], [], found);
  return found.flatMap(item => textProblems(item).map(problem => ({ at: item.at, rule: 'prose' as const, ...problem })));
}

function sizeIssues(schema: Schema): LintIssue[] {
  const files = renderSkillFiles({ skillName: `clip-${schema.name}`, name: schema.name, purpose: typeof schema.description === 'string' ? schema.description : '', executable: schema.name, schema });
  return [...files].flatMap(([file, text]): LintIssue[] => {
    const tokens = Math.round(text.length / charsPerToken);
    if (tokens <= tokenBudget) return [];
    return [{ at: file, rule: 'size', severity: 'warning', message: `About ${tokens} tokens, over the ${tokenBudget} budget. Shorten descriptions or split commands into groups.` }];
  });
}

/** Deterministic and offline. Errors sort before warnings. */
export function lintSchema(schema: Schema, options: LintOptions = {}): LintIssue[] {
  const issues = [...proseIssues(schema), ...commandIssues(schema, options), ...sizeIssues(schema)];
  return [...issues.filter(issue => issue.severity === 'error'), ...issues.filter(issue => issue.severity === 'warning')];
}
