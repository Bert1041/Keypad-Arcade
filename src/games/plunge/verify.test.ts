import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { createPlunge, tick } from './logic/plunge';
import { replayRun, type PlungeReplay } from './verify';

/** Rolls one way, then the other, now and then stopping; records as the scene does. */
function play(seed: number, period = 50) {
  const random = seededRandom(seed);
  const state = createPlunge(random);
  const replay: PlungeReplay = { v: 1, input: [] };
  let recorded = 0;
  for (let step = 1; !state.over && step < 200_000; step++) {
    const phase = Math.floor(step / period) % 5;
    const axis = phase === 4 ? 0 : phase % 2 === 0 ? 1 : -1;
    if (axis !== recorded) {
      replay.input.push([step, axis]);
      recorded = axis;
    }
    tick(state, { axis }, random);
  }
  return { state, replay };
}

describe('Plunge replays', () => {
  it('reproduce a played run’s score exactly', () => {
    for (const seed of [1, 42, 9999]) {
      const { state, replay } = play(seed);
      expect(state.over).toBe(true);
      expect(state.score).toBeGreaterThan(0);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for different input or another seed', () => {
    const { state, replay } = play(7);
    const played = { ok: true, score: state.score };
    const mirrored = { v: 1, input: replay.input.map(([s, a]) => [s, -a]) };
    expect(replayRun(seededRandom(7), mirrored)).not.toEqual(played);
    expect(replayRun(seededRandom(8), replay)).not.toEqual(played);
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      { v: 1 },
      { v: 2, input: [] },
      { v: 1, input: [[0, 1]] },
      {
        v: 1,
        input: [
          [3, 1],
          [3, -1],
        ],
      },
      { v: 1, input: [[1, 2]] },
      { v: 1, input: [[1, 0.5]] },
      { v: 1, input: [['1', 1]] },
      { v: 1, input: [[1, 1, 1]] },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay)).toEqual({
        ok: false,
        reason: 'not a Plunge replay',
      });
    }
  });

  it('reject inputs after the run ended', () => {
    const { replay } = play(3);
    const extra = { v: 1, input: [...replay.input, [107_000, 0]] };
    expect(replayRun(seededRandom(3), extra)).toEqual({
      ok: false,
      reason: 'inputs after the run ended',
    });
  });
});
