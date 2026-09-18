import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipSchema, commands, mcpTools, validate, type State, type Values } from './fixture/spec.ts';
import { seed } from './fixture/state.ts';
import { extractAnswer, tasks } from './tasks.ts';
import { parseTranscript } from './harness.ts';

function run(state: State, name: string, values: Values = {}) {
  const command = commands.find(item => item.name === name)!;
  return command.run(state, validate(command, values));
}

const solutions: Record<string, (state: State) => string> = {
  'count-filtered': () => '2',
  'show-load': () => '10, K-03',
  'usage-report': () => 'reduction, 65',
  'dry-run-safety': state => (run(state, 'kiln hold', { kiln: 'K-02', until: '2026-10-01', 'dry-run': true }) as { blocking_loads: string[] }).blocking_loads.join(', '),
  'queue-by-name': state => (run(state, 'load queue', { kiln: 'K-02', cone: '6', atmosphere: 'reduction', pieces: '14' }) as { id: string }).id,
  'cancel-with-reason': state => (run(state, 'load cancel', { load: 'LD-0010', reason: 'glaze defect' }) as { id: string }).id,
  'multi-step-hold': state => {
    run(state, 'load move', { load: 'LD-0009', to: 'K-01' });
    run(state, 'load move', { load: 'LD-0011', to: 'K-01' });
    run(state, 'kiln hold', { kiln: 'K-04', until: '2026-10-15' });
    return 'LD-0009, LD-0011';
  },
  'refuse-impossible': () => 'refused',
};

for (const task of tasks) {
  test(`${task.id} accepts the reference solution and rejects a wrong one`, () => {
    const after = seed();
    const answer = solutions[task.id]!(after);
    assert.equal(task.verify({ answer, before: seed(), after }), true);
    assert.equal(task.verify({ answer: 'LD-9999', before: seed(), after }), false);
    const tampered = seed();
    tampered.loads[0]!.pieces += 1;
    assert.equal(task.verify({ answer, before: seed(), after: tampered }), false);
  });
}

test('refuses what the fixture documents as refused', () => {
  assert.throws(() => run(seed(), 'load cancel', { load: 'LD-0003', reason: 'x' }), /status is firing/);
  assert.throws(() => run(seed(), 'load queue', { kiln: 'Big Bertha', cone: '6', atmosphere: 'reduction', pieces: 14 }), /Unknown kiln/);
  assert.throws(() => run(seed(), 'load queue', { kiln: 'K-02', cone: '7', atmosphere: 'reduction', pieces: 14 }), /must be one of/);
  assert.throws(() => run(seed(), 'kiln hold', { kiln: 'K-04', until: '2026-10-15' }), /queued loads/);
});

test('every interface describes the same commands and arguments', () => {
  const schema = clipSchema();
  const tools = mcpTools();
  assert.equal(schema.commands.length, tools.length);
  schema.commands.forEach((command, index) => {
    assert.deepEqual(command.args.map(arg => arg.name.replace(/^--/, '').replaceAll('-', '_')), Object.keys(tools[index]!.inputSchema.properties));
    assert.equal(command.mutating, tools[index]!.annotations.destructiveHint);
  });
});

test('extracts the last answer line, tolerating Markdown emphasis', () => {
  assert.equal(extractAnswer('Working.\nANSWER: 1\nDone.\n**ANSWER: LD-0014**'), 'LD-0014');
  assert.equal(extractAnswer('no answer here'), '');
});

test('parses tool calls, errors, and token usage from a transcript', () => {
  const usage = (input: number) => ({ input_tokens: input, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 });
  const transcript = [
    { type: 'assistant', message: { id: 'a', usage: usage(100), content: [{ type: 'tool_use', name: 'Bash', input: { command: 'brindle --help' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', is_error: true }] } },
    { type: 'assistant', message: { id: 'b', usage: usage(180), content: [{ type: 'text' }] } },
    { type: 'result', is_error: false, result: 'ANSWER: 2', num_turns: 2, total_cost_usd: 0.01, duration_ms: 900, usage: usage(280) },
  ].map(event => JSON.stringify(event)).join('\n');
  const metrics = parseTranscript(transcript);
  assert.deepEqual([metrics.toolCalls, metrics.toolErrors, metrics.discoveryCalls, metrics.firstTurnInput, metrics.peakInput, metrics.cumulativeInput], [1, 1, 1, 100, 180, 280]);
});
