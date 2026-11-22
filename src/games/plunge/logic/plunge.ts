import type { RandomFn } from '@/games/types';

/**
 * Plunge's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
 * per simulated second with the direction held, so a run depends only on the seed and when the
 * player held which way.
 *
 * World px, y downwards. Platforms rise from below the screen towards the spikes at the top.
 */

export const STEP_MS = 1000 / 60;
export const WIDTH = 360;
export const HEIGHT = 600;

/** The spikes along the top: the ball dies when its top reaches this line. */
export const CEILING_Y = 44;
export const BALL_R = 9;
const GRAVITY = 1400;
/** The fastest a ball falls, px/s: a shaft rising faster than this cannot be survived. */
export const MAX_FALL = 560;
/** Rolling speed, px/s. */
export const ROLL_SPEED = 210;

export const PLATFORM_H = 10;
const MIN_W = 72;
const MAX_W = 120;
/**
 * A new platform every this many px of rise. At 92 (the first try) a drop between two
 * platforms sometimes needed more sideways travel than a fall allows.
 */
export const SPACING = 72;
/**
 * Rise speed: px/s, from START_RISE, gaining RISE_GAIN each second, with no limit. Once the shaft
 * rises faster than a ball can fall (MAX_FALL), staying alive is impossible — so every run ends,
 * as the leaderboard needs (a capped speed let a good player go on for ever).
 */
export const START_RISE = 70;
export const RISE_GAIN = 0.8;
/** Spiked platforms appear from this point of the run, never two in a row. */
export const SPIKES_FROM_MS = 20_000;
const SPIKE_CHANCE = 0.18;
const STAR_CHANCE = 0.12;
const LIFE_CHANCE = 0.025;

export const START_LIVES = 3;
export const MAX_LIVES = 5;
/** Points per second alive, and per star. */
export const SECOND_POINTS = 10;
export const STAR_POINTS = 50;
/** After losing a life, the run pauses this long before the ball reappears. */
export const RESPAWN_MS = 800;

export type Pickup = 'star' | 'life' | null;

export interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  spiked: boolean;
  pickup: Pickup;
}

export interface Ball {
  x: number;
  y: number;
  vy: number;
  /** The platform it is standing on, if any. */
  on: number | null;
}

export interface PlungeState {
  timeMs: number;
  /** Time actually played (not counting respawn pauses): drives speed and spikes. */
  playedMs: number;
  platforms: Platform[];
  ball: Ball;
  lives: number;
  score: number;
  /** Fraction of a point carried between steps, so survival points are exact. */
  pointsMs: number;
  /** Rise since the last platform was made. */
  risen: number;
  nextId: number;
  lastSpiked: boolean;
  /** The last safe platform made: the next safe one is placed within reach of it. */
  anchor: { x: number; w: number } | null;
  respawnAtMs: number | null;
  over: boolean;
}

export interface PlungeInput {
  /** -1 left, 0 none, 1 right. */
  axis: number;
}

export const NO_INPUT: PlungeInput = { axis: 0 };

export type PlungeEvent =
  | { type: 'land' }
  | { type: 'star' }
  | { type: 'life' }
  | { type: 'died'; cause: 'ceiling' | 'fell' | 'spikes' }
  | { type: 'respawn' }
  | { type: 'over' };

export function riseSpeed(playedMs: number): number {
  return START_RISE + (RISE_GAIN * playedMs) / 1000;
}

/**
 * How far a safe platform may sit from the point a ball drops off the one above, px. A fall of
 * one SPACING at the fastest rise lasts ~0.2 s, enough to roll ~43 px sideways.
 */
export const REACH = 34;
/** Spiked platforms keep at least this far clear of the drop points of the safe one above. */
const TRAP_CLEARANCE = 70;

const frac = (n: number) => n - Math.floor(n);

/**
 * Makes the next platform at `y`. Random placement left players stranded — every platform below
 * out of reach — so safe platforms form a route: each within REACH of a drop point (an edge not
 * against a wall) of the safe one before it. Spiked platforms are traps off that route, never
 * under a drop point; with no room for one, the platform is safe instead.
 *
 * Always draws the same four numbers, so the n-th platform of a seed is the same however the
 * player is doing.
 */
export function makePlatform(state: PlungeState, y: number, random: RandomFn): Platform {
  const wRoll = random();
  const xRoll = random();
  const spikeRoll = random();
  const pickupRoll = random();
  const w = Math.round(MIN_W + wRoll * (MAX_W - MIN_W));
  const fits = (x: number) => Math.max(0, Math.min(WIDTH - w, Math.round(x)));
  const anchor = state.anchor;

  let spiked = false;
  let x = fits(xRoll * (WIDTH - w));
  if (anchor) {
    const wantsSpikes =
      state.playedMs >= SPIKES_FROM_MS && !state.lastSpiked && spikeRoll < SPIKE_CHANCE;
    // Room for a trap left or right of the anchor's drop points?
    const leftRoom = anchor.x - TRAP_CLEARANCE - w;
    const rightStart = anchor.x + anchor.w + TRAP_CLEARANCE;
    const rightRoom = WIDTH - w - rightStart;
    if (wantsSpikes && (leftRoom >= 0 || rightRoom >= 0)) {
      spiked = true;
      const left = leftRoom >= 0 && (rightRoom < 0 || xRoll < 0.5);
      x = left ? fits(frac(xRoll * 2) * leftRoom) : fits(rightStart + frac(xRoll * 2) * rightRoom);
    } else {
      // A drop point: just past one edge of the anchor, on a side not against a wall.
      const leftDrop = anchor.x - BALL_R - 2;
      const rightDrop = anchor.x + anchor.w + BALL_R + 2;
      const canLeft = leftDrop > BALL_R * 2;
      const canRight = rightDrop < WIDTH - BALL_R * 2;
      const drop = canLeft && (!canRight || xRoll < 0.5) ? leftDrop : rightDrop;
      // The platform covers a point within REACH of the drop point.
      const q = drop + (frac(xRoll * 2) - 0.5) * 2 * REACH;
      x = fits(q - w * (0.15 + 0.7 * frac(xRoll * 7)));
    }
  }

  const pickup: Pickup = spiked
    ? null
    : pickupRoll < LIFE_CHANCE
      ? 'life'
      : pickupRoll < LIFE_CHANCE + STAR_CHANCE
        ? 'star'
        : null;
  state.lastSpiked = spiked;
  if (!spiked) state.anchor = { x, w };
  return { id: state.nextId++, x, y, w, spiked, pickup };
}

export function createPlunge(random: RandomFn): PlungeState {
  const state: PlungeState = {
    timeMs: 0,
    playedMs: 0,
    platforms: [],
    ball: { x: WIDTH / 2, y: 0, vy: 0, on: null },
    lives: START_LIVES,
    score: 0,
    pointsMs: 0,
    risen: 0,
    nextId: 1,
    lastSpiked: false,
    anchor: null,
    respawnAtMs: null,
    over: false,
  };
  // Fill the screen below the spikes, then stand the ball on the platform nearest the middle.
  for (let y = HEIGHT - 40; y > CEILING_Y + 80; y -= SPACING) {
    state.platforms.unshift(makePlatform(state, y, random));
  }
  placeBall(state);
  return state;
}

/** Stands the ball on the safe platform nearest mid-screen, clearing it of spikes if need be. */
function placeBall(state: PlungeState): void {
  const middle = HEIGHT / 2;
  const target = [...state.platforms].sort(
    (a, b) => Math.abs(a.y - middle) - Math.abs(b.y - middle),
  )[0];
  if (!target) throw new Error('Plunge: no platform to stand on');
  target.spiked = false;
  state.ball = { x: target.x + target.w / 2, y: target.y - BALL_R, vy: 0, on: target.id };
}

function loseLife(state: PlungeState, cause: 'ceiling' | 'fell' | 'spikes'): PlungeEvent[] {
  state.lives -= 1;
  const events: PlungeEvent[] = [{ type: 'died', cause }];
  if (state.lives <= 0) {
    state.over = true;
    events.push({ type: 'over' });
  } else {
    state.respawnAtMs = state.timeMs + RESPAWN_MS;
  }
  return events;
}

/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
export function tick(state: PlungeState, input: PlungeInput, random: RandomFn): PlungeEvent[] {
  if (state.over) return [];
  state.timeMs += STEP_MS;
  const dt = STEP_MS / 1000;

  if (state.respawnAtMs !== null) {
    if (state.timeMs < state.respawnAtMs) return [];
    state.respawnAtMs = null;
    placeBall(state);
    return [{ type: 'respawn' }];
  }

  const events: PlungeEvent[] = [];
  state.playedMs += STEP_MS;
  state.pointsMs += STEP_MS;
  const per = 1000 / SECOND_POINTS;
  while (state.pointsMs >= per) {
    state.pointsMs -= per;
    state.score += 1;
  }

  // The shaft rises; new platforms come in from below on the clock, never from what the player does.
  const rise = riseSpeed(state.playedMs) * dt;
  for (const p of state.platforms) p.y -= rise;
  state.risen += rise;
  while (state.risen >= SPACING) {
    state.risen -= SPACING;
    const lowest = state.platforms.at(-1)?.y ?? HEIGHT;
    state.platforms.push(makePlatform(state, lowest + SPACING, random));
  }
  state.platforms = state.platforms.filter((p) => p.y > CEILING_Y - 40);

  // The ball: rolls with the input; rides its platform up, or falls.
  const ball = state.ball;
  const axis = Math.sign(input.axis);
  ball.x = Math.max(BALL_R, Math.min(WIDTH - BALL_R, ball.x + axis * ROLL_SPEED * dt));
  const standing = state.platforms.find((p) => p.id === ball.on);
  if (standing && ball.x >= standing.x && ball.x <= standing.x + standing.w) {
    ball.y = standing.y - BALL_R;
    ball.vy = 0;
  } else {
    ball.on = null;
    const before = ball.y + BALL_R;
    ball.vy = Math.min(MAX_FALL, ball.vy + GRAVITY * dt);
    ball.y += ball.vy * dt;
    const after = ball.y + BALL_R;
    // Landed if the ball's bottom crossed a platform's top this step (the platform moved up by
    // `rise` too, so compare against where it was).
    const landing = state.platforms.find(
      (p) => before <= p.y + rise && after >= p.y && ball.x >= p.x && ball.x <= p.x + p.w,
    );
    if (landing) {
      if (landing.spiked) return [...events, ...loseLife(state, 'spikes')];
      ball.on = landing.id;
      ball.y = landing.y - BALL_R;
      ball.vy = 0;
      events.push({ type: 'land' });
    }
  }

  // Pickups sit on their platform's middle; the ball takes one by rolling over it.
  const on = state.platforms.find((p) => p.id === ball.on);
  if (on?.pickup && Math.abs(ball.x - (on.x + on.w / 2)) < BALL_R + 6) {
    if (on.pickup === 'star') {
      state.score += STAR_POINTS;
      events.push({ type: 'star' });
    } else {
      state.lives = Math.min(MAX_LIVES, state.lives + 1);
      events.push({ type: 'life' });
    }
    on.pickup = null;
  }

  if (ball.y - BALL_R <= CEILING_Y) return [...events, ...loseLife(state, 'ceiling')];
  if (ball.y - BALL_R > HEIGHT) return [...events, ...loseLife(state, 'fell')];
  return events;
}
