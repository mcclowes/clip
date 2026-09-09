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
    "args": [{ "name": "--limit", "type": "integer", "default": 20 }]
  }]
}
```

```bash
clip register mytool --purpose "Manage deployments" --schema mytool.json
clip schema mytool
```

A minimal document can use `capabilities` instead of `commands`. Every entry needs a name and description. Mutation markers are optional; missing means unknown, never read-only.
