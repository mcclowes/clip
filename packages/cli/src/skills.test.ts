import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSkills, syncSkills } from './skills.ts';
import type { Registration } from './store.ts';

const tool: Registration = { name: 'fixture', executable: 'fixture', purpose: 'Private fixture tool', source: { kind: 'manual' } };

test('planning skills creates nothing and produces the same guidance as immediate sync', t => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-skills-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const planned = join(dir, 'planned');
  const immediate = join(dir, 'immediate');
  const write = planSkills([tool], planned);
  assert.deepEqual(readdirSync(dir), []);

  const result = write();
  const control = syncSkills([tool], immediate);

  assert.equal(result.directory, planned);
  assert.deepEqual(result.items, control.items);
  assert.deepEqual(result.removed, control.removed);
  for (const name of ['clip-fixture', 'clip-schema-authoring']) {
    assert.deepEqual(readdirSync(join(planned, name)), readdirSync(join(immediate, name)));
    for (const file of readdirSync(join(planned, name))) {
      assert.deepEqual(readFileSync(join(planned, name, file)), readFileSync(join(immediate, name, file)));
    }
  }
});

test('a held skill plan checks ownership again before writing', t => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-skills-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'skills');
  const write = planSkills([tool], root);
  const skill = join(root, 'clip-fixture');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'notes.md'), 'Keep private fixture notes.\n');

  assert.throws(write, /unowned skill/);

  assert.deepEqual(readdirSync(skill), ['notes.md']);
  assert.equal(readFileSync(join(skill, 'notes.md'), 'utf8'), 'Keep private fixture notes.\n');
  assert.equal(existsSync(join(root, 'clip-schema-authoring')), false);
});
