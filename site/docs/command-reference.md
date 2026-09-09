---
sidebar_position: 6
title: Command reference
description: CLIP commands, arguments, output modes, and failure behavior.
---

# Command reference

Run `clip schema` or `clip capabilities` for the machine-readable command contract. Both work offline without configuration.

```text
clip discover [query]
clip register <executable> --purpose <text> [--schema <file> | --probe schema|capabilities]
clip list
clip remove <name>
clip schema
clip capabilities
clip schema show <id>
clip schema init <name> --purpose <text> --file <path>
clip sync [--skills-dir <path>]
clip registry search [query]
clip registry add <id> --purpose <text>
```

All commands accept `--output auto|json|text`. Auto uses JSON when piped and readable text on a terminal. List commands accept `--limit` from 1 to 10000, defaulting to 100, and include truncation metadata. Failures exit 1 with a structured error on stderr.
