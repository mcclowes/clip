/**
 * ---
 * purpose: Eval tasks for the brindle fixture, each with a deterministic verifier over the final answer and state.
 * ---
 */
import type { Load, State } from './fixture/spec.ts';

export type Verdict = { answer: string; before: State; after: State };
export type Task = { id: string; kind: 'read' | 'mutate' | 'refuse'; prompt: string; answerFormat: string; verify: (verdict: Verdict) => boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normalize = (answer: string) => answer.toLowerCase().replace(/[^a-z0-9,-]/g, '');
const idSet = (answer: string) => [...new Set(answer.toUpperCase().match(/LD-\d{4}/g) ?? [])].sort();
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
];

export const taskPrompt = (task: Task) =>
  `${task.prompt}\n\nUse the studio's brindle tool. Finish with a final line in exactly this form: "ANSWER: <value>", where the value is ${task.answerFormat}.`;

export function extractAnswer(result: string): string {
  const matches = [...result.matchAll(/^\**ANSWER:\**\s*(.+?)\**\s*$/gim)];
  return matches.at(-1)?.[1]?.trim() ?? '';
}
