import { readFileSync } from 'node:fs';
import { contract } from '../packages/cli/src/contract.ts';

const tag = process.argv[2];
const { version } = JSON.parse(readFileSync(new URL('../packages/cli/package.json', import.meta.url), 'utf8'));
const problems = [];
if (tag !== undefined && tag !== `v${version}`) problems.push(`tag ${tag} does not match package version ${version}`);
if (contract.version !== version) problems.push(`CLI contract version ${contract.version} does not match package version ${version}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
