import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

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
    if (existsSync(join(root, 'dist'))) {
      assert.deepEqual(readdirSync(join(root, 'dist')).filter(name => name.startsWith('.clip-release-output-')), []);
    }
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

test('partial tar failure preserves a previous archive and checksum', t => {
  const { root, run, assertClean } = fixture(t);
  const archive = join(root, 'dist', 'clip-1.2.3.tar.gz');
  mkdirSync(join(root, 'dist'));
  writeFileSync(archive, 'previous archive');
  writeFileSync(`${archive}.sha256`, 'previous checksum');
  const tools = join(root, 'tools');
  mkdirSync(tools);
  writeFileSync(join(tools, 'tar'), '#!/bin/sh\nprintf partial > "$2"\nexit 37\n', { mode: 0o755 });
  const result = run({ PATH: tools });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(readFileSync(archive, 'utf8'), 'previous archive');
  assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), 'previous checksum');
  assertClean();
});

test('missing input preserves previous release artifacts', t => {
  const { root, run, assertClean } = fixture(t);
  const archive = join(root, 'dist', 'clip-1.2.3.tar.gz');
  mkdirSync(join(root, 'dist'));
  writeFileSync(archive, 'previous archive');
  writeFileSync(`${archive}.sha256`, 'previous checksum');
  rmSync(join(root, 'packages', 'cli', 'dist'), { recursive: true });
  const result = run();
  assert.equal(result.status, 1);
  assert.equal(readFileSync(archive, 'utf8'), 'previous archive');
  assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), 'previous checksum');
  assertClean();
});

test('checksum creation failure preserves previous archive and checksum', t => {
  const { root, run, assertClean } = fixture(t);
  const archive = join(root, 'dist', 'clip-1.2.3.tar.gz');
  mkdirSync(join(root, 'dist'));
  writeFileSync(archive, 'previous archive');
  writeFileSync(`${archive}.sha256`, 'previous checksum');
  const observer = join(root, 'deny-checksum.mjs');
  writeFileSync(observer, `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const write = fs.writeFileSync;
    fs.writeFileSync = function(file, ...args) {
      if (String(file).includes('.clip-release-output-') && String(file).endsWith('.tar.gz.sha256')) {
        throw Object.assign(new Error('fixture checksum failure'), { code: 'EACCES' });
      }
      return Reflect.apply(write, this, [file, ...args]);
    };
    syncBuiltinESMExports();
  `);
  const result = run({ NODE_OPTIONS: `--import=${pathToFileURL(observer).href}` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture checksum failure/);
  assert.equal(readFileSync(archive, 'utf8'), 'previous archive');
  assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), 'previous checksum');
  assertClean();
});

test('repeated packaging replaces previous artifacts with a valid fresh archive', t => {
  const { root, run, assertClean } = fixture(t);
  assert.equal(run().status, 0);
  const archive = join(root, 'dist', 'clip-1.2.3.tar.gz');
  const previous = readFileSync(archive);
  writeFileSync(join(root, 'packages', 'cli', 'dist', 'main.js'), 'console.log("updated fixture CLI");\n');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.notDeepEqual(readFileSync(archive), previous);
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), `${digest}  clip-1.2.3.tar.gz\n`);
  const content = execFileSync('tar', ['-xOf', archive, 'clip-1.2.3/dist/main.js'], { encoding: 'utf8' });
  assert.equal(content, 'console.log("updated fixture CLI");\n');
  assertClean();
});

function denyPromotion(root: string, phase: 'archive' | 'checksum', denyRollback = false) {
  const observer = join(root, 'deny-promotion.mjs');
  writeFileSync(observer, `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const rename = fs.renameSync;
    fs.renameSync = function(source, destination) {
      const path = String(source);
      if (path.includes('.clip-release-output-') && path.endsWith(${JSON.stringify(phase === 'archive' ? '/clip-1.2.3.tar.gz' : '.tar.gz.sha256')})) {
        throw Object.assign(new Error('fixture ${phase} promotion failure'), { code: 'EACCES' });
      }
      if (${denyRollback} && path.endsWith('/previous-archive.tar.gz')) {
        throw Object.assign(new Error('fixture rollback failure'), { code: 'EACCES' });
      }
      return Reflect.apply(rename, this, [source, destination]);
    };
    syncBuiltinESMExports();
  `);
  return { NODE_OPTIONS: `--import=${pathToFileURL(observer).href}` };
}

for (const phase of ['archive', 'checksum'] as const) {
  for (const previous of [false, true]) {
    test(`${phase} promotion failure preserves ${previous ? 'previous artifacts' : 'absent outputs'}`, t => {
      const { root, run, assertClean } = fixture(t);
      const archive = join(root, 'dist', 'clip-1.2.3.tar.gz');
      if (previous) {
        mkdirSync(join(root, 'dist'));
        writeFileSync(archive, 'previous archive');
        writeFileSync(`${archive}.sha256`, 'previous checksum');
        chmodSync(archive, 0o640);
      }
      const result = run(denyPromotion(root, phase));
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`fixture ${phase} promotion failure`));
      assert.equal(result.stdout, '');
      assert.equal(existsSync(archive), previous);
      assert.equal(existsSync(`${archive}.sha256`), previous);
      if (previous) {
        assert.equal(readFileSync(archive, 'utf8'), 'previous archive');
        assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), 'previous checksum');
        assert.equal(statSync(archive).mode & 0o777, 0o640);
      }
      assertClean();
    });
  }
}

test('a checksum directory collision preserves the prior archive and conflicting directory', t => {
  const { root, run, assertClean } = fixture(t);
  const archive = join(root, 'dist', 'clip-1.2.3.tar.gz');
  mkdirSync(`${archive}.sha256`, { recursive: true });
  writeFileSync(archive, 'previous archive');
  writeFileSync(join(`${archive}.sha256`, 'keep.txt'), 'preserve collision');
  const result = run();
  assert.equal(result.status, 1);
  assert.equal(readFileSync(archive, 'utf8'), 'previous archive');
  assert.equal(readFileSync(join(`${archive}.sha256`, 'keep.txt'), 'utf8'), 'preserve collision');
  assertClean();
});

test('rollback failure retains the prior archive and reports its recovery directory', t => {
  const { root, run } = fixture(t);
  const release = join(root, 'dist');
  const archive = join(release, 'clip-1.2.3.tar.gz');
  mkdirSync(release);
  writeFileSync(archive, 'previous archive');
  writeFileSync(`${archive}.sha256`, 'previous checksum');
  const result = run(denyPromotion(root, 'checksum', true));
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture checksum promotion failure/);
  assert.match(result.stderr, /fixture rollback failure/);
  const recovery = readdirSync(release).filter(name => name.startsWith('.clip-release-output-'));
  assert.equal(recovery.length, 1);
  const recoveryDirectory = join(release, recovery[0]);
  assert.ok(result.stderr.includes(recoveryDirectory));
  assert.equal(readFileSync(join(recoveryDirectory, 'previous-archive.tar.gz'), 'utf8'), 'previous archive');
  assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), 'previous checksum');
  assert.deepEqual(readdirSync(join(root, 'temporary')), ['clip-release-unrelated']);
  assert.equal(readFileSync(join(root, 'temporary', 'clip-release-unrelated', 'keep.txt'), 'utf8'), 'preserve');
});
