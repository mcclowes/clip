/**
 * ---
 * purpose: The bundled skill that guides an agent through drafting a capability schema from a tool's help text, with clip lint as the check.
 * related:
 *   - ./skills.ts - Writes this skill beside tool skills on every sync.
 *   - ./lint.ts - The checks the skill loops on; its test lints the worked example.
 * ---
 */
import type { Schema } from './schema.ts';

export const authoringSkillName = 'clip-schema-authoring';

/** Must lint clean, so the skill never teaches a shape lint then rejects. */
export const workedExample: Schema = {
  name: 'mytool',
  description: 'Manage deployments',
  commands: [
    {
      name: 'deploy list',
      description: 'List deployments, newest first',
      mutating: false,
      args: [
        { name: '--limit', type: 'integer', default: 20, description: 'Maximum deployments to show.' },
        { name: '--json', type: 'boolean', description: 'Print JSON.' },
      ],
      examples: ['mytool deploy list --limit 5 --json'],
    },
    {
      name: 'deploy create',
      description: 'Start a deployment of the current directory',
      mutating: true,
      args: [{ name: '--env', type: 'string', required: true, enum: ['staging', 'production'], description: 'Target environment.' }],
    },
    {
      name: 'deploy logs',
      description: 'Show logs for one deployment',
      mutating: false,
      args: [
        { name: 'id', type: 'string', required: true, positional: true, description: 'Deployment ID.' },
        { name: '--tail', type: 'integer', description: 'Show only the last N lines.' },
      ],
      examples: ['mytool deploy logs d-42 --tail 50'],
    },
  ],
};

const body = `# Draft a CLIP schema from --help

Use this when someone wants an installed CLI described for agents and CLIP has no schema for it. CLIP supplies the checks; you do the drafting.

## Before drafting

1. Run \`clip registry search <tool>\`. If the registry has it, use \`clip registry add <id> --purpose "..."\` and stop.
2. If the tool's own docs say it prints a machine-readable schema, use \`clip register <tool> --purpose "..." --probe schema\` (or \`capabilities\`) and stop.
3. Ask what the tool is for in this project if you don't know. The purpose decides which commands matter.

## Read the help safely

Running \`--help\` executes the tool. Keep to help invocations only:

- \`<tool> --help\`, \`<tool> <subcommand> --help\`, or the tool's documented \`help <subcommand>\` or \`-h\`.
- Never run a subcommand without a help flag, and pass nothing else. No real arguments, files, or credentials.
- Stop and tell the person if help output prompts for input, changes files, or looks like the command ran.
- \`man <tool>\` is fine where it exists.

Walk the tree from the top: read the root help, then the help for each subcommand the purpose needs, recursing into groups. For a large CLI, cover what the purpose needs rather than every command; \`clip lint\` warns when the skill gets too big.

## Write the schema

Start the file with \`clip schema init <tool> --purpose "..." --file <tool>.json\`, then fill \`commands\`:

- \`name\`: the words after the tool name, such as \`deploy list\`. Use \`subcommands\` for groups if you prefer nesting.
- \`description\`: one plain sentence describing what the command does. Paraphrase help text; don't copy prose that addresses the reader, and put links in a top-level \`documentation\` field.
- \`args\`: every flag and positional the help lists, with \`type\`, \`required\`, \`enum\`, \`default\`, and \`aliases\` where the help says. Set \`"args": []\` only when help shows there are none.
- \`mutating\`: \`false\` only when help makes clear the command only reads (list, show, get, status, diff, log). \`true\` when it creates, changes, deletes, sends, installs, or logs in. When unsure, leave it out: missing means unknown, which is safer than a wrong \`false\`.
- \`examples\`: read commands lead with an example that invokes the tool, runs that exact command, caps output with the command's limit flag, and asks for its machine-readable form when it has one. One invocation only: no pipes, redirects, chaining, or \`$(...)\`. Use example.com for hosts. Don't invent flags to satisfy this; if the tool has no limit or JSON flag, the example doesn't need one.

A clean example:

\`\`\`json
${JSON.stringify(workedExample, null, 2)}
\`\`\`

## Check until clean

Run \`clip lint <tool>.json\` after each round of edits:

- A structural problem (bad JSON, missing name or description, duplicate command) fails with an error on stderr. Fix it first.
- Otherwise the report lists issues with \`at\`, \`rule\`, and \`message\`. Fix every error, then every warning you can.
- Re-run until \`healthy\` is true. Warnings you leave need a reason, such as a tool with no JSON output; tell the person which and why.

Check each fix against the help text, not against the linter. Never mark a command read-only just to clear a warning.

## Hand over

Show the person the mutating and unknown commands for review, then register and sync:

\`\`\`sh
clip register <tool> --purpose "..." --schema <tool>.json
clip sync
\`\`\`
`;

const description = 'Draft a CLIP capability schema for an installed CLI that has none, by reading its --help output and looping on clip lint until clean.';

export function authoringSkill(): Map<string, string> {
  return new Map([['SKILL.md', `---\nname: ${authoringSkillName}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`]]);
}
