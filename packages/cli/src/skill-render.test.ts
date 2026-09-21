import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexThreshold, renderSkillFiles } from './skill-render.ts';
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

const render = (schema?: Schema) => renderSkillFiles({ skillName: 'clip-kiln', name: 'kiln', purpose: 'Fire kilns', executable: '/bin/kiln', ...(schema ? { schema } : {}) });

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

test(`tools over ${indexThreshold} commands get an index in SKILL.md and usage lines in group files`, () => {
  const files = render(manyCommands(100));
  const skill = files.get('SKILL.md')!;
  assert.doesNotMatch(skill, /--limit/);
  assert.match(skill, /100 commands/);
  const groups = [...files.keys()].filter(path => path !== 'SKILL.md');
  for (const group of groups) assert.ok(skill.includes(`\`${group}\``), `index misses ${group}`);
  const lines = groups.flatMap(group => files.get(group)!.split('\n').filter(line => line.startsWith('- `kiln ')));
  assert.equal(lines.length, 100, 'every command appears in exactly one group file');
});

test('groups over the threshold split on the next word', () => {
  const groups = [...render(manyCommands(100)).keys()].filter(path => path !== 'SKILL.md').sort();
  assert.deepEqual(groups, ['commands/kiln-list.md', 'commands/kiln-show.md', 'commands/load-list.md', 'commands/load-show.md', 'commands/report-list.md', 'commands/report-show.md']);
});

test(`${indexThreshold} commands still render inline`, () => {
  assert.match(render(manyCommands(indexThreshold)).get('SKILL.md')!, /--limit/);
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
