import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEntry, parseCatalog, registrySchema, registrySource, trustOf, validationStatus, type Entry } from './registry.ts';
import { proposeRules } from './permissions.ts';
import { renderSkillFiles } from './skill-render.ts';

const entry: Entry = {
  id: 'git', name: 'Git', executable: 'git', purpose: 'Inspect history', category: 'Development', maintainer: 'mcclowes', version: '1.0.0',
  upstream: 'https://git-scm.com/', documentation: 'https://git-scm.com/docs', schema: 'schemas/git.json', sha256: 'a'.repeat(64), coverage: 'Some',
};
const validation = {
  validated: true, sha256: 'a'.repeat(64), date: '2026-09-21', model: 'sonnet', claudeVersion: '2.1.278', clipVersion: '0.2.0', toolVersion: 'git version 2.55.0',
  passed: 4, runs: 4, baselinePassed: 3, baselineRuns: 4,
};

test('an entry without a validation record is unvalidated', () => {
  assert.equal(validationStatus(entry), 'unvalidated');
});

test('a validation record counts only for the schema digest it ran against', () => {
  assert.equal(validationStatus({ ...entry, validation }), 'validated');
  assert.equal(validationStatus({ ...entry, validation: { ...validation, sha256: 'b'.repeat(64) } }), 'stale');
  assert.equal(validationStatus({ ...entry, validation: { ...validation, validated: false } }), 'failed');
});

test('the catalog accepts a well-formed validation record and rejects a malformed one', () => {
  assert.equal(parseCatalog({ version: 1, items: [{ ...entry, validation }] })[0]?.validation?.passed, 4);
  assert.throws(() => parseCatalog({ version: 1, items: [{ ...entry, validation: { ...validation, passed: '4' } }] }), /validation requires passed/);
  assert.throws(() => parseCatalog({ version: 1, items: [{ ...entry, validation: { ...validation, sha256: 'nope' } }] }), /validation requires sha256/);
  assert.throws(() => parseCatalog({ version: 1, items: [{ ...entry, validation: { ...validation, date: '21/09/2026' } }] }), /validation requires date/);
});

test('Shelf automatic maintenance never receives a read-only permission prefix', () => {
  const shelf = findEntry('shelf');
  const tool = { name: 'shelf', executable: 'shelf', purpose: shelf.purpose, schema: registrySchema(shelf), source: registrySource(shelf) };

  const proposal = proposeRules([tool], registered => trustOf(registered) === 'reviewed');

  assert.deepEqual(proposal.allow, ['Bash(shelf schema:*)', 'Bash(shelf capabilities:*)']);
  assert.deepEqual(proposal.skipped.map(item => [item.command, item.reason]), [
    ['scan', 'mutating'], ['list', 'mutating'], ['search', 'mutating'], ['show', 'mutating'],
    ['describe', 'mutating'], ['related', 'mutating'], ['relate', 'mutating'], ['sync', 'mutating'],
  ]);
});

test('Shelf skills expose cached-only reads and mark operational commands as mutating', () => {
  const shelf = findEntry('shelf');
  const files = renderSkillFiles({ skillName: 'clip-shelf', name: 'shelf', executable: 'shelf', purpose: shelf.purpose, schema: registrySchema(shelf) });
  const skill = files.get('SKILL.md');
  assert.ok(skill);
  assert.match(skill, /--no-refresh/);
  for (const command of ['scan', 'list', 'search', 'show', 'describe', 'related', 'relate', 'sync']) {
    const usage: string | undefined = skill.split('\n').find(candidate => candidate.startsWith(`- \`shelf ${command}`));
    assert.ok(usage, command);
    assert.match(usage, /\*\*\[mutating\]\*\*/);
  }
});
