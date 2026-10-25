import type { ReplayRun } from '@/games/types';
import { NO_INPUT, createRaid, tick, type RaidInput } from './logic/raid';

/**
 * A Star Raid run as the scene records it: each change of input, with the step number (1 = the
 * run's first step) from which it applies. A dragged finger is whole pixels (null when no finger
 * is down); the keys are -1, 0 or 1.
 */
export interface RaidReplay {
  v: 1;
  input: [step: number, targetX: number | null, axis: number][];
}

/** The longest run accepted: 30 minutes of steps. */
const MAX_STEPS = 30 * 60 * 60;
/** A finger can drag the ship target well off-screen; the rules clamp the ship. */
const MAX_TARGET = 5000;

function isReplay(value: unknown): value is RaidReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, input } = value as Partial<RaidReplay>;
  if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS) return false;
  let previous = 0;
  for (const change of input as unknown[]) {
    if (!Array.isArray(change) || change.length !== 3) return false;
    const [at, targetX, axis] = change as unknown[];
    if (!Number.isInteger(at) || (at as number) <= previous || (at as number) > MAX_STEPS) {
      return false;
    }
    const target =
      targetX === null || (Number.isInteger(targetX) && Math.abs(targetX as number) <= MAX_TARGET);
    if (!target || (axis !== -1 && axis !== 0 && axis !== 1)) return false;
    previous = at as number;
  }
  return true;
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Star Raid replay' };
  const state = createRaid();
  let input: RaidInput = NO_INPUT;
  let next = 0;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const change = replay.input[next];
    if (change && change[0] === step) {
      input = { targetX: change[1], axis: change[2] };
      next += 1;
    }
    tick(state, input, random);
    if (!state.alive) {
      return next === replay.input.length
        ? { ok: true, score: state.score }
        : { ok: false, reason: 'inputs after the run ended' };
    }
  }
  return { ok: false, reason: 'the run never ended' };
};
