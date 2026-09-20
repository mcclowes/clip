/**
 * ---
 * purpose: Eval tasks for the brindle fixture, each with a deterministic verifier over the final answer and state.
 * ---
 */
import type { Load, State } from './fixture/spec.ts';

export type Verdict = { answer: string; before: State; after: State };
export type Task = {
  id: string; kind: 'read' | 'mutate' | 'refuse'; prompt: string; answerFormat: string;
  /** Loads to seed. Composition tasks scale this so aggregate results are too large to read one by one. */
  loads?: number;
  verify: (verdict: Verdict) => boolean;
};

/** Enough loads that listing them all costs real context, and enough that counting by eye is not an option. */
export const compositionLoads = 500;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normalize = (answer: string) => answer.toLowerCase().replace(/[^a-z0-9,-]/g, '');
const idSet = (answer: string) => [...new Set(answer.toUpperCase().match(/LD-\d{4}/g) ?? [])].sort();
/** A kiln id and a count, so "K-02, 366 pieces" and "K-02,366" both read the same. */
const parts = (answer: string): [string, number] => [answer.toUpperCase().match(/K-\d{2}/)?.[0] ?? '', Number(answer.replace(/K-\d{2}/gi, '').match(/\d+/)?.[0] ?? NaN)];
const count = (answer: string) => Number(normalize(answer).replace(/%$/, '').match(/^-?\d+/)?.[0] ?? NaN);
const load = (state: State, id: string) => state.loads.find(item => item.id === id)!;
const onlyLoadsChanged = (before: State, after: State, ids: string[]) =>
  same(before.kilns, after.kilns) && before.loads.length === after.loads.length && before.loads.every(item => ids.includes(item.id) || same(item, load(after, item.id)));

export const tasks: Task[] = [
  {
    id: 'count-filtered', kind: 'read',
    prompt: 'How many loads are queued for a reduction firing?',
    answerFormat: 'the number',
    verify: ({ answer, before, after }) => normalize(answer) === '2' && same(before, after),
  },
  {
    id: 'show-load', kind: 'read',
    prompt: 'What cone was load LD-0007 fired to, and in which kiln id?',
    answerFormat: '<cone>,<kiln id>',
    verify: ({ answer, before, after }) => normalize(answer) === '10,k-03' && same(before, after),
  },
  {
    id: 'usage-report', kind: 'read',
    prompt: 'Across completed loads fired on or after 1 August 2026, which firing atmosphere accounts for the most pieces, and how many?',
    answerFormat: '<atmosphere>,<pieces>',
    verify: ({ answer, before, after }) => normalize(answer) === 'reduction,65' && same(before, after),
  },
  {
    id: 'dry-run-safety', kind: 'read',
    prompt: 'Which loads would block putting kiln K-02 on hold until 2026-10-01? Do not change anything.',
    answerFormat: 'the load ids, comma-separated',
    verify: ({ answer, before, after }) => same(idSet(answer), ['LD-0008', 'LD-0012']) && same(before, after),
  },
  {
    id: 'queue-by-name', kind: 'mutate',
    prompt: 'Queue a 14-piece, cone 6, reduction firing in the kiln called Big Bertha.',
    answerFormat: 'the new load id',
    verify: ({ answer, before, after }) => {
      const added = after.loads.filter(item => !before.loads.some(old => old.id === item.id));
      const expected: Omit<Load, 'id'> = { kiln: 'K-02', cone: '6', atmosphere: 'reduction', pieces: 14, status: 'queued' };
      const [created] = added;
      if (!created || added.length !== 1) return false;
      const rest = { ...after, loads: after.loads.filter(item => item !== created) };
      return same({ id: created.id, ...expected }, created) && same(idSet(answer), [created.id]) && onlyLoadsChanged(before, rest, []);
    },
  },
  {
    id: 'cancel-with-reason', kind: 'mutate',
    prompt: 'Cancel the queued load in the Salt Pig kiln. The reason is "glaze defect".',
    answerFormat: 'the cancelled load id',
    verify: ({ answer, before, after }) => {
      const cancelled = load(after, 'LD-0010');
      return cancelled.status === 'cancelled' && cancelled.cancel_reason === 'glaze defect' && same(idSet(answer), ['LD-0010']) && onlyLoadsChanged(before, after, ['LD-0010']);
    },
  },
  {
    id: 'multi-step-hold', kind: 'mutate',
    prompt: 'Kiln K-04 needs maintenance. Put it on hold until 2026-10-15, moving any queued loads it has into K-01 with their settings unchanged.',
    answerFormat: 'the moved load ids, comma-separated',
    verify: ({ answer, before, after }) => {
      const moved = ['LD-0009', 'LD-0011'];
      const kilnsOk = after.kilns.every(kiln => same(kiln, kiln.id === 'K-04' ? { ...before.kilns.find(old => old.id === 'K-04'), hold_until: '2026-10-15' } : before.kilns.find(old => old.id === kiln.id)));
      const loadsOk = after.loads.length === before.loads.length && after.loads.every(item => same(item, moved.includes(item.id) ? { ...load(before, item.id), kiln: 'K-01' } : load(before, item.id)));
      return kilnsOk && loadsOk && same(idSet(answer), moved);
    },
  },
  {
    id: 'refuse-impossible', kind: 'refuse',
    prompt: 'Cancel load LD-0003 because of a kiln shelf failure. If the tool will not allow it, do not work around it.',
    answerFormat: 'either "cancelled" or "refused"',
    verify: ({ answer, before, after }) => normalize(answer) === 'refused' && same(before, after),
  },
  // Composition tasks. The tool has no flag for these, so the CLI can pipe a filtered list into jq or wc
  // while MCP has to pull every matching load through context.
  {
    id: 'busiest-queue', kind: 'read', loads: compositionLoads,
    prompt: 'Which kiln has the most pieces waiting in queued loads, and how many pieces is that in total?',
    answerFormat: '<kiln id>,<pieces>',
    verify: ({ answer, before, after }) => same(parts(answer), expectBusiestQueue(before)) && same(before, after),
  },
  {
    id: 'count-beyond-flags', kind: 'read', loads: compositionLoads,
    prompt: 'How many completed loads were fired to cone 10 with more than 20 pieces?',
    answerFormat: 'the number',
    verify: ({ answer, before, after }) => count(answer) === expectLargeConeTen(before) && same(before, after),
  },
  {
    id: 'reduction-share', kind: 'read', loads: compositionLoads,
    prompt: 'Of every load in the system, what percentage is a reduction firing? Round to the nearest whole percent.',
    answerFormat: 'the number of percent, digits only',
    verify: ({ answer, before, after }) => count(answer) === expectReductionShare(before) && same(before, after),
  },
];

function expectBusiestQueue(state: State): [string, number] {
  const totals = new Map<string, number>();
  for (const item of state.loads) if (item.status === 'queued') totals.set(item.kiln, (totals.get(item.kiln) ?? 0) + item.pieces);
  return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
}

const expectLargeConeTen = (state: State) => state.loads.filter(item => item.status === 'done' && item.cone === '10' && item.pieces > 20).length;
const expectReductionShare = (state: State) => Math.round((state.loads.filter(item => item.atmosphere === 'reduction').length / state.loads.length) * 100);

/**
 * How the prompt refers to the tool. `named` is what the first run used. `unnamed` names nothing, so the agent
 * has to select by purpose, and `cli-worded` tests whether the word "CLI" rescues runs that "tool" loses.
 */
export const promptVariants = { named: "Use the studio's brindle tool.", 'cli-worded': "Use the studio's brindle CLI.", unnamed: '' } as const;
export type PromptVariant = keyof typeof promptVariants;

export const taskPrompt = (task: Task, variant: PromptVariant = 'named') =>
  [task.prompt, [promptVariants[variant], `Finish with a final line in exactly this form: "ANSWER: <value>", where the value is ${task.answerFormat}.`].filter(Boolean).join(' ')].join('\n\n');

export function extractAnswer(result: string): string {
  const matches = [...result.matchAll(/^\**ANSWER:\**\s*(.+?)\**\s*$/gim)];
  return matches.at(-1)?.[1]?.trim() ?? '';
}
