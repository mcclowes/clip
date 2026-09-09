/**
 * ---
 * purpose: Provide the interactive terminal interface for browsing and managing CLIP tools.
 * related:
 *   - ./store.ts - Reads and changes registered tools.
 *   - ./registry.ts - Supplies installable registry entries.
 *   - ./skills.ts - Synchronizes registrations into agent skills.
 * ---
 */
import type { Readable, Writable } from 'node:stream';
import { catalog, registrySchema, type Entry } from './registry.ts';
import { executablePath } from './discovery.ts';
import { readTools, removeTool, updateTools, type Registration, type Scope } from './store.ts';
import { syncSkills } from './skills.ts';

type Input = Readable & { isTTY?: boolean; setRawMode?: (value: boolean) => void; resume(): void };
type Output = Writable & { isTTY?: boolean; columns?: number; rows?: number };
type Terminal = { input: Input; output: Output; skillsDir?: string; scope?: Scope };
type Tab = 'registered' | 'registry';
type Mode = 'browse' | 'search' | 'purpose' | 'remove';

const clear = '\x1b[2J\x1b[H';
const selected = '\x1b[7m';
const reset = '\x1b[0m';

export async function runUi({ input, output, skillsDir = '.agents/skills', scope }: Terminal): Promise<void> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) throw new Error('clip ui requires an interactive terminal.');
  let tab: Tab = 'registered';
  let mode: Mode = 'browse';
  let index = 0;
  let query = '';
  let draft = '';
  let notice = '';
  let tools = readTools();
  const entries = catalog();

  const items = (): Array<Registration | Entry> => {
    const source = tab === 'registered' ? tools : entries;
    const needle = query.toLowerCase();
    return needle ? source.filter(item => `${item.name} ${item.purpose}`.toLowerCase().includes(needle)) : source;
  };
  const current = () => items()[Math.min(index, Math.max(items().length - 1, 0))];
  const render = () => {
    const width = Math.max(50, output.columns ?? 80);
    const height = Math.max(12, output.rows ?? 24);
    const pageSize = Math.max(1, height - 12);
    const offset = Math.max(0, Math.min(index, Math.max(items().length - pageSize, 0)));
    const visible = items().slice(offset, offset + pageSize);
    const active = current();
    const lines = [
      ' CLIP',
      ` ${tab === 'registered' ? `${selected} Registered ${reset}` : ' Registered '}  ${tab === 'registry' ? `${selected} Registry ${reset}` : ' Registry '}`,
      ` ${mode === 'search' ? `Search: ${draft}_` : query ? `Search: ${query}` : ''}`,
      ' ' + '─'.repeat(width - 2),
      ...visible.map((item, itemIndex) => ` ${itemIndex + offset === index ? selected : ''}${item.name.padEnd(20)} ${item.purpose.slice(0, width - 25)}${itemIndex + offset === index ? reset : ''}`),
      ...(visible.length ? [] : [' No tools found.']),
      '',
      ...(active ? [` ${active.name}`, ` ${active.purpose}`, ` ${'category' in active ? active.category + ' · ' + active.coverage : active.executable}`] : []),
      ...(mode === 'purpose' ? ['', ` Purpose: ${draft}_`] : []),
      ...(mode === 'remove' ? ['', ` Remove ${active?.name}? [y/N]`] : []),
      ...(notice ? ['', ` ${notice}`] : []),
      '',
      mode === 'browse'
        ? ` ↑↓ Move  Tab Switch  / Search  ${tab === 'registry' ? 'Enter Install' : 'd Remove'}  s Sync  q Quit`
        : ' Enter Confirm  Esc Cancel',
    ];
    output.write(clear + lines.slice(0, height).join('\n'));
  };

  const setNotice = (message: string) => { notice = message; mode = 'browse'; draft = ''; };
  const install = () => {
    const entry = current() as Entry | undefined;
    if (!entry || !draft.trim()) return;
    const schema = registrySchema(entry);
    const registration: Registration = {
      name: schema.name,
      executable: executablePath(entry.executable),
      purpose: draft.trim(),
      schema,
      source: { kind: 'registry', id: entry.id, version: entry.version, maintainer: entry.maintainer, sha256: entry.sha256 },
    };
    updateTools(existing => [...existing.filter(tool => tool.name !== registration.name), registration], scope);
    tools = readTools();
    setNotice(`Installed ${entry.name}.`);
  };

  input.setEncoding('utf8');
  input.setRawMode(true);
  input.resume();
  output.write('\x1b[?1049h\x1b[?25l');
  render();
  try {
    outer: for await (const chunk of input) {
      const keys = String(chunk).match(/\x1b\[[AB]|[\s\S]/g) ?? [];
      for (const key of keys) {
        try {
          if (mode === 'browse') {
            if (key === 'q' || key === '\x03') break outer;
            if (key === '\t') { tab = tab === 'registered' ? 'registry' : 'registered'; index = 0; query = ''; notice = ''; }
            else if (key === '\x1b[A' || key === 'k') index = Math.max(0, index - 1);
            else if (key === '\x1b[B' || key === 'j') index = Math.min(Math.max(items().length - 1, 0), index + 1);
            else if (key === '/') { mode = 'search'; draft = query; notice = ''; }
            else if ((key === '\r' || key === '\n') && tab === 'registry' && current()) { mode = 'purpose'; draft = (current() as Entry).purpose; notice = ''; }
            else if (key === 'd' && tab === 'registered' && current()) { mode = 'remove'; notice = ''; }
            else if (key === 's') { const result = syncSkills(tools, skillsDir); setNotice(`Synced ${result.items.length} skill${result.items.length === 1 ? '' : 's'} to ${result.directory}.`); }
          } else if (key === '\x1b') { mode = 'browse'; draft = ''; }
          else if (mode === 'remove') {
            if (key.toLowerCase() === 'y') {
              const name = current()!.name;
              removeTool(name, scope);
              tools = readTools();
              index = Math.min(index, Math.max(tools.length - 1, 0));
              setNotice(`Removed ${name}. Run sync to remove its generated skill.`);
            } else if (key.toLowerCase() === 'n' || key === '\r' || key === '\n') mode = 'browse';
          } else if (key === '\r' || key === '\n') {
            if (mode === 'search') { query = draft; index = 0; mode = 'browse'; }
            else install();
          } else if (key === '\x7f') draft = draft.slice(0, -1);
          else if (key >= ' ' && key !== '\x7f') draft += key;
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error));
        }
        render();
      }
    }
  } finally {
    input.setRawMode(false);
    output.write('\x1b[?25h\x1b[?1049l');
  }
}
