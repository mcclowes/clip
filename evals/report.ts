/**
 * ---
 * purpose: Summarize eval result directories as Markdown tables.
 * ---
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = Record<string, unknown>;
const readRows = (path: string): Row[] => existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
const table = (headers: string[], rows: (string | number)[][]) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
const unique = <T>(items: T[]) => [...new Set(items)];
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? (sorted[(sorted.length - 1) >> 1]! + sorted[sorted.length >> 1]!) / 2 : 0;
};
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

function taskReport(rows: Row[]): string {
  const valid = rows.filter(row => !row.harnessError);
  const conditions = unique(rows.map(row => String(row.condition)));
  const metric = (subset: Row[], key: string) => subset.map(row => Number(row[key]));
  const summary = conditions.map(condition => {
    const all = valid.filter(row => row.condition === condition);
    const passed = all.filter(row => row.success);
    return [condition, `${passed.length}/${all.length}`, round(mean(metric(passed, 'toolCalls'))), round(mean(metric(passed, 'discoveryCalls'))), round(mean(metric(all, 'toolErrors')), 2),
      all.filter(row => row.unsafeMutation).length, Math.round(median(metric(passed, 'cumulativeInput'))), Math.round(median(metric(passed, 'peakInput'))), Math.round(median(metric(passed, 'toolResultTokens'))), Math.round(median(metric(passed, 'outputTokens'))),
      round(median(metric(passed, 'costUsd')), 3), round(median(metric(passed, 'durationMs')) / 1000)];
  });
  const tasks = unique(rows.map(row => String(row.task)));
  const perTask = tasks.map(task => [task, ...conditions.map(condition => {
    const all = valid.filter(row => row.condition === condition && row.task === task);
    return `${all.filter(row => row.success).length}/${all.length} (${round(mean(metric(all, 'toolCalls')))})`;
  })]);
  const harnessErrors = rows.length - valid.length;
  const scaled = tasks.filter(task => valid.some(row => row.task === task && Number(row.loads) > 20));
  const composition = scaled.length ? [
    '### Tool-result tokens on scaled tasks', '',
    `Estimated from result text at four characters per token, over passing runs on ${scaled.join(', ')}.`, '',
    table(['Condition', 'Tool-result tokens (median)', 'Cumulative input (median)', 'Tool calls'], conditions.map(condition => {
      const passed = valid.filter(row => row.condition === condition && row.success && scaled.includes(String(row.task)));
      return [condition, Math.round(median(metric(passed, 'toolResultTokens'))), Math.round(median(metric(passed, 'cumulativeInput'))), round(mean(metric(passed, 'toolCalls')))];
    })), '',
  ] : [];
  return [
    '## Ease of use', '',
    'Tool calls, discovery calls, tokens, cost, and time cover passing runs only, so failures that give up early do not look cheap. Errors per run covers all runs.', '',
    table(['Condition', 'Pass', 'Tool calls', 'Discovery calls', 'Errors per run', 'Unsafe mutations', 'Cumulative input (median)', 'Peak context (median)', 'Tool-result tokens (median)', 'Output tokens (median)', 'Cost USD (median)', 'Seconds (median)'], summary), '',
    '### Pass rate by task (mean tool calls)', '', table(['Task', ...conditions], perTask), '',
    ...composition,
    ...(harnessErrors ? [`${harnessErrors} runs hit harness errors and are excluded.`, ''] : []),
  ].join('\n');
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
    '## Context cost', '', `Baseline first-turn input with no brindle interface: ${rows[0]?.baseline} tokens (${rows[0]?.model}).`, '',
    '### Always loaded (tokens added to every turn)', '', section('upfront', 'condition'), '',
    '### Loaded on demand (tokens when the agent asks)', '', section('on-demand', 'artifact'), '',
  ].join('\n');
}

const directories = process.argv.slice(2);
if (!directories.length) throw new Error('Usage: node evals/report.ts <results-dir>...');
for (const directory of directories) {
  const runs = readRows(join(directory, 'runs.jsonl'));
  const context = readRows(join(directory, 'context.jsonl'));
  if (runs.length) console.log(taskReport(runs));
  if (context.length) console.log(contextReport(context));
}
