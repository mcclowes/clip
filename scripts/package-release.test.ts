import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'clip-packaging-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const temporary = join(root, 'temporary');
  mkdirSync(join(temporary, 'clip-release-unrelated'), { recursive: true });
  writeFileSync(join(temporary, 'clip-release-unrelated', 'keep.txt'), 'preserve');
  mkdirSync(join(root, 'scripts'));
  cpSync(new URL('./package-release.mjs', import.meta.url), join(root, 'scripts', 'package-release.mjs'));
  mkdirSync(join(root, 'packages', 'cli', 'dist'), { recursive: true });
  writeFileSync(join(root, 'packages', 'cli', 'package.json'), JSON.stringify({ version: '1.2.3', type: 'module' }));
  writeFileSync(join(root, 'packages', 'cli', 'dist', 'main.js'), 'console.log("fixture CLI");\n');
  writeFileSync(join(root, 'README.md'), 'Fixture readme\n');
  writeFileSync(join(root, 'LICENSE'), 'Fixture license\n');
  const run = (environment: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, ['scripts/package-release.mjs'], {
    cwd: root,
    env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary, ...environment },
    encoding: 'utf8',
    timeout: 10000,
  });
  const assertClean = () => {
    assert.deepEqual(readdirSync(temporary), ['clip-release-unrelated']);
    assert.equal(readFileSync(join(temporary, 'clip-release-unrelated', 'keep.txt'), 'utf8'), 'preserve');
  };
  return { root, run, assertClean };
}

test('release packaging preserves archive contents and checksum while removing its staging directory', t => {
  const { root, run, assertClean } = fixture(t);
  const result = run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const archive = join(root, 'dist', 'clip-1.2.3.tar.gz');
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), `${digest}  clip-1.2.3.tar.gz\n`);
  assert.equal(result.stdout, `${archive}\n${digest}\n`);
  const extracted = join(root, 'extracted');
  mkdirSync(extracted);
  execFileSync('tar', ['-xzf', archive, '-C', extracted]);
  const contents = join(extracted, 'clip-1.2.3');
  assert.deepEqual(readdirSync(contents).sort(), ['LICENSE', 'README.md', 'dist', 'package.json']);
  assert.equal(readFileSync(join(contents, 'dist', 'main.js'), 'utf8'), 'console.log("fixture CLI");\n');
  assert.equal(readFileSync(join(contents, 'README.md'), 'utf8'), 'Fixture readme\n');
  assert.equal(readFileSync(join(contents, 'LICENSE'), 'utf8'), 'Fixture license\n');
  assert.equal(JSON.parse(readFileSync(join(contents, 'package.json'), 'utf8')).version, '1.2.3');
  assertClean();
});

test('release packaging reports missing build input and cleans up its staging directory', t => {
  const { root, run, assertClean } = fixture(t);
  rmSync(join(root, 'packages', 'cli', 'dist'), { recursive: true });
  const result = run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(join(root, 'dist', 'clip-1.2.3.tar.gz.sha256')), false);
  assertClean();
});

test('release packaging reports tar failures and cleans up its staging directory', t => {
  const { root, run, assertClean } = fixture(t);
  const emptyPath = join(root, 'empty-bin');
  mkdirSync(emptyPath);
  const result = run({ PATH: emptyPath });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spawnSync tar ENOENT/);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(join(root, 'dist', 'clip-1.2.3.tar.gz.sha256')), false);
  assertClean();
});
