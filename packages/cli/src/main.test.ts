import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const main = new URL('./main.ts', import.meta.url);
function fixture(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'clip-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...args: string[]) => spawnSync(process.execPath, [main.pathname, ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, CLIP_HOME: join(dir, 'config') },
  });
  const schema = join(dir, 'node.json');
  writeFileSync(schema, JSON.stringify({ name: 'node', commands: [{ name: '--version', description: 'Show runtime version', mutating: false }] }));
  return { dir, run, schema };
}

test('register a tool, update its purpose, and generate a portable skill', t => {
  const { dir, run, schema } = fixture(t);
  const registered = run('register', process.execPath, '--purpose', 'Run JavaScript', '--schema', schema);
  assert.equal(registered.status, 0, registered.stderr);
  assert.equal(JSON.parse(run('list').stdout).items[0].purpose, 'Run JavaScript');
  assert.equal(run('register', process.execPath, '--purpose', 'Run project scripts', '--schema', schema).status, 0);
  assert.equal(JSON.parse(run('list').stdout).items.length, 1);
  assert.equal(run('sync').status, 0);
  const skill = readFileSync(join(dir, '.agents/skills/clip-node/SKILL.md'), 'utf8');
  assert.match(skill, /Run project scripts/);
  assert.match(skill, /--version/);
  assert.equal(run('register', process.execPath, '--purpose', 'Run tests').status, 0);
});

test('refresh reloads a local schema and synchronizes its skill', t => {
  const { dir, run, schema } = fixture(t);
  assert.equal(run('register', process.execPath, '--purpose', 'Run JavaScript', '--schema', schema).status, 0);
  writeFileSync(schema, JSON.stringify({ name: 'node', commands: [{ name: '--help', description: 'Show runtime help', mutating: false }] }));

  const refreshed = run('refresh');

  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.deepEqual(JSON.parse(refreshed.stdout).refreshed, ['node']);
  assert.match(readFileSync(join(dir, '.agents/skills/clip-node/SKILL.md'), 'utf8'), /--help/);
  assert.equal(JSON.parse(run('list').stdout).items[0].schema.commands[0].name, '--help');
});

test('doctor reports schema drift without changing registrations or skills', t => {
  const { dir, run, schema } = fixture(t);
  assert.equal(run('register', process.execPath, '--purpose', 'Run JavaScript', '--schema', schema).status, 0);
  const before = run('list').stdout;
  writeFileSync(schema, JSON.stringify({ name: 'node', commands: [{ name: '--help', description: 'Show runtime help', mutating: false }] }));

  const diagnosis = run('doctor');

  assert.equal(diagnosis.status, 0, diagnosis.stderr);
  assert.equal(JSON.parse(diagnosis.stdout).healthy, false);
  assert.deepEqual(JSON.parse(diagnosis.stdout).items, [{ name: 'node', source: 'file', status: 'drifted' }]);
  assert.equal(run('list').stdout, before);
  assert.equal(existsSync(join(dir, '.agents/skills/clip-node')), false);
});

test('refresh reruns a registered native schema probe', t => {
  const { dir, run } = fixture(t);
  const executable = join(dir, 'native-tool');
  const liveSchema = join(dir, 'native-schema.json');
  writeFileSync(liveSchema, JSON.stringify({ name: 'native', commands: [{ name: 'old', description: 'Old command' }] }));
  writeFileSync(executable, `#!${process.execPath}\nprocess.stdout.write(require('node:fs').readFileSync(${JSON.stringify(liveSchema)}, 'utf8'));`, { mode: 0o755 });
  assert.equal(run('register', executable, '--purpose', 'Test native refresh', '--probe', 'schema').status, 0);
  writeFileSync(liveSchema, JSON.stringify({ name: 'native', commands: [{ name: 'new', description: 'New command' }] }));

  const refreshed = run('refresh');

  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.match(readFileSync(join(dir, '.agents/skills/clip-native/SKILL.md'), 'utf8'), /new/);
});

test('refresh rejects a source schema for a different tool without changing state', t => {
  const { run, schema } = fixture(t);
  assert.equal(run('register', process.execPath, '--purpose', 'Run JavaScript', '--schema', schema).status, 0);
  const before = run('list').stdout;
  writeFileSync(schema, JSON.stringify({ name: 'other', commands: [{ name: 'run', description: 'Run something' }] }));

  const refreshed = run('refresh');

  assert.equal(refreshed.status, 1);
  assert.match(JSON.parse(refreshed.stderr).error.message, /expected node, received other/);
  assert.equal(run('list').stdout, before);
});

test('project registrations override shared and global tools', t => {
  const { dir, run } = fixture(t);
  mkdirSync(join(dir, '.git'));
  mkdirSync(join(dir, '.clip'));
  mkdirSync(join(dir, 'config'));
  const global = { name: 'node', executable: '/global/node', purpose: 'Global purpose', source: { kind: 'manual' } };
  const shared = { name: 'node', executable: 'node', purpose: 'Shared purpose', source: { kind: 'manual' } };
  writeFileSync(join(dir, 'config', 'tools.json'), JSON.stringify({ version: 1, tools: [global] }), { flag: 'wx' });
  writeFileSync(join(dir, '.clip', 'tools.json'), JSON.stringify({ version: 1, tools: [shared] }), { flag: 'wx' });

  const listed = run('list');

  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).items[0], { ...shared, scope: 'shared' });
});

test('register defaults to local project scope', t => {
  const { dir, run } = fixture(t);
  mkdirSync(join(dir, '.git'));

  const registered = run('register', process.execPath, '--purpose', 'Run local scripts');

  assert.equal(registered.status, 0, registered.stderr);
  const document = JSON.parse(readFileSync(join(dir, '.clip', 'tools.local.json'), 'utf8'));
  assert.equal(document.tools[0].purpose, 'Run local scripts');
  assert.equal(JSON.parse(run('list').stdout).items[0].scope, 'local');
});

test('shared registrations store portable executable names', t => {
  const { dir, run } = fixture(t);
  mkdirSync(join(dir, '.git'));

  const registered = run('register', 'node', '--purpose', 'Run project scripts', '--scope', 'shared');

  assert.equal(registered.status, 0, registered.stderr);
  const document = JSON.parse(readFileSync(join(dir, '.clip', 'tools.json'), 'utf8'));
  assert.equal(document.tools[0].executable, 'node');
  assert.equal(JSON.parse(run('list').stdout).items[0].scope, 'shared');
});

test('local removal disables an inherited registration', t => {
  const { dir, run } = fixture(t);
  mkdirSync(join(dir, '.git'));
  assert.equal(run('register', process.execPath, '--purpose', 'Run scripts', '--scope', 'global').status, 0);

  const removed = run('remove', 'node');

  assert.equal(removed.status, 0, removed.stderr);
  assert.deepEqual(JSON.parse(run('list').stdout).items, []);
  const document = JSON.parse(readFileSync(join(dir, '.clip', 'tools.local.json'), 'utf8'));
  assert.deepEqual(document.disabled, ['node']);
});

test('probe capabilities explicitly, preserve nested contracts, and discover without executing', t => {
  const { dir, run } = fixture(t);
  const executable = join(dir, 'fixture-tool');
  const marker = join(dir, 'executed');
  writeFileSync(executable, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes'); console.log(JSON.stringify({name:'fixture',commands:[{name:'project',description:'Projects',subcommands:[{name:'list',description:'List projects',mutating:false}]}]}));`, { mode: 0o755 });
  const discovered = spawnSync(process.execPath, [main.pathname, 'discover', 'fixture-tool'], { encoding: 'utf8', env: { ...process.env, PATH: dir } });
  assert.equal(discovered.status, 0, discovered.stderr);
  assert.equal(JSON.parse(discovered.stdout).items[0].name, 'fixture-tool');
  assert.equal(existsSync(marker), false);
  const probe = run('register', executable, '--purpose', 'Manage projects', '--probe', 'capabilities');
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(existsSync(marker), true);
  assert.equal(run('sync').status, 0);
  assert.match(readFileSync(join(dir, '.agents/skills/clip-fixture/SKILL.md'), 'utf8'), /project list/);
});

test('add a community schema without running its executable, and expose offline introspection', t => {
  const { dir, run } = fixture(t);
  const search = run('registry', 'search', 'git');
  assert.equal(search.status, 0, search.stderr);
  assert.ok(JSON.parse(search.stdout).items.some((item: any) => item.id === 'git'));
  const shown = run('schema', 'show', 'git');
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).capabilities.name, 'git');
  const added = run('registry', 'add', 'git', '--purpose', 'Review changes');
  assert.equal(added.status, 0, added.stderr);
  assert.equal(JSON.parse(added.stdout).source.kind, 'registry');
  assert.equal(run('sync').status, 0);
  assert.match(readFileSync(join(dir, '.agents/skills/clip-git/SKILL.md'), 'utf8'), /Review changes/);
  assert.equal(JSON.parse(run('schema').stdout).name, 'clip');
  assert.ok(JSON.parse(run('capabilities').stdout).commands.some((c: any) => c.name === 'register'));
  assert.ok(JSON.parse(run('capabilities').stdout).commands.some((c: any) => c.name === 'ui'));
});

test('ui requires an interactive terminal', t => {
  const { run } = fixture(t);
  const result = run('ui');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error.message, /interactive terminal/);
});

test('reject invalid documents, preserve user skills, and remove stale owned skills', t => {
  const { dir, run, schema } = fixture(t);
  writeFileSync(schema, JSON.stringify({ name: '../escape', commands: [{ name: 'x', description: 'x' }] }));
  const invalid = run('register', process.execPath, '--purpose', 'Test', '--schema', schema);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.equal(JSON.parse(invalid.stderr).error.kind, 'invalid_request');
  assert.equal(JSON.parse(run('list').stdout).items.length, 0);
  assert.equal(run('register', process.execPath, '--purpose', 'Run scripts').status, 0);
  const skillDir = join(dir, '.agents/skills/clip-node');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), 'User content');
  assert.equal(run('sync').status, 1);
  assert.equal(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'), 'User content');
  const owned = join(dir, 'owned');
  assert.equal(run('sync', '--skills-dir', owned).status, 0);
  assert.equal(run('remove', 'node').status, 0);
  assert.equal(run('remove', 'node').status, 0);
  assert.equal(run('sync', '--skills-dir', owned).status, 0);
  assert.equal(existsSync(join(owned, 'clip-node')), false);
  assert.equal(run('schema', 'init', 'sample', '--purpose', 'Test', '--file', 'draft.json').status, 0);
  assert.equal(run('schema', 'init', 'sample', '--purpose', 'Test', '--file', 'draft.json').status, 1);
  assert.equal(run('register', process.execPath, '--purpose', 'Test', '--schema', 'draft.json').status, 1);
});
