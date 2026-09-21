import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProfile, validateSchema } from './schema.ts';

const command = { name: 'load cancel', description: 'Cancel a load.' };

test('gotchas are optional lists of nonempty strings on the tool and on commands', () => {
  assert.doesNotThrow(() => validateSchema({ name: 'kiln', gotchas: ['Cones are strings.'], commands: [{ ...command, gotchas: ['The load id is positional; there is no --id flag.'] }] }));
  for (const gotchas of ['The id is positional.', [''], [3], {}]) {
    assert.throws(() => validateSchema({ name: 'kiln', commands: [{ ...command, gotchas }] }), /Gotchas must be a list of nonempty strings/);
    assert.throws(() => validateSchema({ name: 'kiln', gotchas, commands: [command] }), /Gotchas must be a list of nonempty strings/);
  }
});

const tree = { name: 'kubectl', commands: [
  { name: 'get', description: 'Get', mutating: false },
  { name: 'delete', description: 'Delete', mutating: true },
  { name: 'config', description: 'Config', subcommands: [
    { name: 'view', description: 'View', mutating: false },
    { name: 'set', description: 'Set', mutating: true },
  ] },
  { name: 'rollout', description: 'Rollouts', subcommands: [{ name: 'status', description: 'Status', mutating: false }, { name: 'undo', description: 'Undo', mutating: true }] },
] };

test('a profile keeps listed commands, a listed parent with its subtree, and a listed child with its ancestors', () => {
  const schema = validateSchema({ ...tree, profiles: { 'read-only': ['get', 'config view', 'rollout'] } });
  const profiled = applyProfile(schema, 'read-only');
  assert.deepEqual(profiled.commands!.map(item => item.name), ['get', 'config', 'rollout']);
  assert.deepEqual(profiled.commands![1]!.subcommands!.map(item => item.name), ['view']);
  assert.deepEqual(profiled.commands![2]!.subcommands!.map(item => item.name), ['status', 'undo']);
  assert.equal(profiled.profiles, undefined);
  assert.equal(schema.commands!.length, 4);
});

test('applying no profile returns the schema unchanged', () => {
  const schema = validateSchema(tree);
  assert.equal(applyProfile(schema, undefined), schema);
});

test('an unknown profile names the ones that exist', () => {
  const schema = validateSchema({ ...tree, profiles: { 'read-only': ['get'], deploy: ['rollout'] } });
  assert.throws(() => applyProfile(schema, 'admin'), /Unknown profile admin for kubectl\. Available: read-only, deploy\./);
  assert.throws(() => applyProfile(validateSchema(tree), 'read-only'), /Unknown profile read-only for kubectl\. Available: none\./);
});

test('profiles must be named lists of command paths that exist in the schema', () => {
  assert.throws(() => validateSchema({ ...tree, profiles: ['get'] }), /Profiles must be an object/);
  assert.throws(() => validateSchema({ ...tree, profiles: { 'read only': ['get'] } }), /Profile names/);
  assert.throws(() => validateSchema({ ...tree, profiles: { empty: [] } }), /Profile empty must list at least one command/);
  assert.throws(() => validateSchema({ ...tree, profiles: { bad: [3] } }), /Profile bad must list at least one command/);
  assert.throws(() => validateSchema({ ...tree, profiles: { bad: ['config edit'] } }), /Profile bad names an unknown command: config edit/);
});
