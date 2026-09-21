import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupLimit, inlineLimit, renderSkillFiles, type RenderOptions } from './skill-render.ts';
import type { Operation, Schema } from './schema.ts';

const kiln: Schema = { name: 'kiln', commands: [
  { name: 'load queue', description: 'Queue a firing', mutating: true, args: [
    { name: '--cone', type: 'string', required: true, enum: ['06', '6'], description: 'Target cone.' },
    { name: '--pieces', type: 'integer', required: true, description: 'Piece count.' },
    { name: '--last', aliases: ['-n'], type: 'integer', default: 5 },
    { name: '--dry-run', type: 'boolean' },
  ], examples: ['kiln load queue --cone 6 --pieces 3'] },
  { name: 'load show', description: 'Show a load', mutating: false, args: [{ name: 'id', type: 'string', required: true }], examples: ['kiln load show 7 --json', 'kiln load show 8'],
    output_fields: [{ name: 'stdout', type: 'string', description: 'One JSON object.' }] },
  { name: 'project', description: 'Projects', subcommands: [{ name: 'list', description: 'List projects' }] },
] };

const render = (schema?: Schema, options?: RenderOptions) => renderSkillFiles({ skillName: 'clip-kiln', name: 'kiln', purpose: 'Fire kilns', executable: '/bin/kiln', ...(schema ? { schema } : {}) }, options);
const forceIndex = { inlineLimit: 1000 };

function manyCommands(count: number): Schema {
  const commands: Operation[] = Array.from({ length: count }, (_, index) => {
    const group = ['load', 'kiln', 'report'][index % 3]!;
    const verb = ['list', 'show'][index % 2]!;
    return { name: `${group} ${verb} v${index}`, description: `Command ${index}`, mutating: false, args: [{ name: '--limit', type: 'integer', required: true }] };
  });
  return { name: 'kiln', commands };
}

test('small tools list a usage line per command in SKILL.md', () => {
  const skill = render(kiln).get('SKILL.md')!;
  assert.match(skill, /^---\nname: clip-kiln\ndescription: "Use kiln to Fire kilns"\n---/);
  assert.match(skill, /Executable: "\/bin\/kiln"/);
  assert.match(skill, /- `kiln load queue --cone 06\|6 --pieces <n> \[--last <n>\] \[--dry-run\]` \*\*\[mutating\]\*\* — Queue a firing\./);
  assert.match(skill, /- `kiln load show <id>` — Show a load\. Example: `kiln load show 7 --json`/);
  assert.match(skill, /- `kiln project list` \*\*\[mutation unknown\]\*\* — List projects\. Arguments: `kiln project list --help`\./);
  assert.match(skill, /`commands\/load\.md`/);
});

test('skills no longer ship or mention schema.json', () => {
  const files = render(kiln);
  assert.deepEqual([...files.keys()].sort(), ['SKILL.md', 'commands/load.md', 'commands/project.md']);
  for (const content of files.values()) assert.doesNotMatch(content, /schema\.json|Source:/);
});

test('group files carry argument descriptions, defaults, aliases, output, and every example', () => {
  const load = render(kiln).get('commands/load.md')!;
  assert.match(load, /^# kiln load\n/);
  assert.match(load, /- `kiln load queue --cone 06\|6 --pieces <n> \[--last <n>\] \[--dry-run\]` \*\*\[mutating\]\*\* — Queue a firing\./);
  assert.match(load, /\n {2}- `--cone`: Target cone\.\n/);
  assert.match(load, /\n {2}- `--last` \(alias `-n`, default `5`\)\n/);
  assert.doesNotMatch(load, /`--dry-run`:/);
  assert.match(load, /\n {2}- Output `stdout`: One JSON object\.\n/);
  assert.match(load, /\n {2}- Examples: `kiln load show 7 --json`, `kiln load show 8`\n/);
});

test('gotchas render beside their command, and tool gotchas above the commands', () => {
  const schema: Schema = { ...kiln, gotchas: ['Cone numbers are strings, so 06 and 6 differ.'], commands: [
    { name: 'load cancel', description: 'Cancel a load', mutating: true, args: [{ name: 'id', required: true }], gotchas: ['The load id is positional; there is no --id flag.'] },
    ...kiln.commands!,
  ] };
  const gotcha = /- `kiln load cancel <id>` \*\*\[mutating\]\*\* — Cancel a load\.\n {2}- Gotcha: The load id is positional; there is no --id flag\.\n/;
  assert.match(render(schema).get('SKILL.md')!, gotcha);
  assert.match(render(schema).get('SKILL.md')!, /## Gotchas\n\n- Cone numbers are strings, so 06 and 6 differ\.\n\n## Commands/);
  assert.match(render(schema).get('commands/load.md')!, gotcha);
  assert.match(render(schema, forceIndex).get('SKILL.md')!, /## Gotchas/);
  assert.doesNotMatch(render(kiln).get('SKILL.md')!, /Gotcha/);
});

test('usage lines over the inline limit become an index in SKILL.md and move to group files', () => {
  const files = render(manyCommands(100), forceIndex);
  const skill = files.get('SKILL.md')!;
  assert.doesNotMatch(skill, /--limit/);
  assert.match(skill, /100 commands/);
  const groups = [...files.keys()].filter(path => path !== 'SKILL.md');
  for (const group of groups) assert.ok(skill.includes(`\`${group}\``), `index misses ${group}`);
  const lines = groups.flatMap(group => files.get(group)!.split('\n').filter(line => line.startsWith('- `kiln ')));
  assert.equal(lines.length, 100, 'every command appears in exactly one group file');
});

test(`usage lines under ${inlineLimit} characters stay inline, however many commands there are`, () => {
  const skill = render(manyCommands(100)).get('SKILL.md')!;
  assert.equal(skill.match(/--limit/g)?.length, 100);
});

test(`groups over ${groupLimit} commands split on the next word`, () => {
  const groups = [...render(manyCommands(100), forceIndex).keys()].filter(path => path !== 'SKILL.md').sort();
  assert.deepEqual(groups, ['commands/kiln-list.md', 'commands/kiln-show.md', 'commands/load-list.md', 'commands/load-show.md', 'commands/report-list.md', 'commands/report-show.md']);
});

test('a split group keeps each command in the file named after it, and lone commands in the parent', () => {
  const commands: Operation[] = [
    { name: 'load queue', description: 'Queue' },
    ...Array.from({ length: groupLimit }, (_, index) => ({ name: `load queue v${index}`, description: 'Clone' })),
    { name: 'load show', description: 'Show' },
  ];
  const files = render({ name: 'kiln', commands }, forceIndex);
  assert.deepEqual([...files.keys()].sort(), ['SKILL.md', 'commands/load-queue.md', 'commands/load.md']);
  assert.match(files.get('commands/load-queue.md')!, /`kiln load queue` \*\*\[mutation unknown\]\*\* — Queue\./);
  assert.match(files.get('commands/load.md')!, /`kiln load show`/);
});

test('group file names are safe and unique', () => {
  const schema: Schema = { name: 'odd', commands: [
    { name: '--version', description: 'Version' },
    { name: '../Up', description: 'Traversal' },
    { name: '..', description: 'Dots' },
    { name: 'a-b', description: 'Dash' },
    { name: 'A_B', description: 'Collides with a-b' },
    { name: 'a b', description: 'Space' },
  ] };
  const paths = [...render(schema).keys()].filter(path => path !== 'SKILL.md');
  assert.equal(new Set(paths).size, 6);
  for (const path of paths) assert.match(path, /^commands\/[a-z0-9-]+\.md$/);
});

test('tools without a schema get a SKILL.md that says so', () => {
  const files = render();
  assert.deepEqual([...files.keys()], ['SKILL.md']);
  assert.match(files.get('SKILL.md')!, /No capability schema registered/);
});

test('a profiled skill says which profile it covers and where the other commands are', () => {
  const skill = renderSkillFiles({ skillName: 'clip-kiln', name: 'kiln', purpose: 'Fire kilns', executable: '/bin/kiln', schema: { name: 'kiln', commands: [kiln.commands![1]!] }, profile: { name: 'read-only', commands: 3 } }).get('SKILL.md')!;
  assert.match(skill, /This skill covers the `read-only` profile: 1 of kiln's 3 commands\. Run `kiln --help` for the others\./);
  assert.doesNotMatch(render(kiln).get('SKILL.md')!, /profile/);
});
