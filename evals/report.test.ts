import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

function reportOn(files: { runs?: object[]; context?: object[] }, args: string[] = []): string {
  const directory = mkdtempSync(join(tmpdir(), 'clip-report-'));
  try {
    for (const [name, rows] of Object.entries(files)) {
      if (rows) writeFileSync(join(directory, `${name}.jsonl`), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
    }
    return execFileSync(process.execPath, [join(here, 'report.ts'), ...args, directory], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const reportFor = (runs: object[], args: string[] = []) => reportOn({ runs }, args);

const run = (over: object = {}) => ({
  condition: 'cli-clip', task: 'count-filtered', kind: 'read', prompt: 'named', trial: 0, claudeVersion: '2.1.278', success: true, unsafeMutation: false,
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
  const report = reportFor([run(), run({ trial: 1 }), { condition: 'cli-clip', task: 'count-filtered', trial: 2, claudeVersion: '2.1.278', success: false, harnessError: 'claude produced no output' }]);
  assert.match(report, /2\/2/);
  assert.match(report, /1 runs hit harness errors and are excluded/);
});

test('both reports name the Claude Code version that produced the rows', () => {
  assert.match(reportFor([run()]), /Claude Code 2\.1\.278\./);
  const context = reportOn({ context: [{ kind: 'upfront', commands: 9, condition: 'cli-clip', tokens: 1_200, baseline: 7_614, model: 'sonnet', claudeVersion: '2.1.278' }] });
  assert.match(context, /Claude Code 2\.1\.278\./);
});

test('rows from before the version was recorded read as unknown', () => {
  assert.match(reportFor([{ ...run(), claudeVersion: undefined }]), /Claude Code unknown\./);
});

test('mixing versions is refused, and an old row counts as its own version', () => {
  assert.throws(() => reportFor([run(), run({ trial: 1, claudeVersion: '2.1.276' })]), /Refusing to report across Claude Code 2\.1\.276, 2\.1\.278/);
  assert.throws(() => reportFor([run(), run({ trial: 1, claudeVersion: undefined })]), /Refusing to report across Claude Code 2\.1\.278, unknown/);
});

test('the explicit flag reports the mixture, loudly', () => {
  const report = reportFor([run(), run({ trial: 1, claudeVersion: '2.1.276' })], ['--allow-mixed-versions']);
  assert.match(report, /\*\*Mixed Claude Code versions: 2\.1\.276, 2\.1\.278\.\*\*/);
  assert.match(report, /not comparable/);
  assert.match(report, /2\/2/);
});

test('an unrecognised option fails rather than being read as a directory', () => {
  assert.throws(() => reportFor([run()], ['--allow-mixed']), /Unknown options: --allow-mixed/);
});
