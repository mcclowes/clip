/**
 * ---
 * purpose: Build equivalent project-task fixtures across commands.md, common task manifests, and Swift conventions.
 * related:
 *   - ./run.ts - Runs each task condition through the agent harness.
 *   - ../packages/cli/src/commands-md.ts - Owns the commands.md format used by the fixture.
 * ---
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtinTools, clipMain, headlessArgs, type Workspace } from './harness.ts';

export const projectCommandConditions = ['commands-md', 'package-json', 'makefile', 'justfile', 'taskfile', 'mise', 'swift-conventions'] as const;
export type ProjectCommandCondition = (typeof projectCommandConditions)[number];

export type ProjectCommandTask = {
  id: 'build' | 'test';
  prompt: string;
  invocation: Record<ProjectCommandCondition, string[]>;
};

export const projectCommandTasks: ProjectCommandTask[] = [
  {
    id: 'build',
    prompt: "Build the project using the repository's project command.",
    invocation: {
      'commands-md': ['project-command', 'build'],
      'package-json': ['npm', 'run', 'assemble'],
      makefile: ['make', 'assemble'],
      justfile: ['just', 'assemble'],
      taskfile: ['task', 'assemble'],
      mise: ['mise', 'run', 'assemble'],
      'swift-conventions': ['swift', 'build'],
    },
  },
  {
    id: 'test',
    prompt: "Run the project's tests using the repository's project command.",
    invocation: {
      'commands-md': ['project-command', 'test'],
      'package-json': ['npm', 'run', 'verify'],
      makefile: ['make', 'verify'],
      justfile: ['just', 'verify'],
      taskfile: ['task', 'verify'],
      mise: ['mise', 'run', 'verify'],
      'swift-conventions': ['swift', 'test'],
    },
  },
];

export type ProjectCommandWorkspace = Workspace & { markerDir: string };

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`);
  chmodSync(path, 0o755);
}

function runnerShim(bin: string, name: string, commandExpression: string): void {
  writeExecutable(join(bin, name), `command_name=${commandExpression}\ncase "$command_name" in\n  assemble|build) exec project-command build ;;\n  verify|test) exec project-command test ;;\n  *) echo "Available tasks: assemble, verify" ;;\nesac`);
}

function writeCondition(condition: ProjectCommandCondition, cwd: string, bin: string, env: NodeJS.ProcessEnv): void {
  if (condition === 'commands-md') {
    mkdirSync(join(cwd, '.clip'));
    writeFileSync(join(cwd, '.clip/commands.md'), [
      '# Commands',
      '',
      '- Build: `project-command build` - compile the project #safe',
      '- Test: `project-command test` - run the test suite #safe #ci',
      '',
    ].join('\n'));
    execFileSync(process.execPath, [clipMain, 'sync', '--target', 'agents-md'], { cwd, env, stdio: 'pipe' });
    return;
  }
  if (condition === 'package-json') {
    writeFileSync(join(cwd, 'package.json'), `${JSON.stringify({ name: 'project-command-eval', private: true, scripts: { assemble: 'project-command build', verify: 'project-command test' } }, null, 2)}\n`);
    return;
  }
  if (condition === 'makefile') {
    writeFileSync(join(cwd, 'Makefile'), '.PHONY: assemble verify\nassemble: ## Build the project\n\t@project-command build\nverify: ## Run the test suite\n\t@project-command test\n');
    return;
  }
  if (condition === 'justfile') {
    writeFileSync(join(cwd, 'justfile'), '# Build the project\nassemble:\n    project-command build\n\n# Run the test suite\nverify:\n    project-command test\n');
    runnerShim(bin, 'just', `"\${1:-}"`);
    return;
  }
  if (condition === 'taskfile') {
    writeFileSync(join(cwd, 'Taskfile.yml'), "version: '3'\ntasks:\n  assemble:\n    desc: Build the project\n    cmds: [project-command build]\n  verify:\n    desc: Run the test suite\n    cmds: [project-command test]\n");
    runnerShim(bin, 'task', `"\${1:-}"`);
    return;
  }
  if (condition === 'mise') {
    writeFileSync(join(cwd, 'mise.toml'), '[tasks.assemble]\ndescription = "Build the project"\nrun = "project-command build"\n\n[tasks.verify]\ndescription = "Run the test suite"\nrun = "project-command test"\n');
    runnerShim(bin, 'mise', `"\${2:-\${1:-}}"`);
    return;
  }
  writeFileSync(join(cwd, 'Package.swift'), '// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name: "ProjectCommandEval")\n');
  runnerShim(bin, 'swift', `"\${1:-}"`);
}

export function prepareProjectCommands(condition: ProjectCommandCondition): ProjectCommandWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'clip-project-commands-eval-'));
  const cwd = join(root, 'work');
  const bin = join(root, 'bin');
  const markerDir = join(root, 'markers');
  mkdirSync(cwd);
  mkdirSync(bin);
  mkdirSync(markerDir);
  writeExecutable(join(bin, 'project-command'), `case "\${1:-}" in\n  build|test) : > "$PROJECT_COMMAND_MARKERS/$1"; echo "$1 complete" ;;\n  *) echo "Unknown project command: \${1:-}" >&2; exit 2 ;;\nesac`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CLIP_HOME: join(root, 'clip-home'),
    PROJECT_COMMAND_MARKERS: markerDir,
  };
  writeCondition(condition, cwd, bin, env);
  return { root, cwd, statePath: markerDir, markerDir, env, claudeArgs: headlessArgs([...builtinTools]) };
}

export function projectCommandPrompt(task: ProjectCommandTask): string {
  return `${task.prompt}\n\nFinish with a final line in exactly this form: "ANSWER: done".`;
}

export const projectCommandSucceeded = (workspace: ProjectCommandWorkspace, task: ProjectCommandTask) =>
  existsSync(join(workspace.markerDir, task.id));
