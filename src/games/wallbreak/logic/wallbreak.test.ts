import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import type { RandomFn } from '@/games/types';
import {
  BALL_R,
  BRICK_POINTS,
  CATCH_POINTS,
  CLEAR_POINTS,
  COLS,
  HEIGHT,
  MAX_LIVES,
  NEXT_LEVEL_MS,
  NO_INPUT,
  PADDLE_SPEED,
  PADDLE_W,
  PADDLE_Y,
  SLOW_MS,
  STEP_MS,
  WIDE_MS,
  WIDE_W,
  WIDTH,
  ballSpeed,
  brickRect,
  buildWall,
  createWallbreak,
  powerFor,
  tick,
  type Ball,
  type WallbreakEvent,
  type WallbreakInput,
  type WallbreakState,
} from './wallbreak';

const types = (events: WallbreakEvent[]) => events.map((e) => e.type);

function run(
  state: WallbreakState,
  ms: number,
  input: WallbreakInput | ((s: WallbreakState) => WallbreakInput) = NO_INPUT,
  random: RandomFn = seededRandom(99),
) {
  const events: WallbreakEvent[] = [];
  for (let t = 0; t < ms && !state.over; t += STEP_MS) {
    events.push(...tick(state, typeof input === 'function' ? input(state) : input, random));
  }
  return events;
}

/** A served game with no bricks in the way, and the ball placed by hand. */
function open(ball: Partial<Ball>): WallbreakState {
  const state = createWallbreak(seededRandom(1));
  state.bricks = [{ id: 999, col: 0, row: 0, hits: 1, drop: null }]; // far corner: not cleared
  state.serving = false;
  state.balls = [{ x: 180, y: 300, dx: 0, dy: -1, ...ball }];
  return state;
}

const serve: WallbreakInput = { ...NO_INPUT, serve: true };

describe('the walls', () => {
  it('are mirrored left to right, and grow with the level', () => {
    const random = seededRandom(3);
    const state = createWallbreak(random);
    const rowsAt = (level: number) => {
      const bricks = buildWall(state, level, random);
      for (const b of bricks) {
        expect(bricks.some((m) => m.row === b.row && m.col === COLS - 1 - b.col)).toBe(true);
      }
      return Math.max(...bricks.map((b) => b.row)) + 1;
    };
    const rows = [1, 3, 5, 9].map(rowsAt);
    expect(rows[3]).toBeGreaterThan(rows[0] ?? 0);
  });

  it('the same seed builds the same walls; another seed, others', () => {
    const wall = (seed: number) =>
      createWallbreak(seededRandom(seed)).bricks.map((b) => `${b.col}:${b.row}:${b.hits}`);
    expect(wall(4)).toEqual(wall(4));
    expect(wall(4)).not.toEqual(wall(5));
  });

  it('the n-th wall is the same however the player did before', () => {
    // Two players on one seed reach level 2 after different play: same second wall.
    // One serves and rallies (paddle hits, bricks broken), the other just waits.
    const second = (rally: boolean) => {
      const random = seededRandom(8);
      const state = createWallbreak(random);
      const follow = (s: WallbreakState): WallbreakInput =>
        s.serving ? serve : { ...NO_INPUT, targetX: (s.balls[0]?.x ?? 180) + 6 };
      run(state, 8_000, rally ? follow : NO_INPUT, random);
      if (rally) expect(state.hits).toBeGreaterThan(0);
      state.bricks = [];
      state.serving = false;
      run(state, NEXT_LEVEL_MS + 100, NO_INPUT, random);
      return state.bricks.map((b) => `${b.col}:${b.row}:${b.hits}:${b.drop}`);
    };
    expect(second(true)).toEqual(second(false));
  });

  it('only the left brick of a mirrored pair carries a power-up', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const b of createWallbreak(seededRandom(seed)).bricks) {
        if (b.drop) expect(b.col).toBeLessThan(COLS / 2);
      }
    }
  });

  it('power-ups split 35% wide, 30% multi, 25% slow, 10% life', () => {
    expect([0, 0.34, 0.36, 0.64, 0.66, 0.89, 0.91, 0.99].map(powerFor)).toEqual([
      'wide',
      'wide',
      'multi',
      'multi',
      'slow',
      'slow',
      'life',
      'life',
    ]);
  });
});

describe('serving and the paddle', () => {
  it('the ball waits on the paddle, follows it, and leaves when served', () => {
    const state = createWallbreak(seededRandom(1));
    run(state, 500, { ...NO_INPUT, targetX: 100 });
    expect(state.serving).toBe(true);
    expect(state.balls[0]?.x).toBeCloseTo(state.paddle.x);
    expect(types(run(state, STEP_MS, serve))).toContain('serve');
    run(state, 200);
    expect(state.balls[0]?.y).toBeLessThan(PADDLE_Y - BALL_R - 20);
  });

  it('chases the finger at no more than 900 px/s, and stays on screen', () => {
    const state = createWallbreak(seededRandom(1));
    const from = state.paddle.x;
    run(state, 100, { ...NO_INPUT, targetX: 0 });
    expect(from - state.paddle.x).toBeCloseTo(
      (PADDLE_SPEED * Math.ceil(100 / STEP_MS) * STEP_MS) / 1000,
      0,
    );
    run(state, 1000, { ...NO_INPUT, targetX: 0 });
    expect(state.paddle.x).toBe(PADDLE_W / 2);
  });

  it('moves with the keys when there is no finger', () => {
    const state = createWallbreak(seededRandom(1));
    const from = state.paddle.x;
    run(state, 200, { ...NO_INPUT, axis: 1 });
    expect(state.paddle.x).toBeGreaterThan(from + 50);
  });

  it('where the ball hits the paddle sets its angle: middle straight up, edges steep', () => {
    const bounce = (offset: number) => {
      const state = open({ x: 180 + offset, y: PADDLE_Y - 20, dx: 0, dy: 1 });
      state.paddle.x = 180;
      run(state, 200, { ...NO_INPUT, targetX: 180 });
      return state.balls[0] ?? { dx: NaN, dy: NaN };
    };
    expect(bounce(0).dx).toBeCloseTo(0);
    expect(bounce(0).dy).toBeCloseTo(-1);
    expect(bounce(-PADDLE_W / 2).dx).toBeCloseTo(-1.5 / Math.sqrt(3.25));
    expect(bounce(PADDLE_W / 4).dx).toBeCloseTo(0.75 / Math.sqrt(1.5625));
  });
});

describe('the ball', () => {
  it('bounces off the side walls and the top', () => {
    const state = open({ x: 20, y: 300, dx: -0.8, dy: -0.6 });
    const events = run(state, 400);
    expect(types(events)).toContain('wall');
    expect(state.balls[0]?.dx).toBeGreaterThan(0);
    const top = open({ x: 180, y: 30, dx: 0.6, dy: -0.8 });
    run(top, 200);
    expect(top.balls[0]?.dy).toBeGreaterThan(0);
  });

  it('never runs nearly flat: at least 35% of its motion is up or down', () => {
    const state = open({ x: 180, y: 300, dx: 0.99, dy: -0.14 });
    run(state, 400);
    expect(Math.abs(state.balls[0]?.dy ?? 0)).toBeGreaterThanOrEqual(0.35 - 1e-12);
  });

  it('breaks a brick for 10 and bounces back; a strong one takes two hits', () => {
    const state = open({});
    const target = { id: 1, col: 5, row: 2, hits: 1, drop: null };
    state.bricks.push(target);
    const r = brickRect(target);
    state.balls = [{ x: r.x + r.w / 2, y: r.y + r.h + 40, dx: 0, dy: -1 }];
    const events = run(state, 300);
    expect(events).toContainEqual({ type: 'brick', id: 1, broken: true });
    expect(state.score).toBe(BRICK_POINTS);
    expect(state.balls[0]?.dy).toBeGreaterThan(0);

    const strong = open({});
    const two = { id: 2, col: 5, row: 2, hits: 2, drop: null };
    strong.bricks.push(two);
    strong.balls = [{ x: r.x + r.w / 2, y: r.y + r.h + 40, dx: 0, dy: -1 }];
    expect(run(strong, 300)).toContainEqual({ type: 'brick', id: 2, broken: false });
    expect(strong.bricks).toContain(two);
  });

  it('cannot pass through a brick however fast it goes', () => {
    // From many starting heights, so a large step cannot land inside the row by luck.
    const passed: string[] = [];
    for (const level of [1, 10, 30]) {
      for (let start = 380; start < 440; start += 3) {
        const state = open({});
        state.level = level;
        state.hits = 999;
        state.bricks = Array.from({ length: COLS }, (_, col) => ({
          id: 100 + col,
          col,
          row: 6,
          hits: 9,
          drop: null,
        }));
        state.balls = [{ x: 183, y: start, dx: 0.3, dy: -Math.sqrt(1 - 0.09) }];
        // Whatever it meets first must be the brick row, not the ceiling behind it.
        const events: WallbreakEvent[] = [];
        const random = seededRandom(1);
        for (let t = 0; t < 2000; t += STEP_MS) {
          events.push(...tick(state, NO_INPUT, random));
          if (types(events).some((e) => e === 'brick' || e === 'wall')) break;
        }
        const first = types(events).find((e) => e === 'brick' || e === 'wall');
        if (first !== 'brick') passed.push(`level ${level}, from y ${start}: ${first}`);
      }
    }
    expect(passed).toEqual([]);
  });

  it('speeds up 2 px/s with each paddle hit and 40 each level, without limit', () => {
    expect([ballSpeed(1, 0), ballSpeed(1, 10), ballSpeed(1, 500), ballSpeed(3, 0)]).toEqual([
      280, 300, 1280, 360,
    ]);
  });
});

describe('lives', () => {
  it('a ball past the paddle costs a life, and the next waits on the paddle', () => {
    const state = open({ x: 20, y: PADDLE_Y + 20, dx: 0, dy: 1 });
    state.paddle.x = 300;
    const events = run(state, 300, { ...NO_INPUT, targetX: 300 });
    expect(types(events)).toContain('lost');
    expect(state.lives).toBe(2);
    expect(state.serving).toBe(true);
  });

  it('with several balls, losing one costs nothing', () => {
    const state = open({ x: 20, y: PADDLE_Y + 20, dx: 0, dy: 1 });
    state.balls.push({ x: 180, y: 200, dx: 0, dy: -1 });
    state.paddle.x = 300;
    run(state, 300, { ...NO_INPUT, targetX: 300 });
    expect(state.lives).toBe(3);
    expect(state.balls).toHaveLength(1);
  });

  it('the third lost ball ends the run, and then nothing more happens', () => {
    const state = createWallbreak(seededRandom(2));
    for (let i = 0; i < 3; i++) {
      state.serving = false;
      state.balls = [{ x: 20, y: PADDLE_Y + 20, dx: 0, dy: 1 }];
      state.paddle.x = 300;
      run(state, 300, { ...NO_INPUT, targetX: 300 });
    }
    expect(state.over).toBe(true);
    expect(tick(state, serve, seededRandom(1))).toEqual([]);
  });
});

describe('power-ups', () => {
  function catchOne(kind: 'wide' | 'multi' | 'slow' | 'life') {
    const state = open({ x: 300, y: 200, dx: 0, dy: -1 });
    state.drops = [{ id: 50, kind, x: 180, y: PADDLE_Y - 30 }];
    state.paddle.x = 180;
    const events = run(state, 400, { ...NO_INPUT, targetX: 180 });
    return { state, events };
  }

  it('a caught power-up scores 25', () => {
    const { state, events } = catchOne('slow');
    expect(events).toContainEqual({ type: 'catch', kind: 'slow' });
    expect(state.score).toBe(CATCH_POINTS);
  });

  it('wide: a 100 px paddle for 12 s', () => {
    const { state } = catchOne('wide');
    expect(state.paddle.w).toBe(WIDE_W);
    // Ball back on the paddle, so none is lost (which would end it early) while the time runs.
    state.serving = true;
    state.balls = [{ x: state.paddle.x, y: PADDLE_Y - BALL_R, dx: 0, dy: 0 }];
    run(state, WIDE_MS, { ...NO_INPUT, targetX: 180 });
    expect(state.paddle.w).toBe(PADDLE_W);
  });

  it('slow: the ball at 70% speed for 8 s', () => {
    const { state } = catchOne('slow');
    const y = state.balls[0]?.y ?? 0;
    run(state, 100, { ...NO_INPUT, targetX: 180 });
    const slowDistance = Math.abs((state.balls[0]?.y ?? 0) - y);
    expect(slowDistance).toBeCloseTo((ballSpeed(1, 0) * 0.7 * 6 * STEP_MS) / 1000, 0);
    expect(state.slowUntilMs).toBeGreaterThan(state.timeMs + SLOW_MS - 1000);
  });

  it('multi: two more balls', () => {
    const { state } = catchOne('multi');
    expect(state.balls).toHaveLength(3);
  });

  it('life: one more, up to 5', () => {
    const { state } = catchOne('life');
    expect(state.lives).toBe(4);
    const full = catchOne('life').state;
    full.lives = MAX_LIVES;
    full.drops = [{ id: 51, kind: 'life', x: 180, y: PADDLE_Y - 30 }];
    run(full, 400, { ...NO_INPUT, targetX: 180 });
    expect(full.lives).toBe(MAX_LIVES);
  });
});

describe('levels', () => {
  it('a cleared wall pays 100 × the level; the next comes a second later', () => {
    const random = seededRandom(6);
    const state = createWallbreak(random);
    state.serving = false;
    const last = { id: 77, col: 5, row: 0, hits: 1, drop: null };
    state.bricks = [last];
    const r = brickRect(last);
    state.balls = [{ x: r.x + r.w / 2, y: r.y + r.h + 30, dx: 0, dy: -1 }];
    const events = run(state, 300, NO_INPUT, random);
    expect(events).toContainEqual({ type: 'clear', level: 1, points: CLEAR_POINTS });
    expect(state.score).toBe(BRICK_POINTS + CLEAR_POINTS);
    const next = run(state, NEXT_LEVEL_MS + 50, NO_INPUT, random);
    expect(next).toContainEqual({ type: 'level', level: 2 });
    expect(state.bricks.length).toBeGreaterThanOrEqual(12);
    expect(state.serving).toBe(true);
    // Level 2's wall pays 200.
    state.serving = false;
    state.bricks = [{ ...last, id: 78 }];
    state.balls = [{ x: r.x + r.w / 2, y: r.y + r.h + 30, dx: 0, dy: -1 }];
    expect(run(state, 300, NO_INPUT, random)).toContainEqual({
      type: 'clear',
      level: 2,
      points: 2 * CLEAR_POINTS,
    });
  });
});

describe('playing it', () => {
  /**
   * Keeps the paddle under the lowest ball coming down, meeting it with the part of the paddle
   * that sends it towards the nearest brick — the way a person aims.
   */
  const tracker = (state: WallbreakState): WallbreakInput => {
    if (state.serving) return { ...serve, targetX: state.paddle.x };
    const ball = [...state.balls].sort((a, b) => b.y - a.y)[0];
    if (!ball) return { ...NO_INPUT, targetX: WIDTH / 2 };
    const goal = state.bricks
      .map((b) => brickRect(b))
      .sort((a, b) => Math.abs(a.x + a.w / 2 - ball.x) - Math.abs(b.x + b.w / 2 - ball.x))[0];
    if (!goal) return { ...NO_INPUT, targetX: ball.x };
    // Outgoing ratio wanted (sideways per upwards), from the paddle to the brick's centre.
    const ratio = (goal.x + goal.w / 2 - ball.x) / Math.max(40, PADDLE_Y - (goal.y + goal.h));
    const offset = Math.max(-0.9, Math.min(0.9, ratio / 1.5));
    return { ...NO_INPUT, targetX: ball.x - offset * (state.paddle.w / 2) };
  };

  it('is playable: tracking the ball clears walls on every seed', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const random = seededRandom(seed);
      const state = createWallbreak(random);
      run(state, 5 * 60_000, tracker, random);
      expect(state.level, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('gets faster than a person can follow: by level 10, over 640 px/s before a single hit', () => {
    // Crossing the 470 px from the paddle to the wall in under 0.75 s. (A program that tracks the
    // ball perfectly can still go on — the leaderboard refuses runs over 30 minutes.)
    expect(ballSpeed(10, 0)).toBeGreaterThanOrEqual(640);
    expect(470 / ballSpeed(10, 0)).toBeLessThan(0.75);
  });

  it('the same seed and inputs give the same run', () => {
    const play = () => {
      const random = seededRandom(12);
      const state = createWallbreak(random);
      run(state, 60_000, tracker, random);
      return { score: state.score, level: state.level, lives: state.lives, y: state.balls[0]?.y };
    };
    expect(play()).toEqual(play());
  });

  it('balls stay on screen above the floor', () => {
    const random = seededRandom(3);
    const state = createWallbreak(random);
    for (let t = 0; t < 60_000 && !state.over; t += STEP_MS) {
      tick(state, tracker(state), random);
      for (const b of state.balls) {
        expect(b.x).toBeGreaterThanOrEqual(BALL_R);
        expect(b.x).toBeLessThanOrEqual(WIDTH - BALL_R);
        expect(b.y).toBeLessThan(HEIGHT + 20);
      }
    }
  });
});
