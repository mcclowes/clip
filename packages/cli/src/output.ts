/**
 * ---
 * purpose: Shape command results for agents (paged JSON) and people (text).
 * ---
 */
import { contract } from './contract.ts';
export function page<T>(items: T[], limit: number) {
  return { items: items.slice(0, limit), total: items.length, truncated: items.length > limit };
}
export const renderVersion = () => `clip ${contract.version}`;
export function renderText(result: any): string {
  if (result === contract) return renderHelp();
  if (result.items) return renderItems(result);
  return JSON.stringify(result, null, 2);
}

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
  const lines = result.items.map(itemLine);
  if (!lines.length) lines.push('No results.');
  if (result.truncated) lines.push(`Showing ${result.items.length} of ${result.total}; increase --limit for more.`);
  if (result.directory) lines.push(`Skills: ${result.directory}`);
  return lines.join('\n');
}

function itemLine(item: any): string {
  if (typeof item === 'string') return item;
  const label = `${item.id ?? item.name}${item.scope ? ` [${item.scope}]` : ''}`;
  const summary = item.purpose ?? item.executable ?? item.status ?? '';
  return `${label}\t${summary}${item.message ? `: ${item.message}` : ''}`;
}
