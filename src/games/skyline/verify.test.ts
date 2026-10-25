import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { NO_INPUT, createSkyline, hookAt, tick, topX } from './logic/skyline';
import { replayRun, type SkylineReplay } from './verify';

/** Plays a run the way the scene does, dropping when the floor is near the top, every `miss`th
 *  floor dropped at once (far off). Records the replay as the scene does. */
function play(seed: number, missEvery = 4) {
  const random = seededRandom(seed);
  const state = createSkyline(random);
  const replay: SkylineReplay = { v: 1, drops: [] };
  for (let step = 1; state.phase !== 'over' && step < 200_000; step++) {
    const lined = Math.abs(hookAt(state).x - topX(state)) < 3;
    const early = state.drops % missEvery === 0 && state.timeMs - state.hook.spawnMs < 40;
    const drop = state.phase === 'swinging' && (lined || early);
    if (drop) replay.drops.push(step);
    tick(state, { drop }, random);
  }
  return { state, replay };
}

describe('Skyline replays', () => {
  it('reproduce a played run’s score exactly', () => {
    for (const seed of [1, 42, 9999]) {
      const { state, replay } = play(seed);
      expect(state.phase).toBe('over');
      expect(state.score).toBeGreaterThan(0);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for different inputs or a different seed', () => {
    // Past 20 floors, where the seed's wind moves where a lined-up floor lands. (Below that the
    // seed only picks which end each floor starts from, and a lined-up tap is the same step from
    // either end — so two seeds can score the same on a short run, legitimately.)
    const { state, replay } = play(7, 15);
    expect(state.floors.length).toBeGreaterThan(25);
    const played = { ok: true, score: state.score };
    // Every other tap missing: each floor drops on the tap meant for the one after it.
    const fewer = { ...replay, drops: replay.drops.filter((_, i) => i % 2 === 0) };
    expect(replayRun(seededRandom(7), fewer)).not.toEqual(played);
    expect(replayRun(seededRandom(8), replay)).not.toEqual(played);
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      42,
      'drops',
      { v: 2, drops: [] },
      { v: 1 },
      { v: 1, drops: [3, 3] },
      { v: 1, drops: [5, 2] },
      { v: 1, drops: [0] },
      { v: 1, drops: [1.5] },
      { v: 1, drops: ['10'] },
      { v: 1, drops: [999_999_999] },
      { v: 1, drops: Array.from({ length: 200_000 }, (_, i) => i + 1) },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay), JSON.stringify(replay)?.slice(0, 40)).toEqual({
        ok: false,
        reason: 'not a Skyline replay',
      });
    }
  });

  it('reject a run that never ends, and inputs after the end', () => {
    expect(replayRun(seededRandom(1), { v: 1, drops: [] })).toEqual({
      ok: false,
      reason: 'the run never ended',
    });
    const { replay } = play(3);
    const extra = { v: 1, drops: [...replay.drops, 100_000] };
    expect(replayRun(seededRandom(3), extra)).toEqual({
      ok: false,
      reason: 'inputs after the run ended',
    });
  });

  it('a whole run replays in well under a server’s time budget', () => {
    const { replay } = play(5, 50);
    const start = performance.now();
    replayRun(seededRandom(5), replay);
    expect(performance.now() - start).toBeLessThan(200);
    expect(NO_INPUT.drop).toBe(false);
  });
});
