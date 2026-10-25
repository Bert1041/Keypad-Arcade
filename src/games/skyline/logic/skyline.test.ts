import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import type { RandomFn } from '@/games/types';
import {
  BONUS_EVERY,
  DROP_PX,
  FLOOR_W,
  MAX_SWAY,
  NEXT_FLOOR_MS,
  NO_INPUT,
  PERFECT_PX,
  ROPE_FROM,
  STEP_MS,
  SWAY_MS,
  WIND,
  WIND_FROM,
  basePeriodMs,
  createSkyline,
  crossSpeed,
  hookAt,
  spawn,
  tick,
  type SkylineEvent,
  type SkylineState,
} from './skyline';

const never = () => {
  throw new Error('no randomness expected here');
};

/** Returns the given numbers in order, then repeats them. */
function sequence(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

/** A tower `height` floors tall, all centred, with a floor swinging (no wind, no lean). */
function tower(height: number): SkylineState {
  const state = createSkyline(sequence(0.9, 0.9, 0, 0, 0));
  state.floors = Array.from({ length: height }, () => ({ x: 0, color: 0 }));
  return state;
}

/**
 * Puts a floor just above the top, at rest, at `x`: the next tick lands it there, at `atMs`
 * (by default 0, when the sway is at its centre).
 */
function dropAt(state: SkylineState, x: number, atMs = 0): SkylineEvent[] {
  state.timeMs = atMs - STEP_MS;
  state.phase = 'falling';
  state.falling = { x, y: DROP_PX - 0.001, vx: 0, vy: 0, color: 2 };
  return tick(state, NO_INPUT, sequence(0.5));
}

/** Ticks until something lands, or the run is over. */
function untilSettled(state: SkylineState, random: RandomFn = sequence(0.5)): SkylineEvent[] {
  for (let i = 0; i < 600; i++) {
    const events = tick(state, NO_INPUT, random);
    if (events.some((e) => ['perfect', 'land', 'miss'].includes(e.type))) return events;
  }
  throw new Error('nothing landed');
}

const types = (events: SkylineEvent[]) => events.map((e) => e.type);

/** A copy deep enough that ticking it leaves the original alone (much faster than structuredClone). */
function copy(state: SkylineState): SkylineState {
  return {
    ...state,
    floors: [...state.floors],
    hook: { ...state.hook },
    falling: state.falling && { ...state.falling },
  };
}

describe('landing', () => {
  it('within 8 px of the top floor is perfect; beyond is a plain landing', () => {
    expect(types(dropAt(tower(0), PERFECT_PX))).toEqual(['perfect']);
    expect(types(dropAt(tower(0), -PERFECT_PX))).toEqual(['perfect']);
    expect(types(dropAt(tower(0), PERFECT_PX + 0.01))).toEqual(['land']);
  });

  it('needs more than half the floor on the one below, or it falls off', () => {
    expect(types(dropAt(tower(0), FLOOR_W / 2 - 0.01))).toEqual(['land']);
    expect(types(dropAt(tower(0), FLOOR_W / 2))).toEqual(['miss']);
    expect(types(dropAt(tower(0), -FLOOR_W / 2))).toEqual(['miss']);
  });

  it('a perfect floor locks to the centre; a plain one stays where it landed', () => {
    const state = tower(1);
    state.floors[0] = { x: 20, color: 0 };
    dropAt(state, 26); // 6 off: perfect
    expect(state.floors.at(-1)?.x).toBe(20);
    dropAt(state, 50); // 30 off: lands at 50
    expect(state.floors.at(-1)?.x).toBe(50);
    expect(state.floors.at(-1)?.color).toBe(2);
  });

  it('is measured against the top floor, not the foundation', () => {
    const state = tower(1);
    state.floors[0] = { x: 30, color: 0 };
    expect(types(dropAt(state, 0))).toEqual(['land']); // 30 left of the top floor: still on
    expect(types(dropAt(tower(0), 0))).toEqual(['perfect']);
  });

  it('a dropped floor keeps 15% of the swing’s speed', () => {
    const state = tower(0);
    for (let i = 0; i < 30; i++) tick(state, NO_INPUT, never);
    const { x, vx } = hookAt({ ...state, timeMs: state.timeMs + STEP_MS });
    tick(state, { drop: true }, never);
    expect(Math.abs(vx)).toBeGreaterThan(50);
    expect(state.falling?.x).toBe(x);
    expect(state.falling?.vx).toBeCloseTo(vx * 0.15);
  });

  it('dropped when it is lined up over the tower, it lands — at every stage, either way', () => {
    // What a player sees is what they get: the moment the swinging floor passes over the top
    // floor's centre, a tap must land it comfortably on — within a quarter of a floor (with all
    // the swing's speed, it missed; at top speed one frame alone is ~5 px).
    const results: string[] = [];
    for (const height of [0, 10, 20, 30, 45, 60, 100]) {
      for (const side of [0.1, 0.9]) {
        const state = tower(height);
        spawn(state, sequence(side, 0.5, 0.5, 0, 0));
        state.wind = 0;
        let before = hookAt(state).x;
        for (;;) {
          const x = hookAt({ ...state, timeMs: state.timeMs + STEP_MS }).x;
          if (Math.sign(x) !== Math.sign(before)) break;
          before = x;
          tick(state, NO_INPUT, never);
        }
        tick(state, { drop: true }, never);
        const [landed] = untilSettled(state);
        const offset = landed?.type === 'land' ? Math.abs(landed.offset) : 0;
        if (landed?.type === 'miss' || offset > FLOOR_W / 4) {
          results.push(`height ${height}, side ${side}: ${landed?.type} ${offset.toFixed(1)}`);
        }
      }
    }
    expect(results).toEqual([]);
  });

  it('and carries it sideways as it falls: about speed × 0.32 s', () => {
    const state = tower(0);
    state.phase = 'falling';
    state.falling = { x: 0, y: 0, vx: 100, vy: 0, color: 0 };
    const [landed] = untilSettled(state);
    expect(landed?.type).toBe('land');
    expect(landed?.type === 'land' && landed.offset).toBeCloseTo(32, -0.5);
  });
});

describe('scoring', () => {
  it('a floor is 10; a perfect one adds 25 × the streak, up to × 5', () => {
    const state = tower(0);
    dropAt(state, 30);
    expect(state.score).toBe(10);
    const perfectScores: number[] = [];
    for (let i = 0; i < 6; i++) {
      dropAt(state, state.floors.at(-1)?.x ?? 0);
      perfectScores.push(state.score);
    }
    // +35, +60, +85, +110, +135, then capped: +135
    expect(perfectScores).toEqual([45, 105, 190, 300, 435, 570]);
    expect(state.streak).toBe(6);
  });

  it('any non-perfect landing, or a miss, resets the streak', () => {
    const landed = tower(0);
    dropAt(landed, 0);
    dropAt(landed, 20);
    expect(landed.streak).toBe(0);
    dropAt(landed, landed.floors.at(-1)?.x ?? 0);
    expect(landed.score).toBe(35 + 10 + 35); // the streak started again from × 1

    const missed = tower(0);
    dropAt(missed, 0);
    dropAt(missed, 60);
    expect(missed.streak).toBe(0);
  });

  it('every 10th floor pays 100 per floor still in hand, once — a miss after it pays nothing', () => {
    const state = tower(BONUS_EVERY - 1);
    state.inHand = 2;
    const events = dropAt(state, 20);
    expect(events).toContainEqual({ type: 'bonus', points: 200 });
    expect(state.score).toBe(10 + 200);

    // Already 10 floors: missing the 11th must not pay the 10th's bonus again.
    const missed = tower(BONUS_EVERY);
    expect(types(dropAt(missed, 60))).toEqual(['miss']);
    expect(missed.score).toBe(0);
  });
});

describe('floors in hand', () => {
  it('a miss costs one; losing the third ends the run and stops the clock', () => {
    const state = tower(0);
    dropAt(state, 60);
    dropAt(state, 60);
    expect(state.inHand).toBe(1);
    expect(state.phase).toBe('waiting');
    expect(types(dropAt(state, 60))).toEqual(['miss', 'over']);
    expect(state.phase).toBe('over');
    const at = state.timeMs;
    expect(tick(state, { drop: true }, never)).toEqual([]);
    expect(state.timeMs).toBe(at);
  });
});

describe('lean and sway', () => {
  it('an off-centre landing adds 0.3 × its offset; a perfect one halves it', () => {
    const state = tower(0);
    dropAt(state, 20);
    expect(state.lean).toBeCloseTo(6);
    dropAt(state, 20 - 30); // 30 off the new top
    expect(state.lean).toBeCloseTo(15);
    dropAt(state, -10);
    expect(state.lean).toBeCloseTo(7.5);
  });

  it('the top sways by the lean, at most 12 px, and a floor must land on where it is now', () => {
    const state = tower(0);
    state.lean = 40;
    // Landing a quarter of the way through the sway: the top is at its right extreme. Dropped on
    // the top floor's rest position, the floor is MAX_SWAY left of where the top is.
    const [landed] = dropAt(state, 0, SWAY_MS / 4);
    expect(landed?.type).toBe('land');
    expect(landed?.type === 'land' && landed.offset).toBeCloseTo(-MAX_SWAY);

    const moving = tower(0);
    moving.lean = 40;
    expect(types(dropAt(moving, MAX_SWAY, SWAY_MS / 4))).toEqual(['perfect']);
  });

  it('a straight tower does not sway', () => {
    // At the sway's extreme, a floor 20 px off lands exactly 20 px off.
    const [landed] = dropAt(tower(0), 20, SWAY_MS / 4);
    expect(landed?.type === 'land' && landed.offset).toBeCloseTo(20);
  });
});

describe('the crane', () => {
  it('starts each floor at one end of its swing, at rest, on the side the seed picks', () => {
    const right = tower(0);
    expect(hookAt(right).x).toBeCloseTo(right.hook.amplitude);
    expect(hookAt(right).vx).toBeCloseTo(0);
    const left = tower(0);
    spawn(left, sequence(0.1, 0, 0, 0, 0));
    expect(hookAt(left).x).toBeCloseTo(-left.hook.amplitude);
  });

  it('swings over the top floor, wherever the tower has drifted', () => {
    const state = tower(1);
    state.floors[0] = { x: 25, color: 0 };
    spawn(state, sequence(0.9, 0, 0, 0, 0));
    expect(hookAt(state).x).toBeCloseTo(25 + state.hook.amplitude);
  });

  it('hangs a new floor from the seed as soon as one lands, to swing 450 ms later', () => {
    const state = tower(0); // the first floor: right side, colour 0
    state.phase = 'falling';
    state.falling = { x: 0, y: DROP_PX - 0.001, vx: 0, vy: 0, color: 0 };
    tick(state, NO_INPUT, sequence(0.1, 0.5, 0.5, 0.8, 0));
    expect(state.drops).toBe(2);
    expect(state.hook).toMatchObject({ side: -1, color: 3, spawnMs: state.waitUntilMs });
    expect(state.phase).toBe('waiting');
    // Shown at the start of its swing while it waits.
    expect(hookAt(state).x).toBeCloseTo(-state.hook.amplitude);
  });

  it('hands over the next floor 450 ms after one settles', () => {
    const state = tower(0);
    dropAt(state, 0);
    const settledAt = state.timeMs;
    const random = sequence(0.5);
    let spawnedAt = 0;
    for (let i = 0; i < 60 && !spawnedAt; i++) {
      if (types(tick(state, NO_INPUT, random)).includes('spawn')) spawnedAt = state.timeMs;
    }
    expect(spawnedAt - settledAt).toBeGreaterThanOrEqual(NEXT_FLOOR_MS);
    expect(spawnedAt - settledAt).toBeLessThan(NEXT_FLOOR_MS + STEP_MS);
  });

  it('ignores taps while a floor is falling or the next one is on its way', () => {
    const state = tower(0);
    tick(state, { drop: true }, never);
    expect(state.phase).toBe('falling');
    expect(tick(state, { drop: true }, never)).toEqual([]);
    untilSettled(state);
    expect(state.phase).toBe('waiting');
    expect(tick(state, { drop: true }, never)).toEqual([]);
  });
});

describe('getting harder', () => {
  it('swings faster past the target as the tower grows', () => {
    expect([0, 9, 10, 20, 30, 40, 50, 58, 200].map(crossSpeed)).toEqual([
      150, 150, 190, 215, 240, 240, 265, 285, 285,
    ]);
  });

  it('shortens the swing’s period as the tower grows', () => {
    expect([0, 10, 20, 40, 50, 65, 200].map(basePeriodMs)).toEqual([
      2600, 2200, 1900, 1900, 1700, 1400, 1400,
    ]);
  });

  it('has no wind below 20 floors, then 400 px/s² either way', () => {
    const low = tower(WIND_FROM - 1);
    spawn(low, sequence(0.9, 0.9, 0, 0, 0));
    expect(low.wind).toBe(0);
    const high = tower(WIND_FROM);
    high.drops = 4;
    spawn(high, sequence(0.9, 0.1, 0, 0, 0));
    expect(high.wind).toBe(-WIND);
  });

  it('re-rolls the wind’s direction only every 4th drop', () => {
    const state = tower(WIND_FROM);
    state.drops = 4;
    const winds: number[] = [];
    for (const roll of [0.9, 0.1, 0.1, 0.1, 0.1]) {
      spawn(state, sequence(0.5, roll, 0, 0, 0));
      winds.push(state.wind);
    }
    expect(winds).toEqual([WIND, WIND, WIND, WIND, -WIND]);
  });

  it('from 30 floors the rope changes the rhythm: 0.8× to 1.25× the period', () => {
    const below = tower(ROPE_FROM - 1);
    spawn(below, sequence(0.5, 0, 1, 0, 0));
    expect(below.hook.periodMs).toBe(basePeriodMs(ROPE_FROM - 1));
    const short = tower(ROPE_FROM);
    spawn(short, sequence(0.5, 0, 0, 0, 0));
    expect(short.hook.periodMs).toBeCloseTo(1900 * 0.8);
    const long = tower(ROPE_FROM);
    spawn(long, sequence(0.5, 0, 1, 0, 0));
    expect(long.hook.periodMs).toBeCloseTo(1900 * 1.25);
  });
});

describe('replays', () => {
  /** Drops each floor `wait` ticks after it appears, until the run ends or `drops` floors. */
  function play(seed: number, wait: (drop: number) => number, drops = 40) {
    const random = seededRandom(seed);
    const state = createSkyline(random);
    const hooks = [{ ...state.hook }];
    let since = 0;
    // Capped, so a bug that stops floors coming fails the test instead of hanging the runner.
    for (let t = 0; t < 100_000 && state.phase !== 'over' && state.drops <= drops; t++) {
      const drop = state.phase === 'swinging' && since >= wait(state.drops);
      const events = tick(state, { drop }, random);
      if (types(events).includes('spawn')) {
        hooks.push({ ...state.hook });
        since = 0;
      } else if (state.phase === 'swinging') {
        since += 1;
      }
    }
    return { state, hooks };
  }

  it('the same seed and the same taps give the same run', () => {
    const a = play(7, (n) => 20 + (n % 7) * 9);
    const b = play(7, (n) => 20 + (n % 7) * 9);
    expect(a.state).toEqual(b.state);
    expect(a.state.drops).toBeGreaterThan(3);
  });

  it('the n-th floor swings the same however the player has done so far', () => {
    // Different timing: different landings, misses, heights — but the same crane.
    const a = play(99, () => 25, 12);
    const b = play(99, (n) => 5 + n * 11, 12);
    const count = Math.min(a.hooks.length, b.hooks.length);
    expect(count).toBeGreaterThan(2);
    for (let i = 0; i < count; i++) {
      expect(a.hooks[i]?.side).toBe(b.hooks[i]?.side);
      expect(a.hooks[i]?.color).toBe(b.hooks[i]?.color);
    }
  });

  it('different seeds give different cranes', () => {
    const sides = (seed: number) =>
      play(seed, () => 30, 16)
        .hooks.map((h) => h.side)
        .join();
    expect(new Set([1, 2, 3, 4, 5].map(sides)).size).toBeGreaterThan(1);
  });
});

describe('fairness', () => {
  /** What happens to the floor on the crane if released 0, 1, 2, … ticks in, over `swings`. */
  function outcomes(state: SkylineState, swings: number): SkylineEvent[][] {
    const waiting = copy(state);
    const ticks = Math.ceil((swings * state.hook.periodMs) / STEP_MS);
    const out: SkylineEvent[][] = [];
    for (let t = 0; t < ticks; t++) {
      const released = copy(waiting);
      tick(released, { drop: true }, never);
      out.push(untilSettled(released));
      tick(waiting, NO_INPUT, never);
    }
    return out;
  }

  /** The longest unbroken run of release ticks that satisfies `ok`, in ms. */
  function longestMs(results: SkylineEvent[][], ok: (t: SkylineEvent['type']) => boolean) {
    let best = 0;
    let run = 0;
    for (const events of results) {
      run = ok(events[0]?.type ?? 'spawn') ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best * STEP_MS;
  }

  // Each stage's first and last floor, the speed ceiling and beyond; both swing directions,
  // wind both ways, the shortest and longest rope, a straight tower and the most sway at
  // several points in its cycle.
  const heights = [0, 9, 10, 19, 20, 29, 30, 39, 40, 50, 57, 58, 59, 65, 120];
  const cases = heights.flatMap((height) =>
    [0.1, 0.9].flatMap((side) =>
      [0.1, 0.9].flatMap((wind) =>
        [0, 1].flatMap((rope) =>
          [0, 40].flatMap((lean) =>
            [0, 0.2, 0.4, 0.6, 0.8].map((phase) => ({ height, side, wind, rope, lean, phase })),
          ),
        ),
      ),
    ),
  );

  it(`every stage leaves ≥ 250 ms to land a floor and ≥ 50 ms for a perfect one (${cases.length} cases)`, () => {
    const failures: string[] = [];
    for (const c of cases) {
      const state = tower(c.height);
      state.lean = c.lean;
      state.timeMs = c.phase * SWAY_MS;
      state.drops = 4; // so this spawn rolls the wind
      spawn(state, sequence(c.side, c.wind, c.rope, 0, 0));
      const results = outcomes(state, 2);
      const land = longestMs(results, (t) => t !== 'miss');
      const perfect = longestMs(results, (t) => t === 'perfect');
      if (land < 250 || perfect < 50) {
        failures.push(
          `${JSON.stringify(c)}: land ${land.toFixed(0)} ms, perfect ${perfect.toFixed(0)} ms`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('a well-timed player never has to miss: 40 seeds, 80 floors each, every one landed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seededRandom(seed);
      const state = createSkyline(random);
      while (state.floors.length < 80) {
        // Of the release moments over one swing, take the one that lands closest to the centre.
        let best = { at: -1, offset: Number.POSITIVE_INFINITY };
        outcomes(state, 1).forEach(([first], at) => {
          const offset =
            first?.type === 'perfect'
              ? 0
              : first?.type === 'land'
                ? Math.abs(first.offset)
                : Infinity;
          if (offset < best.offset) best = { at, offset };
        });
        expect(best.at, `seed ${seed}, floor ${state.floors.length + 1}`).toBeGreaterThanOrEqual(0);
        for (let i = 0; i < best.at; i++) tick(state, NO_INPUT, random);
        tick(state, { drop: true }, random);
        untilSettled(state, random);
        while (state.phase === 'waiting') tick(state, NO_INPUT, random);
      }
      expect(state.inHand).toBe(3);
    }
  });
});
