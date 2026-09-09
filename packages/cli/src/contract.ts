/**
 * ---
 * purpose: Describe CLIP's public command contract for offline introspection and help.
 * ---
 */
const arg = (name: string, description: string, required = false) => ({ name, type: 'string', description, required });
export const contract = {
  name: 'clip', version: '0.1.0', description: 'Register CLI tools and share their capabilities with agents.',
  command_layout: 'flat', output: { tty: 'text', piped: 'json' },
  global_args: [
    { name: '--output', aliases: ['-o'], type: 'string', enum: ['auto', 'json', 'text'], default: 'auto', description: 'Output format.' },
    { name: '--limit', type: 'integer', default: 100, description: 'Maximum list results, between 1 and 10000.' },
    { name: '--scope', type: 'string', enum: ['local', 'shared', 'global'], description: 'Configuration scope for registration changes; defaults to local inside a project and global elsewhere.' },
    { name: '--help', aliases: ['-h'], type: 'boolean', description: 'Describe the command interface.' },
    { name: '--version', type: 'boolean', description: 'Show CLIP version.' },
  ],
  commands: [
    { name: 'discover', description: 'List executables on PATH without running them.', mutating: false, args: [arg('query', 'Optional name filter.')] },
    { name: 'register', description: 'Register or update an installed tool. Probes execute only when explicitly requested.', mutating: true, args: [arg('executable', 'Executable name or path.', true), arg('--purpose', 'When agents should use this tool.', true), arg('--schema', 'Local JSON capability file.'), { ...arg('--probe', 'Run a native introspection command.'), enum: ['schema', 'capabilities'] }] },
    { name: 'list', description: 'List registered tools.', mutating: false, args: [] },
    { name: 'ui', description: 'Manage registered tools and browse the registry in an interactive terminal.', mutating: true, args: [] },
    { name: 'remove', description: 'Remove a registration; run sync to clean generated skills.', mutating: true, args: [arg('name', 'Registered tool name.', true)] },
    { name: 'schema', description: 'Describe CLIP offline.', mutating: false, args: [] },
    { name: 'capabilities', description: 'Alias for CLIP schema introspection.', mutating: false, args: [] },
    { name: 'schema show', description: 'Inspect a community schema and its provenance.', mutating: false, args: [arg('id', 'Registry entry ID.', true)] },
    { name: 'schema init', description: 'Write an editable draft schema without overwriting an existing file.', mutating: true, args: [arg('name', 'Tool name.', true), arg('--purpose', 'Tool purpose.', true), arg('--file', 'New JSON file path.', true)] },
    { name: 'sync', description: 'Create or refresh owned skills, and remove stale owned skills.', mutating: true, args: [arg('--skills-dir', 'Destination directory; defaults to .agents/skills.')] },
    { name: 'refresh', description: 'Reload registered schemas from their sources, then synchronize skills.', mutating: true, args: [arg('--skills-dir', 'Destination directory; defaults to .agents/skills.')] },
    { name: 'doctor', description: 'Check executables and registered schema sources for drift without changing files.', mutating: false, args: [] },
    { name: 'registry search', description: 'Search the bundled, versioned community catalog.', mutating: false, args: [arg('query', 'Optional search text.')] },
    { name: 'registry add', description: 'Add an installed executable to CLIP with a verified community schema. Does not install or run the executable.', mutating: true, args: [arg('id', 'Registry entry ID.', true), arg('--purpose', 'When agents should use this tool.', true)] },
  ],
  errors: [{ kind: 'invalid_request', exit_code: 1, retryable: false, description: 'Invalid input, unavailable executable, invalid schema, or local I/O failure; read message for remediation.' }],
};
