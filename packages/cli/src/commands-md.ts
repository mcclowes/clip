/**
 * ---
 * purpose: Parse and check the project commands file, the Markdown runbook of named commands and their decorators that CLIP specifies and Saggar reads.
 * related:
 *   - ../../../docs/commands.md - The grammar and decorators this module implements.
 *   - ./agents-md.ts - Lists the parsed commands in the AGENTS.md block.
 * ---
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const commandsPath = '.clip/commands.md';
/** Saggar's original location, read until a project moves its file. */
export const legacyCommandsPath = '.saggar/commands.md';

const effects = ['safe', 'writes', 'destructive'] as const;
const lifetimes = ['slow', 'long-running'] as const;
const roles = ['primary', 'companion', 'monitor', 'background', 'quick'] as const;
const surfaces = ['browser', 'simulator'] as const;
export type Effect = (typeof effects)[number];
export type Lifetime = (typeof lifetimes)[number];
export type Role = (typeof roles)[number];
export type Surface = (typeof surfaces)[number];
const flags = ['interactive', 'ci', 'dashboard'] as const;

export type CommandEntry = {
  /** 1-based source line; entries can share a name and a command, so this is the only identity. */
  line: number;
  name: string;
  command: string;
  note?: string;
  /** Whether the bullet sits under `## Layout`, the commands a launcher opens together. */
  layout: boolean;
  /** Every decorator, lowercased, in source order. */
  decorators: string[];
  effect?: Effect;
  lifetime?: Lifetime;
  interactive: boolean;
  ci: boolean;
  role?: Role;
  surface?: Surface;
  icon?: string;
  dashboard: boolean;
  unknown: string[];
};

export type CommandIssue = { line: number; severity: 'error' | 'warning'; message: string };

const includes = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);
/** Lists run least to most cautious, so a conflict resolves to the safer reading. */
const mostCautious = <T extends string>(list: readonly T[], found: string[]): T | undefined => [...list].reverse().find(value => found.includes(value));
const trailingDecorator = /(?:^|\s)#([A-Za-z][\w-]*(?::[\w.-]+)?)\s*$/;
const bulletMarkers = ['- ', '* ', '+ '];
const layoutHeadings = ['layout', 'startup'];

export function findCommandsFile(root: string): { path: string; exists: boolean; legacy: boolean } {
  for (const [relative, legacy] of [[commandsPath, false], [legacyCommandsPath, true]] as const) {
    const path = join(root, relative);
    if (existsSync(path)) return { path, exists: true, legacy };
  }
  return { path: join(root, commandsPath), exists: false, legacy: false };
}

export function parseCommands(markdown: string): CommandEntry[] {
  return readBullets(markdown).flatMap(bullet => (bullet.kind === 'command' ? [bullet.entry] : []));
}

export function checkCommands(markdown: string): CommandIssue[] {
  const issues: CommandIssue[] = [];
  const firstLineByName = new Map<string, number>();
  for (const bullet of readBullets(markdown)) {
    const warn = (message: string) => issues.push({ line: bullet.line, severity: 'warning', message });
    if (bullet.kind === 'unclosed') warn('This bullet has an unclosed code span, so it is not a command.');
    if (bullet.kind === 'empty') warn('This bullet has an empty code span, so it is not a command.');
    if (bullet.kind !== 'command') continue;
    const { entry } = bullet;
    issues.push(...decoratorIssues(entry));
    /** A layout legitimately repeats a command from the menu, so names are keys within a section. */
    const key = `${entry.layout}:${entry.name.toLowerCase()}`;
    const first = firstLineByName.get(key);
    if (first === undefined) firstLineByName.set(key, entry.line);
    else warn(`Another command on line ${first} is also named "${entry.name}".`);
  }
  return issues;
}

/** The decorators an agent acts on, in a fixed order: effect, lifetime, then flags. */
export function agentTags(entry: CommandEntry): string[] {
  return [entry.effect, entry.lifetime, entry.interactive && 'interactive', entry.ci && 'ci'].filter((tag): tag is string => Boolean(tag));
}

/** Commands spelled `@provider prompt` are launcher shorthand for starting an agent, not shell commands. */
export const isShellCommand = (entry: CommandEntry) => !entry.command.startsWith('@');

function decoratorIssues(entry: CommandEntry): CommandIssue[] {
  const issues: CommandIssue[] = [];
  const error = (message: string) => issues.push({ line: entry.line, severity: 'error', message });
  const warn = (message: string) => issues.push({ line: entry.line, severity: 'warning', message });
  const count = (list: readonly string[]) => new Set(entry.decorators.filter(tag => list.includes(tag))).size;
  if (count(effects) > 1) error('Choose one effect: #safe, #writes, or #destructive.');
  if (count(lifetimes) > 1) error('Choose one lifetime: #long-running or #slow.');
  if (entry.ci && entry.lifetime === 'long-running') error('A #ci check has to exit, so it cannot be #long-running.');
  if (count(roles) > 1) error('Choose one role: #primary, #companion, #monitor, #background, or #quick.');
  if (count(surfaces) > 1) error('Choose one surface: #browser or #simulator.');
  if (new Set(entry.decorators.filter(tag => tag.startsWith('icon:'))).size > 1) error('Choose one #icon.');
  for (const tag of entry.unknown) warn(`Unknown decorator #${tag}; readers ignore it.`);
  if (entry.layout && entry.role === 'quick') warn('A layout cannot place a #quick command.');
  if (entry.role === 'quick' && entry.lifetime === 'long-running') warn('A #quick command folds away when it succeeds, but a #long-running one never exits.');
  return issues;
}

type Bullet = { line: number } & ({ kind: 'command'; entry: CommandEntry } | { kind: 'unclosed' | 'empty' });

function readBullets(markdown: string): Bullet[] {
  const bullets: Bullet[] = [];
  let inLayout = false;
  for (const { line, text } of openLines(markdown)) {
    const heading = headingBody(text);
    if (heading) {
      inLayout = isLayoutHeading(heading);
      continue;
    }
    const marker = bulletMarkers.find(prefix => text.startsWith(prefix));
    if (!marker) continue;
    const body = text.slice(marker.length);
    const open = body.indexOf('`');
    if (open === -1) continue;
    const close = body.indexOf('`', open + 1);
    if (close === -1) {
      bullets.push({ line, kind: 'unclosed' });
      continue;
    }
    const command = body.slice(open + 1, close).trim();
    if (!command) {
      bullets.push({ line, kind: 'empty' });
      continue;
    }
    const name = cleanName(body.slice(0, open));
    const { rest, decorators } = splitDecorators(body.slice(close + 1));
    const note = cleanNote(rest);
    bullets.push({ line, kind: 'command', entry: toEntry({ line, name: name || command, command, note, layout: inLayout, decorators }) });
  }
  return bullets;
}

function toEntry(base: { line: number; name: string; command: string; note: string; layout: boolean; decorators: string[] }): CommandEntry {
  const { decorators, note, ...rest } = base;
  const role = roles.find(value => decorators.includes(value));
  const surface = surfaces.find(value => decorators.includes(value));
  const icon = decorators.find(tag => tag.startsWith('icon:'))?.slice('icon:'.length);
  const effect = mostCautious(effects, decorators);
  const lifetime = mostCautious(lifetimes, decorators);
  const known = (tag: string) => includes(effects, tag) || includes(lifetimes, tag) || includes(roles, tag) || includes(surfaces, tag) || includes(flags, tag) || tag.startsWith('icon:');
  return {
    ...rest,
    ...(note ? { note } : {}),
    decorators,
    ...(effect ? { effect } : {}),
    ...(lifetime ? { lifetime } : {}),
    interactive: decorators.includes('interactive'),
    ci: decorators.includes('ci'),
    ...(role ? { role } : {}),
    ...(surface ? { surface } : {}),
    ...(icon ? { icon } : {}),
    dashboard: decorators.includes('dashboard'),
    unknown: decorators.filter(tag => !known(tag)),
  };
}

/** Peels `#word` tokens off the end of the text; with none, reads the retired `[role]` form. */
function splitDecorators(raw: string): { rest: string; decorators: string[] } {
  let rest = raw.trim();
  const decorators: string[] = [];
  for (let match = rest.match(trailingDecorator); match; match = rest.match(trailingDecorator)) {
    decorators.unshift(normalizeDecorator(match[1]!));
    rest = rest.slice(0, match.index).trimEnd();
  }
  if (decorators.length) return { rest, decorators };
  const bracket = rest.match(/\[\s*([A-Za-z]+)\s*\]$/);
  const role = bracket?.[1]?.toLowerCase();
  if (bracket && role && includes(roles, role)) return { rest: rest.slice(0, bracket.index).trimEnd(), decorators: [role] };
  return { rest, decorators };
}

/** Keywords are case-insensitive; an icon's value is kept as written. */
function normalizeDecorator(token: string): string {
  const colon = token.indexOf(':');
  return colon === -1 ? token.toLowerCase() : `${token.slice(0, colon).toLowerCase()}${token.slice(colon)}`;
}

function openLines(markdown: string): { line: number; text: string }[] {
  const lines: { line: number; text: string }[] = [];
  let inFence = false;
  markdown.replace(/\r\n?/g, '\n').split('\n').forEach((raw, index) => {
    const text = raw.trim();
    if (text.startsWith('```') || text.startsWith('~~~')) inFence = !inFence;
    else if (!inFence) lines.push({ line: index + 1, text });
  });
  return lines;
}

/** Hashes need a following space so a `#hashtag` in prose isn't a heading. */
function headingBody(text: string): { level: number; text: string } | undefined {
  const match = text.match(/^(#{1,6})(?:\s+(.*?))?\s*#*\s*$/);
  return match ? { level: match[1]!.length, text: (match[2] ?? '').trim() } : undefined;
}

function isLayoutHeading(heading: { level: number; text: string }): boolean {
  if (heading.level !== 2) return false;
  const name = heading.text.replace(/\s+(#auto|\[\s*auto\s*\])$/i, '').trim().toLowerCase();
  return layoutHeadings.includes(name);
}

function cleanName(raw: string): string {
  return raw.trim().replace(/[\s:\-–—]+$/, '').replace(/^[*_]+|[*_]+$/g, '').trim();
}

/** Only a doubled slash introduces a note, so a note opening on a path keeps it. */
function cleanNote(raw: string): string {
  return raw.trim().replace(/^(?:[:\-–—]|\/\/|\s)+/, '').trim();
}

export const commandsTemplate = `# Commands

Named commands for this project, for people and agents. Each bullet is a name, the command in backticks, and an optional note after a dash or \`//\`. Everything else in this file is prose, and ignored.

<!-- Commands guide: https://clip.marginalutility.dev/docs/commands -->

Trailing decorators say what a command does, so an agent knows when it may run it. \`#safe\` changes nothing outside build output and caches. \`#writes\` edits tracked files. \`#destructive\` can't be undone or reaches beyond this machine, so an agent asks first. No effect decorator means unknown.

\`#long-running\` never exits on its own. \`#slow\` exits, but takes minutes. \`#interactive\` needs a person at the terminal. \`#ci\` is the local equivalent of CI's required checks.

Launchers such as Saggar also read where a command opens: \`#primary\`, \`#companion\`, \`#monitor\`, \`#background\`, or \`#quick\`.

## Layout

The commands a launcher opens together. Add \`#auto\` to this heading to open them with the project.

- Dev server: \`npm run dev\` — the one you leave running #long-running
- Tests: \`npm test\` #safe #monitor

## Everything else

- Check: \`npm run check\` — what CI runs #safe #ci
- Format: \`npm run format\` #writes
- Deploy: \`npm run deploy\` #destructive
`;
