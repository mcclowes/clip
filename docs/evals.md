# Eval findings

First run: 18 September 2026, Claude Code 2.1.276, Sonnet, 3 trials per cell. Method and reproduction steps are in [the evals README](../evals/README.md). Tracked in [issue #10](https://github.com/mcclowes/clip/issues/10).

The fixture is a fictional eight-command CLI, so these numbers show the most a schema can help. Treat three trials as directional.

## Summary

- CLIP took an unfamiliar CLI from 9 of 24 passes to 24 of 24, for 36 tokens of always-loaded context. Bare is the real-world default: with the tool on PATH and no pointer, the agent mostly never tried Bash.
- The `cli-hint` condition is a control that shows where that win comes from. A one-line pointer also passed 24 of 24, so the gain is discovery. The skill body and schema added nothing on top: slightly more calls and tokens than the hint, and more usage errors.
- MCP was the easiest interface to use: about half the tool calls, no discovery, no usage errors, and the lowest total tokens.
- CLIP's always-loaded cost is tiny and flat (36 tokens). Eager MCP grows at about 184 tokens per tool. Deferred MCP, which Claude Code now does by default, closes most of that gap.
- CLIP's on-demand cost is the highest of any interface, because `schema.json` is read whole.

## Ease of use

Tool calls, tokens, cost, and time cover passing runs only.

| Condition | Pass | Tool calls | Discovery calls | Usage errors | Cumulative input (median) | Cost USD (median) | Seconds (median) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cli-bare` | 9/24 | 6.3 | 2.4 | 0 | 111,655 | 0.073 | 28.8 |
| `cli-hint` | 24/24 | 3.5 | 2.0 | 1 | 72,544 | 0.056 | 11.6 |
| `cli-clip` | 24/24 | 4.0 | 1.7 | 5 | 77,490 | 0.064 | 11.6 |
| `mcp-eager` | 24/24 | 2.0 | 0 | 0 | 47,812 | 0.046 | 4.9 |
| `mcp-deferred` | 24/24 | 3.0 | 1.0 | 0 | 57,587 | 0.054 | 7.2 |

Usage errors are total across 24 runs, and exclude the refusal that `refuse-impossible` expects. No condition mutated state on a read-only task or touched the state file.

Peak context barely differs (18,700 to 19,500 tokens). On a small tool, cumulative input is driven by the number of turns, since each turn resends about 17,000 tokens of harness prompt. Fewer calls beats a smaller schema.

### Why the CLIP skill underperformed

All 24 `cli-clip` runs loaded the skill. After that:

- `SKILL.md` lists command names and descriptions, but no arguments. Agents then either guessed (`load cancel --id`, or omitting `--reason`), ran `--help` anyway (7 runs), or read the schema (9 runs).
- `SKILL.md` says to check `schema.json` but not where it is. All 9 schema reads went to the path in the `Source:` line. None read the skill's own copy.
- The skill load is an extra turn that `--help` doesn't need, and it doesn't replace the `--help` call.

## Context cost

Exact token counts. Baseline first-turn input was 17,350 tokens.

Always loaded, added to every turn:

| Condition | 8 commands | 32 commands | 100 commands |
| --- | --- | --- | --- |
| `cli-hint` | 24 | 26 | 26 |
| `cli-clip` | 36 | 36 | 38 |
| `mcp-deferred` | 912 | 1,301 | 2,394 |
| `mcp-eager` | 1,484 | 5,915 | 18,387 |

Loaded on demand:

| Artifact | 8 commands | 32 commands | 100 commands |
| --- | --- | --- | --- |
| `brindle --help` | 327 | 1,264 | 3,888 |
| `brindle load queue --help` | 211 | | |
| CLIP `SKILL.md` | 537 | 1,592 | 4,564 |
| MCP tool definitions | 1,403 | 5,817 | 18,254 |
| CLIP `schema.json` | 1,944 | 7,662 | 23,720 |

To use one command of a 100-command tool, `--help` costs about 4,100 tokens, deferred MCP loads only the selected tool definitions, and CLIP costs about 28,300 if the agent reads the schema.

## What this means for CLIP

1. Discovery is the proven win: CLIP makes an unfamiliar CLI usable at 36 tokens. Nobody hand-writes a pointer for every tool, so generating and maintaining them across tools and agents is the product. Expect a smaller gain on tools the model already knows, since it tries those unprompted.
2. "Saves context versus MCP" holds strongly against eager loading, and weakly against deferred loading.
3. The skill format needs work before it can claim to help usage:
   - Put compact argument signatures in `SKILL.md`, so one load replaces `--help`.
   - Give the path to `schema.json`, or drop the file from the skill.
   - Offer per-command retrieval, such as `clip schema show <tool> <command>`, and compact JSON.

## Not yet measured

- Prompts that don't name the tool. A skill description says what the tool is for, which a bare pointer doesn't, so CLIP may beat the hint there.
- Prompt wording. Tasks said "brindle tool"; "brindle CLI" may rescue some bare runs.
- Tools the model already knows (`git`, `gh`), where a schema likely adds less.
- A real MCP server against its CLI, such as GitHub's. Real servers have longer descriptions, so eager costs will be higher than here.
- Larger tools in the task eval, where eager MCP context and whole-schema reads should start to hurt.
- Other models and agent harnesses. Haiku can't defer tools.
