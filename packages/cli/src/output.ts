/**
 * ---
 * purpose: Shape command results for agents (paged JSON) and people (text).
 * ---
 */
import { contract } from './contract.ts';
export function page<T>(items: T[], limit: number) {
  return { items: items.slice(0, limit), total: items.length, truncated: items.length > limit };
}
export function renderText(result: any): string {
  if (result === contract) return [
    `CLIP ${contract.version} — Command Line Interface Protocol`, '',
    ...contract.commands.map(command => `  clip ${command.name}${command.args.length ? ' ' + command.args.map(arg => arg.required ? `${arg.name.startsWith('--') ? arg.name + ' ' : ''}<${arg.name.replace(/^--/, '')}>` : `[${arg.name}]`).join(' ') : ''}\n    ${command.description}`),
    '', 'Options: --output auto|json|text, --limit 100, --scope local|shared|global, --help, --version',
  ].join('\n');
  if (result.version && result.name === 'clip' && !result.commands) return `clip ${result.version}`;
  if (result.items) {
    const lines = result.items.map((item: any) => typeof item === 'string' ? item : `${item.id ?? item.name}${item.scope ? ` [${item.scope}]` : ''}\t${item.purpose ?? item.executable ?? item.status ?? ''}${item.message ? `: ${item.message}` : ''}`);
    if (!lines.length) lines.push('No results.');
    if (result.truncated) lines.push(`Showing ${result.items.length} of ${result.total}; increase --limit for more.`);
    if (result.directory) lines.push(`Skills: ${result.directory}`);
    return lines.join('\n');
  }
  return JSON.stringify(result, null, 2);
}
