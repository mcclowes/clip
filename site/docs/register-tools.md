---
sidebar_position: 2
title: Register tools
description: Discover executables and register them with a clear purpose.
---

# Register tools with a purpose

`clip discover` lists executable files on PATH without running them. Choose which tools to register; discovery doesn't opt tools in automatically.

```bash
clip discover git --limit 20
clip register mytool --purpose "Manage project deployments" --probe schema
```

For a tool with a `capabilities` command, use `--probe capabilities`. Probes are explicit, time out after five seconds, and cap output at 1 MiB. CLIP doesn't infer capabilities by executing arbitrary commands or parsing help.

You can register without a schema, then add one later. Re-registering updates the purpose and schema for that tool. Use `clip list` to inspect registrations and `clip remove mytool` to remove one.

## Show agents a subset with a profile

Most projects use a handful of a large tool's commands. A schema can name subsets in `profiles`:

```json
"profiles": { "read-only": ["get", "describe", "config view"] }
```

Register with `--profile read-only` and the generated skill lists only those commands, with a note that the tool has others behind `--help`. `clip permissions` also proposes rules only for the profile, so a read-only profile gives a tool that needs no permission prompts. Refresh fails if the schema drops the profile.
