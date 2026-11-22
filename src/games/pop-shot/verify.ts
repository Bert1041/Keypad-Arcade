import type { ReplayRun } from '@/games/types';
import { NO_INPUT, createPopShot, tick, type PopShotInput } from './logic/popShot';

/**
 * A Pop Shot run as the scene records it: each change of input, with the step number (1 = the
 * run's first step) from which it applies — the point aimed at (whole px) and whether fire is
 * pressed (0 or 1). Before the first change the aim is straight up, not firing.
 */
export interface PopShotReplay {
  v: 1;
  input: [step: number, aimX: number, aimY: number, fire: number][];
}

/** The longest run accepted: 30 minutes of steps. */
const MAX_STEPS = 30 * 60 * 60;
const MAX_AIM = 5000;

const isAim = (n: unknown) => Number.isInteger(n) && Math.abs(n as number) <= MAX_AIM;

function isReplay(value: unknown): value is PopShotReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, input } = value as Partial<PopShotReplay>;
  if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS) return false;
  let previous = 0;
  for (const change of input as unknown[]) {
    if (!Array.isArray(change) || change.length !== 4) return false;
    const [step, aimX, aimY, fire] = change as unknown[];
    if (!Number.isInteger(step) || (step as number) <= previous || (step as number) > MAX_STEPS) {
      return false;
    }
    if (!isAim(aimX) || !isAim(aimY) || (fire !== 0 && fire !== 1)) return false;
    previous = step as number;
  }
  return true;
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Pop Shot replay' };
  const state = createPopShot(random);
  let input: PopShotInput = NO_INPUT;
  let next = 0;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const change = replay.input[next];
    if (change && change[0] === step) {
      input = { aimX: change[1], aimY: change[2], fire: change[3] === 1 };
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
