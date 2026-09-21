/**
 * ---
 * purpose: Read-only tasks and scratch fixtures that run a registry schema against its real tool, for agent validation.
 * ---
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pick, random } from './fixture/state.ts';
import { builtinTools, clipMain, headlessArgs, skillsDir, type Workspace } from './harness.ts';

export type RegistryTask = { id: string; prompt: string; answerFormat: string; verify: (answer: string) => boolean };
export type RegistryFixture = {
  /** The registry entry ID, which is also the executable. */
  tool: string;
  setup: (cwd: string) => void;
  /** Everything a read-only task must leave alone. */
  snapshot: (cwd: string) => string;
  /** A fixture file the tests edit to prove the snapshot notices. */
  touch: string;
  tasks: RegistryTask[];
};

export const registryConditions = ['cli-bare', 'cli-clip'] as const;
export type RegistryCondition = (typeof registryConditions)[number];

const write = (cwd: string, files: Record<string, string>) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }
};

function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return ['.git', '.claude'].includes(entry.name) && dir === root ? [] : listFiles(path, root);
    return [relative(root, path)];
  }).sort();
}

/** Working tree content, skipping `.git`, which a plain `git status` may rewrite, and the skill the condition installs. */
const treeDigest = (cwd: string) => {
  const hash = createHash('sha256');
  for (const path of listFiles(cwd)) hash.update(`${path}\0`).update(readFileSync(join(cwd, path))).update('\0');
  return hash.digest('hex');
};

/** Keeps fixture setup and snapshots independent of the user's git config, hooks, and signing. */
export const isolatedGit = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com' };
const git = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...isolatedGit, ...env } });

const normalize = (answer: string) => answer.trim().replace(/^[`"']+|[`"'.]+$/g, '').trim();
const pathSet = (answer: string) => [...new Set(answer.split(/[,\s]+/).map(item => normalize(item).replace(/^\.\//, '')).filter(Boolean))].sort();
const sameSet = (answer: string, expected: string[]) => JSON.stringify(pathSet(answer)) === JSON.stringify([...expected].sort());
const number = (answer: string) => Number(/^-?\d+/.exec(normalize(answer))?.[0] ?? NaN);

/** Oldest first. The third most recent is the one asked for, and its neighbours read alike on purpose. */
const commits = ['Add README', 'Add kiln schedule', 'Fix glaze ratios', 'Rename cone table', 'Bump firing log format', 'Document shelf layout'];

const gitFixture: RegistryFixture = {
  tool: 'git',
  touch: 'schedule.txt',
  setup: cwd => {
    git(cwd, ['init', '-q', '-b', 'main']);
    commits.forEach((subject, index) => {
      write(cwd, { 'README.md': `# Studio\n\nRevision ${index}\n`, 'schedule.txt': `week ${index}\n`, 'cones.txt': `cone ${index}\n`, 'notes/glaze.txt': `ratio ${index}\n` });
      git(cwd, ['add', '-A']);
      const date = `2026-08-0${index + 1}T10:00:00Z`;
      git(cwd, ['commit', '-q', '-m', subject], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    });
    // Staged only, staged then edited again, unstaged only, and untracked. Only the middle two count as unstaged.
    write(cwd, { 'README.md': '# Studio\n\nStaged\n', 'cones.txt': 'cone staged\n' });
    git(cwd, ['add', 'README.md', 'cones.txt']);
    write(cwd, { 'cones.txt': 'cone staged, then edited\n', 'schedule.txt': 'week edited\n', 'notes/glaze.txt': 'ratio edited\n', 'scratch.txt': 'untracked\n' });
  },
  snapshot: cwd => [treeDigest(cwd), git(cwd, ['rev-parse', 'HEAD']), git(cwd, ['diff', '--cached', '--name-status'])].join('\n'),
  tasks: [
    {
      id: 'git-log-subject',
      prompt: 'What is the subject line of the third most recent commit in this repository? Use git.',
      answerFormat: 'the subject line',
      verify: answer => normalize(answer).toLowerCase() === commits.at(-3)!.toLowerCase(),
    },
    {
      id: 'git-unstaged',
      prompt: 'Which tracked files in this repository have changes that are not staged for commit? Use git.',
      answerFormat: 'the file paths relative to the repository root, comma-separated',
      verify: answer => sameSet(answer, ['cones.txt', 'notes/glaze.txt', 'schedule.txt']),
    },
  ],
};

type Item = { sku: string; category: string; status: string; quantity: number };
/** Too many items to count by eye, so the agent has to filter with the tool. Discontinued is rare, so its list stays short. */
export function inventory(): Item[] {
  const next = random(22);
  return Array.from({ length: 400 }, (_, index) => ({
    sku: `SKU-${String(index + 1).padStart(4, '0')}`,
    category: pick(next, ['glaze', 'clay', 'tool', 'kiln-furniture']),
    status: next() < 0.05 ? 'discontinued' : pick(next, ['active', 'active', 'backorder']),
    quantity: Math.floor(next() * 121),
  }));
}

const jqFixture: RegistryFixture = {
  tool: 'jq',
  touch: 'inventory.json',
  setup: cwd => write(cwd, { 'inventory.json': `${JSON.stringify({ generated: '2026-09-01', items: inventory() })}\n` }),
  snapshot: treeDigest,
  tasks: [
    {
      id: 'jq-count',
      prompt: 'In inventory.json, how many items are active and have a quantity above 50? Use jq.',
      answerFormat: 'the number',
      verify: answer => number(answer) === inventory().filter(item => item.status === 'active' && item.quantity > 50).length,
    },
    {
      id: 'jq-list',
      prompt: 'In inventory.json, which items in the glaze category are discontinued? Use jq.',
      answerFormat: 'their SKUs, comma-separated',
      verify: answer => sameSet(answer.toUpperCase(), inventory().filter(item => item.category === 'glaze' && item.status === 'discontinued').map(item => item.sku)),
    },
  ],
};

/**
 * Ignored and hidden files hold matches a plain grep would count, `legacyAuthConfig` is a near miss, and
 * `TODOauth` only matches when the parentheses are read as a regex group.
 */
const sourceTree = {
  '.ignore': 'vendor/\n',
  'src/api.ts': 'export const login = (user: string) => legacyAuth(user);\n// TODO(auth): drop the legacy path\n',
  'src/legacy/session.ts': 'export const resume = (token: string) => legacyAuth(token);\n// TODO(auth) expire tokens\n// TODO(auth) rotate keys\n',
  'src/api.test.ts': "import { login } from './api';\nlegacyAuth('test');\n// TODO(auth) cover failures\n",
  'src/util.ts': 'export const legacyAuthConfig = { ttl: 60 };\n// TODOauth marker\n// TODO(authz) split roles\n',
  'vendor/lib.ts': 'legacyAuth(vendor);\n// TODO(auth) upstream\n',
  '.hidden/notes.ts': '// TODO(auth) private note\nlegacyAuth(hidden);\n',
};

const rgFixture: RegistryFixture = {
  tool: 'rg',
  touch: 'src/api.ts',
  setup: cwd => write(cwd, sourceTree),
  snapshot: treeDigest,
  tasks: [
    {
      id: 'rg-callers',
      prompt: "Which non-test source files call legacyAuth( ? Test files end in .test.ts. Respect the project's ignore files. Use ripgrep (rg).",
      answerFormat: 'the file paths relative to the project root, comma-separated',
      verify: answer => sameSet(answer, ['src/api.ts', 'src/legacy/session.ts']),
    },
    {
      id: 'rg-literal',
      prompt: 'How many lines in this project contain the exact text TODO(auth) ? Search the way ripgrep does by default, skipping ignored and hidden files. Use ripgrep (rg).',
      answerFormat: 'the number',
      verify: answer => number(answer) === 4,
    },
  ],
};

export const registryFixtures: RegistryFixture[] = [gitFixture, jqFixture, rgFixture];

export const registryPrompt = (task: RegistryTask) =>
  `${task.prompt}\n\nDo not modify or create any files. Finish with a final line in exactly this form: "ANSWER: <value>", where the value is ${task.answerFormat}.`;

/** A skill read or a grep is not a use of the tool; validation needs the agent to have actually run it. */
export const invokedTool = (calls: string[], tool: string) =>
  calls.some(call => call.startsWith('Bash ') && new RegExp(`(^|[\\s;&|("'/])${tool}(\\s|"|$)`).test(call.slice(5).replace(/^\{"command":"/, ' ')));

/** Recorded with each run, since a validation says nothing about a tool version it never ran against. */
export function toolVersion(tool: string): string {
  return execFileSync(tool, ['--version'], { encoding: 'utf8' }).split('\n')[0]!.trim();
}

/** The real executable on PATH; `cli-clip` adds only what `clip registry add` and `clip sync` generate. */
export function prepareRegistry(condition: RegistryCondition, fixture: RegistryFixture, purpose: string): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'clip-registry-eval-'));
  const cwd = join(root, 'work');
  mkdirSync(cwd);
  fixture.setup(cwd);
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_HOME: join(root, 'clip-home'), ENABLE_TOOL_SEARCH: 'false' };
  if (condition === 'cli-clip') {
    const clip = (...args: string[]) => execFileSync(process.execPath, [clipMain, ...args], { cwd, env, stdio: 'pipe' });
    clip('registry', 'add', fixture.tool, '--purpose', purpose);
    clip('sync', '--skills-dir', join(cwd, skillsDir));
  }
  return { root, cwd, statePath: '', env, claudeArgs: headlessArgs(builtinTools) };
}
