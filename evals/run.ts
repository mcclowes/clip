/**
 * ---
 * purpose: Entry point for the evals. "tasks" measures ease of use; "context" measures the token footprint of each interface.
 * ---
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { clipSchema, commands, helpText, mcpTools, paddedCommands, toolDescription } from './fixture/spec.ts';
import { readState } from './fixture/state.ts';
import { assertClaudeVersion, assertKnownConditions, claudeVersion, cleanup, clipMain, conditions, headlessArgs, parseTranscript, pool, prepare, runClaude, skillConditions, skillsDir, type Condition, type Workspace } from './harness.ts';
import { extractAnswer, promptVariants, taskPrompt, tasks, type PromptVariant } from './tasks.ts';
import { invokedTool, prepareRegistry, registryConditions, registryFixtures, registryPrompt, toolVersion, type RegistryCondition } from './registry.ts';
import { findEntry } from '../packages/cli/src/registry.ts';
import { prepareProjectCommands, projectCommandConditions, projectCommandPrompt, projectCommandSucceeded, projectCommandTasks, type ProjectCommandCondition } from './project-commands.ts';
import { assessSchema } from './schema-authoring.ts';
import { validateSchema, type Schema } from '../packages/cli/src/schema.ts';
import type { ClipSchema } from './skill-formats.ts';

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
    /** Schema under test for task mode, or the hand-written truth schema for a non-fixture authoring draft. */
    schema: { type: 'string' },
    'schema-label': { type: 'string', default: 'hand-written' },
    /** Include the fixture's known command gotchas in a task schema. */
    gotchas: { type: 'boolean', default: false },
    /** Tool the authoring agent should inspect. Only brindle has deterministic task checks. */
    tool: { type: 'string', default: 'brindle' },
    purpose: { type: 'string' },
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

function suppliedSchema(): ClipSchema | undefined {
  if (!options.schema) return undefined;
  return validateSchema(JSON.parse(readFileSync(options.schema, 'utf8'))) as ClipSchema;
}

type TaskRunOptions = { schema?: ClipSchema; schemaLabel?: string };

async function runTasks(runOptions: TaskRunOptions = {}) {
  const commandCount = chosenCommandCount();
  if (options.gotchas && options.schema) throw new Error('--gotchas cannot be combined with --schema.');
  const schema = runOptions.schema ?? suppliedSchema() ?? (options.gotchas ? clipSchema(paddedCommands(commandCount - commands.length), { gotchas: true }) as ClipSchema : undefined);
  const schemaLabel = runOptions.schemaLabel ?? ((options.schema || options.gotchas || options['schema-label'] !== 'hand-written') ? options['schema-label'] : undefined);
  if (schema && schema.name !== 'brindle') throw new Error(`Task eval schemas must describe brindle, got ${schema.name}.`);
  const chosen = { conditions: chosenConditions(), tasks: tasks.filter(task => !options.tasks || list(options.tasks).includes(task.id)), prompts: chosenPrompts() };
  const jobs = chosen.conditions.flatMap(condition => chosen.tasks.flatMap(task =>
    chosen.prompts.flatMap(prompt => Array.from({ length: Number(options.trials) }, (_, trial) => ({ condition, task, prompt, trial })))));
  let done = 0;
  await pool(jobs, concurrency, async ({ condition, task, prompt, trial }) => {
    const workspace = prepare(condition, { loads: task.loads, distractors: options.distractors, extraCommands: commandCount - commands.length, schema });
    const label = [condition, schemaLabel, task.id, prompt, trial].filter(Boolean).join('.');
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
      record('runs.jsonl', { condition, ...(schemaLabel ? { schema: schemaLabel } : {}), task: task.id, kind: task.kind, prompt, distractors: options.distractors, commands: commandCount, loads: before.loads.length, trial, claudeVersion: version, success, unsafeMutation, answer, ...metrics, model: metrics.model || options.model, result: undefined });
      console.log(`[${++done}/${jobs.length}] ${label} ${success ? 'pass' : 'FAIL'} turns=${metrics.turns} calls=${metrics.toolCalls} errors=${metrics.toolErrors} input=${metrics.cumulativeInput} results=${metrics.toolResultTokens}`);
    } catch (error) {
      record('runs.jsonl', { condition, ...(schemaLabel ? { schema: schemaLabel } : {}), task: task.id, kind: task.kind, prompt, trial, model: options.model, claudeVersion: version, success: false, harnessError: (error as Error).message });
      console.log(`[${++done}/${jobs.length}] ${label} HARNESS ERROR ${(error as Error).message}`);
    } finally {
      cleanup(workspace);
    }
  });
}

const authenticationError = (error: unknown) => /(?:auth(?:entication|orization)?|oauth|credential|log ?in|api key)/i.test(error instanceof Error ? error.message : String(error));

function authoringPrompt(tool: string, purpose: string, file: string): string {
  return [
    `Draft a CLIP capability schema for the installed ${tool} CLI. Its purpose is: ${purpose}`,
    'Use the clip-schema-authoring skill. Read the CLI only with help flags, use clip schema init and clip lint, and write the final JSON schema to the requested file.',
    `Write the final schema to ${file}. Do not register the tool. Finish with exactly: ANSWER: drafted.`,
  ].join('\n\n');
}

/** Install the real bundled authoring skill and a local clip shim, while exposing only the tool's help text to the drafter. */
function prepareAuthoring(tool: string): Workspace {
  const workspace = prepare('cli-bare');
  const bin = join(workspace.root, 'bin');
  const clip = join(bin, 'clip');
  writeFileSync(clip, `#!/bin/sh\nexec "${process.execPath}" "${clipMain}" "$@"\n`);
  chmodSync(clip, 0o755);
  execFileSync(process.execPath, [clipMain, 'sync', '--skills-dir', skillsDir], { cwd: workspace.cwd, env: workspace.env, stdio: 'pipe' });
  if (tool !== 'brindle') {
    try { execFileSync(tool, ['--help'], { stdio: 'pipe' }); }
    catch (error) { cleanup(workspace); throw new Error(`Could not run ${tool} --help: ${error instanceof Error ? error.message : String(error)}`); }
  }
  workspace.claudeArgs.splice(0, workspace.claudeArgs.length, ...headlessArgs(['Bash', 'Read', 'Skill']));
  return workspace;
}

async function runAuthoring() {
  const tool = options.tool;
  const purpose = options.purpose ?? (tool === 'brindle' ? toolDescription : `Use ${tool} in this project.`);
  const truth = tool === 'brindle' && !options.schema ? clipSchema() as Schema : options.schema ? validateSchema(JSON.parse(readFileSync(options.schema, 'utf8'))) : undefined;
  let workspace: Workspace | undefined;
  try {
    workspace = prepareAuthoring(tool);
    const file = `${tool}.agent.json`;
    const transcript = await runClaude(workspace, authoringPrompt(tool, purpose, file), options.model);
    writeFileSync(join(outDir, 'transcripts', `${tool}.authoring.jsonl`), transcript);
    const metrics = parseTranscript(transcript);
    const candidatePath = join(workspace.cwd, file);
    if (!existsSync(candidatePath)) throw new Error(`The authoring agent did not write ${file}.`);
    const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
    const assessment = truth ? assessSchema(candidate, truth) : assessSchema(candidate, validateSchema(candidate));
    const saved = join(outDir, `${tool}.agent.json`);
    writeFileSync(saved, `${JSON.stringify(candidate, null, 2)}\n`);
    record('authoring.jsonl', { tool, purpose, candidate: saved, claudeVersion: version, ...metrics, model: metrics.model || options.model, assessment, result: undefined });
    console.log(`${tool} draft: lint ${assessment.lint.healthy ? 'healthy' : 'FAILED'} (${assessment.lint.errors} errors, ${assessment.lint.warnings} warnings), mutation ${assessment.mutation.correct}/${assessment.mutation.total}, tokens ${metrics.cumulativeInput}`);
    if (tool === 'brindle' && truth) {
      await runTasks({ schema: truth as ClipSchema, schemaLabel: 'hand-written' });
      await runTasks({ schema: validateSchema(candidate) as ClipSchema, schemaLabel: 'agent-drafted' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record('authoring.jsonl', { tool, purpose, claudeVersion: version, model: options.model, blocked: authenticationError(error), harnessError: message });
    if (authenticationError(error)) {
      console.log(`${tool} authoring BLOCKED: ${message}`);
      return;
    }
    throw error;
  } finally {
    if (workspace) cleanup(workspace);
  }
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
      record('runs.jsonl', { ...base, success, usedTool, unsafeMutation: !unchanged, answer, ...metrics, model: metrics.model || options.model, result: undefined });
      console.log(`[${++done}/${jobs.length}] ${fixture.tool}.${label} ${success ? 'pass' : 'FAIL'} answer=${JSON.stringify(answer)} used=${usedTool} unchanged=${unchanged} calls=${metrics.toolCalls} errors=${metrics.toolErrors}`);
    } catch (error) {
      record('runs.jsonl', { ...base, success: false, harnessError: (error as Error).message });
      console.log(`[${++done}/${jobs.length}] ${fixture.tool}.${label} HARNESS ERROR ${(error as Error).message}`);
    } finally {
      if (workspace) cleanup(workspace);
    }
  });
}

async function runProjectCommands() {
  const chosenConditions = list(options.conditions ?? projectCommandConditions.join(','));
  const unknown = chosenConditions.filter(name => !(projectCommandConditions as readonly string[]).includes(name));
  if (unknown.length) throw new Error(`Unknown project-command conditions: ${unknown.join(', ')}. Known: ${projectCommandConditions.join(', ')}`);
  const chosenTasks = projectCommandTasks.filter(task => !options.tasks || list(options.tasks).includes(task.id));
  const jobs = chosenConditions.flatMap(condition => chosenTasks.flatMap(task =>
    Array.from({ length: Number(options.trials) }, (_, trial) => ({ condition: condition as ProjectCommandCondition, task, trial }))));
  let done = 0;
  await pool(jobs, concurrency, async ({ condition, task, trial }) => {
    const workspace = prepareProjectCommands(condition);
    const label = `${condition}.${task.id}.${trial}`;
    const base = { mode: 'project-commands', condition, task: task.id, kind: 'read', trial, model: options.model, claudeVersion: version };
    try {
      const transcript = await runClaude(workspace, projectCommandPrompt(task), options.model);
      writeFileSync(join(outDir, 'transcripts', `${label}.jsonl`), transcript);
      const metrics = parseTranscript(transcript);
      const answer = extractAnswer(metrics.result);
      const stateTampering = metrics.calls.some(call => /PROJECT_COMMAND_MARKERS|\/markers(?:\/|\b)/.test(call));
      const success = metrics.completed && metrics.toolCalls > 0 && !stateTampering && answer.toLowerCase() === 'done' && projectCommandSucceeded(workspace, task);
      record('runs.jsonl', { ...base, success, unsafeMutation: false, answer, ...metrics, stateTampering, model: metrics.model || options.model, result: undefined });
      console.log(`[${++done}/${jobs.length}] ${label} ${success ? 'pass' : 'FAIL'} calls=${metrics.toolCalls} discovery=${metrics.discoveryCalls} errors=${metrics.toolErrors} input=${metrics.cumulativeInput}`);
    } catch (error) {
      record('runs.jsonl', { ...base, success: false, harnessError: (error as Error).message });
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
else if (mode === 'project-commands') await runProjectCommands();
else if (mode === 'authoring') await runAuthoring();
else throw new Error(`Unknown mode: ${mode}. Use "tasks", "context", "registry", "project-commands", or "authoring".`);
console.log(`Results: ${outDir}`);
