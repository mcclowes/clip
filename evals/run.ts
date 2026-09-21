/**
 * ---
 * purpose: Entry point for the evals. "tasks" measures ease of use; "context" measures the token footprint of each interface.
 * ---
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { clipSchema, commands, helpText, mcpTools, paddedCommands } from './fixture/spec.ts';
import { readState } from './fixture/state.ts';
import { assertClaudeVersion, assertKnownConditions, claudeVersion, cleanup, conditions, parseTranscript, pool, prepare, runClaude, skillConditions, skillsDir, type Condition, type Workspace } from './harness.ts';
import { extractAnswer, promptVariants, taskPrompt, tasks, type PromptVariant } from './tasks.ts';
import { invokedTool, prepareRegistry, registryConditions, registryFixtures, registryPrompt, toolVersion, type RegistryCondition } from './registry.ts';
import { findEntry } from '../packages/cli/src/registry.ts';

const here = dirname(fileURLToPath(import.meta.url));
const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string', default: 'sonnet' },
    trials: { type: 'string', default: '3' },
    concurrency: { type: 'string', default: '4' },
    // Defaults depend on the mode, since registry runs have their own conditions and tasks.
    conditions: { type: 'string' },
    tasks: { type: 'string' },
    tools: { type: 'string', default: registryFixtures.map(fixture => fixture.tool).join(',') },
    prompts: { type: 'string', default: 'named' },
    distractors: { type: 'boolean', default: false },
    // Pads brindle with inert clones for tasks, so a skill format is exercised at the size where it changes shape.
    commands: { type: 'string', default: String(commands.length) },
    // The first size is the fixture as it stands, so adding a command does not mislabel the column.
    sizes: { type: 'string', default: `${commands.length},32,100` },
    'require-version': { type: 'string' },
    out: { type: 'string' },
  },
});
const mode = positionals[0] ?? 'tasks';
const outDir = options.out ?? join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}`);
const concurrency = Number(options.concurrency);
// Recorded on every row: a patch release of the harness can move a result on its own, so results are only comparable within a version.
const version = claudeVersion();
if (options['require-version']) assertClaudeVersion(options['require-version'], version);
console.log(`Claude Code ${version}, model ${options.model}, mode ${mode}`);
mkdirSync(join(outDir, 'transcripts'), { recursive: true });

const record = (file: string, row: object) => appendFileSync(join(outDir, file), `${JSON.stringify(row)}\n`);
const list = (value: string) => value.split(',').map(name => name.trim()).filter(Boolean);

function chosenConditions(): Condition[] {
  const chosen = list(options.conditions ?? conditions.join(','));
  assertKnownConditions(chosen);
  return chosen;
}

function chosenPrompts(): PromptVariant[] {
  const chosen = options.prompts.split(',').map(name => name.trim()).filter(Boolean);
  const unknown = chosen.filter(name => !(name in promptVariants));
  if (unknown.length) throw new Error(`Unknown prompt variants: ${unknown.join(', ')}. Known: ${Object.keys(promptVariants).join(', ')}`);
  return chosen as PromptVariant[];
}

function chosenCommandCount(): number {
  const count = Number(options.commands);
  if (!Number.isInteger(count) || count < commands.length) throw new Error(`--commands must be an integer of at least ${commands.length}, the fixture size.`);
  return count;
}

async function runTasks() {
  const commandCount = chosenCommandCount();
  const chosen = { conditions: chosenConditions(), tasks: tasks.filter(task => !options.tasks || list(options.tasks).includes(task.id)), prompts: chosenPrompts() };
  const jobs = chosen.conditions.flatMap(condition => chosen.tasks.flatMap(task =>
    chosen.prompts.flatMap(prompt => Array.from({ length: Number(options.trials) }, (_, trial) => ({ condition, task, prompt, trial })))));
  let done = 0;
  await pool(jobs, concurrency, async ({ condition, task, prompt, trial }) => {
    const workspace = prepare(condition, { loads: task.loads, distractors: options.distractors, extraCommands: commandCount - commands.length });
    const label = `${condition}.${task.id}.${prompt}.${trial}`;
    try {
      const before = readState(workspace.statePath);
      const transcript = await runClaude(workspace, taskPrompt(task, prompt), options.model);
      writeFileSync(join(outDir, 'transcripts', `${label}.jsonl`), transcript);
      const metrics = parseTranscript(transcript);
      const answer = extractAnswer(metrics.result);
      const after = readState(workspace.statePath);
      // No task is solvable without the tool, so an agent that never tried cannot pass by guessing "refused".
      const success = metrics.completed && metrics.toolCalls > 0 && !metrics.stateTampering && task.verify({ answer, before, after });
      const unsafeMutation = task.kind !== 'mutate' && JSON.stringify(before) !== JSON.stringify(after);
      record('runs.jsonl', { condition, task: task.id, kind: task.kind, prompt, distractors: options.distractors, commands: commandCount, loads: before.loads.length, trial, model: options.model, claudeVersion: version, success, unsafeMutation, answer, ...metrics, result: undefined });
      console.log(`[${++done}/${jobs.length}] ${label} ${success ? 'pass' : 'FAIL'} turns=${metrics.turns} calls=${metrics.toolCalls} errors=${metrics.toolErrors} input=${metrics.cumulativeInput} results=${metrics.toolResultTokens}`);
    } catch (error) {
      record('runs.jsonl', { condition, task: task.id, kind: task.kind, prompt, trial, model: options.model, claudeVersion: version, success: false, harnessError: (error as Error).message });
      console.log(`[${++done}/${jobs.length}] ${label} HARNESS ERROR ${(error as Error).message}`);
    } finally {
      cleanup(workspace);
    }
  });
}

async function runRegistry() {
  const chosenConditions = list(options.conditions ?? registryConditions.join(','));
  const unknownConditions = chosenConditions.filter(name => !(registryConditions as readonly string[]).includes(name));
  if (unknownConditions.length) throw new Error(`Unknown registry conditions: ${unknownConditions.join(', ')}. Known: ${registryConditions.join(', ')}`);
  const fixtures = list(options.tools).map(tool => {
    const fixture = registryFixtures.find(item => item.tool === tool);
    if (!fixture) throw new Error(`No registry fixture for ${tool}. Known: ${registryFixtures.map(item => item.tool).join(', ')}`);
    const entry = findEntry(tool);
    return { fixture, entry, toolVersion: toolVersion(entry.executable) };
  });
  const jobs = fixtures.flatMap(({ fixture, ...rest }) => fixture.tasks.filter(task => !options.tasks || list(options.tasks).includes(task.id))
    .flatMap(task => chosenConditions.flatMap(condition => Array.from({ length: Number(options.trials) }, (_, trial) => ({ fixture, task, condition: condition as RegistryCondition, trial, ...rest })))));
  let done = 0;
  await pool(jobs, concurrency, async ({ fixture, entry, task, condition, trial, toolVersion }) => {
    const label = `${condition}.${task.id}.${trial}`;
    const base = { mode: 'registry', tool: fixture.tool, condition, task: task.id, trial, model: options.model, claudeVersion: version, toolVersion, sha256: entry.sha256 };
    let workspace: Workspace | undefined;
    try {
      workspace = prepareRegistry(condition, fixture, entry.purpose);
      const before = fixture.snapshot(workspace.cwd);
      const transcript = await runClaude(workspace, registryPrompt(task), options.model);
      writeFileSync(join(outDir, 'transcripts', `${fixture.tool}.${label}.jsonl`), transcript);
      const metrics = parseTranscript(transcript);
      const answer = extractAnswer(metrics.result);
      const unchanged = fixture.snapshot(workspace.cwd) === before;
      const usedTool = invokedTool(metrics.calls, entry.executable);
      const success = metrics.completed && usedTool && unchanged && task.verify(answer);
      record('runs.jsonl', { ...base, success, usedTool, unsafeMutation: !unchanged, answer, ...metrics, result: undefined });
      console.log(`[${++done}/${jobs.length}] ${fixture.tool}.${label} ${success ? 'pass' : 'FAIL'} answer=${JSON.stringify(answer)} used=${usedTool} unchanged=${unchanged} calls=${metrics.toolCalls} errors=${metrics.toolErrors}`);
    } catch (error) {
      record('runs.jsonl', { ...base, success: false, harnessError: (error as Error).message });
      console.log(`[${++done}/${jobs.length}] ${fixture.tool}.${label} HARNESS ERROR ${(error as Error).message}`);
    } finally {
      if (workspace) cleanup(workspace);
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
function onDemandArtifacts(extra: number, chosen: Condition[]): Record<string, string> {
  const list = paddedCommands(extra);
  const artifacts: Record<string, string> = {
    'cli root --help': helpText(list),
    'cli one command --help': helpText(list, 'load queue'),
    'mcp tool definitions': JSON.stringify(mcpTools(list)),
    'clip schema, one command': JSON.stringify(clipSchema(list).commands.find(command => command.name === 'load queue'), null, 2),
  };
  for (const condition of skillConditions.filter(name => chosen.includes(name))) {
    const workspace = prepare(condition, extra);
    try {
      const skill = join(workspace.cwd, skillsDir, 'clip-brindle');
      const read = (path: string) => readFileSync(join(skill, path), 'utf8');
      artifacts[`${condition} SKILL.md`] = read('SKILL.md');
      if (existsSync(join(skill, 'schema.json'))) artifacts[`${condition} schema.json`] = read('schema.json');
      // What the agent reads to run `load queue`: SKILL.md, plus the group file when usage lines live there.
      const group = existsSync(join(skill, 'commands')) ? readdirSync(join(skill, 'commands')).map(file => `commands/${file}`).find(path => read(path).includes('`brindle load queue ')) : undefined;
      artifacts[`${condition} to use load queue`] = read('SKILL.md').includes('`brindle load queue ') || !group ? read('SKILL.md') : `${read('SKILL.md')}\n${read(group)}`;
    } finally {
      cleanup(workspace);
    }
  }
  return artifacts;
}

async function runContext() {
  const sizes = options.sizes.split(',').map(Number);
  const chosen = chosenConditions();
  const baseline = await firstTurnInput('baseline', 0, okPrompt);
  const referenceBaseline = await firstTurnInput('baseline', 0, referencePrefix);
  console.log(`baseline first-turn input: ${baseline}`);
  const upfront = sizes.flatMap(size => chosen.map(condition => ({ kind: 'upfront' as const, size, condition })));
  const onDemand = sizes.flatMap(size => Object.entries(onDemandArtifacts(size - commands.length, chosen)).filter(([artifact]) => size === sizes[0] || !artifact.includes("one command")).map(([artifact, text]) => ({ kind: 'on-demand' as const, size, artifact, text })));
  await pool([...upfront, ...onDemand], concurrency, async job => {
    const tokens = job.kind === 'upfront'
      ? await firstTurnInput(job.condition, job.size - commands.length, okPrompt) - baseline
      : await firstTurnInput('baseline', 0, referencePrefix + job.text) - referenceBaseline;
    const row = job.kind === 'upfront' ? { kind: job.kind, commands: job.size, condition: job.condition, tokens } : { kind: job.kind, commands: job.size, artifact: job.artifact, tokens, bytes: job.text.length };
    record('context.jsonl', { model: options.model, claudeVersion: version, baseline, ...row });
    console.log(JSON.stringify(row));
  });
}

if (mode === 'tasks') await runTasks();
else if (mode === 'context') await runContext();
else if (mode === 'registry') await runRegistry();
else throw new Error(`Unknown mode: ${mode}. Use "tasks", "context", or "registry".`);
console.log(`Results: ${outDir}`);
