/**
 * ---
 * purpose: Stdio MCP server exposing the unrelated distractor tools, so MCP conditions face a crowded tool list too.
 * ---
 */
import { createInterface } from 'node:readline';
import { distractorMcpTools } from './distractors.ts';

type Request = { id?: number | string; method: string; params?: { name?: string; protocolVersion?: string } };
const instructions = 'Assorted studio back-office tools: invoicing, DNS, stock, logistics, and similar.';

function handle(request: Request): unknown {
  switch (request.method) {
    case 'initialize': return { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'backoffice', version: '1.0.0' }, instructions };
    case 'tools/list': return { tools: distractorMcpTools() };
    // Nothing here does anything. A call means the agent picked the wrong tool, which the run records as an error.
    case 'tools/call': return { content: [{ type: 'text', text: JSON.stringify({ error: 'This tool is not available in this environment.' }) }], isError: true };
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
