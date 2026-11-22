import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import type { RandomFn } from '@/games/types';
import {
  BALL_R,
  CEILING_Y,
  HEIGHT,
  MAX_LIVES,
  MAX_FALL,
  NO_INPUT,
  RESPAWN_MS,
  ROLL_SPEED,
  SPIKES_FROM_MS,
  STAR_POINTS,
  STEP_MS,
  WIDTH,
  createPlunge,
  makePlatform,
  riseSpeed,
  tick,
  type PlungeEvent,
  type PlungeInput,
  type Platform,
  type PlungeState,
} from './plunge';

/** A run with no platforms coming: tests place them by hand. */
function still(random: RandomFn = seededRandom(1)): PlungeState {
  return createPlunge(random);
}

function run(state: PlungeState, ms: number, input: PlungeInput = NO_INPUT, random?: RandomFn) {
  const r = random ?? seededRandom(99);
  const events: PlungeEvent[] = [];
  for (let t = 0; t < ms; t += STEP_MS) events.push(...tick(state, input, r));
  return events;
}

const types = (events: PlungeEvent[]) => events.map((e) => e.type);

/**
 * Ticks until an event of `type` happens; fails after `limitMs` rather than spinning for ever (a
 * broken rule must fail the test, not hang the run).
 */
function until(
  state: PlungeState,
  type: PlungeEvent['type'],
  events: PlungeEvent[],
  input: PlungeInput = NO_INPUT,
  random: RandomFn = seededRandom(99),
  limitMs = 30_000,
) {
  for (let t = 0; t < limitMs; t += STEP_MS) {
    if (types(events).includes(type)) return events;
    events.push(...tick(state, input, random));
  }
  throw new Error(`no '${type}' within ${limitMs} ms`);
}

/** Replaces the shaft with one platform under the ball (and optionally more). */
function onlyPlatform(
  state: PlungeState,
  extra: { x: number; y: number; w: number; spiked?: boolean }[] = [],
) {
  const under: Platform = {
    id: 900,
    x: state.ball.x - 40,
    y: 300,
    w: 80,
    spiked: false,
    pickup: null,
  };
  state.platforms = [
    under,
    ...extra.map((p, i) => ({ id: 901 + i, spiked: false, pickup: null, ...p })),
  ];
  state.ball = { x: state.ball.x, y: under.y - BALL_R, vy: 0, on: 900 };
  return under;
}

describe('the start', () => {
  it('fills the screen with platforms and stands the ball on the one nearest the middle', () => {
    const state = createPlunge(seededRandom(1));
    expect(state.platforms.length).toBeGreaterThanOrEqual(4);
    const on = state.platforms.find((p) => p.id === state.ball.on);
    expect(on).toBeDefined();
    expect(Math.abs((on?.y ?? 0) - HEIGHT / 2)).toBeLessThan(60);
    expect(state.ball.y).toBe((on?.y ?? 0) - BALL_R);
    expect(state.platforms.some((p) => p.spiked)).toBe(false);
  });

  it('the same seed builds the same shaft; another seed, another', () => {
    const shaft = (seed: number) =>
      createPlunge(seededRandom(seed)).platforms.map((p) => [p.x, p.w]);
    expect(shaft(4)).toEqual(shaft(4));
    expect(shaft(4)).not.toEqual(shaft(5));
  });
});

describe('the ball', () => {
  it('rolls at 210 px/s with the input, and stops at the walls', () => {
    const state = still();
    onlyPlatform(state);
    state.platforms[0] = { ...state.platforms[0]!, x: 0, w: WIDTH };
    const x = state.ball.x;
    run(state, 500, { axis: 1 });
    expect(state.ball.x).toBeCloseTo(Math.min(WIDTH - BALL_R, x + ROLL_SPEED * 0.5), -1);
    run(state, 3000, { axis: -1 });
    expect(state.ball.x).toBe(BALL_R);
  });

  it('rides its platform up', () => {
    const state = still();
    const under = onlyPlatform(state);
    run(state, 1000);
    expect(state.ball.on).toBe(under.id);
    expect(state.ball.y).toBeCloseTo((state.platforms[0]?.y ?? 0) - BALL_R);
    expect(state.platforms[0]?.y).toBeLessThan(300 - 60);
  });

  it('rolls off the edge, falls, and lands on the platform below', () => {
    const state = still();
    onlyPlatform(state, [{ x: 0, y: 420, w: WIDTH }]);
    const events = run(state, 1500, { axis: 1 });
    expect(types(events)).toContain('land');
    expect(state.ball.on).toBe(901);
  });

  it('dies landing on spikes, then reappears on a safe platform after 0.8 s', () => {
    const state = still();
    onlyPlatform(state, [{ x: 0, y: 420, w: WIDTH, spiked: true }]);
    const events: PlungeEvent[] = [];
    const random = seededRandom(99);
    until(state, 'died', events, { axis: 1 }, random);
    expect(events).toContainEqual({ type: 'died', cause: 'spikes' });
    expect(state.lives).toBe(2);
    const diedAt = state.timeMs;
    until(state, 'respawn', events, NO_INPUT, random);
    expect(state.timeMs - diedAt).toBeGreaterThanOrEqual(RESPAWN_MS);
    const on = state.platforms.find((p) => p.id === state.ball.on);
    expect(on?.spiked).toBe(false);
  });

  it('reappears on safe ground even when every platform is spiked', () => {
    const state = still();
    const random = seededRandom(99);
    onlyPlatform(state);
    state.platforms = [];
    state.ball.on = null;
    const events: PlungeEvent[] = [];
    until(state, 'died', events, NO_INPUT, random);
    state.platforms = [200, 300, 400].map((y, i) => ({
      id: 950 + i,
      x: 100,
      y,
      w: 120,
      spiked: true,
      pickup: null,
    }));
    until(state, 'respawn', events, NO_INPUT, random);
    const on = state.platforms.find((p) => p.id === state.ball.on);
    expect(on?.spiked).toBe(false);
    expect(types(run(state, 500))).not.toContain('died');
  });

  it('dies when carried up into the spikes', () => {
    const state = still();
    onlyPlatform(state);
    const events = run(state, 6000);
    expect(events).toContainEqual({ type: 'died', cause: 'ceiling' });
  });

  it('dies falling out of the bottom', () => {
    const state = still();
    onlyPlatform(state);
    state.platforms = [];
    state.ball.on = null;
    const events = run(state, 1500);
    expect(events).toContainEqual({ type: 'died', cause: 'fell' });
  });

  it('three lives, then the run is over and nothing more happens', () => {
    const state = still();
    const random = seededRandom(99);
    let deaths = 0;
    for (let t = 0; t < 60_000 && !state.over; t += STEP_MS) {
      // Ride every platform into the spikes.
      for (const e of tick(state, NO_INPUT, random)) if (e.type === 'died') deaths += 1;
    }
    expect(deaths).toBe(3);
    expect(state.over).toBe(true);
    expect(state.lives).toBe(0);
    expect(tick(state, NO_INPUT, random)).toEqual([]);
  });
});

describe('scoring and pickups', () => {
  it('scores 10 a second alive, exactly', () => {
    const state = still();
    onlyPlatform(state);
    state.platforms[0]!.y = HEIGHT - 20;
    state.ball.y = HEIGHT - 20 - BALL_R;
    run(state, 3000 + STEP_MS / 2);
    expect(state.score).toBe(30);
  });

  it('a star is worth 50; an extra life adds one, up to 5', () => {
    const state = still();
    const under = onlyPlatform(state);
    under.pickup = 'star';
    run(state, 100);
    expect(state.score).toBe(STAR_POINTS + 1);
    expect(under.pickup).toBeNull();
    state.lives = MAX_LIVES;
    under.pickup = 'life';
    run(state, 100);
    expect(state.lives).toBe(MAX_LIVES);
    state.lives = 2;
    under.pickup = 'life';
    expect(types(run(state, 100))).toContain('life');
    expect(state.lives).toBe(3);
  });
});

describe('the shaft', () => {
  it('rises faster over time: 70 px/s, +0.8 each second, without limit', () => {
    expect([0, 10_000, 60_000, 200_000].map(riseSpeed)).toEqual([70, 78, 118, 230]);
    // Faster than a ball can fall by about 10 minutes in: nothing survives that.
    expect(riseSpeed(615_000)).toBeGreaterThan(MAX_FALL);
  });

  it('has no spiked platforms for the first 20 s, and never two in a row', () => {
    const random = seededRandom(3);
    const state = createPlunge(random);
    const early = Array.from({ length: 50 }, () => makePlatform(state, 0, random));
    expect(early.some((p) => p.spiked)).toBe(false);
    state.playedMs = SPIKES_FROM_MS;
    const late = Array.from({ length: 2000 }, () => makePlatform(state, 0, random));
    expect(late.filter((p) => p.spiked).length).toBeGreaterThan(100);
    expect(late.some((p, i) => p.spiked && late[i + 1]?.spiked)).toBe(false);
  });

  it('the n-th platform is the same however the player is doing', () => {
    // One player stands still; another rolls off and dies. Same platforms, by id.
    const shaft = (die: boolean) => {
      const random = seededRandom(11);
      const state = createPlunge(random);
      if (die) {
        state.platforms = state.platforms.filter((p) => p.id !== state.ball.on);
      }
      for (let t = 0; t < 30_000 && !state.over; t += STEP_MS) tick(state, NO_INPUT, random);
      return new Map(state.platforms.map((p) => [p.id, `${p.x}:${p.w}`]));
    };
    const calm = shaft(false);
    const unlucky = shaft(true);
    const shared = [...unlucky.keys()].filter((id) => calm.has(id));
    expect(shared.length).toBeGreaterThan(3);
    for (const id of shared) expect(unlucky.get(id)).toBe(calm.get(id));
  });
});

describe('fairness', () => {
  /**
   * A plain strategy: ride a platform until it gets high, then roll off whichever edge has no
   * spiked platform close beneath it; falling, steer for the nearest safe platform below and
   * around any spiked one in the way. If this survives, nothing the shaft asks for is out of
   * reach.
   */
  function bot(state: PlungeState): PlungeInput {
    const ball = state.ball;
    const on = state.platforms.find((p) => p.id === ball.on);
    const below = (y: number, depth: number) =>
      state.platforms.filter((p) => p.y > y && p.y < y + depth && p.id !== ball.on);
    const spikedUnder = (x: number, y: number, depth: number) =>
      below(y, depth).find((p) => p.spiked && x > p.x - BALL_R - 6 && x < p.x + p.w + BALL_R + 6);
    const steer = (x: number) => (Math.abs(x - ball.x) < 3 ? 0 : x > ball.x ? 1 : -1);
    if (on) {
      // Ride while there is time; drop when high, or sooner if nothing else is coming.
      if (on.y > CEILING_Y + 200) return NO_INPUT;
      // An edge against a wall cannot be rolled off.
      const edges = [on.x - BALL_R - 2, on.x + on.w + BALL_R + 2].filter(
        (x) => x > BALL_R && x < WIDTH - BALL_R,
      );
      const clear = edges.filter((x) => !spikedUnder(x, on.y, 150));
      const options = clear.length > 0 ? clear : edges;
      const safe = below(on.y, 400).filter((p) => !p.spiked);
      const distance = (x: number) =>
        Math.min(...safe.map((p) => Math.abs(p.x + p.w / 2 - x)), 999);
      const edge = options.sort((a, b) => distance(a) - distance(b))[0] ?? edges[0]!;
      return { axis: edge < ball.x ? -1 : 1 };
    }
    const danger = spikedUnder(ball.x, ball.y, 130);
    if (danger) {
      const left = danger.x - BALL_R - 8;
      const right = danger.x + danger.w + BALL_R + 8;
      return { axis: Math.abs(left - ball.x) < Math.abs(right - ball.x) ? -1 : 1 };
    }
    // The nearest safe platform it can still reach sideways before falling past it: the shaft
    // rises at `rise` while the ball falls, so the fall to a platform d below takes t with
    // d = (vy + rise)·t + g·t²/2.
    const rise = riseSpeed(state.playedMs);
    const reach = (p: Platform) => {
      const d = p.y - (ball.y + BALL_R);
      const v = ball.vy + rise;
      const t = (-v + Math.sqrt(v * v + 2 * 1400 * d)) / 1400;
      const gap = Math.max(0, p.x + 10 - ball.x, ball.x - (p.x + p.w - 10));
      return gap <= ROLL_SPEED * t;
    };
    const target = below(ball.y + BALL_R, 600)
      .filter((p) => !p.spiked && reach(p))
      .sort((a, b) => a.y - b.y)[0];
    if (!target) return NO_INPUT;
    return { axis: steer(Math.max(target.x + 10, Math.min(target.x + target.w - 10, ball.x))) };
  }

  it('fair: a plain strategy survives the first 90 s on 30 seeds, losing at most one life', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const random = seededRandom(seed);
      const state = createPlunge(random);
      while (state.playedMs < 90_000 && !state.over) tick(state, bot(state), random);
      if (state.lives < 2) {
        failures.push(
          `seed ${seed}: ${state.lives} lives at ${Math.round(state.playedMs / 1000)} s`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('finite: even so, every run ends — the shaft wins in the end', () => {
    const ends: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const random = seededRandom(seed);
      const state = createPlunge(random);
      while (state.timeMs < 12 * 60_000 && !state.over) tick(state, bot(state), random);
      expect(state.over, `seed ${seed}`).toBe(true);
      ends.push(Math.round(state.playedMs / 1000));
    }
    expect(Math.max(...ends)).toBeLessThan(11 * 60);
  });
});
