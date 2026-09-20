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

Each skill includes your purpose, the executable path, one usage line per command, and a full `schema.json` beside `SKILL.md`. A usage line shows required arguments bare, optional ones in brackets, enum values inline, and a mutation marker, with the first example beside read commands:

```text
- `docker container inspect <container> [--format <format>]` — Read metadata for one or more containers. Example: `docker container inspect app --format '{{json .State}}'`
```

Commands whose schema lists no arguments point at their own `--help`. Agents read `schema.json` only when they need argument descriptions or output contracts. The default destination is `.agents/skills` in the current project. Choose the skills directory your agent reads.

Run sync after changing or removing registrations. CLIP refreshes its own skills and removes stale ones, while refusing collisions with unowned directories or extra user files. Generated files are managed output; edit the source schema or registration instead.

Registrations live in `~/.config/clip/tools.json`. Set `CLIP_HOME` to use another directory. Skills provide guidance; they don't grant permissions, store credentials, or bypass your agent's approval rules.
