import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderText } from './output.ts';

test('registry search text shows an agent validation status, and stays quiet when there is none', () => {
  const text = renderText({ items: [
    { id: 'git', purpose: 'Inspect history', agent_validation: 'validated' },
    { id: 'rg', purpose: 'Search files', agent_validation: 'stale' },
    { id: 'kubectl', purpose: 'Inspect clusters', agent_validation: 'unvalidated' },
  ] });
  assert.deepEqual(text.split('\n'), ['git [agent-validated]\tInspect history', 'rg [agent validation stale]\tSearch files', 'kubectl\tInspect clusters']);
});
