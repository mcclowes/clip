import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runUi } from './ui.ts';

function terminal() {
  const input = new PassThrough() as PassThrough & { isTTY: boolean; setRawMode(value: boolean): void };
  const output = new PassThrough() as PassThrough & { isTTY: boolean; columns: number; rows: number };
  input.isTTY = output.isTTY = true;
  input.setRawMode = () => {};
  output.columns = 100;
  output.rows = 30;
  let screen = '';
  output.on('data', chunk => { screen += chunk.toString(); });
  return { input, output, screen: () => screen };
}

test('user can browse the registry and quit the UI', async () => {
  const term = terminal();
  const running = runUi(term);
  term.input.write('\t');
  term.input.write('q');
  await running;
  assert.match(term.screen(), /Registry/);
  assert.match(term.screen(), /Git/);
  assert.match(term.screen(), /Quit/);
});

test('UI rejects non-interactive terminals', async () => {
  const input = new PassThrough() as PassThrough & { isTTY?: boolean };
  const output = new PassThrough() as PassThrough & { isTTY?: boolean };
  await assert.rejects(runUi({ input, output }), /interactive terminal/);
});

test('user can add a registry tool with its suggested purpose', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-ui-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'git'), '#!/bin/sh\n', { mode: 0o755 });
  const previousHome = process.env.CLIP_HOME;
  const previousPath = process.env.PATH;
  process.env.CLIP_HOME = join(dir, 'config');
  process.env.PATH = bin;
  t.after(() => {
    if (previousHome === undefined) delete process.env.CLIP_HOME; else process.env.CLIP_HOME = previousHome;
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
  });
  const { readTools } = await import('./store.ts');
  const term = terminal();
  const running = runUi(term);
  term.input.write('\t');
  term.input.write('\r');
  term.input.write('\r');
  term.input.write('q');
  await running;
  assert.equal(readTools()[0]?.name, 'git');
  assert.match(term.screen(), /Installed Git/);
});

test('user can remove a registration with confirmation', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-ui-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.CLIP_HOME;
  process.env.CLIP_HOME = dir;
  t.after(() => { if (previous === undefined) delete process.env.CLIP_HOME; else process.env.CLIP_HOME = previous; });
  const { updateTools, readTools } = await import('./store.ts');
  updateTools(() => [{ name: 'example', executable: '/bin/example', purpose: 'Example tool', source: { kind: 'manual' } }]);
  const term = terminal();
  const running = runUi(term);
  term.input.write('d');
  term.input.write('y');
  term.input.write('q');
  await running;
  assert.deepEqual(readTools(), []);
  assert.match(term.screen(), /Removed example/);
});
