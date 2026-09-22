import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test, {type TestContext} from 'node:test';
import {
  attachSupplementalNotices,
  type Inventory,
  isAllowed,
  packageRootOf,
  renderNotices,
  shippedPackages,
  updateInventory,
  validate,
} from './inventory.ts';

const mitSha = '41883f836aa33dbbfa0e644ea4ac8a12ba116a59d046f45ae70a2259872f4f8f';

function project(context: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'clip-licenses-'));
  context.after(() => rmSync(root, {recursive: true, force: true}));
  const addPackage = (name: string, manifest: Record<string, unknown>, files: Record<string, string> = {LICENSE: 'MIT text\n'}) => {
    const directory = join(root, 'node_modules', name);
    mkdirSync(join(directory, 'dist'), {recursive: true});
    writeFileSync(join(directory, 'package.json'), JSON.stringify({name, ...manifest}));
    writeFileSync(join(directory, 'dist', 'index.js'), '');
    for (const [file, contents] of Object.entries(files)) writeFileSync(join(directory, file), contents);
    return join(directory, 'dist', 'index.js');
  };
  return {root, addPackage};
}

function inventory(overrides: Partial<Inventory['packages'][number]> = {}): Inventory {
  return {
    schemaVersion: 1,
    allowedLicenses: ['MIT'],
    packages: [{name: 'example', version: '1.0.0', license: 'MIT', reviewed: true, notices: [{file: 'LICENSE', sha256: mitSha}], ...overrides}],
  };
}

test('bundled files map to their outermost npm package', () => {
  assert.equal(packageRootOf('/site/src/pages/index.tsx'), null);
  assert.equal(packageRootOf('/site/node_modules/react/index.js'), '/site/node_modules/react');
  assert.equal(packageRootOf('/site/node_modules/@mdx-js/react/lib/index.js'), '/site/node_modules/@mdx-js/react');
  assert.equal(packageRootOf('/site/node_modules/a/node_modules/b/x.js'), '/site/node_modules/a/node_modules/b');
  assert.equal(packageRootOf('/site/node_modules/react'), null);
});

test('shipped packages are read once with their license files', (context) => {
  const {addPackage} = project(context);
  const entry = addPackage('example', {version: '1.0.0', license: 'MIT', repository: {url: 'https://example.com/repo'}});
  const shipped = shippedPackages([entry, entry, '/site/src/first-party.ts']);

  assert.equal(shipped.length, 1);
  assert.deepEqual(shipped[0].notices.map(({file, sha256}) => ({file, sha256})), [{file: 'LICENSE', sha256: mitSha}]);
  assert.equal(shipped[0].source, 'https://example.com/repo');
});

test('legacy license fields are normalised', (context) => {
  const {addPackage} = project(context);
  const shipped = shippedPackages([
    addPackage('object', {version: '1.0.0', license: {type: 'ISC'}}),
    addPackage('array', {version: '1.0.0', licenses: [{type: 'MIT'}, 'Apache-2.0'], homepage: 'https://example.com'}),
    addPackage('none', {version: '1.0.0'}, {}),
  ]);

  assert.deepEqual(shipped.map(({name, license}) => [name, license]), [
    ['array', '(MIT OR Apache-2.0)'],
    ['none', 'UNKNOWN'],
    ['object', 'ISC'],
  ]);
});

test('a reviewed inventory matching the bundle passes', (context) => {
  const {addPackage} = project(context);
  const shipped = shippedPackages([addPackage('example', {version: '1.0.0', license: 'MIT'})]);

  assert.deepEqual(validate(inventory(), shipped), []);
});

test('an unreviewed bundled package fails', (context) => {
  const {addPackage} = project(context);
  const shipped = shippedPackages([
    addPackage('example', {version: '1.0.0', license: 'MIT'}),
    addPackage('new-package', {version: '2.0.0', license: 'MIT'}),
  ]);

  assert.ok(validate(inventory(), shipped).includes('new-package@2.0.0: shipped package has no reviewed license record'));
});

test('a version bump fails until the inventory is updated', (context) => {
  const {addPackage} = project(context);
  const failures = validate(inventory(), shippedPackages([addPackage('example', {version: '1.1.0', license: 'MIT'})]));

  assert.ok(failures.includes('example@1.1.0: shipped package has no reviewed license record'));
  assert.ok(failures.includes('example@1.0.0: reviewed package is no longer shipped'));
});

test('changed license terms or text fail', (context) => {
  const {addPackage} = project(context);
  const shipped = shippedPackages([addPackage('example', {version: '1.0.0', license: 'MIT'}, {LICENSE: 'changed\n'})]);
  const failures = validate(inventory({license: 'ISC', reviewed: false}), shipped);

  assert.ok(failures.includes('example@1.0.0: license record isn\'t approved'));
  assert.ok(failures.includes('example@1.0.0: license changed from ISC to MIT'));
  assert.ok(failures.includes('example@1.0.0: notice files differ from the reviewed copy'));
});

test('a package without a license file needs a supplemental notice', (context) => {
  const {root, addPackage} = project(context);
  const shipped = shippedPackages([addPackage('example', {version: '1.0.0', license: 'MIT'}, {})]);
  assert.ok(validate(inventory({notices: []}), shipped).some((failure) => failure.includes('no license or notice file found')));

  const notices = join(root, 'notices');
  mkdirSync(notices);
  writeFileSync(join(notices, 'example-LICENSE.txt'), 'MIT text\n');
  const record = {notices: [], supplementalNotices: [{file: 'example-LICENSE.txt', sha256: mitSha, upstream: 'https://example.com/LICENSE'}]};
  const attached = attachSupplementalNotices(inventory(record), shipped, notices);

  assert.deepEqual(attached.failures, []);
  assert.deepEqual(validate(inventory(record), attached.packages), []);
  assert.match(renderNotices(attached.packages), /https:\/\/example\.com\/LICENSE\n-+\nMIT text/);
});

test('a missing or edited supplemental notice fails', (context) => {
  const {root, addPackage} = project(context);
  const shipped = shippedPackages([addPackage('example', {version: '1.0.0', license: 'MIT'}, {})]);
  const notices = join(root, 'notices');
  mkdirSync(notices);
  writeFileSync(join(notices, 'edited.txt'), 'edited\n');
  const record = {
    notices: [],
    supplementalNotices: [
      {file: 'missing.txt', sha256: mitSha, upstream: 'u'},
      {file: 'edited.txt', sha256: mitSha, upstream: 'u'},
    ],
  };

  assert.deepEqual(attachSupplementalNotices(inventory(record), shipped, notices).failures, [
    'example@1.0.0: missing third-party/notices/missing.txt',
    'example@1.0.0: edited.txt differs from the reviewed copy',
  ]);
});

test('a license outside the allowlist needs a review note', (context) => {
  const {addPackage} = project(context);
  const shipped = shippedPackages([addPackage('example', {version: '1.0.0', license: 'MPL-2.0'})]);

  assert.ok(validate(inventory({license: 'MPL-2.0'}), shipped).some((failure) => failure.includes("MPL-2.0 isn't on the allowlist")));
  assert.deepEqual(validate(inventory({license: 'MPL-2.0', reviewNote: 'File-level copyleft; shipped unmodified.'}), shipped), []);
});

test('SPDX expressions are checked against the allowlist', () => {
  assert.equal(isAllowed('(MIT OR GPL-3.0)', ['MIT']), true);
  assert.equal(isAllowed('MIT AND ISC', ['MIT', 'ISC']), true);
  assert.equal(isAllowed('MIT AND GPL-3.0', ['MIT']), false);
  assert.equal(isAllowed('(MIT OR ISC) AND GPL-3.0', ['MIT', 'ISC', 'GPL-3.0']), false);
  assert.equal(isAllowed('UNKNOWN', ['MIT']), false);
});

test('an unsupported schema version fails', () => {
  assert.deepEqual(validate({...inventory(), schemaVersion: 2 as 1, packages: []}, []), ['third-party/licenses.json: unsupported schemaVersion']);
});

test('updating keeps approval across a version bump with unchanged terms', (context) => {
  const {addPackage} = project(context);
  const shipped = shippedPackages([
    addPackage('example', {version: '1.1.0', license: 'MIT'}),
    addPackage('fresh', {version: '1.0.0', license: 'MIT'}),
  ]);
  const updated = updateInventory(inventory({reviewNote: 'kept'}), shipped);

  assert.deepEqual(updated.packages.map(({name, version, reviewed, reviewNote}) => ({name, version, reviewed, reviewNote})), [
    {name: 'example', version: '1.1.0', reviewed: true, reviewNote: 'kept'},
    {name: 'fresh', version: '1.0.0', reviewed: false, reviewNote: undefined},
  ]);
});

test('updating withdraws approval when terms change or a hand-copied notice may be stale', (context) => {
  const {addPackage} = project(context);
  const changed = shippedPackages([addPackage('example', {version: '1.0.0', license: 'MIT'}, {LICENSE: 'changed\n'})]);
  assert.equal(updateInventory(inventory(), changed).packages[0].reviewed, false);

  const bumped = shippedPackages([addPackage('example', {version: '1.1.0', license: 'MIT'})]);
  const supplementalNotices = [{file: 'example-LICENSE.txt', sha256: mitSha, upstream: 'u'}];
  const updated = updateInventory(inventory({supplementalNotices}), bumped).packages[0];
  assert.equal(updated.reviewed, false);
  assert.deepEqual(updated.supplementalNotices, supplementalNotices);
});
