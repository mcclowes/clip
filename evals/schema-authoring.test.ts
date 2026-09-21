import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipSchema } from './fixture/spec.ts';
import { assessSchema } from './schema-authoring.ts';

test('schema assessment counts missing and wrong mutation markers against the hand-written schema', () => {
  const truth = clipSchema();
  const draft = structuredClone(truth);
  const queue = draft.commands.find(command => command.name === 'load queue')!;
  queue.mutating = false;
  delete (draft.commands.find(command => command.name === 'load list')! as { mutating?: boolean }).mutating;
  const result = assessSchema(draft, truth);
  assert.equal(result.valid, true);
  assert.equal(result.mutation.total, truth.commands.length);
  assert.equal(result.mutation.missing, 1);
  assert.equal(result.mutation.wrong, 1);
  assert.equal(result.mutation.correct, truth.commands.length - 2);
});

test('schema assessment returns a structural failure without trying to lint it', () => {
  const result = assessSchema({ name: 'brindle', commands: [] }, clipSchema());
  assert.equal(result.valid, false);
  assert.match(result.validationError!, /nonempty commands/);
  assert.equal(result.lint.errors, 1);
});
