import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join, sep} from 'node:path';

export type NoticeRecord = {file: string; sha256: string};

/** A notice copied into third-party/notices/ because the npm package doesn't ship one. */
export type SupplementalNoticeRecord = NoticeRecord & {upstream: string};

export type PackageRecord = {
  name: string;
  version: string;
  license: string;
  reviewed: boolean;
  reviewNote?: string;
  notices: NoticeRecord[];
  supplementalNotices?: SupplementalNoticeRecord[];
};

export type Inventory = {
  schemaVersion: 1;
  allowedLicenses: string[];
  packages: PackageRecord[];
};

export type ShippedPackage = {
  name: string;
  version: string;
  license: string;
  source?: string;
  notices: (NoticeRecord & {text: string})[];
  supplemental?: (SupplementalNoticeRecord & {text: string})[];
};

const noticeFilePattern = /^(licen[cs]e|copying|notice|patents)([-._].*)?$/i;

export const packageId = ({name, version}: {name: string; version: string}) => `${name}@${version}`;

function sha256(contents: string | Buffer) {
  return createHash('sha256').update(contents).digest('hex');
}

/** The root of the npm package that owns `resource`, or null for first-party files. */
export function packageRootOf(resource: string): string | null {
  const marker = `${sep}node_modules${sep}`;
  const index = resource.lastIndexOf(marker);
  if (index === -1) return null;
  const rest = resource.slice(index + marker.length).split(sep);
  const segments = rest[0].startsWith('@') ? 2 : 1;
  if (rest.length <= segments) return null;
  return resource.slice(0, index + marker.length) + rest.slice(0, segments).join(sep);
}

function licenseOf(manifest: Record<string, unknown>): string {
  const {license, licenses} = manifest as {license?: unknown; licenses?: unknown};
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && 'type' in license) return String(license.type);
  if (Array.isArray(licenses)) {
    const types = licenses.map((entry) => (typeof entry === 'string' ? entry : entry?.type)).filter(Boolean);
    if (types.length > 0) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
  }
  return 'UNKNOWN';
}

function sourceOf(manifest: Record<string, unknown>): string | undefined {
  const {repository, homepage} = manifest as {repository?: unknown; homepage?: unknown};
  if (typeof repository === 'string') return repository;
  if (repository && typeof repository === 'object' && 'url' in repository) return String(repository.url);
  return typeof homepage === 'string' ? homepage : undefined;
}

export function readShippedPackage(root: string): ShippedPackage {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const notices = readdirSync(root, {withFileTypes: true})
    .filter((entry) => entry.isFile() && noticeFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((file) => {
      const contents = readFileSync(join(root, file));
      return {file, sha256: sha256(contents), text: contents.toString('utf8')};
    });
  return {name: manifest.name, version: manifest.version, license: licenseOf(manifest), source: sourceOf(manifest), notices};
}

/**
 * Reads each package that owns a bundled file. Nested package.json files
 * (for example `dist/esm/package.json`) are skipped by resolving to the
 * outermost package directory under node_modules.
 */
export function shippedPackages(resources: Iterable<string>): ShippedPackage[] {
  const roots = new Set<string>();
  for (const resource of resources) {
    const root = packageRootOf(resource);
    if (root && existsSync(join(root, 'package.json'))) roots.add(root);
  }
  const byId = new Map<string, ShippedPackage>();
  for (const root of roots) {
    const shipped = readShippedPackage(root);
    byId.set(packageId(shipped), shipped);
  }
  return [...byId.values()].sort((a, b) => packageId(a).localeCompare(packageId(b)));
}

/** Attaches each record's committed supplemental notices to the matching shipped package. */
export function attachSupplementalNotices(inventory: Inventory, shipped: ShippedPackage[], directory: string) {
  const failures: string[] = [];
  const records = new Map(inventory.packages.map((record) => [packageId(record), record]));
  const packages = shipped.map((pkg) => {
    const notices = records.get(packageId(pkg))?.supplementalNotices ?? [];
    const supplemental = notices.flatMap((notice) => {
      const path = join(directory, notice.file);
      if (!existsSync(path)) {
        failures.push(`${packageId(pkg)}: missing third-party/notices/${notice.file}`);
        return [];
      }
      const contents = readFileSync(path);
      if (sha256(contents) !== notice.sha256) failures.push(`${packageId(pkg)}: ${notice.file} differs from the reviewed copy`);
      return [{...notice, text: contents.toString('utf8')}];
    });
    return supplemental.length > 0 ? {...pkg, supplemental} : pkg;
  });
  return {packages, failures};
}

/** Whether an SPDX expression is satisfied by the allowlist. Mixed AND/OR needs manual review. */
export function isAllowed(expression: string, allowed: string[]) {
  const bare = expression.replace(/[()]/g, '').trim();
  const hasAnd = / AND /.test(bare);
  const hasOr = / OR /.test(bare);
  if (hasAnd && hasOr) return false;
  const terms = bare.split(/ (?:AND|OR) /).map((term) => term.trim());
  return hasAnd ? terms.every((term) => allowed.includes(term)) : terms.some((term) => allowed.includes(term));
}

function sameNotices(a: NoticeRecord[], b: NoticeRecord[]) {
  return a.length === b.length && a.every((notice, index) => notice.file === b[index].file && notice.sha256 === b[index].sha256);
}

export function validate(inventory: Inventory, shipped: ShippedPackage[]): string[] {
  const failures: string[] = [];
  if (inventory.schemaVersion !== 1) failures.push('third-party/licenses.json: unsupported schemaVersion');
  const records = new Map(inventory.packages.map((record) => [packageId(record), record]));
  const shippedIds = new Set(shipped.map(packageId));

  for (const pkg of shipped) {
    const id = packageId(pkg);
    const record = records.get(id);
    if (!record) {
      failures.push(`${id}: shipped package has no reviewed license record`);
      continue;
    }
    if (!record.reviewed) failures.push(`${id}: license record isn't approved`);
    if (record.license !== pkg.license) failures.push(`${id}: license changed from ${record.license} to ${pkg.license}`);
    if (pkg.notices.length === 0 && !pkg.supplemental?.length) {
      failures.push(`${id}: no license or notice file found; copy the upstream license into third-party/notices/`);
    }
    if (!sameNotices(record.notices, pkg.notices)) failures.push(`${id}: notice files differ from the reviewed copy`);
    if (!isAllowed(pkg.license, inventory.allowedLicenses) && !record.reviewNote) {
      failures.push(`${id}: ${pkg.license} isn't on the allowlist; record a reviewNote once its terms are accepted`);
    }
  }

  for (const id of records.keys()) {
    if (!shippedIds.has(id)) failures.push(`${id}: reviewed package is no longer shipped`);
  }
  return failures;
}

/**
 * Rewrites the inventory to match what ships. A record stays approved only
 * when its license and notice text are unchanged; a version bump alone
 * doesn't need a fresh review unless the notice was copied in by hand.
 */
export function updateInventory(inventory: Inventory, shipped: ShippedPackage[]): Inventory {
  const previous = new Map<string, PackageRecord>();
  for (const record of inventory.packages) previous.set(record.name, record);
  return {
    ...inventory,
    packages: shipped.map((pkg) => {
      const notices = pkg.notices.map(({file, sha256}) => ({file, sha256}));
      const prior = previous.get(pkg.name);
      const unchanged =
        prior?.reviewed === true &&
        prior.license === pkg.license &&
        sameNotices(prior.notices, notices) &&
        (!prior.supplementalNotices || prior.version === pkg.version);
      return {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        reviewed: unchanged,
        ...(prior?.reviewNote ? {reviewNote: prior.reviewNote} : {}),
        notices,
        ...(prior?.supplementalNotices ? {supplementalNotices: prior.supplementalNotices} : {}),
      };
    }),
  };
}

export function renderNotices(shipped: ShippedPackage[]): string {
  const sections = shipped.map((pkg) => {
    const heading = [
      `${pkg.name} ${pkg.version}`,
      `License: ${pkg.license}`,
      pkg.source ? `Source: ${pkg.source}` : null,
    ].filter(Boolean).join('\n');
    const notices = [
      ...pkg.notices.map(({file, text}) => ({label: file, text})),
      ...(pkg.supplemental ?? []).map(({upstream, text}) => ({label: upstream, text})),
    ].map(({label, text}) => `${label}\n${'-'.repeat(label.length)}\n${text.trimEnd()}`).join('\n\n');
    return `${heading}\n\n${notices}`;
  });
  return [
    'CLIP site third-party software notices',
    '======================================',
    '',
    'The CLIP docs site bundles the following third-party software. These notices',
    "cover that software only. CLIP itself is MIT licensed; see",
    'https://github.com/mcclowes/clip/blob/main/LICENSE.',
    '',
    sections.join(`\n\n${'='.repeat(72)}\n\n`),
    '',
  ].join('\n');
}
