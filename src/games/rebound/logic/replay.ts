import type { Level } from './level';
import {
  NO_INPUT,
  STEP_MS,
  createRebound,
  tick,
  type ReboundEvent,
  type ReboundInput,
} from './rebound';

/** Hold an input for `ms`. A level's solution is a list of these. */
export interface ScriptStep {
  ms: number;
  move?: number;
  jump?: boolean;
}

/**
 * Turns a script into one input per simulation step. The only definition of how long a step
 * lasts: the tests and the e2e-driven game both use it, so they cannot drift apart (they did,
 * when each counted milliseconds its own way).
 */
export function* scriptInputs(steps: readonly ScriptStep[]): Generator<ReboundInput> {
  for (const step of steps) {
    const ticks = Math.round(step.ms / STEP_MS);
    const input: ReboundInput = { move: step.move ?? 0, jump: step.jump ?? false };
    for (let i = 0; i < ticks; i++) yield input;
  }
}

/**
 * Plays a scripted input sequence through one level and reports what happened. Used to prove
 * every level can be finished: each ships with a solution, replayed in the tests.
 */
export function playScript(level: Level, script: readonly ScriptStep[]) {
  const state = createRebound([level]);
  const events: ReboundEvent[] = [];
  for (const input of scriptInputs(script)) {
    events.push(...tick(state, input));
    if (state.levelCleared || state.over) return { state, events };
  }
  // Keep the last moment going a little, as a player holding still would.
  events.push(...tick(state, NO_INPUT));
  return { state, events };
}
