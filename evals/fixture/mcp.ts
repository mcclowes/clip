/**
 * ---
 * purpose: Dependency-free stdio MCP server exposing the same brindle commands as the CLI.
 * ---
 */
import { createInterface } from 'node:readline';
import { mcpToolName, mcpTools, paddedCommands, toolDescription, UsageError, type Values } from './spec.ts';
import { execute, extraCommands } from './state.ts';

const list = paddedCommands(extraCommands());
type Request = { id?: number | string; method: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } };

const text = (value: string, isError = false) => ({ content: [{ type: 'text', text: value }], isError });

function callTool(name: unknown, input: Record<string, unknown> = {}) {
  const command = list.find(item => mcpToolName(item) === name);
  if (!command) return text(JSON.stringify({ error: `Unknown tool: ${name}` }), true);
  const values: Values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key.replaceAll('_', '-'), value as Values[string]]));
  try {
    return text(JSON.stringify(execute(command, values), null, 2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    return text(JSON.stringify({ error: error.message }), true);
  }
}

function handle(request: Request): unknown {
  switch (request.method) {
    case 'initialize': return { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'brindle', version: '1.0.0' }, instructions: toolDescription };
    case 'tools/list': return { tools: mcpTools(list) };
    case 'tools/call': return callTool(request.params?.name, request.params?.arguments);
    case 'ping': return {};
    default: throw new Error(`Method not found: ${request.method}`);
  }
}

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return;
  const request = JSON.parse(line) as Request;
  if (request.id === undefined) return;
  let reply: object;
  try {
    reply = { result: handle(request) };
  } catch (error) {
    reply = { error: { code: -32601, message: (error as Error).message } };
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, ...reply })}\n`);
});
