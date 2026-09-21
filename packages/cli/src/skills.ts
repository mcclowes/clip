/**
 * ---
 * purpose: Write registered CLI tools as portable skills, with ownership checks before replacing or removing files.
 * ---
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, lstatSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolName } from './schema.ts';
import { groupDir, renderSkillFiles } from './skill-render.ts';
import type { Registration } from './store.ts';
import { authoringSkill, authoringSkillName } from './authoring-skill.ts';

export const defaultSkillsDir = '.agents/skills';
const prefix = 'clip-';
const marker = '.clip-owned';
/** v1 markers predate group files and always owned the same two files. */
const legacyMarker = 'clip-skill-v1\n';
const legacyFiles = ['SKILL.md', 'schema.json'];
/** v2 markers list every file CLIP wrote, one relative path per line after the header. */
const manifestHeader = 'clip-skill-v2';
/** Anything else in a manifest means it was edited by hand, so the directory is treated as unowned. */
const ownablePath = /^(SKILL\.md|schema\.json|commands\/[a-z0-9-]+\.md)$/;

const skillName = (tool: Registration) => `${prefix}${toolName(tool.name).toLowerCase()}`;
/** lstat rather than existsSync, which follows links and so misses a dangling one that a write would follow out of the skill. */
function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
const clipDirs = (root: string) => readdirSync(root).filter(name => name.startsWith(prefix));
const manifest = (paths: Iterable<string>) => `${[manifestHeader, ...paths].join('\n')}\n`;

/** The files CLIP wrote into a skill directory, or undefined when CLIP does not own it. */
function ownedPaths(dir: string): string[] | undefined {
  const path = join(dir, marker);
  if (!existsSync(path) || isSymlink(path)) return undefined;
  const text = readFileSync(path, 'utf8');
  if (text === legacyMarker) return legacyFiles;
  const [header, ...paths] = text.split('\n').filter(Boolean);
  return header === manifestHeader && paths.every(item => ownablePath.test(item)) ? paths : undefined;
}

export const skillFile = (tool: Registration, directory: string) => join(resolve(directory), skillName(tool), 'SKILL.md');

/** The tool's SKILL.md when CLIP generated one there, so a pointer never names a user's skill or a missing file. */
export function existingSkillFile(tool: Registration, directory: string): string | undefined {
  const file = skillFile(tool, directory);
  const dir = join(file, '..');
  return existsSync(dir) && !isSymlink(dir) && ownedPaths(dir)?.includes('SKILL.md') && existsSync(file) ? file : undefined;
}

/** Tool skills plus the bundled authoring skill, which is written even when nothing is registered. */
export function syncSkills(tools: Registration[], directory: string) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const active = new Set([...tools.map(skillName), authoringSkillName]);
  if (active.size !== tools.length + 1) throw new Error(`Tool names collide when normalized to skill names, or with ${authoringSkillName}.`);
  for (const name of new Set([...active, ...clipDirs(root)])) assertSafeToReplace(join(root, name), active.has(name));
  for (const tool of tools) writeSkill(join(root, skillName(tool)), toolSkill(tool));
  writeSkill(join(root, authoringSkillName), authoringSkill());
  const removed = clipDirs(root).filter(name => !active.has(name) && removeOwnedSkill(join(root, name)));
  return { directory: root, items: [...active], removed };
}

/** Refuses to touch anything CLIP did not write itself, unless it is an unowned stale directory we will simply leave alone. */
function assertSafeToReplace(dir: string, active: boolean): void {
  if (!existsSync(dir)) return;
  if (lstatSync(dir).isSymbolicLink()) throw new Error(`Refusing skill symlink: ${dir}`);
  const owned = ownedPaths(dir);
  if (!owned) {
    if (active) throw new Error(`Refusing to overwrite an unowned skill: ${dir}`);
    return;
  }
  const groups = join(dir, groupDir);
  if (isSymlink(groups)) throw new Error(`Refusing skill file symlink: ${dir}`);
  const entries = [
    ...readdirSync(dir).filter(file => file !== groupDir),
    ...(existsSync(groups) ? readdirSync(groups).map(file => `${groupDir}/${file}`) : []),
  ];
  if (entries.some(file => file !== marker && !owned.includes(file))) throw new Error(`Skill contains user files: ${dir}`);
  if (entries.some(file => isSymlink(join(dir, file)))) throw new Error(`Refusing skill file symlink: ${dir}`);
}

const toolSkill = (tool: Registration) => renderSkillFiles({ skillName: skillName(tool), name: tool.name, purpose: tool.purpose, executable: tool.executable, ...(tool.schema ? { schema: tool.schema } : {}) });

/** The marker lists old and new files while writing, so an interrupted sync still owns everything it left behind. */
function writeSkill(dir: string, files: Map<string, string>): void {
  const previous = existsSync(dir) ? (ownedPaths(dir) ?? []) : [];
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, marker), manifest(new Set([...previous, ...files.keys()])));
  for (const [path, content] of files) {
    if (path.startsWith(`${groupDir}/`)) mkdirSync(join(dir, groupDir), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  for (const path of previous) if (!files.has(path) && existsSync(join(dir, path))) unlinkSync(join(dir, path));
  removeEmptyGroupDir(dir);
  writeFileSync(join(dir, marker), manifest(files.keys()));
}

function removeEmptyGroupDir(dir: string): void {
  const groups = join(dir, groupDir);
  if (existsSync(groups) && !readdirSync(groups).length) rmdirSync(groups);
}

function removeOwnedSkill(dir: string): boolean {
  const owned = lstatSync(dir).isDirectory() ? ownedPaths(dir) : undefined;
  if (!owned) return false;
  for (const path of owned) if (existsSync(join(dir, path))) unlinkSync(join(dir, path));
  removeEmptyGroupDir(dir);
  unlinkSync(join(dir, marker));
  rmdirSync(dir);
  return true;
}
