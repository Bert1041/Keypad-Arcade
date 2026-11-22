import type { ReplayRun } from '@/games/types';
import { createPairs, tick } from './logic/pairs';

/**
 * A Pairs run as the scene records it: every card tapped, with the step number (1 = the run's
 * first step) it was tapped on. Taps on cards that cannot turn are recorded too and ignored
 * again by the rules, exactly as in play.
 */
export interface PairsReplay {
  v: 1;
  taps: [step: number, card: number][];
}

/** The longest run accepted: 30 minutes of steps (the clock alone caps a run near 99 s plus bonuses). */
const MAX_STEPS = 30 * 60 * 60;
const MAX_CARD = 36;

function isReplay(value: unknown): value is PairsReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, taps } = value as Partial<PairsReplay>;
  if (v !== 1 || !Array.isArray(taps) || taps.length > MAX_STEPS) return false;
  let previous = 0;
  for (const tap of taps as unknown[]) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [step, card] = tap as unknown[];
    if (!Number.isInteger(step) || (step as number) <= previous || (step as number) > MAX_STEPS) {
      return false;
    }
    if (!Number.isInteger(card) || (card as number) < 0 || (card as number) >= MAX_CARD) {
      return false;
    }
    previous = step as number;
  }
  return true;
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Pairs replay' };
  const state = createPairs(random);
  let next = 0;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const tap = replay.taps[next];
    const card = tap && tap[0] === step ? tap[1] : null;
    if (card !== null) next += 1;
    tick(state, { tap: card }, random);
    if (state.over) {
      return next === replay.taps.length
        ? { ok: true, score: state.score }
        : { ok: false, reason: 'inputs after the run ended' };
    }
  }
  return { ok: false, reason: 'the run never ended' };
};
