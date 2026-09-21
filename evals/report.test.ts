import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

function reportOn(files: { runs?: object[]; context?: object[]; authoring?: object[] }, args: string[] = []): string {
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
  assert.match(full, /Composition on scaled tasks/);
  assert.match(full, /Long session/);
  // 140,000 over 14 turns is the always-loaded cost the long session is there to expose.
  assert.match(full, /\| 10000 \|/);
});

test('scaled-task reports include piping, spills, turns, pass rate, and tool-result tokens', () => {
  const report = reportFor([
    run({ task: 'reduction-share', loads: 500, turns: 3, firstListCallPiped: true, spills: 0, toolResultTokens: 200 }),
    run({ trial: 1, task: 'reduction-share', loads: 500, turns: 4, firstListCallPiped: false, spills: 1, toolResultTokens: 1_200 }),
  ]);
  assert.match(report, /Composition on scaled tasks/);
  assert.match(report, /Piped first call/);
  assert.match(report, /Spilled runs/);
  assert.match(report, /Turns \(median\)/);
  assert.match(report, /2\/2/);
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

test('counts permission prompts a clip permissions allowlist avoids on read tasks', () => {
  const bash = (command: string) => `Bash ${JSON.stringify({ command })}`;
  const output = reportFor([
    run({ calls: [bash('/tmp/clip-eval-a/bin/brindle load list'), bash('brindle load list | jq .items')] }),
    run({ trial: 1, calls: [bash('brindle kiln list')] }),
    run({ task: 'tempting-cancel', calls: [bash('brindle load cancel LD-1')], kind: 'write' }),
    run({ condition: 'mcp-eager', calls: ['mcp__brindle__load_list {}'] }),
  ]);

  assert.match(output, /### Permission prompts on read tasks/);
  assert.match(output, /\| cli-clip \| 3 \| 2 \| 1 \|/);
  assert.doesNotMatch(output, /\| mcp-eager \| \d+ \| \d+ \| \d+ \|/);
});

test('project-command runs get their own report heading', () => {
  const report = reportFor([
    run({ mode: 'project-commands', condition: 'commands-md', task: 'build' }),
    run({ mode: 'project-commands', condition: 'package-json', task: 'build' }),
  ]);
  assert.match(report, /^## Project command discovery/m);
  assert.doesNotMatch(report, /^## Ease of use/m);
});

test('authoring results report lint, mutation markers, and drafting tokens', () => {
  const report = reportOn({ authoring: [{
    tool: 'brindle', claudeVersion: '2.1.278', model: 'sonnet', cumulativeInput: 12_000, outputTokens: 500, toolResultTokens: 100,
    assessment: { valid: true, lint: { healthy: true, errors: 0, warnings: 2 }, mutation: { correct: 8, total: 9, missing: 1, wrong: 0, markers: [{ command: 'load list', expected: false, actual: false, correct: true }] } },
  }] });
  assert.match(report, /Schema authoring: brindle/);
  assert.match(report, /Lint: healthy \(0 errors, 2 warnings\)/);
  assert.match(report, /Mutation markers: 8\/9 correct, 1 missing, 0 wrong/);
  assert.match(report, /cumulativeInput: 12000/);
  assert.match(report, /\| load list \| false \| false \| yes \|/);
});

test('task reports keep hand-written and drafted schemas separate', () => {
  const report = reportFor([run({ schema: 'hand-written' }), run({ trial: 1, schema: 'agent-drafted' })]);
  assert.match(report, /cli-clip \(hand-written\)/);
  assert.match(report, /cli-clip \(agent-drafted\)/);
});
