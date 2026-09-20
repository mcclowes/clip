/**
 * ---
 * purpose: Seed, load, and save brindle state, which lives outside the agent's working directory.
 * ---
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { UsageError, validate, type Command, type Load, type State, type Values } from './spec.ts';

const baseSeed = (): State => ({
  kilns: [
    { id: 'K-01', name: 'Little Wren', capacity: 16 },
    { id: 'K-02', name: 'Big Bertha', capacity: 40 },
    { id: 'K-03', name: 'Salt Pig', capacity: 24 },
    { id: 'K-04', name: 'Old Faithful', capacity: 12 },
  ],
  loads: [
    { id: 'LD-0001', kiln: 'K-01', cone: '06', atmosphere: 'oxidation', pieces: 14, status: 'done', fired_on: '2026-07-19' },
    { id: 'LD-0002', kiln: 'K-02', cone: '10', atmosphere: 'reduction', pieces: 31, status: 'done', fired_on: '2026-08-04' },
    { id: 'LD-0003', kiln: 'K-02', cone: '10', atmosphere: 'reduction', pieces: 36, status: 'firing' },
    { id: 'LD-0004', kiln: 'K-03', cone: '6', atmosphere: 'neutral', pieces: 20, status: 'done', fired_on: '2026-08-11' },
    { id: 'LD-0005', kiln: 'K-01', cone: '6', atmosphere: 'oxidation', pieces: 16, status: 'done', fired_on: '2026-08-20' },
    { id: 'LD-0006', kiln: 'K-04', cone: '04', atmosphere: 'oxidation', pieces: 9, status: 'cooling' },
    { id: 'LD-0007', kiln: 'K-03', cone: '10', atmosphere: 'reduction', pieces: 22, status: 'done', fired_on: '2026-09-02' },
    { id: 'LD-0008', kiln: 'K-02', cone: '6', atmosphere: 'reduction', pieces: 28, status: 'queued' },
    { id: 'LD-0009', kiln: 'K-04', cone: '6', atmosphere: 'oxidation', pieces: 10, status: 'queued' },
    { id: 'LD-0010', kiln: 'K-03', cone: '10', atmosphere: 'reduction', pieces: 18, status: 'queued' },
    { id: 'LD-0011', kiln: 'K-04', cone: '06', atmosphere: 'neutral', pieces: 7, status: 'queued' },
    { id: 'LD-0012', kiln: 'K-02', cone: '04', atmosphere: 'oxidation', pieces: 25, status: 'queued' },
    { id: 'LD-0013', kiln: 'K-01', cone: '10', atmosphere: 'reduction', pieces: 12, status: 'done', fired_on: '2026-09-10' },
  ],
});

export const baseLoadCount = baseSeed().loads.length;

/** Fixed-seed PRNG, so a scaled fixture is identical on every machine and run. */
function random(state: number): () => number {
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(next: () => number, items: readonly T[]) => items[Math.floor(next() * items.length)]!;

/**
 * Seeds `loads` firing loads. The first 13 are hand-written and every existing task depends on them,
 * so extra loads are appended rather than mixed in.
 */
export function seed(loads = baseLoadCount): State {
  const state = baseSeed();
  if (loads < baseLoadCount) throw new Error(`The fixture needs at least ${baseLoadCount} loads.`);
  const next = random(20260918);
  const statuses = ['queued', 'firing', 'cooling', 'done', 'done', 'done'] as const;
  const cones = ['06', '04', '6', '10'] as const;
  const atmospheres = ['oxidation', 'reduction', 'neutral'] as const;
  for (let index = baseLoadCount; index < loads; index++) {
    const kiln = pick(next, state.kilns);
    const status = pick(next, statuses);
    const load: Load = {
      id: `LD-${String(index + 1).padStart(4, '0')}`,
      kiln: kiln.id, cone: pick(next, cones), atmosphere: pick(next, atmospheres),
      pieces: 1 + Math.floor(next() * kiln.capacity), status,
    };
    if (status === 'done') load.fired_on = `2026-0${5 + Math.floor(next() * 5)}-${String(1 + Math.floor(next() * 28)).padStart(2, '0')}`;
    state.loads.push(load);
  }
  return state;
}

function statePath(): string {
  const path = process.env.BRINDLE_STATE;
  if (!path) throw new UsageError('BRINDLE_STATE is not set.');
  return path;
}

export const readState = (path = statePath()): State => JSON.parse(readFileSync(path, 'utf8'));
export const writeState = (state: State, path = statePath()) => writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);

export function execute(command: Command, values: Values): unknown {
  const state = readState();
  const result = command.run(state, validate(command, values));
  if (command.mutating) writeState(state);
  return result;
}

export const extraCommands = () => Number(process.env.BRINDLE_EXTRA_COMMANDS ?? 0);
