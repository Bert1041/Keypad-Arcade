import type { RandomFn } from '@/games/types';
import { cos, sin } from '@/games/shared/detMath';

/**
 * Skyline's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
 * per simulated second, so a run depends only on the seed and the moments the player taps.
 *
 * Horizontal positions are in world px, with the foundation's centre at 0. The crane always
 * swings over the top floor, so only offsets between floors matter.
 */

export const STEP_MS = 1000 / 60;

export const FLOOR_W = 72;
export const FLOOR_H = 28;
/** A floor hangs this far above the top of the tower and falls this far when dropped. */
export const DROP_PX = 100;
const GRAVITY = 2000;
/** How long a fall takes, from DROP_PX and GRAVITY. Used to size the swing (see swingFor). */
const FALL_S = Math.sqrt((2 * DROP_PX) / GRAVITY);
/**
 * The share of the swing's speed a dropped floor keeps. Small on purpose: with all of it, a
 * floor dropped when it looked lined up drifted ~37 px and missed — players read that as a bug.
 * Enough remains that the swing still pulls a late tap off-centre.
 */
export const CARRY = 0.15;

/** Landing within this of the top floor's centre is a perfect drop. */
export const PERFECT_PX = 8;
export const START_IN_HAND = 3;
export const FLOOR_POINTS = 10;
/** Perfect drop: this × the streak (capped), on top of FLOOR_POINTS. */
export const PERFECT_POINTS = 25;
export const MAX_STREAK = 5;
/** Every BONUS_EVERY floors: this × floors still in hand. */
export const BONUS_POINTS = 100;
export const BONUS_EVERY = 10;

/** Each off-centre landing adds this × its offset to the lean; a perfect one halves it. */
export const LEAN_GAIN = 0.3;
/** The top of the tower sways by the lean, up to this. */
export const MAX_SWAY = 12;
export const SWAY_MS = 3000;

/** Sideways push on a falling floor from 20 floors up: about 20 px over a fall. */
export const WIND = 400;
export const WIND_FROM = 20;
/** Wind direction is re-rolled every this many drops. */
export const WIND_EVERY = 4;
/** From this height the rope length — and so the swing's rhythm — changes floor to floor. */
export const ROPE_FROM = 30;
/** Pause between one floor settling and the next starting to swing; the scene lowers it in. */
export const NEXT_FLOOR_MS = 450;

export interface Floor {
  /** Resting centre, before sway. */
  x: number;
  color: number;
}

/** The floor on the crane: swings around the top floor's centre, starting at one end. */
export interface Hook {
  /** When it starts swinging (it is prepared earlier, while the last floor settles). */
  spawnMs: number;
  /** +1 starts at the right end, -1 at the left. */
  side: 1 | -1;
  periodMs: number;
  amplitude: number;
  color: number;
}

export interface Falling {
  x: number;
  /** Distance fallen. */
  y: number;
  vx: number;
  vy: number;
  color: number;
}

export type Phase = 'swinging' | 'falling' | 'waiting' | 'over';

export interface SkylineState {
  timeMs: number;
  phase: Phase;
  /** Standing floors, bottom first; the foundation is not one of them. */
  floors: Floor[];
  inHand: number;
  score: number;
  streak: number;
  lean: number;
  /** Floors handed to the crane so far, missed ones included. */
  drops: number;
  hook: Hook;
  falling: Falling | null;
  /** Sideways acceleration on the current fall (0 below WIND_FROM). */
  wind: number;
  /** The scheduled direction, rolled every WIND_EVERY drops whatever the height. */
  windDir: 1 | -1;
  waitUntilMs: number;
}

export interface SkylineInput {
  drop: boolean;
}

export const NO_INPUT: SkylineInput = { drop: false };

export type SkylineEvent =
  | { type: 'spawn' }
  | { type: 'drop' }
  | { type: 'perfect'; streak: number }
  | { type: 'land'; offset: number }
  | { type: 'miss' }
  | { type: 'bonus'; points: number }
  | { type: 'over' };

/** Swing period in ms at a height, before any rope change. */
export function basePeriodMs(height: number): number {
  if (height < 10) return 2600;
  if (height < 20) return 2200;
  if (height < 40) return 1900;
  return Math.max(1400, 1900 - (height - 40) * 20);
}

/**
 * How fast the landing point sweeps past the target, in px/s. This, not the swing itself, is
 * what decides how much time a player has, so difficulty is set here and the swing is derived.
 * Its ceiling keeps the fairness promises (see skyline.test.ts): ≥ 250 ms to land, ≥ 50 ms for
 * a perfect drop, with the tower swaying at its most.
 */
export function crossSpeed(height: number): number {
  if (height < 10) return 150;
  if (height < 20) return 190;
  if (height < 30) return 215;
  if (height < 40) return 240;
  return Math.min(285, 240 + (height - 40) * 2.5);
}

/**
 * The swing amplitude that makes the landing point cross the target at `speed`. A floor keeps
 * CARRY of the swing's speed as it falls, so where it lands is the swing position plus that
 * speed × fall time — a slightly wider curve than the swing, by √(1 + (CARRY·ωT)²).
 */
export function swingFor(periodMs: number, speed: number): number {
  const omega = (2 * Math.PI) / (periodMs / 1000);
  return speed / (omega * Math.sqrt(1 + CARRY * omega * FALL_S * (CARRY * omega * FALL_S)));
}

export function topX(state: SkylineState): number {
  return state.floors.at(-1)?.x ?? 0;
}

/** How far the top of the tower is displaced from its rest position at `timeMs`. */
export function swayAt(state: SkylineState, timeMs: number): number {
  return Math.min(MAX_SWAY, state.lean) * sin((2 * Math.PI * timeMs) / SWAY_MS);
}

/** The hooked floor's centre and sideways speed (px/s) now; at its start until it swings. */
export function hookAt(state: SkylineState): { x: number; vx: number } {
  const { side, amplitude, periodMs, spawnMs } = state.hook;
  const omega = (2 * Math.PI) / periodMs;
  const t = Math.max(0, state.timeMs - spawnMs);
  return {
    x: topX(state) + side * amplitude * cos(omega * t),
    vx: -side * amplitude * omega * 1000 * sin(omega * t),
  };
}

/**
 * Hangs the next floor on the crane, to start swinging at `startMs`. Always draws the same five
 * numbers, so the n-th floor of a seed is the same whatever happened before it — a challenge
 * replays the same tower.
 */
function prepare(state: SkylineState, random: RandomFn, startMs: number): void {
  const side = random() < 0.5 ? -1 : 1;
  const windRoll = random();
  const rope = random();
  const color = Math.floor(random() * 4);
  random(); // reserved, so a later use does not shift every seed's tower
  if (state.drops % WIND_EVERY === 0) state.windDir = windRoll < 0.5 ? -1 : 1;
  state.drops += 1;

  const height = state.floors.length;
  const periodMs = basePeriodMs(height) * (height >= ROPE_FROM ? 0.8 + rope * 0.45 : 1);
  state.hook = {
    spawnMs: startMs,
    side,
    periodMs,
    amplitude: swingFor(periodMs, crossSpeed(height)),
    color,
  };
  state.wind = height >= WIND_FROM ? state.windDir * WIND : 0;
}

/** Hangs the next floor and starts it swinging now. */
export function spawn(state: SkylineState, random: RandomFn): SkylineEvent[] {
  prepare(state, random, state.timeMs);
  state.phase = 'swinging';
  return [{ type: 'spawn' }];
}

export function createSkyline(random: RandomFn): SkylineState {
  const state: SkylineState = {
    timeMs: 0,
    phase: 'waiting',
    floors: [],
    inHand: START_IN_HAND,
    score: 0,
    streak: 0,
    lean: 0,
    drops: 0,
    hook: { spawnMs: 0, side: 1, periodMs: 1, amplitude: 0, color: 0 },
    falling: null,
    wind: 0,
    windDir: 1,
    waitUntilMs: 0,
  };
  spawn(state, random);
  return state;
}

function land(state: SkylineState, falling: Falling, random: RandomFn): SkylineEvent[] {
  const events: SkylineEvent[] = [];
  const rest = topX(state);
  const offset = falling.x - (rest + swayAt(state, state.timeMs));
  if (Math.abs(offset) <= PERFECT_PX) {
    state.streak += 1;
    state.floors.push({ x: rest, color: falling.color });
    state.score += FLOOR_POINTS + PERFECT_POINTS * Math.min(state.streak, MAX_STREAK);
    state.lean /= 2;
    events.push({ type: 'perfect', streak: state.streak });
  } else if (Math.abs(offset) < FLOOR_W / 2) {
    state.streak = 0;
    state.floors.push({ x: rest + offset, color: falling.color });
    state.score += FLOOR_POINTS;
    state.lean += Math.abs(offset) * LEAN_GAIN;
    events.push({ type: 'land', offset });
  } else {
    state.streak = 0;
    state.inHand -= 1;
    events.push({ type: 'miss' });
    if (state.inHand <= 0) {
      state.phase = 'over';
      events.push({ type: 'over' });
      return events;
    }
  }
  const landed = events[0]?.type !== 'miss';
  if (landed && state.floors.length % BONUS_EVERY === 0) {
    const points = BONUS_POINTS * state.inHand;
    state.score += points;
    events.push({ type: 'bonus', points });
  }
  state.phase = 'waiting';
  state.waitUntilMs = state.timeMs + NEXT_FLOOR_MS;
  prepare(state, random, state.waitUntilMs);
  return events;
}

/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
export function tick(state: SkylineState, input: SkylineInput, random: RandomFn): SkylineEvent[] {
  if (state.phase === 'over') return [];
  state.timeMs += STEP_MS;
  const dt = STEP_MS / 1000;

  switch (state.phase) {
    case 'waiting':
      if (state.timeMs < state.waitUntilMs) return [];
      state.hook.spawnMs = state.timeMs;
      state.phase = 'swinging';
      return [{ type: 'spawn' }];
    case 'swinging': {
      if (!input.drop) return [];
      const { x, vx } = hookAt(state);
      state.falling = { x, y: 0, vx: vx * CARRY, vy: 0, color: state.hook.color };
      state.phase = 'falling';
      return [{ type: 'drop' }];
    }
    case 'falling': {
      const f = state.falling;
      if (!f) throw new Error('Skyline: falling without a floor');
      f.vy += GRAVITY * dt;
      f.vx += state.wind * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.y < DROP_PX) return [];
      state.falling = null;
      return land(state, f, random);
    }
  }
}
