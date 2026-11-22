import type { ReplayRun } from '@/games/types';
import { NO_INPUT, createPlunge, tick, type PlungeInput } from './logic/plunge';

/**
 * A Plunge run as the scene records it: each change of the direction held (-1, 0, 1), with the
 * step number (1 = the run's first step) from which it applies.
 */
export interface PlungeReplay {
  v: 1;
  input: [step: number, axis: number][];
}

/** The longest run accepted: 30 minutes of steps (the shaft outruns any ball after ~10). */
const MAX_STEPS = 30 * 60 * 60;

function isReplay(value: unknown): value is PlungeReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, input } = value as Partial<PlungeReplay>;
  if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS) return false;
  let previous = 0;
  for (const change of input as unknown[]) {
    if (!Array.isArray(change) || change.length !== 2) return false;
    const [step, axis] = change as unknown[];
    if (!Number.isInteger(step) || (step as number) <= previous || (step as number) > MAX_STEPS) {
      return false;
    }
    if (axis !== -1 && axis !== 0 && axis !== 1) return false;
    previous = step as number;
  }
  return true;
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Plunge replay' };
  const state = createPlunge(random);
  let input: PlungeInput = NO_INPUT;
  let next = 0;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const change = replay.input[next];
    if (change && change[0] === step) {
      input = { axis: change[1] };
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
