import type { ReplayRun } from '@/games/types';
import { createSkyline, tick } from './logic/skyline';

/**
 * A Skyline run as the scene records it: the step numbers (1 = the run's first step) on which
 * the player dropped. Nothing else reaches the rules, so this and the seed replay the run.
 */
export interface SkylineReplay {
  v: 1;
  drops: number[];
}

/** The longest run accepted: 30 minutes of steps. */
const MAX_STEPS = 30 * 60 * 60;

function isReplay(value: unknown): value is SkylineReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, drops } = value as Partial<SkylineReplay>;
  if (v !== 1 || !Array.isArray(drops) || drops.length > MAX_STEPS) return false;
  let previous = 0;
  for (const step of drops as unknown[]) {
    if (!Number.isInteger(step) || (step as number) <= previous || (step as number) > MAX_STEPS) {
      return false;
    }
    previous = step as number;
  }
  return true;
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Skyline replay' };
  const state = createSkyline(random);
  let next = 0;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const drop = replay.drops[next] === step;
    if (drop) next += 1;
    tick(state, { drop }, random);
    if (state.phase === 'over') {
      return next === replay.drops.length
        ? { ok: true, score: state.score }
        : { ok: false, reason: 'inputs after the run ended' };
    }
  }
  return { ok: false, reason: 'the run never ended' };
};
