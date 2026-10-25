import { TILE, type Level, type PlatformDef } from './level';

/**
 * Rebound's rules: a fixed-step simulation with no Phaser in it. tick() runs 60 times per
 * simulated second whatever the frame rate, so a run depends only on the levels and the
 * player's inputs.
 */

export const STEP_MS = 1000 / 60;

export type Size = 'small' | 'normal' | 'big';

/** Ball radius in px; the hitbox is the square around it. */
export const RADIUS: Record<Size, number> = { small: 6, normal: 10, big: 14 };
const MAX_RUN: Record<Size, number> = { small: 200, normal: 175, big: 150 };
/**
 * Small and big both jump lower than normal (about 3 tiles against 4): shrinking to pass a
 * grate, or growing to float, costs you height until you change back.
 */
const JUMP_SPEED: Record<Size, number> = { small: 470, normal: 540, big: 470 };

const GRAVITY = 1500;
const MAX_FALL = 700;
const GROUND_ACCEL = 1100;
const AIR_ACCEL = 650;
const GROUND_FRICTION = 900;
/** Let go of jump early for a short hop. */
const JUMP_CUT = 0.5;
/** You can still jump this long after rolling off a ledge… */
const COYOTE_MS = 90;
/** …and a jump pressed this long before landing still happens. */
const JUMP_BUFFER_MS = 120;
/** Hard landings bounce a little: it is a ball. */
const BOUNCE_ABOVE = 420;
const BOUNCE_KEEP = 0.35;

/** In water a big ball floats; smaller balls sink slowly and can swim upwards. */
/** Must beat gravity, or a big ball sinks (it did, until a test caught it). */
const WATER_BUOYANCY = 2200;
const WATER_GRAVITY_SCALE = 0.35;
const WATER_MAX_SINK = 120;
const WATER_RUN_SCALE = 0.6;
const SWIM_SPEED = 300;

export const START_LIVES = 3;
export const POINTS = {
  ring: 20,
  gem: 50,
  levelClear: 500,
  lifeAtMax: 100,
  /** For finishing instantly; falls linearly to 0 at the level's par time. */
  timeBonusMax: 500,
} as const;

/**
 * Faster finishes score more, so even an easy level has a score worth chasing. Rounded to tens;
 * nothing at or after par. Time lost to deaths counts: the clock never stops.
 */
export function timeBonus(levelMs: number, parMs: number): number {
  const left = Math.max(0, 1 - levelMs / parMs);
  return Math.round((POINTS.timeBonusMax * left) / 10) * 10;
}
const MAX_LIVES = 9;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: Size;
  grounded: boolean;
  inWater: boolean;
  coyoteMs: number;
  jumpBufferMs: number;
  /** Turns the sprite as it rolls. */
  angle: number;
  /** Rising from a jump (not a bounce): releasing jump cuts it short. */
  jumping: boolean;
}

export interface ReboundInput {
  /** -1 left, 0, 1 right. */
  move: number;
  /** Held this step. */
  jump: boolean;
}

export const NO_INPUT: ReboundInput = { move: 0, jump: false };

export interface ReboundState {
  levels: readonly Level[];
  levelIndex: number;
  level: Level;
  /** Simulated ms since this level started (moving platforms run on it). */
  levelMs: number;
  ball: Ball;
  /** "x,y" of every collected ring, gem and life, so they stay gone after a respawn. */
  collected: Set<string>;
  ringsLeft: number;
  checkpoint: { x: number; y: number; size: Size };
  lives: number;
  score: number;
  jumpHeld: boolean;
  /** Touched the open exit; frozen until the scene calls nextLevel(). */
  levelCleared: boolean;
  /** The run is over: out of lives, or every level cleared. */
  over: boolean;
  allClear: boolean;
}

export type ReboundEvent =
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'ring'; x: number; y: number }
  | { type: 'gem'; x: number; y: number }
  | { type: 'life'; x: number; y: number }
  | { type: 'checkpoint'; x: number; y: number }
  | { type: 'resize'; size: Size }
  | { type: 'exit-open' }
  | { type: 'died'; livesLeft: number }
  | { type: 'level-clear'; level: number; timeBonus: number }
  | { type: 'game-over' }
  | { type: 'all-clear' };

const key = (x: number, y: number) => `${x},${y}`;

function centreOf(tx: number, ty: number, size: Size) {
  // Stand on the floor of the tile: the ball's bottom at the tile's bottom.
  return { x: tx * TILE + TILE / 2, y: (ty + 1) * TILE - RADIUS[size] };
}

function freshBall(at: { x: number; y: number }, size: Size): Ball {
  return {
    ...at,
    vx: 0,
    vy: 0,
    size,
    grounded: false,
    inWater: false,
    coyoteMs: 0,
    jumpBufferMs: 0,
    angle: 0,
    jumping: false,
  };
}

export function createRebound(
  levels: readonly Level[],
  startLevel = 0,
  lives = START_LIVES,
): ReboundState {
  const level = levels[startLevel];
  if (!level) throw new Error(`Rebound: no level ${startLevel}`);
  const spawn = centreOf(level.start.x, level.start.y, 'normal');
  return {
    levels,
    levelIndex: startLevel,
    level,
    levelMs: 0,
    ball: freshBall(spawn, 'normal'),
    collected: new Set(),
    ringsLeft: level.rings,
    checkpoint: { ...spawn, size: 'normal' },
    lives,
    score: 0,
    jumpHeld: false,
    levelCleared: false,
    over: false,
    allClear: false,
  };
}

/** Moves on to the next level, keeping score and lives. */
export function nextLevel(state: ReboundState): ReboundState {
  const fresh = createRebound(state.levels, state.levelIndex + 1, state.lives);
  return { ...fresh, score: state.score };
}

export function tileAt(level: Level, tx: number, ty: number) {
  return level.grid[ty]?.[tx] ?? '#';
}

/** Where a moving platform is at `ms`: there and back, smoothly. */
export function platformAt(p: PlatformDef, ms: number) {
  const phase = (ms % p.periodMs) / p.periodMs;
  const t = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0 → 1 → 0, easing at the ends
  return { x: (p.x + p.dx * t) * TILE, y: (p.y + p.dy * t) * TILE, w: p.width * TILE, h: TILE };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ballBox = (b: Ball): Box => {
  const r = RADIUS[b.size];
  return { x: b.x - r, y: b.y - r, w: r * 2, h: r * 2 };
};

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Every solid box touching `box`: wall tiles and moving platforms. */
function solidsNear(state: ReboundState, box: Box, ms: number): Box[] {
  const out: Box[] = [];
  const x0 = Math.floor(box.x / TILE);
  const x1 = Math.floor((box.x + box.w - 0.001) / TILE);
  const y0 = Math.floor(box.y / TILE);
  const y1 = Math.floor((box.y + box.h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const tile = tileAt(state.level, tx, ty);
      if (tile === '#' || (tile === 'H' && state.ball.size !== 'small')) {
        out.push({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE });
      }
    }
  }
  for (const p of state.level.platforms) {
    const pb = platformAt(p, ms);
    if (overlaps(box, pb)) out.push(pb);
  }
  return out;
}

function tilesTouching(box: Box): [number, number][] {
  const out: [number, number][] = [];
  for (let ty = Math.floor(box.y / TILE); ty <= Math.floor((box.y + box.h - 0.001) / TILE); ty++) {
    for (
      let tx = Math.floor(box.x / TILE);
      tx <= Math.floor((box.x + box.w - 0.001) / TILE);
      tx++
    ) {
      out.push([tx, ty]);
    }
  }
  return out;
}

/** The platform the ball is standing on, if any (checked before platforms move this step). */
function platformUnder(state: ReboundState, ms: number): PlatformDef | null {
  const box = ballBox(state.ball);
  const feet = { x: box.x, y: box.y + box.h, w: box.w, h: 2 };
  return state.level.platforms.find((p) => overlaps(feet, platformAt(p, ms))) ?? null;
}

function die(state: ReboundState, events: ReboundEvent[]) {
  state.lives -= 1;
  events.push({ type: 'died', livesLeft: state.lives });
  if (state.lives <= 0) {
    state.over = true;
    events.push({ type: 'game-over' });
    return;
  }
  state.ball = freshBall(state.checkpoint, state.checkpoint.size);
}

/**
 * Advances one fixed step. Mutates `state` and returns what happened, for sound and effects.
 * The scene calls nextLevel() after a 'level-clear' event, when it has shown the transition.
 */
export function tick(state: ReboundState, input: ReboundInput): ReboundEvent[] {
  if (state.over || state.levelCleared) return [];
  const events: ReboundEvent[] = [];
  const dt = STEP_MS / 1000;
  const ball = state.ball;
  const before = state.levelMs;
  state.levelMs += STEP_MS;

  // Ride a moving platform: move with it before anything else.
  const riding = ball.grounded ? platformUnder(state, before) : null;
  if (riding) {
    const a = platformAt(riding, before);
    const b = platformAt(riding, state.levelMs);
    ball.x += b.x - a.x;
    ball.y += b.y - a.y;
  }

  // Jump input: buffer the press, cut the jump short on release.
  const pressed = input.jump && !state.jumpHeld;
  state.jumpHeld = input.jump;
  ball.jumpBufferMs = pressed ? JUMP_BUFFER_MS : Math.max(0, ball.jumpBufferMs - STEP_MS);
  ball.coyoteMs = ball.grounded ? COYOTE_MS : Math.max(0, ball.coyoteMs - STEP_MS);

  // Horizontal.
  const maxRun = MAX_RUN[ball.size] * (ball.inWater ? WATER_RUN_SCALE : 1);
  const move = Math.sign(input.move);
  if (move !== 0) {
    ball.vx += move * (ball.grounded ? GROUND_ACCEL : AIR_ACCEL) * dt;
    ball.vx = Math.max(-maxRun, Math.min(maxRun, ball.vx));
  } else if (ball.grounded) {
    const slow = GROUND_FRICTION * dt;
    ball.vx = Math.abs(ball.vx) <= slow ? 0 : ball.vx - Math.sign(ball.vx) * slow;
  }

  // Vertical.
  if (ball.inWater && ball.size === 'big') {
    ball.vy -= (WATER_BUOYANCY - GRAVITY) * dt;
    ball.vy = Math.max(ball.vy, -SWIM_SPEED);
  } else if (ball.inWater) {
    ball.vy = Math.min(ball.vy + GRAVITY * WATER_GRAVITY_SCALE * dt, WATER_MAX_SINK);
  } else {
    ball.vy = Math.min(ball.vy + GRAVITY * dt, MAX_FALL);
  }
  if (ball.jumpBufferMs > 0 && (ball.coyoteMs > 0 || ball.inWater)) {
    ball.vy = ball.inWater ? -SWIM_SPEED : -JUMP_SPEED[ball.size];
    ball.jumpBufferMs = 0;
    ball.coyoteMs = 0;
    ball.grounded = false;
    ball.jumping = !ball.inWater;
    events.push({ type: 'jump' });
  } else if (ball.jumping && !input.jump && ball.vy < 0) {
    // Released early: cut the jump short (bounces are not jumps and keep their height).
    ball.vy *= JUMP_CUT;
    ball.jumping = false;
  }
  if (ball.vy >= 0) ball.jumping = false;

  // Move and collide, one axis at a time.
  const r = RADIUS[ball.size];
  ball.x += ball.vx * dt;
  for (const s of solidsNear(state, ballBox(ball), state.levelMs)) {
    // An earlier push may already have cleared this one.
    if (!overlaps(ballBox(ball), s)) continue;
    ball.x = ball.vx > 0 || (ball.vx === 0 && ball.x < s.x + s.w / 2) ? s.x - r : s.x + s.w + r;
    ball.vx = 0;
  }
  const wasGrounded = ball.grounded;
  const fallSpeed = ball.vy;
  ball.y += ball.vy * dt;
  ball.grounded = false;
  for (const s of solidsNear(state, ballBox(ball), state.levelMs)) {
    if (!overlaps(ballBox(ball), s)) continue;
    if (ball.vy >= 0 && ball.y < s.y + s.h / 2) {
      ball.y = s.y - r;
      ball.grounded = true;
      ball.vy = fallSpeed > BOUNCE_ABOVE ? -fallSpeed * BOUNCE_KEEP : 0;
      if (ball.vy < 0) ball.grounded = false;
    } else {
      ball.y = s.y + s.h + r;
      ball.vy = 0;
    }
  }
  if (ball.grounded && !wasGrounded) events.push({ type: 'land' });
  ball.angle += (ball.vx * dt) / r;

  // What the ball touches.
  const box = ballBox(ball);
  ball.inWater = false;
  for (const [tx, ty] of tilesTouching(box)) {
    const tile = tileAt(state.level, tx, ty);
    const k = key(tx, ty);
    switch (tile) {
      case '^': {
        // Only the spikes themselves, the lower half of the tile.
        const spikes = { x: tx * TILE + 3, y: ty * TILE + TILE / 2, w: TILE - 6, h: TILE / 2 };
        if (overlaps(box, spikes)) {
          die(state, events);
          return events;
        }
        break;
      }
      case 'v': {
        // Hanging from the ceiling: the upper half of the tile.
        const spikes = { x: tx * TILE + 3, y: ty * TILE, w: TILE - 6, h: TILE / 2 };
        if (overlaps(box, spikes)) {
          die(state, events);
          return events;
        }
        break;
      }
      case 'o':
      case '*':
      case '+':
        if (!state.collected.has(k)) {
          state.collected.add(k);
          if (tile === 'o') {
            state.ringsLeft -= 1;
            state.score += POINTS.ring;
            events.push({ type: 'ring', x: tx, y: ty });
            if (state.ringsLeft === 0) events.push({ type: 'exit-open' });
          } else if (tile === '*') {
            state.score += POINTS.gem;
            events.push({ type: 'gem', x: tx, y: ty });
          } else {
            if (state.lives >= MAX_LIVES) state.score += POINTS.lifeAtMax;
            else state.lives += 1;
            events.push({ type: 'life', x: tx, y: ty });
          }
        }
        break;
      case 'C': {
        const spot = centreOf(tx, ty, ball.size);
        if (state.checkpoint.x !== spot.x || state.checkpoint.y !== spot.y) {
          state.checkpoint = { ...spot, size: ball.size };
          events.push({ type: 'checkpoint', x: tx, y: ty });
        }
        break;
      }
      case 's':
      case 'n':
      case 'g': {
        const size: Size = tile === 's' ? 'small' : tile === 'g' ? 'big' : 'normal';
        if (ball.size !== size) {
          const old = ball.size;
          // Grow from the floor up, and only if there is room.
          ball.y += RADIUS[old] - RADIUS[size];
          ball.size = size;
          if (solidsNear(state, ballBox(ball), state.levelMs).length > 0) {
            ball.y -= RADIUS[old] - RADIUS[size];
            ball.size = old;
          } else {
            events.push({ type: 'resize', size });
          }
        }
        break;
      }
      case '~':
        ball.inWater = true;
        break;
      case 'E':
        if (state.ringsLeft === 0) {
          state.levelCleared = true;
          const bonus = timeBonus(state.levelMs, state.level.parMs);
          state.score += POINTS.levelClear + bonus;
          events.push({ type: 'level-clear', level: state.levelIndex + 1, timeBonus: bonus });
          if (state.levelIndex + 1 >= state.levels.length) {
            state.over = true;
            state.allClear = true;
            events.push({ type: 'all-clear' });
          }
          return events;
        }
        break;
      case '.':
      case '#':
      case 'H':
      case 'S':
        break;
    }
  }

  // Fell out of the level (only possible through a gap the map left open).
  if (ball.y - r > state.level.rows * TILE) die(state, events);
  return events;
}
