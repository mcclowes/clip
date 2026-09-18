/**
 * ---
 * purpose: Own interactive UI state and key handling for browsing and managing CLIP tools.
 * related:
 *   - ./screen.ts - Renders this state as terminal text.
 *   - ./store.ts - Reads and changes registered tools.
 *   - ./registry.ts - Supplies installable registry entries.
 *   - ./skills.ts - Synchronizes registrations into agent skills.
 * ---
 */
import type { Readable, Writable } from 'node:stream';
import { catalog, registryRegistration, type Entry } from './registry.ts';
import { defaultScope, readTools, removeTool, upsertTool, type Registration, type Scope } from './store.ts';
import { defaultSkillsDir, syncSkills } from './skills.ts';
import { clampIndex, isEntry, renderScreen, type Item, type Mode, type Tab } from './screen.ts';

type Input = Readable & { isTTY?: boolean; setRawMode?: (value: boolean) => void; resume(): void };
type Output = Writable & { isTTY?: boolean; columns?: number; rows?: number };
type Terminal = { input: Input; output: Output; skillsDir?: string; scope?: Scope };

const keys = { escape: '\x1b', enter: '\r', newline: '\n', backspace: '\x7f', interrupt: '\x03', tab: '\t', up: '\x1b[A', down: '\x1b[B' };
const isEnter = (key: string) => key === keys.enter || key === keys.newline;
const keyPattern = /\x1b\[[AB]|[\s\S]/g;
const enterAlternateScreen = '\x1b[?1049h\x1b[?25l';
const leaveAlternateScreen = '\x1b[?25h\x1b[?1049l';

type State = {
  tab: Tab; mode: Mode; index: number; query: string; draft: string; notice: string;
  tools: Registration[]; entries: Entry[]; skillsDir: string; scope: Scope;
};
type Outcome = 'quit' | void;

export async function runUi({ input, output, skillsDir = defaultSkillsDir, scope = defaultScope() }: Terminal): Promise<void> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) throw new Error('clip ui requires an interactive terminal.');
  const state: State = {
    tab: 'registered', mode: 'browse', index: 0, query: '', draft: '', notice: '',
    tools: readTools(), entries: catalog(), skillsDir, scope,
  };
  const render = () => output.write(renderScreen({ ...state, items: items(state), columns: output.columns, rows: output.rows }));

  input.setEncoding('utf8');
  input.setRawMode(true);
  input.resume();
  output.write(enterAlternateScreen);
  render();
  try {
    for await (const chunk of input) {
      for (const key of String(chunk).match(keyPattern) ?? []) {
        let outcome: Outcome = undefined;
        try {
          outcome = handleKey(state, key);
        } catch (error) {
          setNotice(state, error instanceof Error ? error.message : String(error));
        }
        render();
        if (outcome === 'quit') return;
      }
    }
  } finally {
    input.setRawMode(false);
    output.write(leaveAlternateScreen);
  }
}

function items(state: State): Item[] {
  const source: Item[] = state.tab === 'registered' ? state.tools : state.entries;
  const needle = state.query.toLowerCase();
  return needle ? source.filter(item => `${item.name} ${item.purpose}`.toLowerCase().includes(needle)) : source;
}

function current(state: State): Item | undefined {
  const visible = items(state);
  return visible[clampIndex(state.index, visible.length)];
}

function setNotice(state: State, message: string): void {
  state.notice = message;
  state.mode = 'browse';
  state.draft = '';
}

/** Mode is resolved here once; every handler below serves a single mode. */
function handleKey(state: State, key: string): Outcome {
  if (state.mode === 'browse') return handleBrowse(state, key);
  if (key === keys.escape) return cancelPrompt(state);
  if (state.mode === 'remove') return handleRemove(state, key);
  if (!isEnter(key)) return editDraft(state, key);
  if (state.mode === 'search') return applySearch(state);
  return install(state);
}

function handleBrowse(state: State, key: string): Outcome {
  const active = current(state);
  switch (key) {
    case 'q': case keys.interrupt: return 'quit';
    case keys.tab: return switchTab(state);
    case keys.up: case 'k': state.index = Math.max(0, state.index - 1); return;
    case keys.down: case 'j': state.index = clampIndex(state.index + 1, items(state).length); return;
    case '/': return startPrompt(state, 'search', state.query);
    case 's': return sync(state);
    case keys.enter: case keys.newline:
      if (state.tab === 'registry' && active) startPrompt(state, 'purpose', active.purpose);
      return;
    case 'd':
      if (state.tab === 'registered' && active) startPrompt(state, 'remove', '');
      return;
  }
}

function switchTab(state: State): void {
  state.tab = state.tab === 'registered' ? 'registry' : 'registered';
  state.index = 0;
  state.query = '';
  state.notice = '';
}

function startPrompt(state: State, mode: Mode, draft: string): void {
  state.mode = mode;
  state.draft = draft;
  state.notice = '';
}

function cancelPrompt(state: State): void {
  state.mode = 'browse';
  state.draft = '';
}

function handleRemove(state: State, key: string): void {
  if (key.toLowerCase() === 'y') return confirmRemove(state);
  if (key.toLowerCase() === 'n' || isEnter(key)) state.mode = 'browse';
}

function confirmRemove(state: State): void {
  const name = current(state)!.name;
  removeTool(name, state.scope);
  state.tools = readTools();
  state.index = clampIndex(state.index, state.tools.length);
  setNotice(state, `Removed ${name}. Run sync to remove its generated skill.`);
}

function editDraft(state: State, key: string): void {
  if (key === keys.backspace) state.draft = state.draft.slice(0, -1);
  else if (key >= ' ') state.draft += key;
}

function applySearch(state: State): void {
  state.query = state.draft;
  state.index = 0;
  state.mode = 'browse';
}

function install(state: State): void {
  const entry = current(state);
  if (!entry || !isEntry(entry) || !state.draft.trim()) return;
  upsertTool(registryRegistration(entry, state.draft.trim(), state.scope), state.scope);
  state.tools = readTools();
  setNotice(state, `Installed ${entry.name}.`);
}

function sync(state: State): void {
  const result = syncSkills(state.tools, state.skillsDir);
  setNotice(state, `Synced ${result.items.length} skill${result.items.length === 1 ? '' : 's'} to ${result.directory}.`);
}
