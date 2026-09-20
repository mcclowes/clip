# Evals

Measures two claims: that agents use a CLI more easily with a CLIP skill, and that CLIP costs less context than MCP. See [the findings](../docs/evals.md) and [issue #10](https://github.com/mcclowes/clip/issues/10).

## Design

One fictional tool, `brindle`, is exposed through every interface from a single spec (`fixture/spec.ts`), so the help text, CLIP schema, and MCP tools describe identical commands. It's fictional so training data can't stand in for the schema. Its `--help` documents everything the schema does.

| Condition | What the agent gets |
| --- | --- |
| `cli-bare` | `brindle` on PATH, nothing else |
| `cli-hint` | `brindle` on PATH plus one system prompt line saying so, standing in for a CLAUDE.md mention |
| `cli-clip` | `brindle` on PATH plus the skill from the real `clip register` and `clip sync` |
| `cli-clip-signatures` | The same, rendered with compact argument signatures and a relative schema path ([#11](https://github.com/mcclowes/clip/issues/11)) |
| `mcp-eager` | An MCP server with tool schemas loaded upfront |
| `mcp-deferred` | The same server with schemas deferred behind tool search |

## Skill formats

`skill-formats.ts` holds one renderer per proposed skill format, and each becomes its own condition, so a format can be measured before `packages/cli` changes. `current` calls the real `clip register` and `clip sync` and keeps the plain `cli-clip` name; every other format `x` is the condition `cli-clip-x`. A renderer receives the skills directory, the CLIP schema, its path on disk, and the resolved executable, and writes whatever skill it wants:

```ts
{ id: 'signatures', summary: '…', render: ({ schema, purpose, executable, skillsDir }) => { /* write SKILL.md */ } }
```

Adding an entry to `skillFormats` is enough; the conditions list, the task matrix, and the context report pick it up.

Each run is headless Claude Code (`claude -p`) in a fresh temp directory with `--setting-sources project --strict-mcp-config`, so your global skills, plugins, and MCP servers stay out. Built-in tools are fixed at Bash, Read, and Skill, plus ToolSearch for `mcp-deferred`. State lives outside the working directory; touching it directly fails the run.

Tasks in `tasks.ts` cover filtered reads, a report, a dry run that must not mutate, mutations that need an id lookup, a multi-step change, and a request the tool refuses. A deterministic verifier checks the final `ANSWER:` line and the resulting state.

Composition tasks run against a scaled fixture (500 loads, appended to the 13 hand-written ones by a fixed-seed generator) and ask for aggregates the tool has no flag for, so a CLI can pipe a listing into `jq` while MCP has to pull it back through context. `runs.jsonl` records tool-result tokens, estimated from result text at four characters per token.

## Prompt variants and distractors

`--prompts` picks how a prompt refers to the tool: `named` ("the studio's brindle tool", what the first run used), `cli-worded` ("brindle CLI"), or `unnamed`, which names nothing so the agent has to select by purpose. `--distractors` adds 20 unrelated fictional tools in whichever namespace the condition uses — skills for the CLI conditions, a second MCP server for the MCP ones. Both default off, so the main matrix keeps its size.

## Run

Requires the `claude` CLI, logged in. Runs use your Claude quota: the full task matrix is 120 Sonnet sessions.

```sh
npm run eval -- tasks --trials 3
npm run eval -- context
npm run eval -- tasks --conditions cli-hint,cli-clip --tasks queue-by-name --trials 1
npm run eval:report -- evals/results/<directory>
```

Options: `--model` (default `sonnet`; tool search deferral doesn't work on Haiku), `--trials`, `--concurrency`, `--conditions`, `--tasks`, `--sizes` (command counts for `context`), and `--out`. Raw results and transcripts go to `evals/results/`, which isn't committed.

## Metrics

- **Pass**: verifier result. A run that makes no tool call can't pass.
- **Tool calls** and **discovery calls**: discovery is `--help`, a skill load, a read of `SKILL.md` or `schema.json`, or a tool search.
- **Errors per run**: tool results flagged as errors, such as nonzero exits and MCP errors.
- **Unsafe mutations**: state changed on a task that should leave it alone.
- **Cumulative input**: input tokens summed over every turn, which is what you pay for. **Peak context** is the largest single turn.
- **Always loaded** context: first-turn input minus a baseline with no brindle interface.
- **Loaded on demand** context: exact token count of each artifact, measured as the first-turn input delta when it's appended to a prompt.

## Limits

One fixture, one agent harness, and a small trial count. A fictional tool measures the upper bound of a schema's value; on tools the model already knows, expect less. The MCP server is minimal, so real servers with longer descriptions cost more per tool.
