/**
 * ---
 * purpose: Summarize eval result directories as Markdown tables.
 * ---
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brindleRules, promptCount } from './permissions.ts';

type Row = Record<string, unknown>;
const readRows = (path: string): Row[] => existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
const table = (headers: string[], rows: (string | number)[][]) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
const unique = <T>(items: T[]) => [...new Set(items)];
const conditionName = (row: Row) => `${String(row.condition)}${row.schema ? ` (${String(row.schema)})` : ''}`;
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? (sorted[(sorted.length - 1) >> 1]! + sorted[sorted.length >> 1]!) / 2 : 0;
};
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const quantile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]! : 0;
};
/** Half the interquartile range, so a median reads with the spread that produced it. */
const spread = (values: number[]) => Math.round((quantile(values, 0.75) - quantile(values, 0.25)) / 2);
const withSpread = (values: number[]) => (values.length > 2 ? `${Math.round(median(values))} ±${spread(values)}` : String(Math.round(median(values))));

/** Rows written before the version was recorded read as `unknown`, which is itself a version to refuse to mix. */
const claudeVersions = (rows: Row[]) => unique(rows.map(row => String(row.claudeVersion ?? 'unknown'))).sort();

function versionLine(rows: Row[]): string {
  const versions = claudeVersions(rows);
  return versions.length > 1
    ? `**Mixed Claude Code versions: ${versions.join(', ')}.** The harness prompt changes between patch releases, so these rows are not comparable.`
    : `Claude Code ${versions[0] ?? 'unknown'}.`;
}

/**
 * Wilson 95% interval on a pass rate, which stays sensible at 0/n and n/n where a normal interval does not.
 * Three trials give a wide interval on purpose: it is the honest width for three trials.
 */
function passRate(passed: number, total: number): string {
  if (!total) return '';
  const z = 1.96;
  const rate = passed / total;
  const denominator = 1 + (z * z) / total;
  const centre = (rate + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((rate * (1 - rate)) / total + (z * z) / (4 * total * total))) / denominator;
  return `${passed}/${total} (${Math.round(Math.max(0, centre - margin) * 100)}–${Math.round(Math.min(1, centre + margin) * 100)}%)`;
}

function taskReport(rows: Row[]): string {
  const valid = rows.filter(row => !row.harnessError);
  const heading = rows.every(row => row.mode === 'project-commands') ? 'Project command discovery' : 'Ease of use';
  const conditions = unique(rows.map(conditionName));
  const metric = (subset: Row[], key: string) => subset.map(row => Number(row[key]));
  const summary = conditions.map(condition => {
    const all = valid.filter(row => conditionName(row) === condition);
    const passed = all.filter(row => row.success);
    return [condition, passRate(passed.length, all.length), round(mean(metric(passed, 'toolCalls'))), round(mean(metric(passed, 'discoveryCalls'))), round(mean(metric(all, 'toolErrors')), 2),
      all.filter(row => row.unsafeMutation).length, withSpread(metric(passed, 'cumulativeInput')), Math.round(median(metric(passed, 'peakInput'))), Math.round(median(metric(passed, 'toolResultTokens'))), Math.round(median(metric(passed, 'outputTokens'))),
      round(median(metric(passed, 'costUsd')), 3), round(median(metric(passed, 'durationMs')) / 1000)];
  });
  const tasks = unique(rows.map(row => String(row.task)));
  const perTask = tasks.map(task => [task, ...conditions.map(condition => {
      const all = valid.filter(row => conditionName(row) === condition && row.task === task);
    return all.length ? `${all.filter(row => row.success).length}/${all.length} (${round(mean(metric(all, 'toolCalls')))})` : '';
  })]);
  const harnessErrors = rows.length - valid.length;
  const scaled = tasks.filter(task => valid.some(row => row.task === task && Number(row.loads) > 20));
  const composition = scaled.length ? [
    '### Composition on scaled tasks', '',
    `Piped first call and spilled runs cover all valid runs on ${scaled.join(', ')}. Turns and tokens cover passing runs. Tool-result tokens are estimated from result text at four characters per token.`, '',
    table(['Condition', 'Pass', 'Piped first call', 'Spilled runs', 'Turns (median)', 'Tool-result tokens (median)', 'Cumulative input (median)', 'Tool calls'], conditions.map(condition => {
      const all = valid.filter(row => conditionName(row) === condition && scaled.includes(String(row.task)));
      const passed = valid.filter(row => conditionName(row) === condition && row.success && scaled.includes(String(row.task)));
      return [condition, passRate(passed.length, all.length), `${all.filter(row => row.firstListCallPiped).length}/${all.length}`, `${all.filter(row => Number(row.spills) > 0).length}/${all.length}`,
        round(median(metric(passed, 'turns'))), withSpread(metric(passed, 'toolResultTokens')), withSpread(metric(passed, 'cumulativeInput')), round(mean(metric(passed, 'toolCalls')))];
    })), '',
  ] : [];
  const variants = unique(valid.map(row => `${row.prompt ?? 'named'}${row.distractors ? ' + distractors' : ''}`));
  const byVariant = variants.length > 1 ? [
    '### Pass rate by prompt variant', '',
    'A variant that names no tool measures selection by purpose. Distractors are 20 unrelated tools in the same namespace as the condition\'s own interface.', '',
    table(['Condition', ...variants], conditions.map(condition => [condition, ...variants.map(variant => {
      const all = valid.filter(row => conditionName(row) === condition && `${row.prompt ?? 'named'}${row.distractors ? ' + distractors' : ''}` === variant);
      return all.length ? `${all.filter(row => row.success).length}/${all.length}` : '';
    })])), '',
  ] : [];
  const prompts = permissionPrompts(valid);
  const longRuns = valid.filter(row => row.task === 'long-session' && row.success);
  const longSession = longRuns.length ? [
    '### Long session (many unrelated turns, one tool use)', '',
    'The tool does the same work as `count-filtered`. Everything else is unrelated chores, so an always-loaded interface is resent on every turn.', '',
    table(['Condition', 'Pass', 'Turns (median)', 'Cumulative input (median)', 'Per turn'], conditions.map(condition => {
      const all = valid.filter(row => conditionName(row) === condition && row.task === 'long-session');
      const passed = all.filter(row => row.success);
      const turns = median(metric(passed, 'turns'));
      const input = median(metric(passed, 'cumulativeInput'));
      return [condition, passRate(passed.length, all.length), round(turns), withSpread(metric(passed, 'cumulativeInput')), turns ? Math.round(input / turns) : ''];
    })), '',
  ] : [];
  return [
    `## ${heading}`, '', versionLine(rows), '',
    'Tool calls, discovery calls, tokens, cost, and time cover passing runs only, so failures that give up early do not look cheap. Errors per run covers all runs.',
    'Pass rates carry a Wilson 95% interval, and `±` on a median is half the interquartile range. With few trials these are wide, which is the point.', '',
    table(['Condition', 'Pass', 'Tool calls', 'Discovery calls', 'Errors per run', 'Unsafe mutations', 'Cumulative input (median)', 'Peak context (median)', 'Tool-result tokens (median)', 'Output tokens (median)', 'Cost USD (median)', 'Seconds (median)'], summary), '',
    '### Pass rate by task (mean tool calls)', '', table(['Task', ...conditions], perTask), '',
    ...byVariant,
    ...composition,
    ...longSession,
    ...prompts,
    ...(harnessErrors ? [`${harnessErrors} runs hit harness errors and are excluded.`, ''] : []),
  ].join('\n');
}

/** Replays read-task Bash calls against the rules `clip permissions` would generate for brindle; with no allowlist, every one prompts. */
function permissionPrompts(rows: Row[]): string[] {
  const reads = rows.filter(row => String(row.condition).startsWith('cli-') && row.kind === 'read' && Array.isArray(row.calls));
  if (!reads.length) return [];
  const rules = brindleRules();
  const conditions = unique(reads.map(conditionName));
  return [
    '### Permission prompts on read tasks', '',
    'Bash calls replayed against the allow rules `clip permissions` generates for brindle. A call avoids its prompt only when every segment between shell operators matches a rule, so a pipe to jq still prompts, as it would with no other allowlist.', '',
    table(['Condition', 'Bash calls (prompts with no allowlist)', 'Prompts avoided', 'Still prompted', 'Avoided'], conditions.map(condition => {
      const counts = reads.filter(row => conditionName(row) === condition).map(row => promptCount(row.calls as string[], rules));
      const bash = counts.reduce((sum, count) => sum + count.bash, 0);
      const avoided = counts.reduce((sum, count) => sum + count.avoided, 0);
      return [condition, bash, avoided, bash - avoided, bash ? `${Math.round((avoided / bash) * 100)}%` : ''];
    })), '',
  ];
}

function contextReport(rows: Row[]): string {
  const sizes = unique(rows.map(row => Number(row.commands))).sort((a, b) => a - b);
  const section = (kind: string, key: string) => {
    const subset = rows.filter(row => row.kind === kind);
    return table([key, ...sizes.map(size => `${size} commands`)], unique(subset.map(row => String(row[key]))).map(name => [name, ...sizes.map(size => {
      const found = subset.find(row => row[key] === name && row.commands === size);
      return found ? Number(found.tokens) : '';
    })]));
  };
  return [
    '## Context cost', '', versionLine(rows), '', `Baseline first-turn input with no brindle interface: ${rows[0]?.baseline} tokens (${rows[0]?.model}).`, '',
    '### Always loaded (tokens added to every turn)', '', section('upfront', 'condition'), '',
    '### Loaded on demand (tokens when the agent asks)', '', section('on-demand', 'artifact'), '',
  ].join('\n');
}

function authoringReport(rows: Row[]): string {
  return rows.map(row => {
    if (row.blocked) return `## Schema authoring: ${row.tool}\n\nBlocked by provider authentication: ${row.harnessError}`;
    const assessment = row.assessment as { valid: boolean; validationError?: string; lint: { healthy: boolean; errors: number; warnings: number }; mutation: { correct: number; total: number; missing: number; wrong: number; markers: { command: string; expected: string | boolean; actual: string | boolean; correct: boolean }[] } } | undefined;
    if (!assessment) return `## Schema authoring: ${row.tool}\n\nNo assessment was recorded.`;
    const metrics = ['cumulativeInput', 'outputTokens', 'toolResultTokens'].map(key => `${key}: ${row[key] ?? 'unknown'}`).join(', ');
    return [
      `## Schema authoring: ${row.tool}`, '',
      `Claude Code ${row.claudeVersion ?? 'unknown'}, model ${row.model ?? 'unknown'}. ${metrics}.`, '',
      assessment.valid
        ? `Lint: ${assessment.lint.healthy ? 'healthy' : 'failed'} (${assessment.lint.errors} errors, ${assessment.lint.warnings} warnings). Mutation markers: ${assessment.mutation.correct}/${assessment.mutation.total} correct, ${assessment.mutation.missing} missing, ${assessment.mutation.wrong} wrong.`
        : `Schema validation failed: ${assessment.validationError ?? 'unknown error'}.`, '',
      ...(assessment.valid ? ['### Mutation markers', '', table(['Command', 'Hand-written', 'Agent-drafted', 'Match'], assessment.mutation.markers.map(marker => [marker.command, String(marker.expected), String(marker.actual), marker.correct ? 'yes' : 'no'])), ''] : []),
    ].join('\n');
  }).join('\n');
}

const allowMixedVersions = '--allow-mixed-versions';
const args = process.argv.slice(2);
const usage = `Usage: node evals/report.ts [${allowMixedVersions}] <results-dir>...`;
const unknownOptions = args.filter(arg => arg.startsWith('--') && arg !== allowMixedVersions);
if (unknownOptions.length) throw new Error(`Unknown options: ${unknownOptions.join(', ')}. ${usage}`);
const directories = args.filter(arg => !arg.startsWith('--'));
if (!directories.length) throw new Error(usage);

const loaded = directories.map(directory => ({ runs: readRows(join(directory, 'runs.jsonl')), context: readRows(join(directory, 'context.jsonl')), authoring: readRows(join(directory, 'authoring.jsonl')) }));
// A version change alone can move a result, so mixing them silently is the failure this gate exists to prevent.
const versions = claudeVersions(loaded.flatMap(({ runs, context }) => [...runs, ...context]));
if (versions.length > 1 && !args.includes(allowMixedVersions)) {
  throw new Error(`Refusing to report across Claude Code ${versions.join(', ')}. The harness prompt changes between patch releases, so these rows are not comparable. Pass ${allowMixedVersions} to report anyway.`);
}
for (const { runs, context } of loaded) {
  if (runs.length) console.log(taskReport(runs));
  if (context.length) console.log(contextReport(context));
}
for (const { authoring } of loaded) if (authoring.length) console.log(authoringReport(authoring));
