import type { RandomFn } from '@/games/types';

/**
 * Star Raid's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60
 * times per simulated second, whatever the frame rate, so a run depends only on the seed and
 * the player's inputs — never on how fast the phone draws.
 */

export const WIDTH = 360;
export const HEIGHT = 600;
export const STEP_MS = 1000 / 60;

export const SHIP_Y = 540;
const SHIP_MIN_X = 18;
const SHIP_MAX_X = WIDTH - 18;
/** Following a finger: fast, but not a teleport. */
const SHIP_FOLLOW_SPEED = 520;
/** Arrow keys / A-D. */
const SHIP_KEY_SPEED = 300;
/** Smaller than the sprite: near misses should feel like misses. */
const SHIP_HITBOX = { w: 14, h: 12 };
const ENEMY_HITBOX = { w: 24, h: 20 };
const SHOT_HITBOX = { w: 4, h: 10 };

const FIRE_EVERY_MS = 160;
const SHOT_SPEED = 640;
const ENEMY_SHOT_SPEED = 240;
export const START_LIVES = 3;
export const INVULNERABLE_MS = 1500;

export type EnemyKind = 'drifter' | 'weaver' | 'gunner';

export const ENEMY: Record<EnemyKind, { hp: number; points: number }> = {
  drifter: { hp: 1, points: 10 },
  weaver: { hp: 2, points: 20 },
  gunner: { hp: 3, points: 30 },
};

/** One enemy in a wave's schedule, fixed when the wave is generated. */
export interface Spawn {
  atMs: number;
  kind: EnemyKind;
  x: number;
  speed: number;
  /** Weaver sway in px. */
  amplitude: number;
  /** Gunner: ms until its first shot. */
  firstShotMs: number;
}

export interface Enemy extends Spawn {
  id: number;
  y: number;
  hp: number;
  ageMs: number;
  nextShotMs: number;
  /** Where it is drawn and collides this step (weavers sway around x). */
  cx: number;
}

export interface Shot {
  x: number;
  y: number;
}

export interface RaidState {
  timeMs: number;
  ship: { x: number };
  lives: number;
  invulnerableMs: number;
  fireInMs: number;
  score: number;
  kills: number;
  enemies: Enemy[];
  shots: Shot[];
  enemyShots: Shot[];
  pending: Spawn[];
  wave: number;
  nextWaveAtMs: number;
  nextId: number;
  alive: boolean;
}

export interface RaidInput {
  /** World x the player is steering towards (drag), or null. */
  targetX: number | null;
  /** -1, 0 or 1 from the keyboard; ignored while targetX is set. */
  axis: number;
}

export const NO_INPUT: RaidInput = { targetX: null, axis: 0 };

export type RaidEvent =
  | { type: 'wave'; index: number }
  | { type: 'spawn'; id: number; kind: EnemyKind; x: number; atMs: number }
  | { type: 'enemy-hit'; x: number; y: number }
  | { type: 'kill'; kind: EnemyKind; x: number; y: number }
  | { type: 'ship-hit'; livesLeft: number }
  | { type: 'died' };

export function waveIntervalMs(wave: number): number {
  return Math.max(1400, 3000 - wave * 80);
}

/** Bigger waves and new enemy kinds as the run goes on. */
export function generateWave(random: RandomFn, wave: number, startMs: number): Spawn[] {
  const count = Math.min(3 + Math.floor(wave / 2), 9);
  const spawns: Spawn[] = [];
  for (let i = 0; i < count; i++) {
    const roll = random();
    const kind: EnemyKind =
      wave >= 6 && roll < 0.25 ? 'gunner' : wave >= 3 && roll < 0.6 ? 'weaver' : 'drifter';
    spawns.push({
      atMs: startMs + i * 220,
      kind,
      x: 30 + random() * (WIDTH - 60),
      speed: (kind === 'gunner' ? 55 : kind === 'weaver' ? 80 : 90) + random() * 40 + wave * 2,
      amplitude: 30 + random() * 40,
      firstShotMs: 500 + random() * 900,
    });
  }
  return spawns;
}

export function createRaid(): RaidState {
  return {
    timeMs: 0,
    ship: { x: WIDTH / 2 },
    lives: START_LIVES,
    invulnerableMs: 0,
    fireInMs: 0,
    score: 0,
    kills: 0,
    enemies: [],
    shots: [],
    enemyShots: [],
    pending: [],
    wave: 0,
    nextWaveAtMs: 1000,
    nextId: 1,
    alive: true,
  };
}

function overlaps(
  ax: number,
  ay: number,
  a: { w: number; h: number },
  bx: number,
  by: number,
  b: { w: number; h: number },
) {
  return Math.abs(ax - bx) * 2 < a.w + b.w && Math.abs(ay - by) * 2 < a.h + b.h;
}

/**
 * Advances one fixed step. Mutates `state` (60 copies a second would be waste) and returns
 * what happened, for sound and effects. Randomness is consumed only when a wave is generated,
 * on the clock — so every player on the same seed meets the same waves.
 */
export function tick(state: RaidState, input: RaidInput, random: RandomFn): RaidEvent[] {
  if (!state.alive) return [];
  const events: RaidEvent[] = [];
  const dt = STEP_MS / 1000;
  state.timeMs += STEP_MS;

  // Waves, on the clock.
  while (state.timeMs >= state.nextWaveAtMs) {
    state.pending.push(...generateWave(random, state.wave, state.nextWaveAtMs));
    events.push({ type: 'wave', index: state.wave });
    state.nextWaveAtMs += waveIntervalMs(state.wave);
    state.wave += 1;
  }
  while (state.pending[0] && state.pending[0].atMs <= state.timeMs) {
    const spawn = state.pending.shift();
    if (!spawn) break;
    const id = state.nextId++;
    events.push({ type: 'spawn', id, kind: spawn.kind, x: spawn.x, atMs: spawn.atMs });
    state.enemies.push({
      ...spawn,
      id,
      y: -20,
      hp: ENEMY[spawn.kind].hp,
      ageMs: 0,
      nextShotMs: spawn.firstShotMs,
      cx: spawn.x,
    });
  }

  // Ship.
  const ship = state.ship;
  if (input.targetX !== null) {
    const step = SHIP_FOLLOW_SPEED * dt;
    ship.x += Math.max(-step, Math.min(step, input.targetX - ship.x));
  } else {
    ship.x += Math.sign(input.axis) * SHIP_KEY_SPEED * dt;
  }
  ship.x = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, ship.x));
  state.invulnerableMs = Math.max(0, state.invulnerableMs - STEP_MS);

  // Auto-fire.
  state.fireInMs -= STEP_MS;
  if (state.fireInMs <= 0) {
    state.shots.push({ x: ship.x, y: SHIP_Y - 16 });
    state.fireInMs += FIRE_EVERY_MS;
  }
  for (const shot of state.shots) shot.y -= SHOT_SPEED * dt;
  state.shots = state.shots.filter((s) => s.y > -20);

  // Enemies.
  for (const enemy of state.enemies) {
    enemy.ageMs += STEP_MS;
    enemy.y += enemy.speed * dt;
    enemy.cx =
      enemy.kind === 'weaver' ? enemy.x + Math.sin(enemy.ageMs / 450) * enemy.amplitude : enemy.x;
    if (enemy.kind === 'gunner') {
      enemy.nextShotMs -= STEP_MS;
      if (enemy.nextShotMs <= 0 && enemy.y > 0 && enemy.y < SHIP_Y - 60) {
        state.enemyShots.push({ x: enemy.cx, y: enemy.y + 12 });
        enemy.nextShotMs += 1400;
      }
    }
  }
  for (const shot of state.enemyShots) shot.y += ENEMY_SHOT_SPEED * dt;
  state.enemyShots = state.enemyShots.filter((s) => s.y < HEIGHT + 20);

  // Player shots hit enemies.
  for (const shot of state.shots) {
    // Only enemies already on screen can be hit: no killing what the player cannot see.
    const enemy = state.enemies.find(
      (e) => e.hp > 0 && e.y > 0 && overlaps(shot.x, shot.y, SHOT_HITBOX, e.cx, e.y, ENEMY_HITBOX),
    );
    if (!enemy) continue;
    shot.y = -100; // spent
    enemy.hp -= 1;
    if (enemy.hp > 0) {
      events.push({ type: 'enemy-hit', x: enemy.cx, y: enemy.y });
    } else {
      state.score += ENEMY[enemy.kind].points;
      state.kills += 1;
      events.push({ type: 'kill', kind: enemy.kind, x: enemy.cx, y: enemy.y });
    }
  }
  state.shots = state.shots.filter((s) => s.y > -20);

  // The ship is hit by an enemy or an enemy shot (rammers are destroyed, without points).
  if (state.invulnerableMs === 0) {
    const rammer = state.enemies.find(
      (e) => e.hp > 0 && overlaps(ship.x, SHIP_Y, SHIP_HITBOX, e.cx, e.y, ENEMY_HITBOX),
    );
    const bullet = state.enemyShots.find((s) =>
      overlaps(ship.x, SHIP_Y, SHIP_HITBOX, s.x, s.y, SHOT_HITBOX),
    );
    if (rammer || bullet) {
      if (rammer) rammer.hp = 0;
      if (bullet) bullet.y = HEIGHT + 100;
      state.lives -= 1;
      state.invulnerableMs = INVULNERABLE_MS;
      events.push({ type: 'ship-hit', livesLeft: state.lives });
      if (state.lives <= 0) {
        state.alive = false;
        events.push({ type: 'died' });
      }
    }
  }

  state.enemies = state.enemies.filter((e) => e.hp > 0 && e.y < HEIGHT + 30);
  state.enemyShots = state.enemyShots.filter((s) => s.y < HEIGHT + 20);
  return events;
}
