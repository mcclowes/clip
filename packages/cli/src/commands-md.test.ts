import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCommands, commandsTemplate, findCommandsFile, parseCommands } from './commands-md.ts';

for (const kind of ['directory', 'directory-link', 'dangling'] as const) {
  test(`command-file discovery skips a modern ${kind} and preserves the default when neither file is usable`, t => {
    const root = mkdtempSync(join(tmpdir(), 'clip-command-path-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const modern = join(root, '.clip/commands.md');
    const legacy = join(root, '.saggar/commands.md');
    mkdirSync(join(root, '.clip'));
    mkdirSync(join(root, '.saggar'));
    if (kind === 'directory') mkdirSync(modern);
    else {
      const target = join(root, 'target');
      if (kind === 'directory-link') mkdirSync(target);
      symlinkSync(target, modern);
    }
    writeFileSync(legacy, '- Legacy: `node --version` #safe\n');
    assert.deepEqual(findCommandsFile(root), { path: legacy, exists: true, legacy: true });
    unlinkSync(legacy);
    assert.deepEqual(findCommandsFile(root), { path: modern, exists: false, legacy: false });
    mkdirSync(legacy);
    assert.deepEqual(findCommandsFile(root), { path: modern, exists: false, legacy: false });
  });
}

test('regular modern files and file links retain precedence over legacy files', t => {
  const root = mkdtempSync(join(tmpdir(), 'clip-command-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const modern = join(root, '.clip/commands.md');
  mkdirSync(join(root, '.clip'));
  mkdirSync(join(root, '.saggar'));
  writeFileSync(join(root, '.saggar/commands.md'), 'Legacy\n');
  const target = join(root, 'target.md');
  writeFileSync(target, 'Modern\n');
  symlinkSync(target, modern);
  assert.deepEqual(findCommandsFile(root), { path: modern, exists: true, legacy: false });
  unlinkSync(modern);
  writeFileSync(modern, 'Modern\n');
  assert.deepEqual(findCommandsFile(root), { path: modern, exists: true, legacy: false });
});

test('cyclic command-file links retain fallback and missing-file behavior', t => {
  const root = mkdtempSync(join(tmpdir(), 'clip-command-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const modern = join(root, '.clip/commands.md');
  const legacy = join(root, '.saggar/commands.md');
  mkdirSync(join(root, '.clip'));
  mkdirSync(join(root, '.saggar'));
  symlinkSync(modern, modern);
  writeFileSync(legacy, 'Legacy\n');
  assert.deepEqual(findCommandsFile(root), { path: legacy, exists: true, legacy: true });
  unlinkSync(legacy);
  assert.deepEqual(findCommandsFile(root), { path: modern, exists: false, legacy: false });
});

test('a bullet with a code span is a command: name before, command inside, note after', () => {
  const [entry] = parseCommands('# Commands\n\n- **Dev server**: `npm run dev` — the one you leave running\n');
  assert.deepEqual(entry, {
    line: 3, name: 'Dev server', command: 'npm run dev', note: 'the one you leave running', layout: false,
    decorators: [], interactive: false, ci: false, dashboard: false, unknown: [],
  });
});

test('prose, fenced blocks, unclosed spans, and empty spans are not commands', () => {
  const entries = parseCommands([
    'Run `npm test` before pushing.',
    '```', '- Hidden: `rm -rf /`', '```',
    '- Broken: `npm run',
    '- Empty: ``',
    '* Star bullet: `make`',
    '  + Nested plus: `make test`',
    '- `npm run lint`',
  ].join('\n'));
  assert.deepEqual(entries.map(entry => [entry.line, entry.name, entry.command]), [
    [7, 'Star bullet', 'make'], [8, 'Nested plus', 'make test'], [9, 'npm run lint', 'npm run lint'],
  ]);
});

test('long fences keep shorter example fences out of commands and validation', () => {
  const markdown = [
    '````markdown', '```shell', '- Example: `echo example` #safe #destructive',
    '```', '````', '- Real: `node --version` #safe',
  ].join('\n');
  assert.deepEqual(parseCommands(markdown).map(entry => [entry.line, entry.name]), [[6, 'Real']]);
  assert.deepEqual(checkCommands(markdown, { strict: true }), []);
});

for (const [name, opening, inner, closing] of [
  ['different characters', '```', '~~~', '```'],
  ['shorter delimiters and a longer closer', '~~~~', '~~~', '~~~~~'],
  ['a closing-looking line with text', '```', '```` trailing text', '```'],
] as const) {
  test(`fences ignore ${name} without changing the surrounding layout`, () => {
    const markdown = [opening, inner, '## Layout', '- Example: `bad` #safe #destructive', closing, '- Real: `ok` #safe'].join('\n');
    assert.deepEqual(parseCommands(markdown).map(entry => [entry.line, entry.name, entry.layout]), [[6, 'Real', false]]);
    assert.deepEqual(checkCommands(markdown, { strict: true }), []);
  });
}

test('backticks invalidate backtick info strings but are allowed after tilde fences', () => {
  assert.deepEqual(parseCommands('```invalid`info\n- Real: `ok` #safe\n').map(entry => [entry.line, entry.name]), [[2, 'Real']]);
  const markdown = '~~~valid`info\n- Example: `bad` #safe #destructive\n~~~\n- Real: `ok` #safe\n';
  assert.deepEqual(parseCommands(markdown).map(entry => [entry.line, entry.name]), [[4, 'Real']]);
  assert.deepEqual(checkCommands(markdown, { strict: true }), []);
});

test('an unclosed fence hides all remaining commands and validation warnings', () => {
  for (const [opening, other] of [['```', '~~~'], ['~~~', '```']]) {
    const markdown = [opening, other, '## Layout', '- Example: `bad` #safe #destructive', '- Unclosed: `bad'].join('\n');
    assert.deepEqual(parseCommands(markdown), []);
    assert.deepEqual(checkCommands(markdown, { strict: true }), []);
  }
});

for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']] as const) {
  test(`fences retain ${name} line numbers, indentation, layout, and decorators`, () => {
    const markdown = [
      '    ````markdown', '\t```', '- Example: `bad` #safe #destructive', '\t```', '  `````\t ',
      '## Layout #auto', '   - Real: `ok` #safe #monitor #ci',
    ].join(newline);
    assert.deepEqual(parseCommands(markdown).map(entry => [entry.line, entry.name, entry.layout, entry.effect, entry.role, entry.ci]),
      [[7, 'Real', true, 'safe', 'monitor', true]]);
    assert.deepEqual(checkCommands(markdown, { strict: true }), []);
  });
}

test('note introducers are shed, but a note opening on a path keeps its slash', () => {
  const notes = parseCommands('- A: `a` // doubled slash\n- B: `b` : colon\n- C: `c` /tmp/out is written\n').map(entry => entry.note);
  assert.deepEqual(notes, ['doubled slash', 'colon', '/tmp/out is written']);
});

test('agent decorators set effect, lifetime, interactive, and ci', () => {
  const [build, deploy, dev, login] = parseCommands([
    '- Check: `npm run check` — types and lint #safe #slow #ci',
    '- Deploy: `npm run deploy` #destructive',
    '- Dev: `npm run dev` #long-running #monitor',
    '- Login: `vercel login` #interactive #writes',
  ].join('\n'));
  assert.equal(build!.note, 'types and lint');
  assert.deepEqual([build!.effect, build!.lifetime, build!.ci], ['safe', 'slow', true]);
  assert.equal(deploy!.effect, 'destructive');
  assert.deepEqual([dev!.lifetime, dev!.role], ['long-running', 'monitor']);
  assert.deepEqual([login!.interactive, login!.effect], [true, 'writes']);
  assert.deepEqual(build!.decorators, ['safe', 'slow', 'ci']);
});

test("Saggar's presentation decorators are read, case-insensitively", () => {
  const [entry] = parseCommands('- Site: `npm start` #Companion #browser #dashboard #icon:rectangle.split.2x2\n');
  assert.deepEqual([entry!.role, entry!.surface, entry!.dashboard, entry!.icon], ['companion', 'browser', true, 'rectangle.split.2x2']);
});

test('unknown decorators are consumed and reported, so they never spill into the note', () => {
  const [entry] = parseCommands('- Tests: `npm test` covers #42 #flaky #quick\n');
  assert.equal(entry!.note, 'covers #42');
  assert.deepEqual(entry!.unknown, ['flaky']);
  assert.equal(entry!.role, 'quick');
});

test('conflicting decorators resolve to the more cautious reading', () => {
  const [entry] = parseCommands('- Mixed: `x` #safe #destructive #slow #long-running\n');
  assert.deepEqual([entry!.effect, entry!.lifetime], ['destructive', 'long-running']);
});

test('the layout section is marked, and the retired bracket and startup forms still read', () => {
  const entries = parseCommands('# Commands\n\n## Startup [auto]\n\n- Dev: `npm run dev` [monitor]\n\n## Other\n\n- Deploy: `npm run deploy`\n');
  assert.deepEqual(entries.map(entry => [entry.name, entry.layout, entry.role]), [['Dev', true, 'monitor'], ['Deploy', false, undefined]]);
});

test('CRLF files parse like LF files', () => {
  assert.deepEqual(parseCommands('- A: `a` #safe\r\n- B: `b`\r\n').map(entry => [entry.line, entry.command, entry.effect]), [[1, 'a', 'safe'], [2, 'b', undefined]]);
});

test('check reports conflicts and contradictions as errors and suspicious shapes as warnings', () => {
  const issues = checkCommands([
    '# Commands',
    '- One: `a` #safe #writes',
    '- Two: `b` #slow #long-running',
    '- Three: `c` #long-running #ci',
    '- Four: `d` #monitor #quick',
    '- one: `e` #flaky',
    '- Broken: `f',
    '## Layout',
    '- Five: `g` #quick',
    '- Six: `h` #long-running #quick',
  ].join('\n'));
  assert.deepEqual(issues.map(issue => [issue.line, issue.severity, issue.message]), [
    [2, 'error', 'Choose one effect: #safe, #writes, or #destructive.'],
    [3, 'error', 'Choose one lifetime: #long-running or #slow.'],
    [4, 'error', 'A #ci check has to exit, so it cannot be #long-running.'],
    [5, 'error', 'Choose one role: #primary, #companion, #monitor, #background, or #quick.'],
    [6, 'warning', 'Unknown decorator #flaky; readers ignore it.'],
    [6, 'warning', 'Another command on line 2 is also named "one".'],
    [7, 'warning', 'This bullet has an unclosed code span, so it is not a command.'],
    [9, 'warning', 'A layout cannot place a #quick command.'],
    [10, 'warning', 'A layout cannot place a #quick command.'],
    [10, 'warning', 'A #quick command folds away when it succeeds, but a #long-running one never exits.'],
  ]);
});

test('a layout may repeat a command from the menu under the same name', () => {
  assert.deepEqual(checkCommands('- Dev: `npm run dev`\n\n## Layout\n\n- Dev: `npm run dev` #monitor\n'), []);
});

test('the template parses cleanly and demonstrates the agent decorators', () => {
  assert.deepEqual(checkCommands(commandsTemplate), []);
  const entries = parseCommands(commandsTemplate);
  assert.ok(entries.some(entry => entry.layout));
  for (const decorator of ['safe', 'writes', 'destructive', 'long-running', 'ci']) {
    assert.ok(entries.some(entry => entry.decorators.includes(decorator)), decorator);
  }
});
