import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema } from './schema.ts';

const command = { name: 'load cancel', description: 'Cancel a load.' };

test('gotchas are optional lists of nonempty strings on the tool and on commands', () => {
  assert.doesNotThrow(() => validateSchema({ name: 'kiln', gotchas: ['Cones are strings.'], commands: [{ ...command, gotchas: ['The load id is positional; there is no --id flag.'] }] }));
  for (const gotchas of ['The id is positional.', [''], [3], {}]) {
    assert.throws(() => validateSchema({ name: 'kiln', commands: [{ ...command, gotchas }] }), /Gotchas must be a list of nonempty strings/);
    assert.throws(() => validateSchema({ name: 'kiln', gotchas, commands: [command] }), /Gotchas must be a list of nonempty strings/);
  }
});
