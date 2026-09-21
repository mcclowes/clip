/**
 * ---
 * purpose: Shape command results for agents (paged JSON) and people (text).
 * ---
 */
import { contract } from './contract.ts';
import { agentTags } from './commands-md.ts';
import type { MutationMarker, RegistryReview } from './refresh.ts';
export function page<T>(items: T[], limit: number) {
  return { items: items.slice(0, limit), total: items.length, truncated: items.length > limit };
}
export const renderVersion = () => `clip ${contract.version}`;
export function renderText(result: any): string {
  if (result === contract) return renderHelp();
  if (isRefreshResult(result) && (result.pending.length || result.accepted?.length)) return renderRefresh(result);
  if (result.items || result.agents_md) return renderItems(result);
  const single = renderSingle(result);
  if (single) return single;
  return JSON.stringify(result, null, 2);
}

type RefreshResult = { accepted?: string[]; pending: RegistryReview[] };
function isRefreshResult(result: unknown): result is RefreshResult {
  return Boolean(result) && typeof result === 'object' && Array.isArray((result as { pending?: unknown }).pending);
}

function renderRefresh(result: RefreshResult): string {
  const lines = result.accepted?.length ? [`Accepted registry updates: ${result.accepted.join(', ')}`, ''] : [];
  for (const review of result.pending) {
    lines.push(`Pending registry review: ${review.name}`);
    if (review.mutations.length) {
      lines.push('MUTATION MARKERS');
      lines.push(...review.mutations.map(change => `  ${change.command}: ${mutationLabel(change.from)} -> ${mutationLabel(change.to)}`));
    }
    if (review.diff.length) {
      lines.push('Agent-facing diff');
      lines.push(...review.diff.flatMap(file => file.text.split('\n')));
    }
    lines.push(`Accept it with: clip refresh --accept ${review.name}`, '');
  }
  lines.push('For CI, use clip refresh --accept-all.');
  return lines.join('\n').trimEnd();
}

const mutationLabel = (marker: MutationMarker) => marker === 'unknown' ? 'mutation unknown' : marker ? 'mutating' : 'read-only';

function renderHelp(): string {
  return [
    `CLIP ${contract.version} — Command Line Interface Protocol`, '',
    ...contract.commands.map(command => `  clip ${[command.name, ...command.args.map(usage)].join(' ')}\n    ${command.description}`),
    '', 'Options: --output auto|json|text, --limit 100, --scope local|shared|global, --help, --version',
  ].join('\n');
}

function usage(arg: { name: string; required: boolean }): string {
  if (!arg.required) return `[${arg.name}]`;
  const value = `<${arg.name.replace(/^--/, '')}>`;
  return arg.name.startsWith('--') ? `${arg.name} ${value}` : value;
}

function renderItems(result: any): string {
  const lines = (result.items ?? []).map(itemLine);
  if (result.items && !lines.length) lines.push('No results.');
  if (result.truncated) lines.push(`Showing ${result.items.length} of ${result.total}; increase --limit for more.`);
  if (result.directory) lines.push(`Skills: ${result.directory}`);
  if (result.agents_md) lines.push(`Agents file: ${result.agents_md.file} (${result.agents_md.changed ? 'updated' : 'unchanged'})`);
  return lines.join('\n');
}

function renderSingle(result: any): string | undefined {
  if (typeof result.file === 'string' && typeof result.next === 'string') return `Wrote ${result.file}\n${result.next}`;
  if (typeof result.removed === 'string') return `Removed ${result.removed}`;
  if (typeof result.name === 'string' && typeof result.executable === 'string' && typeof result.purpose === 'string' && result.source) return `Registered ${result.name}`;
  return undefined;
}

const validationTags: Record<string, string> = { validated: 'agent-validated', failed: 'agent validation failed', stale: 'agent validation stale' };

function itemLine(item: any): string {
  if (typeof item === 'string') return item;
  if (item.severity) return `${item.line ?? item.at}: ${item.severity}: ${item.message}`;
  if (item.command !== undefined) {
    const tags = agentTags(item);
    return `${item.name}\t${item.command}${tags.length ? ` [${tags.join(', ')}]` : ''}`;
  }
  const tag = item.scope ?? validationTags[item.agent_validation];
  const label = `${item.id ?? item.name}${tag ? ` [${tag}]` : ''}`;
  const summary = item.purpose ?? item.executable ?? item.status ?? '';
  return `${label}\t${summary}${item.message ? `: ${item.message}` : ''}`;
}
