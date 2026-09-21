---
sidebar_position: 4
title: Generate skills
description: Generate and maintain portable agent skills from registered tools.
---

# Generate and maintain skills

```bash
clip sync
clip sync --skills-dir .claude/skills
```

Each skill includes your purpose, the executable path, one usage line per command, and a `commands/` directory of reference files beside `SKILL.md`. A usage line shows required arguments bare, optional ones in brackets, enum values inline, and a mutation marker, with the first example beside read commands:

```text
- `docker container inspect <container> [--format <format>]` — Read metadata for one or more containers. Example: `docker container inspect app --format '{{json .State}}'`
```

Commands whose schema lists no arguments point at their own `--help`. The default destination is `.agents/skills` in the current project. Choose the skills directory your agent reads.

## Skill layout

```text
.agents/skills/clip-docker/
  SKILL.md              usage lines, or an index for very large tools
  commands/container.md argument descriptions, output notes, and every example
  .clip-owned           the files CLIP wrote
```

Commands are grouped by their leading words, so `container ls` and `container inspect` share `commands/container.md`. A group over 15 commands splits on the next word.

Usage lines stay in `SKILL.md` until they pass 24,000 characters, about 10,000 tokens, or roughly 130 commands with a few arguments each. Past that, `SKILL.md` becomes an index of group files and their command names, and the usage lines move into the group files. The limit is high on purpose: in the evals, an index at 100 commands cost agents one extra read per task and saved no tokens.

Skills don't include `schema.json`. The group files carry what agents need from it, and `clip doctor` and `clip refresh` read the registration, not the skill.

## Ownership

Run sync after changing or removing registrations. CLIP refreshes its own skills and removes stale ones, including group files a smaller schema no longer needs. It refuses collisions with unowned directories, extra user files anywhere in a skill, and symlinks. Generated files are managed output; edit the source schema or registration instead.

Registrations live in `~/.config/clip/tools.json`. Set `CLIP_HOME` to use another directory. Skills provide guidance; they don't grant permissions, store credentials, or bypass your agent's approval rules.
