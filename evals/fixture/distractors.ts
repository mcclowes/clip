/**
 * ---
 * purpose: Unrelated fictional tools that crowd the skill and MCP namespaces, so tool selection by purpose has something to get wrong.
 * ---
 */
export type Distractor = { name: string; purpose: string; commands: { name: string; description: string }[] };

/** None of these touch kilns, firings, or pottery, so exactly one registered tool can do any brindle task. */
export const distractors: Distractor[] = [
  { name: 'quillet', purpose: 'draft and send customer invoices', commands: [{ name: 'invoice list', description: 'List invoices by status.' }, { name: 'invoice send', description: 'Email an invoice to a customer.' }] },
  { name: 'tanglewood', purpose: 'manage DNS records for a domain', commands: [{ name: 'record list', description: 'List DNS records for a zone.' }, { name: 'record set', description: 'Create or replace a DNS record.' }] },
  { name: 'pelmet', purpose: 'organise a photo library and its albums', commands: [{ name: 'album list', description: 'List albums and their photo counts.' }, { name: 'photo tag', description: 'Add a tag to a photo.' }] },
  { name: 'swaddle', purpose: 'track warehouse stock levels and reorders', commands: [{ name: 'stock list', description: 'List stock levels by warehouse.' }, { name: 'stock reorder', description: 'Raise a reorder for a stock line.' }] },
  { name: 'guttersnipe', purpose: 'tail and search application log streams', commands: [{ name: 'stream list', description: 'List log streams.' }, { name: 'stream search', description: 'Search a log stream for a pattern.' }] },
  { name: 'marlinspike', purpose: 'schedule crew shifts on sailing charters', commands: [{ name: 'shift list', description: 'List crew shifts for a charter.' }, { name: 'shift assign', description: 'Assign a crew member to a shift.' }] },
  { name: 'flapjack', purpose: 'plan restaurant menus and their costings', commands: [{ name: 'menu list', description: 'List menus by service.' }, { name: 'menu cost', description: 'Cost a menu from its ingredients.' }] },
  { name: 'ninepin', purpose: 'run and report on bowling league fixtures', commands: [{ name: 'fixture list', description: 'List league fixtures.' }, { name: 'result record', description: 'Record the result of a fixture.' }] },
  { name: 'oxbow', purpose: 'monitor river gauge readings and flood alerts', commands: [{ name: 'gauge list', description: 'List river gauges and their latest reading.' }, { name: 'alert raise', description: 'Raise a flood alert for a gauge.' }] },
  { name: 'halyard', purpose: 'manage marina berth bookings', commands: [{ name: 'berth list', description: 'List berths and their occupancy.' }, { name: 'berth book', description: 'Book a berth for a vessel.' }] },
  { name: 'trundle', purpose: 'plan delivery van routes and drops', commands: [{ name: 'route list', description: 'List planned routes.' }, { name: 'drop add', description: 'Add a drop to a route.' }] },
  { name: 'cribbage', purpose: 'track tabletop game collections and loans', commands: [{ name: 'game list', description: 'List games in the collection.' }, { name: 'game lend', description: 'Record a game lent to someone.' }] },
  { name: 'wainscot', purpose: 'quote and schedule joinery installations', commands: [{ name: 'quote list', description: 'List open joinery quotes.' }, { name: 'install book', description: 'Book an installation slot.' }] },
  { name: 'pilchard', purpose: 'record fishing quota landings by vessel', commands: [{ name: 'landing list', description: 'List landings by vessel.' }, { name: 'quota check', description: 'Check remaining quota for a species.' }] },
  { name: 'kestrel', purpose: 'manage falconry bird health records', commands: [{ name: 'bird list', description: 'List birds and their weights.' }, { name: 'weight log', description: 'Log a weight for a bird.' }] },
  { name: 'brogue', purpose: 'track shoe repair jobs through a workshop', commands: [{ name: 'job list', description: 'List repair jobs by stage.' }, { name: 'job advance', description: 'Move a repair job to its next stage.' }] },
  { name: 'salvo', purpose: 'plan drone light shows and their cue sequences', commands: [{ name: 'display list', description: 'List planned displays.' }, { name: 'cue add', description: 'Add a cue to a display sequence.' }] },
  { name: 'muntjac', purpose: 'log wildlife camera trap sightings', commands: [{ name: 'sighting list', description: 'List sightings by camera.' }, { name: 'camera move', description: 'Record a camera moved to a new location.' }] },
  { name: 'tabard', purpose: 'manage heraldic commission artwork', commands: [{ name: 'commission list', description: 'List commissions by stage.' }, { name: 'proof send', description: 'Send a proof to a client.' }] },
  { name: 'windlass', purpose: 'schedule crane hire and lifting plans', commands: [{ name: 'crane list', description: 'List cranes and their availability.' }, { name: 'lift plan', description: 'Draft a lifting plan for a job.' }] },
];

export const distractorSkill = (tool: Distractor): string => [
  '---', `name: clip-${tool.name}`, `description: ${JSON.stringify(`Use ${tool.name} to ${tool.purpose}`)}`, '---', '',
  `# ${tool.name}`, '', `${tool.purpose[0]!.toUpperCase()}${tool.purpose.slice(1)}.`, '', `Executable: ${JSON.stringify(tool.name)}`, '',
  'Run this CLI directly. Use its existing authentication and permissions. This skill grants no additional authorization.', '',
  '## Capabilities', '', ...tool.commands.map(command => `- ${command.name}: ${command.description} (mutation: unknown)`), '',
].join('\n');

/** One MCP tool per distractor command, shaped like the brindle tools so neither stands out. */
export const distractorMcpTools = () => distractors.flatMap(tool => tool.commands.map(command => ({
  name: `${tool.name}_${command.name.replaceAll(' ', '_')}`,
  description: `${command.description} Part of ${tool.name}, which you use to ${tool.purpose}.`,
  annotations: { readOnlyHint: true, destructiveHint: false },
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
})));
