/**
 * ---
 * purpose: Prepare an isolated workspace per condition, run headless Claude Code in it, and extract metrics from the transcript.
 * ---
 */
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distractors, distractorSkill } from './fixture/distractors.ts';
import { clipSchema, paddedCommands, toolDescription } from './fixture/spec.ts';
import { seed, writeState } from './fixture/state.ts';
import { skillFormatByCondition, type ClipSchema } from './skill-formats.ts';

/** Skill formats appear as their own conditions, so a format change is measured without touching packages/cli. */
export const skillConditions = [...skillFormatByCondition.keys()];
export const conditions = ['cli-bare', 'cli-hint', ...skillConditions, 'mcp-eager', 'mcp-deferred'];
export type Condition = string;

const here = dirname(fileURLToPath(import.meta.url));
const clipMain = resolve(here, '../packages/cli/src/main.ts');
const builtinTools = ['Bash', 'Read', 'Skill'];
const runTimeoutMs = 6 * 60_000;
/** Stands in for the one line a project would otherwise put in CLAUDE.md. */
const cliHint = 'The brindle CLI is installed and on PATH.';
export const skillsDir = '.claude/skills';
const isCliCondition = (condition: Condition) => condition === 'cli-bare' || condition === 'cli-hint' || skillFormatByCondition.has(condition);

export function assertKnownConditions(chosen: Condition[]): void {
  const unknown = chosen.filter(condition => !conditions.includes(condition));
  if (unknown.length) throw new Error(`Unknown conditions: ${unknown.join(', ')}. Known: ${conditions.join(', ')}`);
}

export type PrepareOptions = { extraCommands?: number; loads?: number; distractors?: boolean };
export type Workspace = { root: string; cwd: string; statePath: string; env: NodeJS.ProcessEnv; claudeArgs: string[] };

export function prepare(condition: Condition, options: PrepareOptions | number = {}): Workspace {
  const { extraCommands = 0, loads, distractors: withDistractors = false } = typeof options === 'number' ? { extraCommands: options } : options;
  const root = mkdtempSync(join(tmpdir(), 'clip-eval-'));
  const cwd = join(root, 'work');
  const bin = join(root, 'bin');
  const statePath = join(root, 'state.json');
  mkdirSync(cwd);
  mkdirSync(bin);
  writeState(seed(loads), statePath);
  const fixtureEnv = { BRINDLE_STATE: statePath, BRINDLE_EXTRA_COMMANDS: String(extraCommands) };
  const env: NodeJS.ProcessEnv = { ...process.env, ...fixtureEnv, CLIP_HOME: join(root, 'clip-home'), ENABLE_TOOL_SEARCH: condition === 'mcp-deferred' ? 'true' : 'false' };
  const tools = [...builtinTools];
  const claudeArgs: string[] = [];

  if (isCliCondition(condition)) {
    const shim = join(bin, 'brindle');
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${join(here, 'fixture/cli.ts')}" "$@"\n`);
    chmodSync(shim, 0o755);
    env.PATH = `${bin}:${process.env.PATH}`;
  }
  if (condition === 'cli-hint') claudeArgs.push('--append-system-prompt', cliHint);
  const format = skillFormatByCondition.get(condition);
  if (format) {
    const schemaPath = join(root, 'brindle.schema.json');
    const schema = clipSchema(paddedCommands(extraCommands)) as ClipSchema;
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    format.render({
      skillsDir: join(cwd, skillsDir), schema, schemaPath, executable: join(bin, 'brindle'), purpose: toolDescription,
      clip: (...args: string[]) => void execFileSync(process.execPath, [clipMain, ...args], { cwd, env, stdio: 'pipe' }),
    });
  }
  const isMcp = condition === 'mcp-eager' || condition === 'mcp-deferred';
  if (isMcp) {
    const config = join(root, 'mcp.json');
    const server = (file: string) => ({ command: process.execPath, args: [join(here, `fixture/${file}`)], env: fixtureEnv });
    writeFileSync(config, JSON.stringify({ mcpServers: { brindle: server('mcp.ts'), ...(withDistractors ? { backoffice: server('mcp-distractors.ts') } : {}) } }));
    claudeArgs.push('--mcp-config', config);
    if (condition === 'mcp-deferred') tools.push('ToolSearch');
  }
  // Distractors crowd the namespace the condition's own interface lives in, so selection by purpose is what is tested.
  if (withDistractors && !isMcp) for (const tool of distractors) {
    const dir = join(cwd, skillsDir, `clip-${tool.name}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), distractorSkill(tool));
  }
  claudeArgs.push('--setting-sources', 'project', '--strict-mcp-config', '--tools', tools.join(','), '--allowedTools', [...tools, 'mcp__brindle', 'mcp__backoffice'].join(','), '--no-session-persistence', '--output-format', 'stream-json', '--verbose');
  return { root, cwd, statePath, env, claudeArgs };
}

export const cleanup = (workspace: Workspace) => rmSync(workspace.root, { recursive: true, force: true });

type Usage = { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number };
type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; is_error?: boolean; content?: unknown };
type Event = { type: string; subtype?: string; message?: { id: string; usage: Usage; content: Block[] | string }; result?: string; is_error?: boolean; num_turns?: number; total_cost_usd?: number; duration_ms?: number; usage?: Usage };

export type Metrics = {
  completed: boolean; result: string; turns: number; costUsd: number; durationMs: number;
  toolCalls: number; toolErrors: number; discoveryCalls: number; stateTampering: boolean; calls: string[];
  firstTurnInput: number; peakInput: number; cumulativeInput: number; outputTokens: number;
  toolResultChars: number; toolResultTokens: number;
};

const inputTokens = (usage: Usage) => usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
/** Transcripts carry no per-result token count, so tool output is sized by text and converted at the usual ratio. */
const charsPerToken = 4;

function resultText(block: Block): string {
  if (typeof block.content === 'string') return block.content;
  if (!Array.isArray(block.content)) return '';
  return block.content.map(part => (typeof part === 'string' ? part : String((part as { text?: unknown }).text ?? ''))).join('');
}

/** Any file a CLIP skill ships for the agent to read, including per-group reference files. */
const skillReference = /SKILL\.md|schema\.json|clip-[\w.-]+\/commands\//;

function isDiscovery(block: Block): boolean {
  const input = JSON.stringify(block.input ?? {});
  if (block.name === 'Skill' || block.name === 'ToolSearch') return true;
  if (block.name === 'Read') return skillReference.test(input);
  return block.name === 'Bash' && (/(--help|\s-h\b|\bhelp\b|\bman\s)/.test(input) || skillReference.test(input));
}

export function parseTranscript(transcript: string): Metrics {
  const events = transcript.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as Event]; } catch { return []; } });
  const perMessage = new Map<string, number>();
  const calls: Block[] = [];
  let toolErrors = 0;
  let toolResultChars = 0;
  for (const event of events) {
    const content = Array.isArray(event.message?.content) ? event.message.content : [];
    if (event.type === 'assistant') {
      perMessage.set(event.message!.id, inputTokens(event.message!.usage));
      calls.push(...content.filter(block => block.type === 'tool_use'));
    }
    if (event.type === 'user') {
      const results = content.filter(block => block.type === 'tool_result');
      toolErrors += results.filter(block => block.is_error).length;
      toolResultChars += results.reduce((sum, block) => sum + resultText(block).length, 0);
    }
  }
  const final = events.find(event => event.type === 'result');
  const inputs = [...perMessage.values()];
  return {
    completed: !!final && !final.is_error, result: final?.result ?? '', turns: final?.num_turns ?? 0, costUsd: final?.total_cost_usd ?? 0, durationMs: final?.duration_ms ?? 0,
    toolCalls: calls.length, toolErrors, discoveryCalls: calls.filter(isDiscovery).length,
    stateTampering: calls.some(block => /BRINDLE_STATE|state\.json/.test(JSON.stringify(block.input))),
    calls: calls.map(block => `${block.name} ${JSON.stringify(block.input)}`.slice(0, 240)),
    firstTurnInput: inputs[0] ?? 0, peakInput: Math.max(0, ...inputs), cumulativeInput: final?.usage ? inputTokens(final.usage) : 0, outputTokens: final?.usage?.output_tokens ?? 0,
    toolResultChars, toolResultTokens: Math.round(toolResultChars / charsPerToken),
  };
}

/**
 * The harness prompt moves between patch releases: 2.1.276 to 2.1.278 halved it and flipped a headline
 * result, so every row records the version that produced it and a rerun can demand a specific one.
 */
export function parseClaudeVersion(raw: string): string {
  const match = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?\b/.exec(raw);
  if (!match) throw new Error(`No version in \`claude --version\` output: ${JSON.stringify(raw.trim().slice(0, 200))}`);
  return match[0];
}

export function assertClaudeVersion(required: string, actual: string): void {
  if (required !== actual) throw new Error(`Required Claude Code ${required} but \`claude --version\` reports ${actual}. Results from different versions are not comparable.`);
}

let cachedVersion: string | undefined;

export function claudeVersion(): string {
  if (cachedVersion) return cachedVersion;
  let raw: string;
  try {
    raw = execFileSync('claude', ['--version'], { encoding: 'utf8' });
  } catch (error) {
    throw new Error(`Could not run \`claude --version\`: ${(error as Error).message}`);
  }
  cachedVersion = parseClaudeVersion(raw);
  return cachedVersion;
}

export function runClaude(workspace: Workspace, prompt: string, model: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('claude', ['-p', prompt, '--model', model, ...workspace.claudeArgs], { cwd: workspace.cwd, env: workspace.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), runTimeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', () => {
      clearTimeout(timer);
      if (!stdout.trim()) reject(new Error(`claude produced no output: ${stderr.slice(0, 400)}`));
      else resolvePromise(stdout);
    });
  });
}

export async function pool<T, R>(items: T[], size: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!, index);
    }
  }));
  return results;
}
