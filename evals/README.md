# Evals

Measures two claims: that agents use a CLI more easily with a CLIP skill, and that CLIP costs less context than MCP. See [the findings](../docs/evals.md) and [issue #10](https://github.com/mcclowes/clip/issues/10).

## Design

One fictional tool, `brindle`, is exposed through every interface from a single spec (`fixture/spec.ts`), so the help text, CLIP schema, and MCP tools describe identical commands. It's fictional so training data can't stand in for the schema. Its `--help` documents everything the schema does.

| Condition | What the agent gets |
| --- | --- |
| `cli-bare` | `brindle` on PATH, nothing else |
| `cli-hint` | `brindle` on PATH plus one system prompt line saying so, standing in for a CLAUDE.md mention |
| `cli-clip` | `brindle` on PATH plus the skill from the real `clip register` and `clip sync` |
| `cli-clip-signatures` | The same, rendered by the eval's own signature renderer with `schema.json` beside it, as proposed in [#11](https://github.com/mcclowes/clip/issues/11) before it shipped |
| `cli-clip-index` | The shipped renderer with its index forced at any size: `SKILL.md` lists group files, and usage lines live in `commands/<group>.md` ([#12](https://github.com/mcclowes/clip/issues/12)) |
| `cli-clip-no-examples` | The shipped renderer with every example stripped, so the first example beside each read command can be measured ([#20](https://github.com/mcclowes/clip/issues/20)) |
| `mcp-eager` | An MCP server with tool schemas loaded upfront |
| `mcp-deferred` | The same server with schemas deferred behind tool search |

## Skill formats

`skill-formats.ts` holds one renderer per proposed skill format, and each becomes its own condition, so a format can be measured before `packages/cli` changes. `current` calls the real `clip register` and `clip sync` and keeps the plain `cli-clip` name; every other format `x` is the condition `cli-clip-x`. A renderer gets the skills directory, the CLIP schema, its path on disk, and the resolved executable, and writes whatever skill it wants:

```ts
{ id: 'signatures', summary: '…', render: ({ schema, purpose, executable, skillsDir }) => { /* write SKILL.md */ } }
```

Adding an entry to `skillFormats` is enough; the conditions list, the task matrix, and the context report pick it up. A renderer can import `packages/cli/src/skill-render.ts` and pass it options, which is how `cli-clip-index` measures the large-tool path on a small fixture.

Each run is headless Claude Code (`claude -p`) in a fresh temp directory with `--setting-sources project --strict-mcp-config`, so your global skills, plugins, and MCP servers stay out. Built-in tools are fixed at Bash, Read, and Skill, plus ToolSearch for `mcp-deferred`. State lives outside the working directory; touching it directly fails the run.

Tasks in `tasks.ts` cover filtered reads, a report, a dry run that must not mutate, mutations that need an id lookup, a multi-step change, and a request the tool refuses. A deterministic verifier checks the final `ANSWER:` line and the resulting state.

`brindle log` is shaped like `git log` with every flag renamed and `--limit` made required, so the `stale-priors` task measures whether an interface corrects a confident guess from training data. The `tempting-cancel` and `tempting-move` tasks are read-only asks that never say "do not change anything", and the mutation they invite would succeed, so `mutating: true` and MCP's `destructiveHint` have something to prevent.

Composition tasks run against a scaled fixture (500 loads, appended to the 13 hand-written ones by a fixed-seed generator) and ask for aggregates the tool has no flag for, so a CLI can pipe a listing into `jq` while MCP has to pull it back through context. `runs.jsonl` records tool-result tokens, estimated from result text at four characters per token.

## Prompt variants and distractors

`--prompts` picks how a prompt refers to the tool: `named` ("the studio's brindle tool", what the first run used), `cli-worded` ("brindle CLI"), or `unnamed`, which names nothing so the agent has to select by purpose. `--distractors` adds 20 unrelated fictional tools in whichever namespace the condition uses: skills for the CLI conditions, a second MCP server for the MCP ones. Both default off, so the main matrix keeps its size.

## Run

Requires the `claude` CLI, logged in. Runs use your Claude quota, so every scenario is selectable and worth targeting. The full matrix at three trials is 315 sessions; the second run instead spent 234 across the four commands below.

```sh
npm run eval -- tasks --trials 1 --out evals/results/v2-smoke
npm run eval -- context --out evals/results/v2-context
npm run eval -- tasks --tasks count-filtered,usage-report,tempting-move --prompts unnamed --distractors --trials 3
npm run eval -- tasks --conditions cli-bare --tasks count-filtered,usage-report,stale-priors --prompts named,cli-worded --trials 3
npm run eval:report -- evals/results/<directory>
```

A skill format that changes shape with tool size needs tasks at that size. `--commands 100` pads `brindle` with inert clones for every condition, as `context` does, while the tasks still target the original nine commands:

```sh
npm run eval -- tasks --conditions cli-hint,cli-clip,cli-clip-index --commands 100 --trials 1
```

Options: `--model` (default `sonnet`; tool search deferral doesn't work on Haiku), `--trials`, `--commands` (tool size for `tasks`, defaulting to the fixture's nine commands), `--concurrency`, `--conditions`, `--tasks`, `--prompts`, `--distractors`, `--sizes` (command counts for `context`, defaulting to the fixture size then 32 and 100), `--require-version`, and `--out`. Unknown condition and prompt names fail fast rather than running nothing, and `context` measures only the conditions you pass. Raw results and transcripts go to `evals/results/`, which isn't committed.

## Claude Code version

Every run prints the installed Claude Code version at the start and records it on every `runs.jsonl` and `context.jsonl` row, because the harness prompt changes between patch releases and can move a result on its own ([#30](https://github.com/mcclowes/clip/issues/30)). `--require-version 2.1.278` makes a rerun meant to reproduce an earlier result fail fast instead of quietly measuring something else.

`eval:report` refuses to report across more than one version, and counts rows written before this existed as `unknown`. Pass `--allow-mixed-versions` to report anyway; the header then says so in bold.

## Metrics

- **Pass**: verifier result. A run that makes no tool call can't pass.
- **Tool calls** and **discovery calls**: discovery is `--help`, a skill load, a read of `SKILL.md`, `schema.json`, or a skill's `commands/` file, or a tool search.
- **Errors per run**: tool results flagged as errors, such as nonzero exits and MCP errors.
- **Unsafe mutations**: state changed on a task that should leave it alone.
- **Cumulative input**: input tokens summed over every turn, which is what you pay for. **Peak context** is the largest single turn.
- **Tool-result tokens**: result text at four characters per token, so output flowing back through context is visible separately from prompt cost.
- **Spread**: pass rates carry a Wilson 95% interval, and `±` on a median is half the interquartile range. Both are wide at three trials, which is the honest width for three trials.
- **Always loaded** context: first-turn input minus a baseline with no brindle interface.
- **Loaded on demand** context: exact token count of each artifact, measured as the first-turn input delta when it's appended to a prompt.

## Limits

One fixture, one agent harness, and a small trial count. A fictional tool measures the upper bound of a schema's value; on tools the model already knows, expect less. The MCP server is minimal, so real servers with longer descriptions cost more per tool.

Two things bite harder than they look. Claude Code spills oversized tool results to a file, so any interface with Bash can read a large result back with `jq` rather than pulling it through context, which blunts the composition tasks. And the harness prompt itself moves between patch releases: 2.1.276 to 2.1.278 halved it and flipped a headline result, which is why every row carries its version and the report won't mix them.
