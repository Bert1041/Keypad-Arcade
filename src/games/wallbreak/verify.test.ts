import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { NO_INPUT, createWallbreak, tick, type WallbreakInput } from './logic/wallbreak';
import { replayRun, type WallbreakReplay } from './verify';

/**
 * Serves, follows the ball for `playMs`, then moves the paddle away until the run ends; records
 * input changes as the scene does.
 */
function play(seed: number, playMs = 40_000) {
  const random = seededRandom(seed);
  const state = createWallbreak(random);
  const replay: WallbreakReplay = { v: 1, input: [] };
  let recorded: WallbreakInput = NO_INPUT;
  for (let step = 1; !state.over && step < 200_000; step++) {
    const ball = state.balls[0];
    const following = step * (1000 / 60) < playMs;
    const input: WallbreakInput = {
      targetX: Math.round(following && ball ? ball.x + 6 : 20),
      axis: 0,
      serve: state.serving && step % 30 === 0,
    };
    if (
      input.targetX !== recorded.targetX ||
      input.axis !== recorded.axis ||
      input.serve !== recorded.serve
    ) {
      replay.input.push([step, input.targetX, input.axis, input.serve ? 1 : 0]);
      recorded = input;
    }
    tick(state, input, random);
  }
  return { state, replay };
}

describe('Wallbreak replays', () => {
  it('reproduce a played run’s score exactly', () => {
    for (const seed of [1, 42, 9999]) {
      const { state, replay } = play(seed);
      expect(state.over).toBe(true);
      expect(state.score).toBeGreaterThan(100);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for different input or another seed', () => {
    const { state, replay } = play(7);
    const played = { ok: true, score: state.score };
    const shifted = {
      v: 1,
      input: replay.input.map(([s, x, a, serve]) => [s, x === null ? null : x + 30, a, serve]),
    };
    expect(replayRun(seededRandom(7), shifted)).not.toEqual(played);
    expect(replayRun(seededRandom(8), replay)).not.toEqual(played);
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      { v: 1 },
      { v: 1, input: [[1, 10, 0]] },
      { v: 1, input: [[0, 10, 0, 0]] },
      {
        v: 1,
        input: [
          [2, 10, 0, 0],
          [2, 11, 0, 0],
        ],
      },
      { v: 1, input: [[1, 10.5, 0, 0]] },
      { v: 1, input: [[1, 10, 2, 0]] },
      { v: 1, input: [[1, 10, 0, 2]] },
      { v: 1, input: [[1, 99_999, 0, 0]] },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay)).toEqual({
        ok: false,
        reason: 'not a Wallbreak replay',
      });
    }
  });

  it('reject inputs after the run ended, and a run that never ends', () => {
    const { replay } = play(3);
    const extra = { v: 1, input: [...replay.input, [107_000, 0, 0, 0]] };
    expect(replayRun(seededRandom(3), extra)).toEqual({
      ok: false,
      reason: 'inputs after the run ended',
    });
    // Never served: the ball waits on the paddle for ever.
    expect(replayRun(seededRandom(3), { v: 1, input: [] })).toEqual({
      ok: false,
      reason: 'the run never ended',
    });
  });
});
