import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalog, validationStatus, type Entry } from './registry.ts';

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
