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

Each skill includes your purpose, executable path, operations, provenance, and a full `schema.json`. The default destination is `.agents/skills` in the current project. Choose the skills directory your agent reads.

Run sync after changing or removing registrations. CLIP refreshes its own skills and removes stale ones, while refusing collisions with unowned directories or extra user files. Generated files are managed output; edit the source schema or registration instead.

Registrations live in `~/.config/clip/tools.json`. Set `CLIP_HOME` to use another directory. Skills provide guidance; they don't grant permissions, store credentials, or bypass your agent's approval rules.
