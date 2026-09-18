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
import { clipSchema, paddedCommands, toolDescription } from './fixture/spec.ts';
import { seed, writeState } from './fixture/state.ts';

export const conditions = ['cli-bare', 'cli-hint', 'cli-clip', 'mcp-eager', 'mcp-deferred'] as const;
export type Condition = (typeof conditions)[number] | 'baseline';

const here = dirname(fileURLToPath(import.meta.url));
const clipMain = resolve(here, '../packages/cli/src/main.ts');
const builtinTools = ['Bash', 'Read', 'Skill'];
const runTimeoutMs = 6 * 60_000;
/** Stands in for the one line a project would otherwise put in CLAUDE.md. */
const cliHint = 'The brindle CLI is installed and on PATH.';
const cliConditions: Condition[] = ['cli-bare', 'cli-hint', 'cli-clip'];

export type Workspace = { root: string; cwd: string; statePath: string; env: NodeJS.ProcessEnv; claudeArgs: string[] };

export function prepare(condition: Condition, extraCommands = 0): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'clip-eval-'));
  const cwd = join(root, 'work');
  const bin = join(root, 'bin');
  const statePath = join(root, 'state.json');
  mkdirSync(cwd);
  mkdirSync(bin);
  writeState(seed(), statePath);
  const fixtureEnv = { BRINDLE_STATE: statePath, BRINDLE_EXTRA_COMMANDS: String(extraCommands) };
  const env: NodeJS.ProcessEnv = { ...process.env, ...fixtureEnv, CLIP_HOME: join(root, 'clip-home'), ENABLE_TOOL_SEARCH: condition === 'mcp-deferred' ? 'true' : 'false' };
  const tools = [...builtinTools];
  const claudeArgs: string[] = [];

  if (cliConditions.includes(condition)) {
    const shim = join(bin, 'brindle');
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${join(here, 'fixture/cli.ts')}" "$@"\n`);
    chmodSync(shim, 0o755);
    env.PATH = `${bin}:${process.env.PATH}`;
  }
  if (condition === 'cli-hint') claudeArgs.push('--append-system-prompt', cliHint);
  if (condition === 'cli-clip') {
    const schemaPath = join(root, 'brindle.schema.json');
    writeFileSync(schemaPath, JSON.stringify(clipSchema(paddedCommands(extraCommands)), null, 2));
    const clip = (...args: string[]) => execFileSync(process.execPath, [clipMain, ...args], { cwd, env, stdio: 'pipe' });
    clip('register', 'brindle', '--purpose', toolDescription, '--schema', schemaPath);
    clip('sync', '--skills-dir', '.claude/skills');
  }
  if (condition === 'mcp-eager' || condition === 'mcp-deferred') {
    const config = join(root, 'mcp.json');
    writeFileSync(config, JSON.stringify({ mcpServers: { brindle: { command: process.execPath, args: [join(here, 'fixture/mcp.ts')], env: fixtureEnv } } }));
    claudeArgs.push('--mcp-config', config);
    if (condition === 'mcp-deferred') tools.push('ToolSearch');
  }
  claudeArgs.push('--setting-sources', 'project', '--strict-mcp-config', '--tools', tools.join(','), '--allowedTools', [...tools, 'mcp__brindle'].join(','), '--no-session-persistence', '--output-format', 'stream-json', '--verbose');
  return { root, cwd, statePath, env, claudeArgs };
}

export const cleanup = (workspace: Workspace) => rmSync(workspace.root, { recursive: true, force: true });

type Usage = { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number };
type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; is_error?: boolean };
type Event = { type: string; subtype?: string; message?: { id: string; usage: Usage; content: Block[] | string }; result?: string; is_error?: boolean; num_turns?: number; total_cost_usd?: number; duration_ms?: number; usage?: Usage };

export type Metrics = {
  completed: boolean; result: string; turns: number; costUsd: number; durationMs: number;
  toolCalls: number; toolErrors: number; discoveryCalls: number; stateTampering: boolean; calls: string[];
  firstTurnInput: number; peakInput: number; cumulativeInput: number; outputTokens: number;
};

const inputTokens = (usage: Usage) => usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;

function isDiscovery(block: Block): boolean {
  const input = JSON.stringify(block.input ?? {});
  if (block.name === 'Skill' || block.name === 'ToolSearch') return true;
  if (block.name === 'Read') return /SKILL\.md|schema\.json/.test(input);
  return block.name === 'Bash' && /(--help|\s-h\b|\bhelp\b|\bman\s|SKILL\.md|schema\.json)/.test(input);
}

export function parseTranscript(transcript: string): Metrics {
  const events = transcript.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as Event]; } catch { return []; } });
  const perMessage = new Map<string, number>();
  const calls: Block[] = [];
  let toolErrors = 0;
  for (const event of events) {
    const content = Array.isArray(event.message?.content) ? event.message.content : [];
    if (event.type === 'assistant') {
      perMessage.set(event.message!.id, inputTokens(event.message!.usage));
      calls.push(...content.filter(block => block.type === 'tool_use'));
    }
    if (event.type === 'user') toolErrors += content.filter(block => block.type === 'tool_result' && block.is_error).length;
  }
  const final = events.find(event => event.type === 'result');
  const inputs = [...perMessage.values()];
  return {
    completed: !!final && !final.is_error, result: final?.result ?? '', turns: final?.num_turns ?? 0, costUsd: final?.total_cost_usd ?? 0, durationMs: final?.duration_ms ?? 0,
    toolCalls: calls.length, toolErrors, discoveryCalls: calls.filter(isDiscovery).length,
    stateTampering: calls.some(block => /BRINDLE_STATE|state\.json/.test(JSON.stringify(block.input))),
    calls: calls.map(block => `${block.name} ${JSON.stringify(block.input)}`.slice(0, 240)),
    firstTurnInput: inputs[0] ?? 0, peakInput: Math.max(0, ...inputs), cumulativeInput: final?.usage ? inputTokens(final.usage) : 0, outputTokens: final?.usage?.output_tokens ?? 0,
  };
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
