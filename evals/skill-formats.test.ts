import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipSchema } from './fixture/spec.ts';
import { conditions, skillConditions } from './harness.ts';
import { renderSignatureSkill, signature, skillFormats, type ClipSchema } from './skill-formats.ts';

const schema = clipSchema() as ClipSchema;
const command = (name: string) => schema.commands.find(item => item.name === name)!;

test('every skill format is reachable as a condition', () => {
  assert.equal(skillConditions.length, skillFormats.length);
  assert.ok(skillConditions.includes('cli-clip'), 'the shipped renderer keeps the cli-clip name');
  for (const condition of skillConditions) assert.ok(conditions.includes(condition));
});

test('signatures show required arguments bare and optional ones bracketed', () => {
  assert.equal(signature('brindle', command('kiln list')), 'brindle kiln list');
  assert.equal(signature('brindle', command('load cancel')), 'brindle load cancel <load> --reason <reason> [--dry-run]');
  assert.equal(signature('brindle', command('load queue')), 'brindle load queue --kiln <kiln> --cone 06|04|6|10 --atmosphere oxidation|reduction|neutral --pieces <n>');
});

test('the signature skill names every command and points at its own schema copy', () => {
  const rendered = renderSignatureSkill(schema, 'test the thing', '/bin/brindle');
  for (const item of schema.commands) assert.ok(rendered.includes(signature('brindle', item)), `missing ${item.name}`);
  assert.ok(rendered.includes('`schema.json` next to this file'));
  assert.ok(rendered.includes('Executable: "/bin/brindle"'));
  assert.equal(rendered.match(/\*\*\[mutating\]\*\*/g)?.length, schema.commands.filter(item => item.mutating).length);
});
