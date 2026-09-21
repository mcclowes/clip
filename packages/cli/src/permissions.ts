/**
 * ---
 * purpose: Propose agent permission allow rules from mutation markers, and merge them into Claude Code settings.
 * related:
 *   - ./registry.ts - trustOf decides which schemas are eligible.
 * ---
 */
import type { Operation } from './schema.ts';
import type { Registration } from './store.ts';

export type Skip = { tool: string; command?: string; reason: string };
export type Proposal = { allow: string[]; skipped: Skip[] };

/** A word a prefix rule can match on exactly. Placeholders and flags would widen the rule to the whole tool. */
const literalWord = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const claudeRule = (tool: string, path: string) => `Bash(${tool} ${path}:*)`;

/** Only leaves are candidates: a parent's prefix also matches every child, including mutating ones. */
function leaves(items: Operation[], parent = ''): { path: string; operation: Operation }[] {
  return items.flatMap(operation => {
    const path = parent ? `${parent} ${operation.name}` : operation.name;
    return operation.subcommands?.length ? leaves(operation.subcommands, path) : [{ path, operation }];
  });
}

function skipReason(path: string, mutating: boolean | undefined): string | undefined {
  if (mutating === true) return 'mutating';
  if (mutating === undefined) return 'mutation unknown';
  if (!path.split(' ').every(word => literalWord.test(word))) return 'not a literal command path';
  return undefined;
}

export function proposeRules(tools: Registration[], eligible: (tool: Registration) => boolean): Proposal {
  const allow = new Set<string>();
  const skipped: Skip[] = [];
  for (const tool of tools) {
    const operations = tool.schema?.commands ?? tool.schema?.capabilities;
    if (!operations) { skipped.push({ tool: tool.name, reason: 'no schema' }); continue; }
    if (!eligible(tool)) { skipped.push({ tool: tool.name, reason: `unreviewed; pass --trust ${tool.name} to include it` }); continue; }
    for (const { path, operation } of leaves(operations)) {
      const reason = skipReason(path, operation.mutating);
      if (reason) skipped.push({ tool: tool.name, command: path, reason });
      else allow.add(claudeRule(tool.name, path));
    }
  }
  return { allow: [...allow], skipped };
}

export function mergeClaudeSettings(text: string | undefined, rules: string[]): { text: string; added: string[]; existing: string[] } {
  const settings = text === undefined ? {} : JSON.parse(text);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Claude settings must be a JSON object.');
  const permissions = settings.permissions ?? {};
  if (typeof permissions !== 'object' || Array.isArray(permissions)) throw new Error('Claude settings permissions must be an object.');
  const current: unknown = permissions.allow ?? [];
  if (!Array.isArray(current)) throw new Error('Claude settings permissions.allow must be a list.');
  const added = rules.filter(rule => !current.includes(rule));
  const merged = { ...settings, permissions: { ...permissions, allow: [...current, ...added] } };
  return { text: `${JSON.stringify(merged, null, 2)}\n`, added, existing: rules.filter(rule => current.includes(rule)) };
}
