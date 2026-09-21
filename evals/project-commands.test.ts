import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanup } from './harness.ts';
import { projectCommandConditions, projectCommandSucceeded, projectCommandTasks, prepareProjectCommands } from './project-commands.ts';

test('each project-command condition exposes equivalent build and test tasks', () => {
  for (const condition of projectCommandConditions) {
    const workspace = prepareProjectCommands(condition);
    try {
      for (const task of projectCommandTasks) {
        execFileSync(task.invocation[condition][0]!, task.invocation[condition].slice(1), {
          cwd: workspace.cwd,
          env: workspace.env,
          stdio: 'pipe',
        });
        assert.equal(existsSync(join(workspace.markerDir, task.id)), true, `${condition} ${task.id}`);
      }
    } finally {
      cleanup(workspace);
    }
  }
});

test('commands.md is surfaced through the real clip sync output', () => {
  const workspace = prepareProjectCommands('commands-md');
  try {
    const agents = readFileSync(join(workspace.cwd, 'AGENTS.md'), 'utf8');
    assert.match(agents, /Project commands from `\.clip\/commands\.md`/);
    assert.match(agents, /Build: `project-command build`/);
    assert.match(agents, /Test: `project-command test`/);
  } finally {
    cleanup(workspace);
  }
});

test('the Swift baseline has no project task manifest', () => {
  const workspace = prepareProjectCommands('swift-conventions');
  try {
    assert.equal(existsSync(join(workspace.cwd, 'Package.swift')), true);
    for (const file of ['AGENTS.md', 'package.json', 'Makefile', 'justfile', 'Taskfile.yml', 'mise.toml', '.clip/commands.md']) {
      assert.equal(existsSync(join(workspace.cwd, file)), false, file);
    }
  } finally {
    cleanup(workspace);
  }
});

test('a project command succeeds only after its expected effect occurs', () => {
  const workspace = prepareProjectCommands('package-json');
  const task = projectCommandTasks[0]!;
  try {
    assert.equal(projectCommandSucceeded(workspace, task), false);
    execFileSync(task.invocation['package-json'][0]!, task.invocation['package-json'].slice(1), { cwd: workspace.cwd, env: workspace.env });
    assert.equal(projectCommandSucceeded(workspace, task), true);
  } finally {
    cleanup(workspace);
  }
});
