import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';

const version = '0.4.0';
const helper = new URL('./release-notes.mjs', import.meta.url);

function fixture(t: TestContext, changelog: string) {
  const dir = mkdtempSync(join(tmpdir(), 'clip-release-notes-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(helper, join(dir, 'scripts/release-notes.mjs'));
  writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  const run = () => spawnSync(process.execPath, ['scripts/release-notes.mjs', version], { cwd: dir, encoding: 'utf8' });
  return { dir, run };
}

const emptySections = [
  `## [${version}]\n\n## [0.3.0]\nPrevious notes\n`,
  `## [${version}]\n \t\r\n\n## [0.3.0]\nPrevious notes\n`,
  `## [${version}]\n`,
  `## [${version}]\n \t\r\n`,
];

test('release notes reject empty and whitespace-only sections', t => {
  for (const changelog of emptySections) {
    const result = fixture(t, changelog).run();
    assert.equal(result.status, 1, changelog);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /CHANGELOG\.md.*no release notes.*0\.4\.0/);
  }
});

test('release notes reject a final heading without a newline', t => {
  const result = fixture(t, `## [${version}]`).run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /no release notes/);
});

const notes = '### Fixed\n\n- Preserve nested headings.\n\n#### Details\n\nKeep this paragraph.';
test('release notes extract the exact version and preserve nested Markdown', t => {
  const { run } = fixture(t, `# Changelog\n\n## [0.4.00]\nWrong patch\n\n## [0.4.0-beta]\nPrerelease\n\n## [${version}] - 2026-09-22\n\n${notes}\n\n## [0.3.0]\nPrevious notes\n`);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `${notes}\n`);
});

test('release notes reject missing versions rather than selecting a similar one', t => {
  const result = fixture(t, '## [0.4.00]\nWrong patch\n\n## [0.4.0-beta]\nPrerelease\n').run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `CHANGELOG.md has no section for ${version}\n`);
});

test('the actual publication step stops before gh on invalid notes and passes valid notes unchanged', t => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const step = workflow.split('      - name: Publish GitHub release\n')[1];
  const block = step?.match(/ {8}run: \|\n((?: {10}[^\n]*\n)+)/)?.[1];
  assert.ok(block, 'Expected the GitHub release publication shell step');
  const script = block.replace(/^ {10}/gm, '');
  const cases = [...emptySections, `## [${version}]`, '## [0.3.0]\nPrevious notes\n', `## [${version}]\n\n${notes}\n`];
  for (const [index, changelog] of cases.entries()) {
    const { dir } = fixture(t, changelog);
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/clip-0.4.0.tar.gz'), 'fixture archive');
    writeFileSync(join(dir, 'dist/clip-0.4.0.sha256'), 'fixture checksum');
    const called = join(dir, 'publisher.json');
    writeFileSync(join(bin, 'gh'), `#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2); fs.writeFileSync(${JSON.stringify(called)}, JSON.stringify({ args, notes: fs.readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8') }));\n`, { mode: 0o755 });
    const stepFile = join(dir, 'publish.sh');
    writeFileSync(stepFile, script);
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', stepFile], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, GITHUB_REF_NAME: `v${version}`, GH_TOKEN: 'fixture-only' },
    });
    if (index < cases.length - 1) {
      assert.equal(result.status, 1, `${changelog}\n${result.stderr}`);
      assert.equal(existsSync(called), false);
      assert.equal(readFileSync(join(dir, 'release-notes.md'), 'utf8'), '');
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(called, 'utf8')), {
        args: ['release', 'create', `v${version}`, 'dist/clip-0.4.0.tar.gz', 'dist/clip-0.4.0.sha256', '--verify-tag', '--notes-file', 'release-notes.md'],
        notes: `${notes}\n`,
      });
    }
  }
});

const fencedBodies = [
  ['backticks', '- Example:\n\n```markdown\n## [9.9.9]\n- Example content.\n```\n\n### Details\n\n- Still this release.'],
  ['tildes and CRLF', '- Example:\r\n\r\n~~~markdown\r\n## [9.9.9]\r\n- Example content.\r\n~~~\r\n\r\n- Still this release.'],
  ['shorter embedded fences', '- Example:\n\n````markdown\n```\n## [9.9.9]\n- Example content.\n`````\n\n- Still this release.'],
  ['mismatched embedded fences', '- Example:\n\n```markdown\n~~~\n## [9.9.9]\n- Example content.\n```\n\n- Still this release.'],
  ['embedded fence runs with trailing text', '- Example:\n\n```markdown\n```not-a-close\n## [9.9.9]\n- Example content.\n```\n\n- Still this release.'],
  ['over-indented embedded fences', '- Example:\n\n```markdown\n    ```\n## [9.9.9]\n- Example content.\n```\n\n- Still this release.'],
  ['indented fences and closing whitespace', '- Example:\n\n   ~~~~markdown\n## [9.9.9]\n- Example content.\n ~~~~~ \t\n\n- Still this release.'],
  ['an unclosed fence', '- Example:\n\n```markdown\n## [9.9.9]\n- This is still code at the end of the document.'],
] as const;

for (const [name, body] of fencedBodies) {
  test(`release notes preserve ${name} without treating code headings as sections`, t => {
    const newline = name === 'tildes and CRLF' ? '\r\n' : '\n';
    const nextRelease = name === 'an unclosed fence' ? '' : `${newline}${newline}## [0.3.0]${newline}- Older release.${newline}`;
    const result = fixture(t, `# Changelog${newline}${newline}## [${version}]${newline}${newline}${body}${nextRelease}`).run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${body}\n`);
    assert.equal(result.stderr, '');
  });
}

for (const fence of ['```', '~~~']) {
  test(`release selection ignores a matching heading inside a ${fence} preamble`, t => {
    const result = fixture(t, `# Changelog\n\n${fence}markdown\n## [${version}]\n- Example only.\n${fence}\n\n## [${version}]\n\n- Actual release.\n\n## [0.3.0]\n- Older release.\n`).run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '- Actual release.\n');
  });
}

test('a matching heading only inside a fence retains the missing-section failure', t => {
  const result = fixture(t, `~~~markdown\n## [${version}]\n- Example only.\n~~~\n`).run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `CHANGELOG.md has no section for ${version}\n`);
});

for (const opener of ['```invalid`info', '    ```']) {
  test(`a non-fence opening (${JSON.stringify(opener)}) does not hide the release heading`, t => {
    const result = fixture(t, `${opener}\n\n## [${version}]\n- Actual release.\n\n## [0.3.0]\n- Older release.\n`).run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '- Actual release.\n');
  });
}

test('the actual publication step passes complete fenced notes to gh', t => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const step = workflow.split('      - name: Publish GitHub release\n')[1];
  const block = step?.match(/ {8}run: \|\n((?: {10}[^\n]*\n)+)/)?.[1];
  assert.ok(block, 'Expected the GitHub release publication shell step');
  const body = fencedBodies[0][1];
  const { dir } = fixture(t, `## [${version}]\n\n${body}\n\n## [0.3.0]\n- Older release.\n`);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist/clip-0.4.0.tar.gz'), 'fixture archive');
  writeFileSync(join(dir, 'dist/clip-0.4.0.sha256'), 'fixture checksum');
  const called = join(dir, 'publisher.json');
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2); fs.writeFileSync(${JSON.stringify(called)}, JSON.stringify({ args, notes: fs.readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8') }));\n`, { mode: 0o755 });
  const stepFile = join(dir, 'publish.sh');
  writeFileSync(stepFile, block.replace(/^ {10}/gm, ''));
  const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', stepFile], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, GITHUB_REF_NAME: `v${version}`, GH_TOKEN: 'fixture-only' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(called, 'utf8')), {
    args: ['release', 'create', `v${version}`, 'dist/clip-0.4.0.tar.gz', 'dist/clip-0.4.0.sha256', '--verify-tag', '--notes-file', 'release-notes.md'],
    notes: `${body}\n`,
  });
});
