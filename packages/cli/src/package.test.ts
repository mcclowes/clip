import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// The published CLI ships only CLIP's own MIT code. A runtime dependency would
// bring third-party license obligations into the npm package and release tarball.
test('the published CLI has no third-party runtime dependencies', () => {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies']) {
    assert.equal(manifest[field], undefined, `packages/cli/package.json declares ${field}`);
  }
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest.files, ['dist']);
});
