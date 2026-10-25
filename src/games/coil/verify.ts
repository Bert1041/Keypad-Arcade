import type { ReplayRun } from '@/games/types';
import { COLS, ROWS, createCoil, queueTurn, step, type CoilState, type Dir } from './logic/coil';

/**
 * A Coil run as the scene records it: every turn the player made, with the number of steps
 * taken before it. Turns pass through queueTurn exactly as in play, so ignored ones (a reversal,
 * a full queue) are ignored again.
 */
export interface CoilReplay {
  v: 1;
  turns: [step: number, dir: 'u' | 'd' | 'l' | 'r'][];
}

const DIRS: Record<string, Dir> = { u: 'up', d: 'down', l: 'left', r: 'right' };
/** The most steps a run can take: every cell twice over is far beyond a perfect game. */
const MAX_STEPS = COLS * ROWS * 40;
const MAX_TURNS = 20_000;

function isReplay(value: unknown): value is CoilReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, turns } = value as Partial<CoilReplay>;
  if (v !== 1 || !Array.isArray(turns) || turns.length > MAX_TURNS) return false;
  let previous = 0;
  for (const turn of turns as unknown[]) {
    if (!Array.isArray(turn) || turn.length !== 2) return false;
    const [at, dir] = turn as unknown[];
    if (!Number.isInteger(at) || (at as number) < previous || (at as number) > MAX_STEPS) {
      return false;
    }
    if (typeof dir !== 'string' || !(dir in DIRS)) return false;
    previous = at as number;
  }
  return true;
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Coil replay' };
  let state: CoilState = createCoil(random, COLS, ROWS);
  let next = 0;
  for (let taken = 0; taken <= MAX_STEPS; taken++) {
    for (let turn = replay.turns[next]; turn && turn[0] === taken; turn = replay.turns[next]) {
      const dir = DIRS[turn[1]];
      if (dir) state = queueTurn(state, dir);
      next += 1;
    }
    state = step(state, random).state;
    if (!state.alive) {
      return next === replay.turns.length
        ? { ok: true, score: state.score }
        : { ok: false, reason: 'inputs after the run ended' };
    }
  }
  return { ok: false, reason: 'the run never ended' };
};
