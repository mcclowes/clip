import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authoringSkill, authoringSkillName, workedExample } from './authoring-skill.ts';
import { lintSchema } from './lint.ts';
import { validateSchema } from './schema.ts';

test('the worked example schema passes lint with no issues, so the skill teaches what lint checks', () => {
  assert.deepEqual(lintSchema(validateSchema(workedExample)), []);
});

test('the authoring skill has frontmatter, keeps to help flags, and loops on clip lint', () => {
  const files = authoringSkill();
  assert.deepEqual([...files.keys()], ['SKILL.md']);
  const skill = files.get('SKILL.md')!;
  assert.match(skill, new RegExp(`^---\\nname: ${authoringSkillName}\\ndescription: .+\\n---\\n`));
  assert.match(skill, /--help/);
  assert.match(skill, /executes the tool/);
  assert.match(skill, /clip lint /);
  assert.match(skill, /clip registry search/);
  assert.ok(skill.includes(JSON.stringify(workedExample, null, 2)));
});
