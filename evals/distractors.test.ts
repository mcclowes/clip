import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { distractorMcpTools, distractors, distractorSkill } from './fixture/distractors.ts';
import { commands } from './fixture/spec.ts';
import { cleanup, prepare, skillsDir } from './harness.ts';
import { promptVariants, taskPrompt, tasks } from './tasks.ts';

test('there are around twenty distractors, and none of them is about firing pottery', () => {
  assert.ok(distractors.length >= 18 && distractors.length <= 22, `${distractors.length} distractors`);
  assert.equal(new Set(distractors.map(tool => tool.name)).size, distractors.length);
  const text = JSON.stringify(distractors).toLowerCase();
  for (const word of ['kiln', 'firing', 'fire', 'pottery', 'cone', 'glaze', 'brindle', 'atmosphere']) {
    assert.ok(!text.includes(word), `a distractor mentions "${word}", which would make selection ambiguous`);
  }
});

test('distractor MCP tools outnumber the real ones and take no arguments', () => {
  const tools = distractorMcpTools();
  assert.ok(tools.length > commands.length);
  assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length);
  for (const tool of tools) assert.deepEqual(tool.inputSchema.properties, {});
});

test('a distractor skill states its purpose in its description', () => {
  const rendered = distractorSkill(distractors[0]!);
  assert.ok(rendered.startsWith('---\nname: clip-quillet\n'));
  assert.ok(rendered.includes(distractors[0]!.purpose));
});

test('distractor skills are installed beside the real one for CLI conditions', () => {
  const workspace = prepare('cli-clip', { distractors: true });
  try {
    const installed = readdirSync(join(workspace.cwd, skillsDir));
    assert.equal(installed.length, distractors.length + 1);
    assert.ok(installed.includes('clip-brindle'));
    for (const tool of distractors) assert.ok(installed.includes(`clip-${tool.name}`));
  } finally {
    cleanup(workspace);
  }
});

test('MCP conditions get a second server for distractors, and none without', () => {
  for (const withDistractors of [true, false]) {
    const workspace = prepare('mcp-eager', { distractors: withDistractors });
    try {
      const config = JSON.parse(readFileSync(join(workspace.root, 'mcp.json'), 'utf8'));
      assert.deepEqual(Object.keys(config.mcpServers), withDistractors ? ['brindle', 'backoffice'] : ['brindle']);
    } finally {
      cleanup(workspace);
    }
  }
});

test('only the named variants mention the tool, and no task prompt names it itself', () => {
  const task = tasks[0]!;
  assert.ok(taskPrompt(task, 'named').includes("brindle tool"));
  assert.ok(taskPrompt(task, 'cli-worded').includes("brindle CLI"));
  assert.ok(!taskPrompt(task, 'unnamed').toLowerCase().includes('brindle'));
  assert.ok(taskPrompt(task, 'unnamed').includes('ANSWER:'));
  for (const item of tasks) assert.ok(!item.prompt.toLowerCase().includes('brindle'), `${item.id} names the tool in its own prompt`);
  assert.deepEqual(Object.keys(promptVariants), ['named', 'cli-worded', 'unnamed']);
});
