import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertClaudeVersion, parseClaudeVersion, parseTranscript, transcriptHarnessError } from './harness.ts';

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

test('reading a skill group file counts as discovery', () => {
  const call = (name: string, input: object) => JSON.stringify({ type: 'assistant', message: { id: `m-${name}-${JSON.stringify(input)}`, usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 }, content: [{ type: 'tool_use', name, input }] } });
  const transcript = [
    call('Read', { file_path: '/w/.claude/skills/clip-brindle/commands/load.md' }),
    call('Bash', { command: 'cat .claude/skills/clip-brindle/commands/log.md' }),
    call('Bash', { command: 'brindle load list --status queued' }),
  ].join('\n');
  const metrics = parseTranscript(transcript);
  assert.equal(metrics.toolCalls, 3);
  assert.equal(metrics.discoveryCalls, 2);
});

test('composition metrics distinguish a piped first listing and file spills', () => {
  const assistant = JSON.stringify({ type: 'assistant', message: { id: 'm-1', usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 }, content: [{ type: 'tool_use', name: 'Bash', input: { command: "brindle load list --status done | jq '.items | length'" } }] } });
  const result = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'Error: result exceeds maximum allowed tokens. Output has been saved to /tmp/output.' }] } });
  const metrics = parseTranscript([assistant, result].join('\n'));
  assert.equal(metrics.firstListCallPiped, true);
  assert.equal(metrics.spills, 1);
});

test('reading project task manifests counts as discovery', () => {
  const call = (name: string, input: object) => JSON.stringify({ type: 'assistant', message: { id: `m-${name}-${JSON.stringify(input)}`, usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 }, content: [{ type: 'tool_use', name, input }] } });
  const transcript = [
    call('Read', { file_path: '/w/package.json' }),
    call('Bash', { command: 'sed -n 1,120p Taskfile.yml' }),
    call('Bash', { command: 'npm run assemble' }),
  ].join('\n');
  assert.equal(parseTranscript(transcript).discoveryCalls, 2);
});

test('the resolved model comes from the transcript, since an alias like sonnet moves between releases', () => {
  const transcript = [
    JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5' }),
    JSON.stringify({ type: 'result', subtype: 'success', result: 'ANSWER: 1', num_turns: 1, usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 } }),
  ].join('\n');
  assert.equal(parseTranscript(transcript).model, 'claude-sonnet-5');
  assert.equal(parseTranscript('').model, '');
});

test('an API failure is a harness error, not a failed task', () => {
  const transcript = JSON.stringify({ type: 'result', is_error: true, terminal_reason: 'api_error', result: 'Failed to authenticate: OAuth session expired' });
  assert.equal(transcriptHarnessError(transcript), 'Failed to authenticate: OAuth session expired');
  assert.equal(transcriptHarnessError(JSON.stringify({ type: 'result', is_error: false, result: 'done' })), undefined);
});
