import { readFileSync } from 'node:fs';
const version = process.argv[2];
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const section = changelog.split(/^## /m).find((part) => part.startsWith(`[${version}]`));
if (!section) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const newline = section.indexOf('\n');
const notes = newline === -1 ? '' : section.slice(newline + 1).trim();
if (!notes) {
  console.error(`CHANGELOG.md has no release notes for ${version}`);
  process.exit(1);
}
console.log(notes);
