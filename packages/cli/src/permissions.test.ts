import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeClaudeSettings, proposeRules } from './permissions.ts';
import type { Registration } from './store.ts';

const tool = (name: string, commands: unknown[]): Registration => ({ name, executable: name, purpose: 'Test', schema: { name, commands } as Registration['schema'], source: { kind: 'file' } });
const trusted = () => true;

test('allows only leaf commands marked non-mutating', () => {
  const gh = tool('gh', [
    { name: 'pr', description: 'Pull requests', subcommands: [
      { name: 'list', description: 'List', mutating: false },
      { name: 'merge', description: 'Merge', mutating: true },
      { name: 'view', description: 'View' },
    ] },
  ]);

  const { allow, skipped } = proposeRules([gh], trusted);

  assert.deepEqual(allow, ['Bash(gh pr list:*)']);
  assert.deepEqual(skipped, [
    { tool: 'gh', command: 'pr merge', reason: 'mutating' },
    { tool: 'gh', command: 'pr view', reason: 'mutation unknown' },
  ]);
});

test('never allows a parent whose prefix would cover its mutating children', () => {
  const git = tool('git', [{ name: 'remote', description: 'Remotes', mutating: false, subcommands: [{ name: 'remove', description: 'Remove', mutating: true }] }]);

  assert.deepEqual(proposeRules([git], trusted).allow, []);
});

test('skips command paths that are not literal words, since the prefix would cover the whole tool', () => {
  const curl = tool('curl', [
    { name: '<url>', description: 'Fetch', mutating: false },
    { name: '--version', description: 'Version', mutating: false },
    { name: 'get "x"', description: 'Quoted', mutating: false },
  ]);

  const { allow, skipped } = proposeRules([curl], trusted);

  assert.deepEqual(allow, []);
  assert.deepEqual(skipped.map(item => item.reason), ['not a literal command path', 'not a literal command path', 'not a literal command path']);
});

test('skips untrusted tools and tools without a schema', () => {
  const docker = tool('docker', [{ name: 'ps', description: 'List', mutating: false }]);
  const bare: Registration = { name: 'make', executable: 'make', purpose: 'Build', source: { kind: 'manual' } };

  const { allow, skipped } = proposeRules([docker, bare], item => item.name !== 'docker');

  assert.deepEqual(allow, []);
  assert.deepEqual(skipped, [{ tool: 'docker', reason: 'unreviewed; pass --trust docker to include it' }, { tool: 'make', reason: 'no schema' }]);
});

test('deduplicates rules and reads the capabilities format', () => {
  const jq = tool('jq', []);
  jq.schema = { name: 'jq', capabilities: [{ name: 'version', description: 'Version', mutating: false }] };

  assert.deepEqual(proposeRules([jq, jq], trusted).allow, ['Bash(jq version:*)']);
});

test('merges new rules into Claude settings and keeps everything else', () => {
  const existing = JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(ls:*)', 'Bash(gh pr list:*)'], deny: ['Bash(rm:*)'] } });

  const merged = mergeClaudeSettings(existing, ['Bash(gh pr list:*)', 'Bash(docker ps:*)']);

  assert.deepEqual(merged.added, ['Bash(docker ps:*)']);
  assert.deepEqual(merged.existing, ['Bash(gh pr list:*)']);
  assert.deepEqual(JSON.parse(merged.text), { model: 'opus', permissions: { allow: ['Bash(ls:*)', 'Bash(gh pr list:*)', 'Bash(docker ps:*)'], deny: ['Bash(rm:*)'] } });
});

test('starts settings from nothing and refuses malformed ones', () => {
  assert.deepEqual(JSON.parse(mergeClaudeSettings(undefined, ['Bash(jq version:*)']).text), { permissions: { allow: ['Bash(jq version:*)'] } });
  assert.throws(() => mergeClaudeSettings('[]', []), /settings must be a JSON object/);
  assert.throws(() => mergeClaudeSettings('{"permissions":{"allow":"x"}}', []), /permissions.allow must be a list/);
});
