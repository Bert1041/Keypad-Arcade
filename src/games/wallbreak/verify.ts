import type { ReplayRun } from '@/games/types';
import { NO_INPUT, createWallbreak, tick, type WallbreakInput } from './logic/wallbreak';

/**
 * A Wallbreak run as the scene records it: each change of input, with the step number (1 = the
 * run's first step) from which it applies — where the finger is (whole px, or null), the keys
 * (-1, 0, 1), and whether serve is pressed (0 or 1).
 */
export interface WallbreakReplay {
  v: 1;
  input: [step: number, targetX: number | null, axis: number, serve: number][];
}

/** The longest run accepted: 30 minutes of steps. */
const MAX_STEPS = 30 * 60 * 60;
const MAX_TARGET = 5000;

function isReplay(value: unknown): value is WallbreakReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, input } = value as Partial<WallbreakReplay>;
  if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS) return false;
  let previous = 0;
  for (const change of input as unknown[]) {
    if (!Array.isArray(change) || change.length !== 4) return false;
    const [step, targetX, axis, serve] = change as unknown[];
    if (!Number.isInteger(step) || (step as number) <= previous || (step as number) > MAX_STEPS) {
      return false;
    }
    const target =
      targetX === null || (Number.isInteger(targetX) && Math.abs(targetX as number) <= MAX_TARGET);
    if (!target || (axis !== -1 && axis !== 0 && axis !== 1) || (serve !== 0 && serve !== 1)) {
      return false;
    }
    previous = step as number;
  }
  return true;
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Wallbreak replay' };
  const state = createWallbreak(random);
  let input: WallbreakInput = NO_INPUT;
  let next = 0;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const change = replay.input[next];
    if (change && change[0] === step) {
      input = { targetX: change[1], axis: change[2], serve: change[3] === 1 };
      next += 1;
    }
    tick(state, input, random);
    if (state.over) {
      return next === replay.input.length
        ? { ok: true, score: state.score }
        : { ok: false, reason: 'inputs after the run ended' };
    }
  }
  return { ok: false, reason: 'the run never ended' };
};
