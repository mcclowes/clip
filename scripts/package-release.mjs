import { cpSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('packages/cli/package.json', root), 'utf8'));
const staging = mkdtempSync(join(tmpdir(), 'clip-release-'));
let outputStaging = '';
try {
  const directory = join(staging, `clip-${version}`);
  mkdirSync(directory);
  cpSync(new URL('packages/cli/dist/', root), join(directory, 'dist'), { recursive: true });
  for (const [source, destination] of [['packages/cli/package.json', 'package.json'], ['LICENSE', 'LICENSE'], ['README.md', 'README.md']]) cpSync(new URL(source, root), join(directory, destination));
  mkdirSync(new URL('dist/', root), { recursive: true });
  const archive = resolve(`dist/clip-${version}.tar.gz`);
  outputStaging = mkdtempSync(join(dirname(archive), '.clip-release-output-'));
  const stagedArchive = join(outputStaging, basename(archive));
  execFileSync('tar', ['-czf', stagedArchive, '-C', staging, `clip-${version}`]);
  const digest = createHash('sha256').update(readFileSync(stagedArchive)).digest('hex');
  writeFileSync(`${stagedArchive}.sha256`, `${digest}  clip-${version}.tar.gz\n`);
  renameSync(stagedArchive, archive);
  renameSync(`${stagedArchive}.sha256`, `${archive}.sha256`);
  console.log(`${archive}\n${digest}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
  if (outputStaging) rmSync(outputStaging, { recursive: true, force: true });
}
