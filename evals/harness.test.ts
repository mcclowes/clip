import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertClaudeVersion, parseClaudeVersion } from './harness.ts';

test('the version comes out of whatever `claude --version` prints around it', () => {
  assert.equal(parseClaudeVersion('2.1.278 (Claude Code)\n'), '2.1.278');
  assert.equal(parseClaudeVersion('2.1.276 (Claude Code)'), '2.1.276');
  assert.equal(parseClaudeVersion('2.2.0-beta.3 (Claude Code)\n'), '2.2.0-beta.3');
});

test('output with no version fails rather than recording a guess', () => {
  assert.throws(() => parseClaudeVersion('command not found: claude'), /No version/);
  assert.throws(() => parseClaudeVersion(''), /No version/);
});

test('a required version gates the run on an exact match', () => {
  assert.doesNotThrow(() => assertClaudeVersion('2.1.278', '2.1.278'));
  assert.throws(() => assertClaudeVersion('2.1.276', '2.1.278'), /Required Claude Code 2\.1\.276 but .* 2\.1\.278/);
});
