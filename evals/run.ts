/**
 * ---
 * purpose: Entry point for the evals. "tasks" measures ease of use; "context" measures the token footprint of each interface.
 * ---
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { clipSchema, commands, helpText, mcpTools, paddedCommands } from './fixture/spec.ts';
import { readState } from './fixture/state.ts';
import { assertKnownConditions, cleanup, conditions, parseTranscript, pool, prepare, runClaude, skillConditions, skillsDir, type Condition } from './harness.ts';
import { extractAnswer, taskPrompt, tasks } from './tasks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string', default: 'sonnet' },
    trials: { type: 'string', default: '3' },
    concurrency: { type: 'string', default: '4' },
    conditions: { type: 'string', default: conditions.join(',') },
    tasks: { type: 'string', default: tasks.map(task => task.id).join(',') },
    sizes: { type: 'string', default: '8,32,100' },
    out: { type: 'string' },
  },
});
const mode = positionals[0] ?? 'tasks';
const outDir = options.out ?? join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}`);
const concurrency = Number(options.concurrency);
mkdirSync(join(outDir, 'transcripts'), { recursive: true });

const record = (file: string, row: object) => appendFileSync(join(outDir, file), `${JSON.stringify(row)}\n`);

function chosenConditions(): Condition[] {
  const chosen = options.conditions.split(',').map(name => name.trim()).filter(Boolean);
  assertKnownConditions(chosen);
  return chosen;
}

async function runTasks() {
  const chosen = { conditions: chosenConditions(), tasks: tasks.filter(task => options.tasks.split(',').includes(task.id)) };
  const jobs = chosen.conditions.flatMap(condition => chosen.tasks.flatMap(task => Array.from({ length: Number(options.trials) }, (_, trial) => ({ condition, task, trial }))));
  let done = 0;
  await pool(jobs, concurrency, async ({ condition, task, trial }) => {
    const workspace = prepare(condition);
    const label = `${condition}.${task.id}.${trial}`;
    try {
      const before = readState(workspace.statePath);
      const transcript = await runClaude(workspace, taskPrompt(task), options.model);
      writeFileSync(join(outDir, 'transcripts', `${label}.jsonl`), transcript);
      const metrics = parseTranscript(transcript);
      const answer = extractAnswer(metrics.result);
      const after = readState(workspace.statePath);
      // No task is solvable without the tool, so an agent that never tried cannot pass by guessing "refused".
      const success = metrics.completed && metrics.toolCalls > 0 && !metrics.stateTampering && task.verify({ answer, before, after });
      const unsafeMutation = task.kind !== 'mutate' && JSON.stringify(before) !== JSON.stringify(after);
      record('runs.jsonl', { condition, task: task.id, kind: task.kind, trial, model: options.model, success, unsafeMutation, answer, ...metrics, result: undefined });
      console.log(`[${++done}/${jobs.length}] ${label} ${success ? 'pass' : 'FAIL'} turns=${metrics.turns} calls=${metrics.toolCalls} errors=${metrics.toolErrors} input=${metrics.cumulativeInput}`);
    } catch (error) {
      record('runs.jsonl', { condition, task: task.id, kind: task.kind, trial, model: options.model, success: false, harnessError: (error as Error).message });
      console.log(`[${++done}/${jobs.length}] ${label} HARNESS ERROR ${(error as Error).message}`);
    } finally {
      cleanup(workspace);
    }
  });
}

const okPrompt = 'Reply with the single word: ok';
const referencePrefix = 'Ignore the reference data below and reply with the single word: ok\n\n';

async function firstTurnInput(condition: Condition, extra: number, prompt: string): Promise<number> {
  const workspace = prepare(condition, extra);
  try {
    return parseTranscript(await runClaude(workspace, prompt, options.model)).firstTurnInput;
  } finally {
    cleanup(workspace);
  }
}

/** What each interface loads on demand, as the text the agent would actually receive. */
function onDemandArtifacts(extra: number): Record<string, string> {
  const list = paddedCommands(extra);
  const artifacts: Record<string, string> = {
    'cli root --help': helpText(list),
    'cli one command --help': helpText(list, 'load queue'),
    'mcp tool definitions': JSON.stringify(mcpTools(list)),
    'clip schema, one command': JSON.stringify(clipSchema(list).commands.find(command => command.name === 'load queue'), null, 2),
  };
  for (const condition of skillConditions) {
    const workspace = prepare(condition, extra);
    try {
      const skill = join(workspace.cwd, skillsDir, 'clip-brindle');
      artifacts[`${condition} SKILL.md`] = readFileSync(join(skill, 'SKILL.md'), 'utf8');
      artifacts[`${condition} schema.json`] = readFileSync(join(skill, 'schema.json'), 'utf8');
    } finally {
      cleanup(workspace);
    }
  }
  return artifacts;
}

async function runContext() {
  const sizes = options.sizes.split(',').map(Number);
  const baseline = await firstTurnInput('baseline', 0, okPrompt);
  const referenceBaseline = await firstTurnInput('baseline', 0, referencePrefix);
  console.log(`baseline first-turn input: ${baseline}`);
  const upfront = sizes.flatMap(size => conditions.map(condition => ({ kind: 'upfront' as const, size, condition })));
  const onDemand = sizes.flatMap(size => Object.entries(onDemandArtifacts(size - commands.length)).filter(([artifact]) => size === sizes[0] || !artifact.includes("one command")).map(([artifact, text]) => ({ kind: 'on-demand' as const, size, artifact, text })));
  await pool([...upfront, ...onDemand], concurrency, async job => {
    const tokens = job.kind === 'upfront'
      ? await firstTurnInput(job.condition, job.size - commands.length, okPrompt) - baseline
      : await firstTurnInput('baseline', 0, referencePrefix + job.text) - referenceBaseline;
    const row = job.kind === 'upfront' ? { kind: job.kind, commands: job.size, condition: job.condition, tokens } : { kind: job.kind, commands: job.size, artifact: job.artifact, tokens, bytes: job.text.length };
    record('context.jsonl', { model: options.model, baseline, ...row });
    console.log(JSON.stringify(row));
  });
}

if (mode === 'tasks') await runTasks();
else if (mode === 'context') await runContext();
else throw new Error(`Unknown mode: ${mode}. Use "tasks" or "context".`);
console.log(`Results: ${outDir}`);
