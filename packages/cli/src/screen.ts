/**
 * ---
 * purpose: Render the interactive UI state as terminal text, with no knowledge of input, storage, or effects.
 * related:
 *   - ./ui.ts - Owns the state this renders and the key handling that changes it.
 * ---
 */
import type { Entry } from './registry.ts';
import type { Registration } from './store.ts';

export type Tab = 'registered' | 'registry';
export type Mode = 'browse' | 'search' | 'purpose' | 'remove';
export type Item = Registration | Entry;
export type View = {
  tab: Tab; mode: Mode; index: number; query: string; draft: string; notice: string;
  items: Item[]; columns?: number; rows?: number;
};

const clear = '\x1b[2J\x1b[H';
const invert = '\x1b[7m';
const reset = '\x1b[0m';
const minColumns = 50;
const minRows = 12;
/** Rows reserved for the header, detail pane, prompts, and footer. */
const chromeRows = 12;
const nameColumn = 20;

const isEntry = (item: Item): item is Entry => 'category' in item;
const detail = (item: Item) => (isEntry(item) ? `${item.category} · ${item.coverage}` : item.executable);
const highlight = (text: string, active: boolean) => (active ? `${invert}${text}${reset}` : text);

export function visibleRange(count: number, index: number, rows: number | undefined): { offset: number; pageSize: number } {
  const pageSize = Math.max(1, Math.max(minRows, rows ?? 24) - chromeRows);
  return { offset: Math.max(0, Math.min(index, Math.max(count - pageSize, 0))), pageSize };
}

export function renderScreen(view: View): string {
  const width = Math.max(minColumns, view.columns ?? 80);
  const height = Math.max(minRows, view.rows ?? 24);
  const { offset, pageSize } = visibleRange(view.items.length, view.index, view.rows);
  const visible = view.items.slice(offset, offset + pageSize);
  const active = view.items[Math.min(view.index, Math.max(view.items.length - 1, 0))];
  const lines = [
    ' CLIP',
    ` ${highlight(' Registered ', view.tab === 'registered')}  ${highlight(' Registry ', view.tab === 'registry')}`,
    ` ${searchLine(view)}`,
    ' ' + '─'.repeat(width - 2),
    ...visible.map((item, row) => ` ${highlight(`${item.name.padEnd(nameColumn)} ${item.purpose.slice(0, width - 25)}`, row + offset === view.index)}`),
    ...(visible.length ? [] : [' No tools found.']),
    '',
    ...(active ? [` ${active.name}`, ` ${active.purpose}`, ` ${detail(active)}`] : []),
    ...(view.mode === 'purpose' ? ['', ` Purpose: ${view.draft}_`] : []),
    ...(view.mode === 'remove' ? ['', ` Remove ${active?.name}? [y/N]`] : []),
    ...(view.notice ? ['', ` ${view.notice}`] : []),
    '',
    footer(view),
  ];
  return clear + lines.slice(0, height).join('\n');
}

function searchLine({ mode, draft, query }: View): string {
  if (mode === 'search') return `Search: ${draft}_`;
  return query ? `Search: ${query}` : '';
}

function footer({ mode, tab }: View): string {
  if (mode !== 'browse') return ' Enter Confirm  Esc Cancel';
  return ` ↑↓ Move  Tab Switch  / Search  ${tab === 'registry' ? 'Enter Install' : 'd Remove'}  s Sync  q Quit`;
}
