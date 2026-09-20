import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipSchema, commands, mcpTools, validate, type State, type Values } from './fixture/spec.ts';
import { seed } from './fixture/state.ts';
import { compositionLoads, extractAnswer, tasks } from './tasks.ts';
import { parseTranscript } from './harness.ts';

function run(state: State, name: string, values: Values = {}) {
  const command = commands.find(item => item.name === name)!;
  return command.run(state, validate(command, values));
}

const listed = (state: State, values: Values = {}) => (run(state, 'load list', values) as { items: State['loads']; total: number });

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
  // Solved the way a CLI condition would: one filtered list per aggregate, then arithmetic over it.
  'busiest-queue': state => {
    const totals = new Map<string, number>();
    for (const item of listed(state, { status: 'queued' }).items) totals.set(item.kiln, (totals.get(item.kiln) ?? 0) + item.pieces);
    const [kiln, pieces] = [...totals].sort((a, b) => b[1] - a[1])[0]!;
    return `${kiln}, ${pieces} pieces`;
  },
  'count-beyond-flags': state => String(listed(state, { status: 'done' }).items.filter(item => item.cone === '10' && item.pieces > 20).length),
  'reduction-share': state => `${Math.round((listed(state, { atmosphere: 'reduction' }).total / listed(state).total) * 100)}%`,
};

for (const task of tasks) {
  test(`${task.id} accepts the reference solution and rejects a wrong one`, () => {
    const fixture = () => seed(task.loads);
    const after = fixture();
    const answer = solutions[task.id]!(after);
    assert.equal(task.verify({ answer, before: fixture(), after }), true);
    assert.equal(task.verify({ answer: 'LD-9999', before: fixture(), after }), false);
    const tampered = fixture();
    tampered.loads[0]!.pieces += 1;
    assert.equal(task.verify({ answer, before: fixture(), after: tampered }), false);
  });
}

test('the scaled fixture is deterministic, and only appends to the hand-written loads', () => {
  const base = seed();
  const scaled = seed(compositionLoads);
  assert.equal(scaled.loads.length, compositionLoads);
  assert.deepEqual(scaled.loads.slice(0, base.loads.length), base.loads);
  assert.deepEqual(scaled.kilns, base.kilns);
  assert.deepEqual(scaled, seed(compositionLoads));
  const capacity = new Map(scaled.kilns.map(kiln => [kiln.id, kiln.capacity]));
  for (const item of scaled.loads) {
    assert.ok(item.pieces >= 1 && item.pieces <= capacity.get(item.kiln)!, `${item.id} exceeds its kiln capacity`);
    assert.equal(item.status === 'done', item.fired_on !== undefined, `${item.id} fired date does not match its status`);
  }
});

test('composition tasks need more than the tool can filter, and a scaled listing is expensive to read', () => {
  const scaled = seed(compositionLoads);
  for (const id of ['busiest-queue', 'count-beyond-flags', 'reduction-share']) {
    assert.equal(tasks.find(task => task.id === id)!.loads, compositionLoads, `${id} should run against the scaled fixture`);
  }
  // No --cone or --pieces flag exists, so the answer has to be computed over a listing rather than asked for.
  assert.deepEqual(commands.find(item => item.name === 'load list')!.args.map(arg => arg.name), ['--status', '--kiln', '--atmosphere']);
  assert.ok(JSON.stringify(listed(scaled), null, 2).length > 50_000);
});

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
