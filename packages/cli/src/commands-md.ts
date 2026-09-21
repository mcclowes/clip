/**
 * ---
 * purpose: Parse and check the project commands file, the Markdown runbook of named commands and their decorators that CLIP specifies and Saggar reads.
 * related:
 *   - ../../../site/docs/commands.md -The grammar and decorators this module implements.
 *   - ./agents-md.ts - Lists the parsed commands in the AGENTS.md block.
 * ---
 */
import { existsSync, readFileSync } from 'node:fs';
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

export type CommandIssue = { line?: number; severity: 'error' | 'warning'; message: string };

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

export function checkCommands(markdown: string, options: { root?: string; strict?: boolean } = {}): CommandIssue[] {
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
  if (options.strict) issues.push(...strictEffectIssues(markdown));
  if (options.root) issues.push(...manifestDriftIssues(options.root, markdown, Boolean(options.strict)));
  return issues;
}

/** Strict CI requires authors to say whether every shell command is safe, writes files, or is destructive. */
function strictEffectIssues(markdown: string): CommandIssue[] {
  return parseCommands(markdown)
    .filter(entry => isShellCommand(entry) && !entry.effect)
    .map(entry => ({ line: entry.line, severity: 'error' as const, message: 'Declare one effect: #safe, #writes, or #destructive.' }));
}

/** Matches a declared invocation before its optional arguments, without inspecting the task body. */
export function manifestDriftIssues(root: string, markdown: string, strict: boolean): CommandIssue[] {
  const ignored = ignoredCommands(markdown);
  const entries = parseCommands(markdown);
  const declared = manifestCommands(root);
  const severity: CommandIssue['severity'] = strict ? 'error' : 'warning';
  const issues: CommandIssue[] = declared
    .filter(seed => !ignored.has(seed.command) && !entries.some(entry => describesManifestCommand(entry.command, seed.command)))
    .map(seed => ({ severity, message: `${seed.source} declares "${seed.command}", but .clip/commands.md does not describe it.` }));
  for (const manifest of supportedManifests(root)) {
    const declaredCommands = new Set(declared.filter(seed => seed.source === manifest.source).map(seed => seed.command));
    for (const entry of entries) {
      if (ignored.has(entry.command) || !manifest.matches(entry.command) || [...declaredCommands].some(command => describesManifestCommand(entry.command, command))) continue;
      issues.push({ line: entry.line, severity, message: `The commands file describes "${entry.command}", but ${manifest.source} does not declare it.` });
    }
  }
  return issues;
}

const describesManifestCommand = (entry: string, declared: string) => entry === declared || entry.startsWith(`${declared} `);

/** A comment keeps an intentional exclusion out of both Markdown readers and generated agent guidance. */
function ignoredCommands(markdown: string): Set<string> {
  return new Set([...markdown.matchAll(/<!--\s*clip:ignore\s+(.+?)\s*-->/g)].map(match => match[1]!.trim()));
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

export type ManifestCommand = { source: string; name: string; command: string; note?: string };

type SupportedManifest = { source: string; matches: (command: string) => boolean };

/** Reads conventional task manifests without invoking their runners. */
export function seededCommandsTemplate(root: string): string {
  const seeds = manifestCommands(root);
  if (!seeds.length) return commandsTemplate;
  return `# Commands

Named commands for this project, for people and agents. These commands came from task manifests when this file was created. They have no effect decorators, because a manifest says how to run a task, not what it changes. Review and decorate them before relying on them.

<!-- Commands guide: https://clip.marginalutility.dev/docs/commands -->

${seededSections(seeds)}`;
}

/** The same declarations that `commands init` reads, exposed for offline drift checks. */
export function manifestCommands(root: string): ManifestCommand[] {
  return [
    ...packageScripts(root),
    ...makeTargets(root),
    ...justRecipes(root),
    ...taskfileTasks(root),
    ...miseTasks(root),
  ];
}

/** A source is checked only when its manifest exists; unrelated shell commands remain valid. */
function supportedManifests(root: string): SupportedManifest[] {
  const supports = (source: string, files: string[], matches: (command: string) => boolean) => readFirstManifest(root, files) === undefined ? [] : [{ source, matches }];
  return [
    ...supports('package.json scripts', ['package.json'], command => /^npm run \S+(?:\s|$)/.test(command)),
    ...supports('Makefile', ['Makefile', 'makefile', 'GNUmakefile'], command => /^make \S+(?:\s|$)/.test(command)),
    ...supports('justfile', ['justfile', '.justfile'], command => /^just \S+(?:\s|$)/.test(command)),
    ...supports('Taskfile', ['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml', 'taskfile.yaml'], command => /^task \S+(?:\s|$)/.test(command)),
    ...supports('mise', ['mise.toml', '.mise.toml'], command => /^mise run \S+(?:\s|$)/.test(command)),
  ];
}

function packageScripts(root: string): ManifestCommand[] {
  const text = readManifest(root, 'package.json');
  if (!text) return [];
  try {
    const scripts = JSON.parse(text).scripts;
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return [];
    return Object.keys(scripts).filter(name => validTaskName(name) && typeof scripts[name] === 'string').map(name => ({ source: 'package.json scripts', name: `npm ${name}`, command: `npm run ${name}` }));
  } catch {
    return [];
  }
}

/** Only documented, concrete targets are task-like; special, pattern, and variable targets are Make plumbing. */
function makeTargets(root: string): ManifestCommand[] {
  const text = readFirstManifest(root, ['Makefile', 'makefile', 'GNUmakefile']);
  if (!text) return [];
  return text.split(/\r\n?|\n/).flatMap(line => {
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9_./-]*):[^#]*\s##\s*(.*?)\s*$/);
    if (!match || match[1]!.includes('%')) return [];
    return [{ source: 'Makefile', name: `make ${match[1]}`, command: `make ${match[1]}`, note: match[2] || undefined }];
  });
}

function justRecipes(root: string): ManifestCommand[] {
  const text = readFirstManifest(root, ['justfile', '.justfile']);
  if (!text) return [];
  const seeds: ManifestCommand[] = [];
  let comment: string | undefined;
  for (const line of text.split(/\r\n?|\n/)) {
    const description = line.match(/^\s*#\s?(.*?)\s*$/);
    if (description) {
      comment = description[1] || undefined;
      continue;
    }
    const recipe = line.match(/^([A-Za-z0-9][\w-]*)(?:\s+[\w-]+(?:=[^\s]+)?)*\s*:\s*(?:#.*)?$/);
    if (recipe && !['alias', 'export', 'import', 'mod', 'set'].includes(recipe[1]!)) {
      seeds.push({ source: 'justfile', name: `just ${recipe[1]}`, command: `just ${recipe[1]}`, note: comment });
    }
    comment = undefined;
  }
  return seeds;
}

function taskfileTasks(root: string): ManifestCommand[] {
  const text = readFirstManifest(root, ['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml', 'taskfile.yaml']);
  if (!text) return [];
  const seeds: ManifestCommand[] = [];
  let tasksIndent: number | undefined;
  let taskIndent: number | undefined;
  let task: { indent: number; seed: ManifestCommand } | undefined;
  for (const line of text.split(/\r\n?|\n/)) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (tasksIndent === undefined) {
      if (/^\s*tasks:\s*(?:#.*)?$/.test(line)) tasksIndent = indent;
      continue;
    }
    if (line.trim() && indent <= tasksIndent) break;
    const taskMatch = line.match(/^(\s+)([A-Za-z0-9][\w.-]*):\s*(?:#.*)?$/);
    if (taskMatch && taskMatch[1]!.length > tasksIndent && (taskIndent === undefined || taskMatch[1]!.length === taskIndent)) {
      const name = taskMatch[2]!;
      const seed: ManifestCommand = { source: 'Taskfile', name: `task ${name}`, command: `task ${name}` };
      seeds.push(seed);
      taskIndent = taskMatch[1]!.length;
      task = { indent: taskMatch[1]!.length, seed };
      continue;
    }
    const description = line.match(/^\s+desc:\s*(.*?)\s*$/);
    if (task && description && indent > task.indent) task.seed.note = quotedValue(description[1]!);
  }
  return seeds;
}

function miseTasks(root: string): ManifestCommand[] {
  const text = readFirstManifest(root, ['mise.toml', '.mise.toml']);
  if (!text) return [];
  const seeds: ManifestCommand[] = [];
  let task: ManifestCommand | undefined;
  for (const line of text.split(/\r\n?|\n/)) {
    const section = line.match(/^\s*\[tasks\.([^\]]+)]\s*$/);
    if (section) {
      const name = quotedValue(section[1]!);
      task = validTaskName(name) ? { source: 'mise', name: `mise ${name}`, command: `mise run ${name}` } : undefined;
      if (task) seeds.push(task);
      continue;
    }
    if (/^\s*\[/.test(line)) task = undefined;
    const description = line.match(/^\s*description\s*=\s*(.*?)\s*$/);
    if (task && description) task.note = quotedValue(description[1]!);
  }
  return seeds;
}

function seededSections(seeds: ManifestCommand[]): string {
  return [...new Map(seeds.map(seed => [seed.source, seed])).keys()].map(source => {
    const entries = seeds.filter(seed => seed.source === source);
    return `## ${source}\n\n${entries.map(seed => `- ${seed.name}: \`${seed.command}\`${seed.note ? ` — ${escapeNote(seed.note)}` : ''}`).join('\n')}`;
  }).join('\n\n');
}

function readManifest(root: string, file: string): string | undefined {
  const path = join(root, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function readFirstManifest(root: string, files: string[]): string | undefined {
  for (const file of files) {
    const text = readManifest(root, file);
    if (text !== undefined) return text;
  }
  return undefined;
}

function validTaskName(name: string): boolean {
  return Boolean(name) && !/[`\r\n]/.test(name);
}

function quotedValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed.replace(/\s+#.*$/, '');
}

/** A manifest description may contain a decorator-looking word, but only an author may add CLIP decorators. */
function escapeNote(note: string): string {
  return note.replace(/#/g, '\\#');
}
