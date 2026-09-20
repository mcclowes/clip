import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

function reportFor(runs: object[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'clip-report-'));
  try {
    writeFileSync(join(directory, 'runs.jsonl'), `${runs.map(row => JSON.stringify(row)).join('\n')}\n`);
    return execFileSync(process.execPath, [join(here, 'report.ts'), directory], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const run = (over: object = {}) => ({
  condition: 'cli-clip', task: 'count-filtered', kind: 'read', prompt: 'named', trial: 0, success: true, unsafeMutation: false,
  toolCalls: 2, discoveryCalls: 1, toolErrors: 0, turns: 3, cumulativeInput: 30_000, peakInput: 19_000, toolResultTokens: 100, outputTokens: 200, costUsd: 0.05, durationMs: 9_000, ...over,
});

test('pass rates carry an interval, and medians carry a spread', () => {
  const report = reportFor([run(), run({ trial: 1 }), run({ trial: 2, success: false }), run({ trial: 3, cumulativeInput: 50_000 })]);
  assert.match(report, /3\/4 \(\d+–\d+%\)/);
  assert.match(report, /\d+ ±\d+/);
});

test('a unanimous pass rate still reports an interval below 100', () => {
  const report = reportFor([run(), run({ trial: 1 }), run({ trial: 2 })]);
  assert.match(report, /3\/3 \(\d+–100%\)/);
  assert.doesNotMatch(report, /100–100%/);
});

test('sections appear only when their runs do', () => {
  const plain = reportFor([run(), run({ trial: 1 }), run({ trial: 2 })]);
  assert.doesNotMatch(plain, /prompt variant/);
  assert.doesNotMatch(plain, /Long session/);
  assert.doesNotMatch(plain, /scaled tasks/);

  const full = reportFor([
    run(), run({ trial: 1, prompt: 'unnamed', distractors: true }),
    run({ trial: 2, task: 'reduction-share', loads: 500, toolResultTokens: 12_000 }),
    run({ trial: 3, task: 'long-session', turns: 14, cumulativeInput: 140_000 }),
  ]);
  assert.match(full, /Pass rate by prompt variant/);
  assert.match(full, /unnamed \+ distractors/);
  assert.match(full, /Tool-result tokens on scaled tasks/);
  assert.match(full, /Long session/);
  // 140,000 over 14 turns is the always-loaded cost the long session is there to expose.
  assert.match(full, /\| 10000 \|/);
});

test('harness errors are counted out rather than scored as failures', () => {
  const report = reportFor([run(), run({ trial: 1 }), { condition: 'cli-clip', task: 'count-filtered', trial: 2, success: false, harnessError: 'claude produced no output' }]);
  assert.match(report, /2\/2/);
  assert.match(report, /1 runs hit harness errors and are excluded/);
});
