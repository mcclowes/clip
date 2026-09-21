import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { invokedTool, isolatedGit, registryFixtures } from './registry.ts';

function scratch(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'clip-registry-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const installed = (tool: string) => { try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } };
const sh = (cwd: string, command: string) => execFileSync('sh', ['-c', command], { cwd, encoding: 'utf8', env: { ...process.env, ...isolatedGit } }).trim();

/** Each task solved with the real tool the way the schema suggests, so an expectation that drifts from the tool's actual output fails here, not in a paid run. */
const solutions: Record<string, string> = {
  'git-log-subject': 'git --no-pager log -n 3 --format=%s | tail -n 1',
  'git-unstaged': 'git --no-optional-locks status --porcelain=v1 | grep "^.M" | cut -c4- | paste -sd, -',
  'jq-count': "jq '[.items[] | select(.status == \"active\" and .quantity > 50)] | length' inventory.json",
  'jq-list': "jq -r '[.items[] | select(.category == \"glaze\" and .status == \"discontinued\") | .sku] | sort | join(\",\")' inventory.json",
  'rg-callers': "rg --no-config --files-with-matches --glob '!*.test.ts' --fixed-strings 'legacyAuth(' . | sort | paste -sd, -",
  'rg-literal': "rg --no-config --fixed-strings --count-matches --no-filename 'TODO(auth)' . | paste -sd+ - | bc",
};

for (const fixture of registryFixtures) {
  test(`${fixture.tool}: every task is solvable with the real tool and rejects a wrong answer`, t => {
    if (!installed(fixture.tool)) return t.skip(`${fixture.tool} is not installed`);
    const cwd = scratch(t);
    fixture.setup(cwd);
    for (const task of fixture.tasks) {
      const answer = sh(cwd, solutions[task.id]!);
      assert.ok(task.verify(answer), `${task.id}: ${JSON.stringify(answer)} should pass`);
      assert.ok(!task.verify(''), `${task.id}: an empty answer should fail`);
      assert.ok(!task.verify('0'), `${task.id}: "0" should fail`);
    }
  });

  test(`${fixture.tool}: the snapshot is stable across reads and catches a change`, t => {
    if (!installed(fixture.tool) || !installed('git')) return t.skip('tool not installed');
    const cwd = scratch(t);
    fixture.setup(cwd);
    const before = fixture.snapshot(cwd);
    for (const task of fixture.tasks) sh(cwd, solutions[task.id]!);
    assert.equal(fixture.snapshot(cwd), before);
    appendFileSync(join(cwd, fixture.touch), '\nchanged\n');
    assert.notEqual(fixture.snapshot(cwd), before);
  });
}

test('git: staging a file counts as a change even though no file content moved', t => {
  const git = registryFixtures.find(fixture => fixture.tool === 'git')!;
  const cwd = scratch(t);
  git.setup(cwd);
  const before = git.snapshot(cwd);
  sh(cwd, 'git add -A');
  assert.notEqual(git.snapshot(cwd), before);
});

test('a run only counts as using the tool when a shell call invokes it', () => {
  assert.ok(invokedTool(['Bash {"command":"git --no-pager log -n 3"}'], 'git'));
  assert.ok(invokedTool(['Bash {"command":"cd /w && rg --files"}'], 'rg'));
  assert.ok(invokedTool(['Bash {"command":"cat a.json | jq .items"}'], 'jq'));
  // The skill names the resolved executable, so agents that follow it call the absolute path.
  assert.ok(invokedTool(['Bash {"command":"cd /w && /opt/homebrew/bin/rg --no-config -F x | wc -l"}'], 'rg'));
  assert.ok(!invokedTool(['Bash {"command":"cat /opt/homebrew/bin/rgx"}'], 'rg'));
  assert.ok(!invokedTool(['Read {"file_path":"/w/.claude/skills/clip-git/SKILL.md"}'], 'git'));
  assert.ok(!invokedTool(['Bash {"command":"grep -r legacyAuth src"}'], 'rg'));
  assert.ok(!invokedTool(['Bash {"command":"cat .gitignore"}'], 'git'));
});
