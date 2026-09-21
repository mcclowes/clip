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
clip lint <schema-file|tool|registry-id>
clip sync [--skills-dir <path>] [--target all|skills|agents-md] [--agents-file <path>]
clip registry search [query]
clip registry add <id> --purpose <text>
clip commands [--file <path>]
clip commands check [--file <path>]
clip commands init [--file <path>]
```

All commands accept `--output auto|json|text`. Auto uses JSON when piped and readable text on a terminal. List commands accept `--limit` from 1 to 10000, defaulting to 100, and include truncation metadata. Failures exit 1 with a structured error on stderr. `clip commands check` and `clip lint` also exit 1 when they find errors, with the report on stdout. See [project commands](./commands.md).

`clip list` marks each registration `reviewed` when its schema is a bundled registry schema, unmodified, and `unreviewed` otherwise: local files, probes, manual registrations, and registry schemas edited after install or left behind by a catalog update until `clip refresh`.

`clip lint` checks a schema file, a registered tool, or a registry entry, offline. Errors are instruction-like text in any field (text addressing the agent, role markers) and examples that are more than one invocation (command substitution, or chaining, pipes, redirects, or background jobs outside quotes). Warnings are commands without documented `args` (set `[]` when there are none), missing mutation markers, read commands whose first example isn't bounded and machine-readable, generated skill files over about 12,000 tokens, free text over 500 characters (300 for examples), links outside `documentation` other than example.com and localhost, and documentation links without HTTPS. Registry entries treat the example rule as an error.
