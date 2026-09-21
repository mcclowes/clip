# Eval findings

## CLIP against MCP at 100 commands (21 September 2026)

Claude Code 2.1.278, `claude-sonnet-5`, one trial per cell. `cli-clip`, `mcp-eager`, and `mcp-deferred` on all 15 tasks at 100 commands, named prompts, no distractors. 45 sessions, in `evals/results/v5-mcp-100`.

**Every run passed in every condition, with no unsafe mutations. On tokens, deferred MCP and CLIP are close, and eager MCP costs the most.** This run can't separate the three on accuracy, so read it on cost and calls only.

| Condition | Pass | Tool calls | Discovery calls | Errors per run | First-turn input (median) | Cumulative input (median) | Cumulative input (total) | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cli-clip` | 15/15 | 3.3 | 1.1 | 0.13 | 7,780 | 45,307 | 885,505 | 6.3s |
| `mcp-deferred` | 15/15 | 3.6 | 1.2 | 0.07 | 10,051 | 37,763 | 761,844 | 5.9s |
| `mcp-eager` | 15/15 | 2.5 | 0 | 0.13 | 26,589 | 59,338 | 1,355,874 | 3.9s |

Errors per run includes the refusal `refuse-impossible` expects: every condition tried `load cancel LD-0003`, got rejected, and refused.

- **Eager MCP is the easiest to drive and the most expensive.** It makes the fewest calls and is fastest, but about 19,000 tokens of tool definitions ride on every turn. On `long-session` that's 331,969 input tokens against 171,759 for `cli-clip`.
- **Deferred MCP roughly matches CLIP.** It used 14% fewer input tokens in total. A tool search returns only the tools a task needs, while a skill load returns every usage line (7,823 tokens at 100 commands). CLIP pays for a whole CLI's surface, and deferred MCP pays per tool.
- **CLIP's edge is result size.** On `count-beyond-flags`, both MCP arms pulled 11,782 tokens of listing through context, and `cli-clip` piped it down to 568. Deferred MCP still finished lower overall on that task, because `cli-clip` took four calls to get there.
- **Deferred discovery can miss.** On `reduction-share`, `mcp-deferred` searched `load_list`, then `kiln_list`, before finding the tool, and its result spilled to a file anyway. That was its most expensive run.

### Ignore `costUsd`

The dollar cost in `runs.jsonl` includes prompt-cache discounts. Cache reads cost about a tenth of base input and cache writes about 1.25 times, so a run's cost depends mostly on whether an earlier run left its prefix cached. The eval doesn't control run order, so the figure is noise. For example, `mcp-eager` made a single call on both `show-load` and `count-filtered`. One cost $0.030 and the other $0.114, because the second hit a cold cache.

With cache discounts, eager MCP looked cheapest ($0.83 total, against $1.04 for `cli-clip`), because its identical 100-tool prefix stays warm across runs. At base Sonnet rates ($3 per million input tokens, $15 per million output), the order is the same as input tokens:

| Condition | Total (15 runs) | Median per run |
| --- | --- | --- |
| `mcp-deferred` | $2.32 | $0.114 |
| `cli-clip` | $2.69 | $0.136 |
| `mcp-eager` | $4.10 | $0.178 |

Use cumulative input tokens for comparisons. Caching helps every interface in real use, but it helps the condition with the most repeated prefix most, and that's a property of the eval's run order, not of the interface.

### Caveats

- One trial per cell and a 100% pass rate. The ordering is directional, and the run says nothing about robustness.
- One tool behind each interface. That's deferred MCP's best case, and it's where the scaling argument below doesn't apply yet.
- The MCP server is minimal. Real servers carry longer tool descriptions, which raises eager's cost and, less so, deferred's.

## Scaling across many tools (theoretical, not yet measured)

The case for CLIP over MCP isn't a single tool with 100 commands. It's an agent with many tools installed. That's where eager MCP breaks down, and deferred loading is the industry's fix. So the claim to test is whether CLIP scales better than deferred MCP, not just better than eager.

What each interface keeps in context on every turn, fitted from the context cost measurements in the second run (9, 32, and 100 commands):

| Interface | Always loaded | Grows with |
| --- | --- | --- |
| Eager MCP | about 189 tokens per tool | every tool on every server |
| Deferred MCP | about 780 fixed, plus about 16 tokens per tool name | every tool on every server |
| CLIP | about 35 tokens per skill | CLIs, not commands |

Projected always-loaded cost:

| Setup | Tools | Eager MCP | Deferred MCP | CLIP |
| --- | --- | --- | --- | --- |
| 1 tool, 100 commands | 100 | 18,900 | 2,400 | 35 |
| 5 tools, 50 commands each | 250 | 47,000 | 4,800 | 175 |
| 20 tools, 50 commands each | 1,000 | 189,000 | 16,800 | 700 |

Eager MCP stops being viable within a handful of servers. Deferred MCP grows about 16 tokens per tool, so it's workable but not free. CLIP's always-loaded cost grows only with the number of CLIs. A CLI with 50 commands costs about 35 tokens, against about 800 for the same tools deferred.

But the always-loaded cost is only half of it. What an agent loads on demand runs the other way:

- A tool search returns the definitions of the few tools it matched.
- A CLIP skill load returns every usage line for that CLI, 7,823 tokens at 100 commands, once per session per CLI.

So CLIP pays more to use one CLI and less to have many installed. That's the trade the single-tool run shows as near parity. The crossover should come as the number of installed tools grows and the number used per task stays small, which is the normal shape of a well-equipped agent.

Two effects could matter more than tokens:

- **Discovery accuracy.** Deferred search matches over every tool name. With hundreds of near-miss names across servers, it may pick the wrong tool or search repeatedly, as `reduction-share` already did once with one server. CLIP selects a CLI by skill description first, then a command within it, so the search space at each step stays small.
- **Result size.** A CLI can filter and pipe its output. MCP results come back whole, or spill to a file above Claude Code's threshold.

Caveats on the projection:

- The rates come from one minimal fictional server. Real tool descriptions are longer, so real MCP costs will be higher.
- Claude Code may change how deferred tools are listed, for example searching without listing names, which would shrink deferred's per-tool cost. Harness changes have flipped results here before.
- Where a CLI already exists, CLIP needs no server. Where MCP earns its keep (hosted tools, OAuth, clients without a shell), the comparison doesn't apply.

To measure it: sweep 1, 5, and 20 installed tools at a fixed number of commands each, with the task's tool among the rest. Compare first-turn input, cumulative input, discovery calls, and pass rate for `cli-clip` and `mcp-deferred`. If CLIP stays flat on context and deferred MCP loses accuracy or tokens as tools are added, the claim holds.

## Gotchas run (21 September 2026)

Claude Code 2.1.278, Sonnet, three trials per condition. Targeted at [#40](https://github.com/mcclowes/clip/issues/40): `cancel-with-reason`, the task that previously guessed `load cancel --id`, on `cli-clip` with and without the `load cancel` gotcha. Six sessions.

**The gotcha did not change usage errors in this harness.** Both conditions passed 3 of 3, made three calls per run, and had zero usage errors. The current skill already prints `brindle load cancel <load> --reason <reason> [--dry-run]`, so the positional argument is visible before the agent makes its first command call. The gotcha added 73 median input tokens, from 35,494 to 35,567.

| Condition | Pass | Tool calls | Usage errors | Cumulative input (median) |
| --- | --- | --- | --- | --- |
| `cli-clip` without gotchas | 3/3 | 3 | 0 | 35,494 |
| `cli-clip` with gotchas | 3/3 | 3 | 0 | 35,567 |

This doesn't show that gotchas never help. It shows that the shipped usage line corrected this particular wrong guess before the gotcha could. Keep the field for errors that argument usage alone doesn't prevent, and rerun the targeted comparison when one appears.

## Registry validation run (21 September 2026)

Claude Code 2.1.278, `claude-sonnet-5`, two trials. The first run against real tools rather than `brindle` ([#22](https://github.com/mcclowes/clip/issues/22)): `git` 2.55.0, `jq` 1.7.1, and `rg` 15.2.0, two read-only tasks each, with and without the registry schema. 24 sessions, after a 12-session smoke run that found one harness bug: the skill names the resolved executable, and the tool-use check didn't recognise `/opt/homebrew/bin/rg`.

**Every run passed in both conditions, so the schemas don't mislead, but on these tasks they don't help either.** The skill cost one extra call, its read, in every `cli-clip` run, and more input on two of three tools.

| Tool | Condition | Pass | Tool calls | Discovery calls | Tool errors | Cumulative input (median) |
| --- | --- | --- | --- | --- | --- | --- |
| git | `cli-bare` | 4/4 | 1.0 | 0 | 0 | 15,880 |
| git | `cli-clip` | 4/4 | 2.0 | 1.0 | 0 | 25,865 |
| jq | `cli-bare` | 4/4 | 2.5 | 0 | 1 | 28,035 |
| jq | `cli-clip` | 4/4 | 3.3 | 1.0 | 0 | 26,086 |
| rg | `cli-bare` | 4/4 | 1.5 | 0 | 0 | 19,577 |
| rg | `cli-clip` | 4/4 | 2.5 | 1.0 | 0 | 29,938 |

That's the expected result for tools this well known. The first run's limits section predicted it: a fictional tool measures the upper bound of a schema's value. The fixtures include traps a careless call falls into: a file both staged and edited, `TODO(auth)` read as a regex, and matches in ignored and hidden files. The model avoided all of them unaided. So `validated` in the registry means the schema doesn't lead an agent astray on its covered commands. It doesn't mean the schema improves on no schema, and the record keeps the baseline beside it so nobody reads it that way.

Two trials are few. Treat 4/4 as "no failures seen", not as a rate.

## Rendered example run (21 September 2026)

Claude Code 2.1.278, Sonnet, three trials. Targeted at [#20](https://github.com/mcclowes/clip/issues/20): the three composition tasks against the 500-load fixture, comparing `cli-clip` (first example beside each read command) with `cli-clip-no-examples` (the same skill with examples stripped). 18 sessions.

**The rendered example changed nothing.** Every run passed, and in all 18 the first call was an unpiped `brindle load list` with a status or atmosphere filter. Examples or not, the agent pulled the listing whole, and on `count-beyond-flags` and `reduction-share` the output spilled to a file in every run (6 of 6 per condition) before `jq` ran against the spill.

| Condition | Pass | Tool calls | Tool-result tokens (median) | Cumulative input (median) | Piped first call | Spilled (large tasks) |
| --- | --- | --- | --- | --- | --- | --- |
| `cli-clip` | 9/9 | 3.3 | 1,207 ±1,342 | 47,544 ±5,120 | 0/9 | 6/6 |
| `cli-clip-no-examples` | 9/9 | 3.0 | 937 ±1,327 | 36,201 ±5,061 | 0/9 | 6/6 |

The gap in tokens is within the spread and runs the wrong way for the hypothesis. Read it as noise.

This doesn't test the rule as written. Brindle's `load list` has no cap or format flag and always emits JSON, so its first example is already bounded and machine-readable, and these tasks need every row anyway. What it does show is that an example beside the signature doesn't change how the agent composes. The spill is the recurring cost, and a bounded example can't prevent it when the task needs the whole set. Only piping on the first call can, and nothing in the skill currently shows piping.

## Piped first-call run (blocked, 21 September 2026)

The #34 matrix attempted three trials of `busiest-queue`, `count-beyond-flags`, and `reduction-share` for `cli-clip`, `cli-clip-piped-example`, and `cli-clip-pipe-note`. Claude Code failed authentication before every model turn: `OAuth session expired and could not be refreshed`.

All 27 rows are harness errors. Piped first calls, spills, turns, pass rate, and tool-result tokens are unavailable, not zero. Re-authenticate the provider, then rerun the command in [the eval README](../evals/README.md#run).

## Skill format run (21 September 2026)

Claude Code 2.1.278, Sonnet, one trial per cell. Targeted at [#11](https://github.com/mcclowes/clip/issues/11) and [#12](https://github.com/mcclowes/clip/issues/12): the eleven named-prompt tasks that aren't composition or long-session tasks, on `cli-hint` and the CLIP skill variants only, at 9 commands and at 100. 88 sessions.

- **Usage lines shipped, and they hold at 100 commands.** `cli-clip` makes fewer calls and fewer usage errors than `cli-hint` at both sizes, which is the bar #11 set.
- **`schema.json` left the skill at no cost.** Nothing read it, so argument detail moved to `commands/<group>.md`, and nothing read those at 100 commands either.
- **An index at 100 commands loses.** Splitting `SKILL.md` into an index plus group files cost 1.5 extra calls per task and saved no tokens. `clip sync` now keeps usage lines inline up to about 10,000 tokens.

| Condition | Commands | Pass | Tool calls | Discovery calls | Errors per run | Cumulative input (median) |
| --- | --- | --- | --- | --- | --- | --- |
| `cli-hint` | 9 | 11/11 | 3.1 | 2.1 | 0.36 | 33,079 |
| `cli-clip`, usage lines and `schema.json` | 9 | 11/11 | 2.4 | 1.0 | 0.09 | 25,280 |
| `cli-clip-groups`, usage lines and group files | 9 | 11/11 | 2.4 | 1.1 | 0.09 | 25,351 |
| `cli-hint` | 100 | 11/11 | 2.9 | 1.8 | 0.27 | 43,035 |
| `cli-clip`, as shipped | 100 | 11/11 | 2.4 | 1.0 | 0.09 | 39,250 |
| `cli-clip-index`, index and group files | 100 | 11/11 | 3.8 | 2.5 | 0.09 | 38,760 |

Errors per run includes the refusal `refuse-impossible` expects, so 0.09 is the floor. One trial per cell, so read the ordering as directional.

### The index costs a read per command group

With the index, every task went Skill, then a read of each group file it needed, then the command. Tasks that touch two groups, such as queueing by kiln name, read two files. Each read is another turn that resends the whole context, about 11,000 tokens here, which cancels the 4,300 tokens the index and one group file save over inline usage lines. At 100 commands the two tie on tokens and the index loses on calls.

The first attempt at the index also mis-grouped commands: `load queue` sat in `load.md` while `load-queue.md` held only its clones, so agents opened the wrong file and then the right one. Fixing that removed the wasted reads but not the structural one.

So the index is only for tools whose usage lines would be too large to load at all. The limit is 24,000 characters, about 10,000 tokens at the 2.4 characters per token that usage lines measure, or about 130 commands like the fixture's. Where an index starts winning on tokens above that is untested.

### What an agent reads to use one command

| Artifact | 9 commands | 32 commands | 100 commands |
| --- | --- | --- | --- |
| Before #11: `SKILL.md` plus `schema.json` | 2,793 | 9,370 | 28,783 |
| Shipped `SKILL.md` | 881 | 2,667 | 7,823 |
| Index `SKILL.md` plus one group file | | | 3,507 |
| `brindle --help` plus `brindle load queue --help` | 556 | | |

The first row is what the old skill sent an agent to when it needed arguments: the command list, then the whole schema. The shipped skill needs nothing past `SKILL.md`, and at 100 commands that's 7,823 tokens against 28,783. The always-loaded cost is unchanged at 32 to 38 tokens.

## Second run (20 September 2026)

Claude Code 2.1.278, Sonnet. Method and reproduction steps are in [the evals README](../evals/README.md). Tracked in [issue #10](https://github.com/mcclowes/clip/issues/10) and [issue #13](https://github.com/mcclowes/clip/issues/13). The [first run](#first-run-18-september-2026) is kept below, because the harness changed underneath it.

The fixture is a fictional nine-command CLI, so these numbers show the most a schema can help.

### What changed from the first run

- **The bare baseline stopped failing.** Claude Code 2.1.278 sends a much smaller harness prompt than 2.1.276 did: baseline first-turn input is 7,614 tokens against 17,350. With a prompt that names the tool, `cli-bare` now reaches for Bash unprompted and passes everything. The first run's headline, 9 of 24 to 24 of 24, does not reproduce.
- **Pass rate hit the ceiling instead of the floor.** All six conditions passed all 90 named-prompt cells. It no longer separates anything, so the interesting numbers are calls, usage errors, and tokens.
- **Prompts that don't name the tool do separate.** `cli-bare` passes 0 of 9. Every other condition passes 9 of 9. That is where discovery now shows up.
- **A skill format is a condition.** `cli-clip` is the renderer that ships; `cli-clip-signatures` is the format proposed in [#11](https://github.com/mcclowes/clip/issues/11), rendered by a function in `evals/` so it can be measured before `packages/cli` moves.
- **New scenarios.** Aggregate tasks against 500 loads, a long session of eleven unrelated turns around one tool use, a command shaped like `git log` with every flag renamed, two read-only tasks that invite a mutation, and a wording control.
- **Statistics.** Pass rates carry a Wilson 95% interval and medians carry half an interquartile range, so three trials read as the wide evidence they are.

Fifteen tasks, six conditions, and four result sets add up to 234 sessions.

### Summary

- Adding argument signatures to `SKILL.md` is the clearest win available. `cli-clip-signatures` beats every other CLI condition on calls, discovery, usage errors, and tokens, and it beats the one-line hint that the first run could not distinguish itself from. [#11](https://github.com/mcclowes/clip/issues/11) is ready to ship.
- Discovery is still the proven value, but you need an unnamed prompt to see it. Name the tool and the agent finds it on PATH by itself.
- MCP is still the easiest interface to drive, at the fewest calls, and still the most expensive when results are large: 11,782 tool-result tokens against 593 for the same answer through a CLI.
- Mutation markers had nothing to prevent. Zero unsafe mutations in 90 runs, including two tasks written to tempt one.
- The composition tasks partly missed, because Claude Code spills oversized tool results to a file and any interface with Bash reads it back with `jq`.

### Ease of use

Named prompts, one trial per cell, 15 tasks. Calls, discovery, and tokens cover passing runs; errors per run covers all runs.

| Condition | Pass | Tool calls | Discovery calls | Errors per run | Unsafe mutations | Cumulative input (median) | Tool-result tokens (median) | Seconds (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cli-bare` | 15/15 | 3.9 | 1.8 | 0.20 | 0 | 35,972 | 528 | 7.4 |
| `cli-hint` | 15/15 | 3.7 | 1.9 | 0.20 | 0 | 32,886 | 472 | 6.1 |
| `cli-clip` | 15/15 | 3.9 | 2.0 | 0.13 | 0 | 37,978 | 484 | 7.7 |
| `cli-clip-signatures` | 15/15 | 3.3 | 1.0 | 0.07 | 0 | 25,189 | 124 | 6.3 |
| `mcp-eager` | 15/15 | 2.4 | 0 | 0.07 | 0 | 19,294 | 117 | 3.9 |
| `mcp-deferred` | 15/15 | 3.5 | 1.0 | 0.07 | 0 | 28,039 | 117 | 5.5 |

One trial per cell, so treat the ordering as directional and the pass column as uninformative. The errors-per-run column counts the refusal that `refuse-impossible` expects, which every condition hits exactly once.

#### Argument signatures replace the help call

`cli-clip-signatures` spends exactly one discovery call and two tool calls on every read task. `cli-clip` spends two discovery calls, because `SKILL.md` gives command names without arguments, so the agent loads the skill and then runs `--help` anyway. Three read tasks, one trial each:

| Task | `cli-hint` | `cli-clip` | `cli-clip-signatures` | `mcp-eager` |
| --- | --- | --- | --- | --- |
| `count-filtered` | 3 calls, 2 discovery | 3 calls, 2 discovery | 2 calls, 1 discovery | 1 call, 0 discovery |
| `usage-report` | 3 calls, 2 discovery, 1 error | 3 calls, 2 discovery | 2 calls, 1 discovery | 1 call, 0 discovery |
| `stale-priors` | 3 calls, 2 discovery, 1 error | 4 calls, 2 discovery, 1 error | 2 calls, 1 discovery | 1 call, 0 discovery |

This clears the bar [#11](https://github.com/mcclowes/clip/issues/11) set: `cli-clip` at or below `cli-hint` on tool calls and usage errors. The signature format is below both.

#### Stale priors

`brindle log` is shaped like `git log` with every flag renamed and `--limit` made required. `cli-bare`, `cli-hint`, and `cli-clip` each burned a call running `brindle log` with no arguments, which is valid `git log` and exit 2 here. The three conditions that carry argument detail before the first call, `cli-clip-signatures` and both MCP arms, made no such guess.

A schema does correct a confident wrong guess. So does `--help`, for the price of a round trip.

#### Mutation safety

`tempting-cancel` and `tempting-move` are read-only asks that never say "do not change anything", and the mutation each invites would succeed against the fixture. Every condition answered without mutating, and no run touched the state file directly. Zero unsafe mutations in 90 runs.

So `mutating: true` and MCP's `destructiveHint` earned nothing here. Sonnet did not need telling. That may change on a weaker model, or on a tool whose read and write commands read more alike than `load show` and `load cancel` do. The scenarios stay as a regression check for weaker models.

#### Permission prompts

Markers earn their keep on friction instead. The harness runs with every tool allowed, so it can't see prompts; `eval:report` replays each read task's recorded Bash calls against the rules `clip permissions` generates for brindle ([#24](https://github.com/mcclowes/clip/issues/24)). A call avoids its prompt only when every segment between shell operators matches. With no allowlist, every call prompts.

| Condition | Bash calls | Prompts avoided | Avoided |
| --- | --- | --- | --- |
| cli-bare | 39 | 7 | 18% |
| cli-hint | 33 | 15 | 45% |
| cli-clip | 21 | 14 | 67% |

Replayed from the 18 September Sonnet run. Most of what still prompts is a brindle call piped to jq or python, which a user who already allows jq would not see. The skill helps twice: fewer calls overall, and a larger share of them are plain invocations an allow rule matches. Transcripts also showed agents invoking the absolute executable path a skill prints rather than the tool name, so `clip permissions` writes a rule for both.

### Prompts that don't name the tool

Three read tasks, three trials, 20 unrelated fictional tools installed as distractors: skills for the CLI conditions, a second MCP server for the MCP ones.

| Condition | Pass | Tool calls | Discovery calls | Cumulative input (median) |
| --- | --- | --- | --- | --- |
| `cli-bare` | 0/9 (0-30%) | - | - | - |
| `cli-hint` | 9/9 (70-100%) | 2.8 | 2.0 | 35,718 |
| `cli-clip` | 9/9 (70-100%) | 2.4 | 1.7 | 27,446 |
| `cli-clip-signatures` | 9/9 (70-100%) | 2.1 | 1.0 | 26,677 |
| `mcp-eager` | 9/9 (70-100%) | 1.3 | 0 | 27,532 |
| `mcp-deferred` | 9/9 (70-100%) | 2.3 | 1.0 | 29,462 |

`cli-bare` never found the tool in nine attempts, spending 4 to 6 calls per run poking around before giving up. A one-line hint is enough to rescue it, so this measures pointing at the tool rather than describing it. Twenty distractors did not confuse any condition that had a pointer.

#### Prompt wording

"brindle CLI" against "brindle tool", `cli-bare` only, three tasks, three trials each.

| Variant | Pass | Tool calls (mean) | Usage errors | Cumulative input (median) |
| --- | --- | --- | --- | --- |
| named ("brindle tool") | 9/9 | 2.89 | 6 | 33,696 |
| `cli-worded` ("brindle CLI") | 9/9 | 2.67 | 6 | 32,735 |

No difference worth reporting. The first run's guess, that "CLI" might rescue bare runs, is moot now that naming the tool at all is enough.

### Composition and tool-result tokens

Three aggregate tasks against 500 loads, asking for answers the tool has no flag for, so the work has to happen over a listing.

| Task | `cli-clip-signatures` | `mcp-eager` |
| --- | --- | --- |
| `busiest-queue` | 3 calls, 3,292 result tokens | 1 call, 3,257 result tokens |
| `count-beyond-flags` | 4 calls, 593 result tokens | 1 call, 11,782 result tokens |
| `reduction-share` | 3 calls, 608 result tokens, 35,971 input | 3 calls, 8,206 result tokens, 59,283 input |

Tool-result tokens are estimated from result text at four characters per token.

`count-beyond-flags` and `reduction-share` show the effect the tasks were built for. Pulling a 500-load listing back through context costs 8,000 to 12,000 tokens where a `jq` pipeline costs 600, and on `reduction-share` that makes `mcp-eager` the most expensive condition overall rather than the cheapest. `busiest-queue` shows nothing, because the queued subset is small enough that every condition pulls it whole.

#### Where this measurement leaks

Claude Code writes oversized tool results to a file instead of the transcript. An unfiltered `load_list` came back as `Error: result (85,111 characters across 4,260 lines) exceeds maximum allowed tokens. Output has been saved to …`, and the agent then read the file with Bash and `jq`. Bash output spills the same way above roughly 30KB.

So the premise, that MCP has to pull results through context while a CLI can pipe, only holds below the spill threshold. Above it both interfaces end up in Bash, and MCP pays an extra turn and a fumbled `jq` invocation to get there. Any conclusion about large results is a conclusion about that threshold as much as about the interface.

### Long sessions

Eleven unrelated chores around one tool use, so always-loaded context is resent every turn rather than once. One trial per condition.

| Condition | Turns | Cumulative input | Per turn |
| --- | --- | --- | --- |
| `cli-bare` | 15 | 137,438 | 9,163 |
| `cli-hint` | 14 | 129,908 | 9,279 |
| `cli-clip` | 15 | 130,696 | 8,713 |
| `cli-clip-signatures` | 14 | 120,019 | 8,573 |
| `mcp-eager` | 12 | 125,841 | 10,487 |
| `mcp-deferred` | 13 | 128,175 | 9,860 |

Eager MCP costs about 1,900 tokens more per turn than the signature skill, which is the always-loaded gap showing up as intended. It still finished with a lower total than `cli-bare`, because it needed three fewer turns. At nine commands, turn count beats footprint. At 100 commands the footprint is 18,897 tokens a turn and the arithmetic flips.

### Context cost

Exact token counts. Baseline first-turn input with no brindle interface: 7,614 tokens.

Always loaded, added to every turn:

| Condition | 9 commands | 32 commands | 100 commands |
| --- | --- | --- | --- |
| `cli-bare` | 4 | 0 | 0 |
| `cli-hint` | 26 | 26 | 24 |
| `cli-clip` | 40 | 36 | 32 |
| `cli-clip-signatures` | 38 | 36 | 34 |
| `mcp-deferred` | 922 | 1,287 | 2,359 |
| `mcp-eager` | 1,709 | 6,064 | 18,897 |

The `cli-bare` row is zero by construction, so its 4 tokens at nine commands set the noise floor: treat differences under about 5 tokens as nothing. Eager MCP grows at roughly 189 tokens per command, deferred at 16.

Loaded on demand:

| Artifact | 9 commands | 32 commands | 100 commands |
| --- | --- | --- | --- |
| `brindle --help` | 345 | 1,188 | 3,732 |
| `brindle load queue --help` | 209 | | |
| CLIP schema, one command | 381 | | |
| `cli-clip` `SKILL.md` | 558 | 1,526 | 4,426 |
| `cli-clip-signatures` `SKILL.md` | 745 | 2,233 | 6,629 |
| MCP tool definitions | 1,623 | 5,954 | 18,720 |
| `schema.json` | 2,235 | 7,844 | 24,357 |

The signature format costs 33% to 50% more to load than the current skill. It still comes out ahead, because it replaces a `--help` call and usually a schema read: at 100 commands, 6,629 tokens against 4,426 plus 3,732 for the help text the current skill sends the agent to anyway.

`schema.json` remains the most expensive artifact in the eval, and the agent read it 9 times in 24 runs the first time round. Per-command retrieval, [#12](https://github.com/mcclowes/clip/issues/12), is still worth doing: one command is 381 tokens against 24,357 for the whole file at 100 commands.

### What this means for CLIP

1. **Ship argument signatures.** It's the only change here that improved every ease-of-use metric at once, and it's cheap. [#11](https://github.com/mcclowes/clip/issues/11).
2. **Make schema retrieval per-command.** The whole-file read is the largest single cost any condition pays, and one command is 1.6% of it. [#12](https://github.com/mcclowes/clip/issues/12).
3. **The discovery claim needs the honest caveat.** A schema makes an unfamiliar CLI usable for about 36 tokens, but only when nothing else points at the tool. Once a prompt names it, a current model finds it alone. The value is the prompts that don't name it, which is most real prompts, and generating pointers across tools and agents so nobody hand-writes them.
4. **"Costs less context than MCP" holds against eager loading and is now mixed against deferred.** Deferred MCP's always-loaded cost is 922 tokens against 38, but its per-call cost is lower than a whole-schema read. The comparison turns on retrieval granularity, which is exactly what #12 is about.
5. **Don't lean on mutation markers as a safety claim.** Nothing in 90 runs needed them. Their value is fewer permission prompts: `clip permissions` would have removed two in three on read tasks.

### Not yet measured

- A rerun of the ease-of-use matrix at three trials. One trial per cell was the cost of covering every new scenario inside the session budget, and it leaves the ordering directional.
- Tools the model already knows (`git`, `gh`), where a schema likely adds less.
- A real MCP server against its CLI, such as GitHub's. Real servers carry longer descriptions, so eager costs will be higher than here.
- Weaker models, where mutation markers and argument detail should matter more. Haiku cannot defer tools.
- Other agent harnesses. Two Claude Code patch releases moved the baseline by 10,000 tokens and flipped a headline result, so treat any single-harness number as perishable.

### Schema authoring comparison

Issue [#38](https://github.com/mcclowes/clip/issues/38) adds an authoring run alongside the interface matrix. The drafter gets only an installed CLI, the bundled `clip-schema-authoring` skill, and `clip`; it reads help, writes a schema, and lints it. The result records lint errors and warnings, every drafted mutation marker against the hand-written schema, and the drafter's token use.

For Brindle, the same task matrix then runs with the hand-written and agent-drafted schemas through the shipped skill renderer. The report splits task success and token metrics by schema. Real, unregistered tools can use the same draft-and-compare command with a hand-written truth schema, although they do not have Brindle's deterministic task fixture.

---

## First run (18 September 2026)

Claude Code 2.1.276, Sonnet, 3 trials per cell, eight commands, 24 cells per condition. Kept because the harness prompt halved between this run and the second, which explains most of the difference.

- CLIP took an unfamiliar CLI from 9 of 24 passes to 24 of 24, for 36 tokens of always-loaded context.
- The `cli-hint` control also passed 24 of 24, so the gain was discovery, not the skill body.
- MCP was the easiest interface to use, with about half the tool calls and no usage errors.
- CLIP's on-demand cost was the highest of any interface, because `schema.json` is read whole.

| Condition | Pass | Tool calls | Discovery calls | Usage errors | Cumulative input (median) | Seconds (median) |
| --- | --- | --- | --- | --- | --- | --- |
| `cli-bare` | 9/24 | 6.3 | 2.4 | 0 | 111,655 | 28.8 |
| `cli-hint` | 24/24 | 3.5 | 2.0 | 1 | 72,544 | 11.6 |
| `cli-clip` | 24/24 | 4.0 | 1.7 | 5 | 77,490 | 11.6 |
| `mcp-eager` | 24/24 | 2.0 | 0 | 0 | 47,812 | 4.9 |
| `mcp-deferred` | 24/24 | 3.0 | 1.0 | 0 | 57,587 | 7.2 |

Baseline first-turn input was 17,350 tokens, against 7,614 in the second run. Peak context was 18,700 to 19,500, against 8,700 to 9,800. Cumulative input fell by roughly two thirds across the board for the same work.

The diagnosis of why the CLIP skill underperformed still holds, and is what [#11](https://github.com/mcclowes/clip/issues/11) fixes: `SKILL.md` listed command names without arguments, so agents guessed (`load cancel --id`, or omitting `--reason`), ran `--help` anyway in 7 runs, or read the schema in 9. All 9 schema reads went to the path in the `Source:` line rather than the skill's own copy.
