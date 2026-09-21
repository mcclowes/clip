import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brindleRules, promptCount } from './permissions.ts';

const bash = (command: string) => `Bash ${JSON.stringify({ command })}`;

test('brindle rules cover its read commands only', () => {
  const rules = brindleRules();
  assert.ok(rules.includes('Bash(brindle load list:*)'));
  assert.ok(!rules.some(rule => rule.includes('load cancel')));
});

test('a call avoids a prompt only when every segment matches a rule', () => {
  const calls = [
    'Read {"file_path":"/tmp/x/SKILL.md"}',
    bash('/tmp/clip-eval-abc/bin/brindle load list --status queued'),
    bash('brindle load list; brindle kiln list'),
    bash('brindle load list | jq .items'),
    bash('brindle load cancel LD-0001'),
    bash('cd /tmp/clip-eval-abc/bin; ./brindle load list'),
    bash('brindle load listing'),
  ];

  assert.deepEqual(promptCount(calls, brindleRules()), { bash: 6, avoided: 2 });
});

test('a truncated call counts as prompted, since its tail is unknown', () => {
  const truncated = bash(`brindle load list --status ${'x'.repeat(300)}`).slice(0, 240);
  assert.deepEqual(promptCount([truncated], brindleRules()), { bash: 1, avoided: 0 });
});
