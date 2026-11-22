import type { RandomFn } from '@/games/types';

/**
 * Wallbreak's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60
 * times per simulated second with where the player wants the paddle and whether they served, so
 * a run depends only on the seed and those inputs.
 *
 * World px, y downwards. Only + − × ÷, Math.sqrt and rounding are used, which every engine
 * computes alike (the leaderboard replays runs in Node).
 */

export const STEP_MS = 1000 / 60;
export const WIDTH = 360;
export const HEIGHT = 600;

export const COLS = 10;
export const MAX_ROWS = 8;
export const BRICK_W = 34;
export const BRICK_H = 14;
export const BRICK_GAP = 2;
/** Left edge of the wall, so 10 bricks and their gaps sit centred. */
export const WALL_X = (WIDTH - (COLS * BRICK_W + (COLS - 1) * BRICK_GAP)) / 2;
export const WALL_Y = 80;

export const PADDLE_Y = 552;
export const PADDLE_H = 10;
export const PADDLE_W = 64;
export const WIDE_W = 100;
/** The paddle's top speed, px/s: it chases the finger but cannot teleport. */
export const PADDLE_SPEED = 900;
const PADDLE_KEY_SPEED = 420;

export const BALL_R = 5;
/**
 * Ball speed, px/s: 40 more each level, and 2 more with every paddle hit within a level, without
 * limit. By level 10 it crosses the screen in well under a second, past what a person can follow,
 * so people's runs end. A perfect program that tracks the ball can go on far longer (tested to
 * 30 minutes); the leaderboard refuses any run longer than that (verify.ts).
 */
export function ballSpeed(level: number, hits: number): number {
  return 280 + 40 * (level - 1) + 2 * hits;
}
/** How steep the paddle can send the ball: horizontal/vertical at the paddle's very edge. */
const STEER = 1.5;
/** The ball's vertical share never drops below this, so it cannot loop side to side for ever. */
const MIN_VERTICAL = 0.35;

export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const BRICK_POINTS = 10;
export const CATCH_POINTS = 25;
export const CLEAR_POINTS = 100;

export const WIDE_MS = 12_000;
export const SLOW_MS = 8_000;
const SLOW_FACTOR = 0.7;
const DROP_SPEED = 130;
const DROP_SIZE = 16;
/** Pause between a cleared wall and the next. */
export const NEXT_LEVEL_MS = 1_000;

export type PowerKind = 'wide' | 'multi' | 'slow' | 'life';

export interface Brick {
  id: number;
  col: number;
  row: number;
  /** Hits left (1 or 2). */
  hits: number;
  drop: PowerKind | null;
}

export interface Ball {
  x: number;
  y: number;
  /** Direction, unit length; the speed comes from ballSpeed(). */
  dx: number;
  dy: number;
}

export interface Drop {
  id: number;
  kind: PowerKind;
  x: number;
  y: number;
}

export interface WallbreakState {
  timeMs: number;
  level: number;
  bricks: Brick[];
  paddle: { x: number; w: number };
  balls: Ball[];
  /** True while the ball sits on the paddle, waiting to be served. */
  serving: boolean;
  /** Paddle hits this level (the ball speeds up a little with each). */
  hits: number;
  drops: Drop[];
  wideUntilMs: number;
  slowUntilMs: number;
  lives: number;
  score: number;
  nextLevelAtMs: number | null;
  nextId: number;
  over: boolean;
}

export interface WallbreakInput {
  /** Where the finger is (world x), or null. */
  targetX: number | null;
  /** -1, 0 or 1 from the keys; used when there is no finger. */
  axis: number;
  serve: boolean;
}

export const NO_INPUT: WallbreakInput = { targetX: null, axis: 0, serve: false };

export type WallbreakEvent =
  | { type: 'serve' }
  | { type: 'paddle' }
  | { type: 'wall' }
  | { type: 'brick'; id: number; broken: boolean }
  | { type: 'catch'; kind: PowerKind }
  | { type: 'lost' }
  | { type: 'clear'; level: number; points: number }
  | { type: 'level'; level: number }
  | { type: 'over' };

const POWERS: readonly [PowerKind, number][] = [
  ['wide', 0.35],
  ['multi', 0.3],
  ['slow', 0.25],
  ['life', 0.1],
];

export function powerFor(roll: number): PowerKind {
  let acc = 0;
  for (const [kind, share] of POWERS) {
    acc += share;
    if (roll < acc) return kind;
  }
  return 'wide';
}

export function brickRect(b: Pick<Brick, 'col' | 'row'>) {
  return {
    x: WALL_X + b.col * (BRICK_W + BRICK_GAP),
    y: WALL_Y + b.row * (BRICK_H + BRICK_GAP),
    w: BRICK_W,
    h: BRICK_H,
  };
}

/**
 * Builds level `level`'s wall: a pattern mirrored left to right. Every level draws exactly
 * MAX_ROWS × COLS/2 × 3 numbers whatever it uses, so the n-th wall of a seed is the same for
 * everyone however their earlier levels went.
 */
export function buildWall(state: WallbreakState, level: number, random: RandomFn): Brick[] {
  const rows = Math.min(MAX_ROWS, 3 + Math.ceil(level / 2));
  const fill = Math.min(0.9, 0.6 + 0.04 * level);
  const strong = Math.min(0.5, 0.05 + 0.06 * level);
  const bricks: Brick[] = [];
  for (let row = 0; row < MAX_ROWS; row++) {
    for (let half = 0; half < COLS / 2; half++) {
      const present = random() < fill;
      const twoHits = random() < strong;
      const dropRoll = random();
      if (row >= rows || !present) continue;
      for (const col of [half, COLS - 1 - half]) {
        const mirrored = col !== half;
        bricks.push({
          id: state.nextId++,
          col,
          row,
          hits: twoHits ? 2 : 1,
          // Mirrored bricks share a pattern, not a prize: only the left one carries it.
          drop: !mirrored && dropRoll < 0.14 ? powerFor(dropRoll / 0.14) : null,
        });
      }
    }
  }
  // A thin wall is no level: top up a full first row (deterministic, no extra draws).
  if (bricks.length < 12) {
    for (let col = 0; col < COLS; col++) {
      if (!bricks.some((b) => b.row === 0 && b.col === col)) {
        bricks.push({ id: state.nextId++, col, row: 0, hits: 1, drop: null });
      }
    }
  }
  return bricks;
}

function serveBall(state: WallbreakState): void {
  state.serving = true;
  state.balls = [{ x: state.paddle.x, y: PADDLE_Y - BALL_R, dx: 0, dy: 0 }];
}

export function createWallbreak(random: RandomFn): WallbreakState {
  const state: WallbreakState = {
    timeMs: 0,
    level: 1,
    bricks: [],
    paddle: { x: WIDTH / 2, w: PADDLE_W },
    balls: [],
    serving: true,
    hits: 0,
    drops: [],
    wideUntilMs: 0,
    slowUntilMs: 0,
    lives: START_LIVES,
    score: 0,
    nextLevelAtMs: null,
    nextId: 1,
    over: false,
  };
  state.bricks = buildWall(state, 1, random);
  serveBall(state);
  return state;
}

/** A unit direction from a horizontal/vertical ratio, upwards (dy < 0). */
function upwards(ratio: number): { dx: number; dy: number } {
  const length = Math.sqrt(ratio * ratio + 1);
  return { dx: ratio / length, dy: -1 / length };
}

/** Keeps a direction from going nearly flat after a bounce. */
function steepen(ball: Ball): void {
  if (Math.abs(ball.dy) >= MIN_VERTICAL) return;
  const dy = ball.dy < 0 ? -MIN_VERTICAL : MIN_VERTICAL;
  const dx = (ball.dx < 0 ? -1 : 1) * Math.sqrt(1 - MIN_VERTICAL * MIN_VERTICAL);
  ball.dx = dx;
  ball.dy = dy;
}

function overlaps(ball: Ball, r: { x: number; y: number; w: number; h: number }): boolean {
  return (
    ball.x + BALL_R > r.x &&
    ball.x - BALL_R < r.x + r.w &&
    ball.y + BALL_R > r.y &&
    ball.y - BALL_R < r.y + r.h
  );
}

/** The first brick the ball overlaps, if any. */
function brickAt(state: WallbreakState, ball: Ball): Brick | undefined {
  return state.bricks.find((b) => overlaps(ball, brickRect(b)));
}

function hitBrick(state: WallbreakState, brick: Brick, events: WallbreakEvent[]): void {
  brick.hits -= 1;
  state.score += BRICK_POINTS;
  const broken = brick.hits <= 0;
  events.push({ type: 'brick', id: brick.id, broken });
  if (!broken) return;
  state.bricks = state.bricks.filter((b) => b !== brick);
  if (brick.drop) {
    const r = brickRect(brick);
    state.drops.push({ id: state.nextId++, kind: brick.drop, x: r.x + r.w / 2, y: r.y + r.h / 2 });
  }
}

function movePaddle(state: WallbreakState, input: WallbreakInput, dt: number): void {
  const paddle = state.paddle;
  paddle.w = state.timeMs < state.wideUntilMs ? WIDE_W : PADDLE_W;
  const half = paddle.w / 2;
  if (input.targetX !== null) {
    const step = PADDLE_SPEED * dt;
    paddle.x += Math.max(-step, Math.min(step, input.targetX - paddle.x));
  } else {
    paddle.x += Math.sign(input.axis) * PADDLE_KEY_SPEED * dt;
  }
  paddle.x = Math.max(half, Math.min(WIDTH - half, paddle.x));
}

/** Moves one ball by `distance`, bouncing off walls, bricks and the paddle. */
function moveBall(state: WallbreakState, ball: Ball, distance: number, events: WallbreakEvent[]) {
  // Small sub-steps (≤ 3 px) so a fast ball cannot pass through a 14 px brick.
  const parts = Math.max(1, Math.ceil(distance / 3));
  const step = distance / parts;
  for (let i = 0; i < parts; i++) {
    // Horizontal, then vertical, each checked on its own: the side it hit decides the bounce.
    ball.x += ball.dx * step;
    if (ball.x - BALL_R < 0 || ball.x + BALL_R > WIDTH) {
      ball.x = Math.max(BALL_R, Math.min(WIDTH - BALL_R, ball.x));
      ball.dx = -ball.dx;
      events.push({ type: 'wall' });
    }
    const sideways = brickAt(state, ball);
    if (sideways) {
      ball.x -= ball.dx * step;
      ball.dx = -ball.dx;
      hitBrick(state, sideways, events);
    }
    ball.y += ball.dy * step;
    if (ball.y - BALL_R < 0) {
      ball.y = BALL_R;
      ball.dy = -ball.dy;
      events.push({ type: 'wall' });
    }
    const vertical = brickAt(state, ball);
    if (vertical) {
      ball.y -= ball.dy * step;
      ball.dy = -ball.dy;
      hitBrick(state, vertical, events);
    }
    // The paddle: only a ball coming down onto its top bounces; where it hits sets the angle.
    const paddle = state.paddle;
    const onPaddle =
      ball.dy > 0 &&
      ball.y + BALL_R >= PADDLE_Y &&
      ball.y + BALL_R <= PADDLE_Y + PADDLE_H &&
      ball.x >= paddle.x - paddle.w / 2 - BALL_R &&
      ball.x <= paddle.x + paddle.w / 2 + BALL_R;
    if (onPaddle) {
      const offset = Math.max(-1, Math.min(1, (ball.x - paddle.x) / (paddle.w / 2)));
      const dir = upwards(offset * STEER);
      ball.dx = dir.dx;
      ball.dy = dir.dy;
      ball.y = PADDLE_Y - BALL_R;
      state.hits += 1;
      events.push({ type: 'paddle' });
    }
    steepen(ball);
  }
}

function catchDrops(state: WallbreakState, dt: number, events: WallbreakEvent[]): void {
  const paddle = state.paddle;
  const kept: Drop[] = [];
  for (const drop of state.drops) {
    drop.y += DROP_SPEED * dt;
    const caught =
      drop.y + DROP_SIZE / 2 >= PADDLE_Y &&
      drop.y - DROP_SIZE / 2 <= PADDLE_Y + PADDLE_H &&
      Math.abs(drop.x - paddle.x) <= paddle.w / 2 + DROP_SIZE / 2;
    if (!caught) {
      if (drop.y - DROP_SIZE / 2 < HEIGHT) kept.push(drop);
      continue;
    }
    state.score += CATCH_POINTS;
    events.push({ type: 'catch', kind: drop.kind });
    if (drop.kind === 'wide') state.wideUntilMs = state.timeMs + WIDE_MS;
    else if (drop.kind === 'slow') state.slowUntilMs = state.timeMs + SLOW_MS;
    else if (drop.kind === 'life') state.lives = Math.min(MAX_LIVES, state.lives + 1);
    else if (!state.serving) {
      // Two more balls from the first, fanned out.
      const from = state.balls[0];
      if (from) {
        for (const ratio of [-0.8, 0.8]) {
          const dir = upwards(ratio);
          state.balls.push({ x: from.x, y: from.y, dx: dir.dx, dy: dir.dy });
        }
      }
    }
  }
  state.drops = kept;
}

/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
export function tick(
  state: WallbreakState,
  input: WallbreakInput,
  random: RandomFn,
): WallbreakEvent[] {
  if (state.over) return [];
  const events: WallbreakEvent[] = [];
  state.timeMs += STEP_MS;
  const dt = STEP_MS / 1000;

  if (state.nextLevelAtMs !== null) {
    if (state.timeMs < state.nextLevelAtMs) return [];
    state.nextLevelAtMs = null;
    state.level += 1;
    state.hits = 0;
    state.bricks = buildWall(state, state.level, random);
    state.drops = [];
    state.wideUntilMs = 0;
    state.slowUntilMs = 0;
    serveBall(state);
    return [{ type: 'level', level: state.level }];
  }

  movePaddle(state, input, dt);

  if (state.serving) {
    const ball = state.balls[0];
    if (ball) ball.x = state.paddle.x;
    if (!input.serve) return events;
    state.serving = false;
    if (ball) Object.assign(ball, upwards(0.25));
    events.push({ type: 'serve' });
  }

  const slow = state.timeMs < state.slowUntilMs ? SLOW_FACTOR : 1;
  const distance = ballSpeed(state.level, state.hits) * slow * dt;
  for (const ball of state.balls) moveBall(state, ball, distance, events);
  catchDrops(state, dt, events);

  // Balls that fall past the paddle are lost; the last one costs a life.
  state.balls = state.balls.filter((b) => b.y - BALL_R < HEIGHT);
  if (state.balls.length === 0) {
    state.lives -= 1;
    events.push({ type: 'lost' });
    state.drops = [];
    state.wideUntilMs = 0;
    state.slowUntilMs = 0;
    if (state.lives <= 0) {
      state.over = true;
      events.push({ type: 'over' });
      return events;
    }
    serveBall(state);
  }

  if (state.bricks.length === 0 && state.nextLevelAtMs === null) {
    const points = CLEAR_POINTS * state.level;
    state.score += points;
    events.push({ type: 'clear', level: state.level, points });
    state.nextLevelAtMs = state.timeMs + NEXT_LEVEL_MS;
    state.balls = [];
    state.drops = [];
  }
  return events;
}
