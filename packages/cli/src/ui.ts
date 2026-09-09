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
import { readTools, removeTool, upsertTool, type Registration, type Scope } from './store.ts';
import { defaultSkillsDir, syncSkills } from './skills.ts';
import { renderScreen, type Item, type Mode, type Tab } from './screen.ts';

type Input = Readable & { isTTY?: boolean; setRawMode?: (value: boolean) => void; resume(): void };
type Output = Writable & { isTTY?: boolean; columns?: number; rows?: number };
type Terminal = { input: Input; output: Output; skillsDir?: string; scope?: Scope };

const keys = { escape: '\x1b', enter: '\r', newline: '\n', backspace: '\x7f', interrupt: '\x03', tab: '\t', up: '\x1b[A', down: '\x1b[B' };
const keyPattern = /\x1b\[[AB]|[\s\S]/g;
const enterAlternateScreen = '\x1b[?1049h\x1b[?25l';
const leaveAlternateScreen = '\x1b[?25h\x1b[?1049l';

type State = {
  tab: Tab; mode: Mode; index: number; query: string; draft: string; notice: string;
  tools: Registration[]; entries: Entry[]; skillsDir: string; scope?: Scope;
};
type Outcome = 'quit' | void;

export async function runUi({ input, output, skillsDir = defaultSkillsDir, scope }: Terminal): Promise<void> {
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
  return visible[Math.min(state.index, Math.max(visible.length - 1, 0))];
}

function setNotice(state: State, message: string): void {
  state.notice = message;
  state.mode = 'browse';
  state.draft = '';
}

function handleKey(state: State, key: string): Outcome {
  if (state.mode === 'browse') return handleBrowse(state, key);
  if (key === keys.escape) {
    state.mode = 'browse';
    state.draft = '';
    return;
  }
  if (state.mode === 'remove') return handleRemove(state, key);
  return handleTextEntry(state, key);
}

function handleBrowse(state: State, key: string): Outcome {
  const active = current(state);
  const isEnter = key === keys.enter || key === keys.newline;
  if (key === 'q' || key === keys.interrupt) return 'quit';
  if (key === keys.tab) {
    state.tab = state.tab === 'registered' ? 'registry' : 'registered';
    state.index = 0;
    state.query = '';
    state.notice = '';
  } else if (key === keys.up || key === 'k') state.index = Math.max(0, state.index - 1);
  else if (key === keys.down || key === 'j') state.index = Math.min(Math.max(items(state).length - 1, 0), state.index + 1);
  else if (key === '/') startPrompt(state, 'search', state.query);
  else if (isEnter && state.tab === 'registry' && active) startPrompt(state, 'purpose', (active as Entry).purpose);
  else if (key === 'd' && state.tab === 'registered' && active) {
    state.mode = 'remove';
    state.notice = '';
  } else if (key === 's') sync(state);
}

function startPrompt(state: State, mode: Mode, draft: string): void {
  state.mode = mode;
  state.draft = draft;
  state.notice = '';
}

function handleRemove(state: State, key: string): void {
  if (key.toLowerCase() === 'y') {
    const name = current(state)!.name;
    removeTool(name, state.scope);
    state.tools = readTools();
    state.index = Math.min(state.index, Math.max(state.tools.length - 1, 0));
    setNotice(state, `Removed ${name}. Run sync to remove its generated skill.`);
  } else if (key.toLowerCase() === 'n' || key === keys.enter || key === keys.newline) state.mode = 'browse';
}

function handleTextEntry(state: State, key: string): void {
  if (key === keys.enter || key === keys.newline) {
    if (state.mode === 'search') {
      state.query = state.draft;
      state.index = 0;
      state.mode = 'browse';
    } else install(state);
  } else if (key === keys.backspace) state.draft = state.draft.slice(0, -1);
  else if (key >= ' ') state.draft += key;
}

function install(state: State): void {
  const entry = current(state) as Entry | undefined;
  if (!entry || !state.draft.trim()) return;
  upsertTool(registryRegistration(entry, state.draft.trim(), state.scope ?? 'global'), state.scope);
  state.tools = readTools();
  setNotice(state, `Installed ${entry.name}.`);
}

function sync(state: State): void {
  const result = syncSkills(state.tools, state.skillsDir);
  setNotice(state, `Synced ${result.items.length} skill${result.items.length === 1 ? '' : 's'} to ${result.directory}.`);
}
