import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeValidation, type RegistryRow } from './validation.ts';

const sha = 'a'.repeat(64);
const row = (condition: string, success: boolean, extra: Partial<RegistryRow> = {}): RegistryRow => ({
  tool: 'git', condition, task: 'git-log-subject', success, model: 'sonnet', claudeVersion: '2.1.278', toolVersion: 'git version 2.55.0', sha256: sha, ...extra,
});
const context = { sha256: sha, clipVersion: '0.2.0', date: '2026-09-21' };

test('a tool is validated when every run with the schema passed', () => {
  const validation = summarizeValidation([row('cli-clip', true), row('cli-clip', true), row('cli-bare', false), row('cli-bare', true)], context);
  assert.deepEqual(validation, {
    validated: true, sha256: sha, date: '2026-09-21', model: 'sonnet', claudeVersion: '2.1.278', clipVersion: '0.2.0', toolVersion: 'git version 2.55.0',
    passed: 2, runs: 2, baselinePassed: 1, baselineRuns: 2,
  });
});

test('one failed schema run is enough to withhold validation, and the result is still recorded', () => {
  const validation = summarizeValidation([row('cli-clip', true), row('cli-clip', false), row('cli-bare', true)], context);
  assert.equal(validation.validated, false);
  assert.equal(validation.passed, 1);
});

test('a harness error counts as a failed run rather than disappearing', () => {
  assert.equal(summarizeValidation([row('cli-clip', true), row('cli-clip', false, { harnessError: 'timeout' })], context).validated, false);
});

test('runs that cannot be summarized honestly are refused', () => {
  assert.throws(() => summarizeValidation([row('cli-bare', true)], context), /no cli-clip runs/);
  assert.throws(() => summarizeValidation([row('cli-clip', true), row('cli-clip', true, { model: 'opus' })], context), /more than one model/);
  assert.throws(() => summarizeValidation([row('cli-clip', true), row('cli-clip', true, { toolVersion: 'git version 2.40.0' })], context), /more than one toolVersion/);
  assert.throws(() => summarizeValidation([row('cli-clip', true, { sha256: 'b'.repeat(64) })], context), /schema has changed/);
});
