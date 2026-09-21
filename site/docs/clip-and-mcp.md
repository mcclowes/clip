---
sidebar_position: 7
title: CLIP and MCP
description: What the evals measured when the same tool was driven through a CLIP skill and through MCP, including where MCP wins.
---

# CLIP and MCP

MCP is the easier interface for an agent to drive. CLIP is far cheaper to keep available, and it lets an agent pipe results through other tools instead of pulling them into context. Which one fits depends on how many commands you expose and how large their output gets.

The numbers below come from the [eval findings](https://github.com/mcclowes/clip/blob/main/docs/evals.md): 15 tasks against a fictional nine-command CLI, Claude Code 2.1.278, Sonnet, one trial per cell. The CLIP condition is the usage-line skill format that `clip sync` ships. Read the ordering as directional.

| | CLIP skill | Eager MCP |
| --- | --- | --- |
| Tool calls per task | 3.3 | 2.4 |
| Discovery calls per task | 1.0 | 0 |
| Seconds per task (median) | 6.3 | 3.9 |
| Always loaded, 9 commands | 38 tokens | 1,709 tokens |
| Always loaded, 100 commands | 34 tokens | 18,897 tokens |
| Tool-result tokens, `count-beyond-flags` | 593 | 11,782 |

## Where MCP wins

MCP drives in fewer calls: 2.4 per task against 3.3. It needs no discovery call, because the tool definitions are already in context, while a CLIP agent loads the skill first. And it's faster, at a median of 3.9 seconds per task against 6.3.

Nothing on the CLIP roadmap closes that gap. A file-based skill has to be read before it helps, so it pays at least one load per task, and MCP pays none. Adding usage lines to skills cut CLIP's discovery to a single call, and that single call is the floor.

## Where CLIP wins

**Footprint.** An eager MCP server puts every tool definition into every turn. At 9 commands that's 1,709 tokens against 38 for a CLIP skill, about 45 times more. At 100 commands it's 18,897 against 34, more than 500 times more. Eager MCP grows by roughly 189 tokens per command; the CLIP skill stays flat because only its name and description are always loaded.

Over a long session this compounds. In a session of eleven unrelated chores around one tool use, eager MCP cost about 1,900 tokens more per turn than the CLIP skill. At nine commands it still finished slightly ahead on total input, because it needed fewer turns. At 100 commands the footprint would dominate.

Deferred MCP sits between the two: 922 tokens always loaded at 9 commands and 2,359 at 100, with a discovery call like CLIP's.

**Composition.** A CLIP tool is a CLI, so an agent can filter its output with `jq` or any other command before reading it. On `count-beyond-flags`, a question the tool has no flag for, the CLIP agent piped a 500-load listing through `jq` and read 593 tokens of results. The MCP agent pulled the listing into context: 11,782 tokens.

That gap only holds below the harness's spill threshold. Claude Code writes oversized tool results to a file, and above that size an MCP agent also ends up reading the file with Bash, at the cost of an extra turn.

## Choosing

If you expose a few commands and your harness defers tool loading, MCP is fine, and it's the smoother interface to drive.

If you have many commands, commands with large outputs, or several tools installed side by side, the always-loaded footprint and piping favor CLIP.

## These numbers age

The comparison is sensitive to the agent harness. Between two Claude Code patch releases the baseline prompt shrank by about 10,000 tokens, and a headline result from the first eval run stopped reproducing. Treat any figure here as a measurement of one harness version, one model, and one fixture. Real MCP servers usually carry longer descriptions than the fixture, which would make eager MCP's always-loaded cost higher, but that hasn't been measured yet.
