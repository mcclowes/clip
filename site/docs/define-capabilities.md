---
sidebar_position: 3
title: Define capabilities
description: Describe CLI operations in a structured capability document.
---

# Define capabilities

CLIP follows the structured output and introspection principles in [CLI Spec v0.2](https://clispec.dev/spec/v0.2/). Native schemas are preserved, including nested commands, arguments, output fields, and mutation markers.

When a tool has no schema, start a draft:

```bash
clip schema init mytool --purpose "Manage deployments" --file mytool.json
```

Add real operations to the empty commands list before registration:

```json
{
  "name": "mytool",
  "commands": [{
    "name": "list",
    "description": "List deployments",
    "mutating": false,
    "args": [{ "name": "--limit", "type": "integer", "default": 20 }],
    "examples": ["mytool list --limit 20"]
  }]
}
```

```bash
clip lint mytool.json
clip register mytool --purpose "Manage deployments" --schema mytool.json
clip sync
```

## Draft with an agent

`clip sync` installs a `clip-schema-authoring` skill beside your tool skills, even with nothing registered. Ask your agent to write a schema for a tool, and the skill has it:

- check the registry and native probes first
- read `<tool> --help` and each subcommand's help, and run nothing else, since reading help still executes the tool
- leave `mutating` out when unsure, so agents see mutation unknown rather than a wrong read-only marker
- lead read commands with a bounded, machine-readable example
- run `clip lint` after each round of edits until it reports no errors, then hand you the mutating and unknown commands to review

CLIP supplies the checks; the agent does the drafting.

## Document shape

A minimal document can use `capabilities` instead of `commands`. Every entry needs a name and description. Mutation markers are optional; missing means unknown, never read-only.

## Gotchas

When agents guess wrong about a command in a repeatable way, record the fact they miss in `gotchas`, on the command or at the top level for the whole tool:

```json
{
  "name": "load cancel",
  "description": "Cancel a queued load",
  "mutating": true,
  "args": [{ "name": "id", "positional": true, "required": true }],
  "gotchas": ["The load id is positional; there is no --id flag."]
}
```

Each gotcha renders in the skill beside its command. Keep them to one statement of fact about the tool, under 200 characters. They reach an agent's context, so `clip lint` gives them the same prose checks as descriptions, and rejects gotchas phrased as instructions to the agent.
