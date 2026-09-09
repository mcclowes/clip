---
sidebar_position: 1
title: Get started
slug: /
description: Install CLIP and share command-line tools with your agents.
---

# Your command line, shared with your agents

CLIP stands for Command Line Interface Protocol. It registers installed tools, records what they're for, and generates skills that describe their capabilities. Your agents run the original CLI directly.

## Install CLIP

```bash
brew install mcclowes/clip/clip
clip --version
clip discover
```

CLIP requires Node.js 24 or later, installed by the formula. To run from source, clone [the repository](https://github.com/mcclowes/clip), run `npm ci && npm run build`, then `node packages/cli/dist/main.js --help`.

## Register your first tool

```bash
clip registry add git --purpose "Review repository changes"
clip sync
```

Your project now contains `.agents/skills/clip-git/SKILL.md` and its capability document.

Next, [register your own tools](./register-tools.md) or [browse community schemas](/tools).
