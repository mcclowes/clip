import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
  assert.equal(JSON.parse(run('schema', 'node').stdout).name, 'node');
});
