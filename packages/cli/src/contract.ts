/**
 * ---
 * purpose: Describe CLIP's public command contract for offline introspection and help.
 * ---
 */
const arg = (name: string, description: string, required = false) => ({ name, type: 'string', description, required });
const syncArgs = [
  arg('--skills-dir', 'Destination directory; defaults to .agents/skills.'),
  { ...arg('--target', 'What to synchronize; defaults to all.'), enum: ['all', 'skills', 'agents-md'], default: 'all' },
  arg('--agents-file', 'File holding the pointer block; defaults to AGENTS.md.'),
];
export const contract = {
  name: 'clip', version: '0.4.0', description: 'Register CLI tools and share their capabilities with agents.',
  command_layout: 'flat', output: { tty: 'text', piped: 'json' },
  global_args: [
    { name: '--output', aliases: ['-o'], type: 'string', enum: ['auto', 'json', 'text'], default: 'auto', description: 'Output format.' },
    { name: '--limit', type: 'integer', default: 100, description: 'Maximum list results, between 1 and 10000.' },
    { name: '--scope', type: 'string', enum: ['local', 'shared', 'global'], description: 'Configuration scope for registration changes; defaults to local inside a project and global elsewhere.' },
    { name: '--help', aliases: ['-h'], type: 'boolean', description: 'Describe the command interface.' },
    { name: '--version', type: 'boolean', description: 'Show CLIP version.' },
  ],
  commands: [
    { name: 'discover', description: 'List installed tools that have a registry schema, without running them. A query or --all searches every executable on PATH.', mutating: false, args: [arg('query', 'Optional name filter across all of PATH.'), { name: '--all', type: 'boolean', description: 'List every executable on PATH.', required: false }] },
    { name: 'register', description: 'Register or update an installed tool. Probes execute only when explicitly requested.', mutating: true, args: [arg('executable', 'Executable name or path.', true), arg('--purpose', 'When agents should use this tool.', true), arg('--schema', 'Local JSON capability file.'), arg('--profile', 'Show agents only this named command subset from the schema.'), { ...arg('--probe', 'Run a native introspection command.'), enum: ['schema', 'capabilities'] }] },
    { name: 'list', description: 'List registered tools.', mutating: false, args: [] },
    { name: 'ui', description: 'Manage registered tools and browse the registry in an interactive terminal.', mutating: true, args: [] },
    { name: 'remove', description: 'Remove a registration; run sync to clean generated skills.', mutating: true, args: [arg('name', 'Registered tool name.', true)] },
    { name: 'schema', description: 'Describe CLIP offline.', mutating: false, args: [] },
    { name: 'capabilities', description: 'Alias for CLIP schema introspection.', mutating: false, args: [] },
    { name: 'schema show', description: 'Inspect a community schema and its provenance.', mutating: false, args: [arg('id', 'Registry entry ID.', true)] },
    { name: 'schema init', description: 'Write an editable draft schema without overwriting an existing file.', mutating: true, args: [arg('name', 'Tool name.', true), arg('--purpose', 'Tool purpose.', true), arg('--file', 'New JSON file path.', true)] },
    { name: 'sync', description: 'Create or refresh owned skills, including the bundled schema authoring skill, and the AGENTS.md pointer block, and remove stale owned skills.', mutating: true, args: syncArgs },
    { name: 'refresh', description: 'Reload file and native schemas, show registry changes that would reach agents, and synchronize accepted updates.', mutating: true, args: [...syncArgs, arg('--accept', 'Accept this pending registry update; repeatable.'), { name: '--accept-all', type: 'boolean', description: 'Accept every pending registry update, for CI.', required: false }] },
    { name: 'doctor', description: 'Check executables and registered schema sources for drift without changing files.', mutating: false, args: [] },
    { name: 'commands', description: 'List the project commands in .clip/commands.md, or .saggar/commands.md until it moves, with what each one does.', mutating: false, args: [arg('--file', 'Commands file; defaults to the project\'s.')] },
    { name: 'commands check', description: 'Check the commands file for decorator conflicts and manifest drift. --strict also requires effects and exits 1 on drift. Reports on stdout.', mutating: false, args: [arg('--file', 'Commands file; defaults to the project\'s.'), { name: '--strict', type: 'boolean', description: 'Treat manifest drift as errors and require an effect decorator for every shell command.', required: false }] },
    { name: 'commands init', description: 'Write a commands file seeded from local task manifests, without overwriting an existing one.', mutating: true, args: [arg('--file', 'New file path; defaults to .clip/commands.md.')] },
    { name: 'lint', description: 'Check a schema file, registered tool, or registry entry offline for skill size, argument and mutation coverage, bounded examples, and instruction-like text. Exits 1 on errors, with the report on stdout.', mutating: false, args: [arg('target', 'Schema file path, registered tool name, or registry entry ID.', true)] },
    { name: 'permissions', description: 'Propose agent allow rules for registered commands marked mutating: false, from reviewed bundled schemas or tools you trust. Prints the rules it would add; writes only with --write. Everything else keeps prompting.', mutating: true, args: [
      { ...arg('--target', 'Agent settings format; defaults to claude.'), enum: ['claude'], default: 'claude' },
      arg('--trust', 'Also include this unreviewed registered tool; repeatable.'),
      arg('--file', 'Settings file; defaults to .claude/settings.local.json in the project.'),
      { name: '--write', type: 'boolean', description: 'Merge the proposed rules into the settings file.', required: false },
    ] },
    { name: 'registry search', description: 'Search the bundled, versioned community catalog.', mutating: false, args: [arg('query', 'Optional search text.')] },
    { name: 'registry add', description: 'Add an installed executable to CLIP with a verified community schema. Does not install or run the executable.', mutating: true, args: [arg('id', 'Registry entry ID.', true), arg('--purpose', 'When agents should use this tool.', true), arg('--profile', 'Show agents only this named command subset from the schema.')] },
  ],
  errors: [{ kind: 'invalid_request', exit_code: 1, retryable: false, description: 'Invalid input, unavailable executable, invalid schema, or local I/O failure; read message for remediation.' }],
};
