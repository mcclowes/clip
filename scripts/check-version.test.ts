import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function versionFixture(t: TestContext, contract: string) {
  const root = mkdtempSync(join(tmpdir(), 'clip-version-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'packages/cli/src'), { recursive: true });
  copyFileSync(new URL('./check-version.mjs', import.meta.url), join(root, 'scripts/check-version.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(root, 'packages/cli/package.json'), JSON.stringify({ type: 'module', version: '1.2.3' }));
  writeFileSync(join(root, 'packages/cli/src/contract.ts'), contract);
  return (...args: string[]) => spawnSync(process.execPath, ['scripts/check-version.mjs', ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000,
  });
}

test('version check accepts matching metadata with no tag or a matching tag', t => {
  const run = versionFixture(t, "export const contract = { version: '1.2.3' };\n");
  for (const args of [[], ['v1.2.3']]) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});

test('version check reads the exported value independently of formatting', t => {
  const run = versionFixture(t, 'export const contract = { version:\n  "1.2.3" };\n');
  const result = run('v1.2.3');
  assert.equal(result.status, 0, result.stderr);
});

test('version check rejects mismatched, unprefixed, and empty supplied tags', t => {
  const run = versionFixture(t, "export const contract = { version: '1.2.3' };\n");
  for (const tag of ['v1.2.4', '1.2.3', '']) {
    const result = run(tag);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /does not match package version 1\.2\.3/);
  }
});

test('a wrong exported version fails even with a matching tag or comment', t => {
  const run = versionFixture(t, "// Previous version: '1.2.3'\nexport const contract = { version: '1.2.2' };\n");
  for (const args of [[], ['v1.2.3']]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /CLI contract version 1\.2\.2 does not match package version 1\.2\.3/);
  }
});

test('version check reports both tag and contract mismatches', t => {
  const run = versionFixture(t, "export const contract = { version: '1.2.2' };\n");
  const result = run('v1.2.4');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tag v1\.2\.4 does not match package version 1\.2\.3/);
  assert.match(result.stderr, /CLI contract version 1\.2\.2 does not match package version 1\.2\.3/);
});
