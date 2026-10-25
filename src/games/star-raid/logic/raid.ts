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
const RAPID_FIRE_EVERY_MS = 80;
/** Twin shot: two streams this far either side of the ship's centre. */
const TWIN_OFFSET = 7;
const SHOT_SPEED = 640;
const ENEMY_SHOT_SPEED = 240;
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const INVULNERABLE_MS = 1500;
/** After a shield soaks a hit: long enough to get clear, shorter than losing a life. */
export const SHIELD_GRACE_MS = 800;

export type EnemyKind = 'drifter' | 'weaver' | 'gunner' | 'carrier';

export const ENEMY: Record<EnemyKind, { hp: number; points: number }> = {
  drifter: { hp: 1, points: 10 },
  weaver: { hp: 2, points: 20 },
  gunner: { hp: 3, points: 30 },
  carrier: { hp: 2, points: 50 },
};

export type PowerKind = 'twin' | 'rapid' | 'shield' | 'bomb' | 'life';

export const POWER_MS = { twin: 10_000, rapid: 8_000 } as const;
const POWER_FALL_SPEED = 100;
/** Generous on purpose: a catch you almost made should count. */
const POWER_HITBOX = { w: 26, h: 26 };

/** Which power-up a carrier holds, rolled when its wave is generated. */
const DROP_TABLE: [PowerKind, number][] = [
  ['twin', 0.3],
  ['rapid', 0.3],
  ['shield', 0.25],
  ['bomb', 0.1],
  ['life', 0.05],
];

export function rollDrop(roll: number): PowerKind {
  let acc = 0;
  for (const [kind, weight] of DROP_TABLE) {
    acc += weight;
    if (roll < acc) return kind;
  }
  return 'twin';
}

/** A carrier joins waves 2, 6, 10, … */
export const hasCarrier = (wave: number) => wave % 4 === 2;

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
  /** Carrier: the power-up it releases when destroyed. */
  drop?: PowerKind;
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

export interface PowerUp {
  id: number;
  kind: PowerKind;
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
  powerUps: PowerUp[];
  twinMs: number;
  rapidMs: number;
  shield: boolean;
  pending: Spawn[];
  wave: number;
  nextWaveAtMs: number;
  /** Enemy ids: depend only on the seed and the clock, never on play. */
  nextId: number;
  /** Separate, because power-ups depend on what the player destroys. */
  nextPowerId: number;
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
  | { type: 'shield-broken' }
  | { type: 'powerup-dropped'; kind: PowerKind; x: number; y: number }
  | { type: 'powerup'; kind: PowerKind; x: number }
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
  if (hasCarrier(wave)) {
    // After the rest of the wave, and from the same seed: everyone gets the same chance.
    spawns.push({
      atMs: startMs + count * 220 + 400,
      kind: 'carrier',
      x: 40 + random() * (WIDTH - 80),
      speed: 60 + random() * 20,
      amplitude: 0,
      firstShotMs: 0,
      drop: rollDrop(random()),
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
    powerUps: [],
    twinMs: 0,
    rapidMs: 0,
    shield: false,
    pending: [],
    wave: 0,
    nextWaveAtMs: 1000,
    nextId: 1,
    nextPowerId: 1,
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

  const kill = (enemy: Enemy) => {
    enemy.hp = 0;
    state.score += ENEMY[enemy.kind].points;
    state.kills += 1;
    events.push({ type: 'kill', kind: enemy.kind, x: enemy.cx, y: enemy.y });
    if (enemy.drop) {
      state.powerUps.push({ id: state.nextPowerId++, kind: enemy.drop, x: enemy.cx, y: enemy.y });
      events.push({ type: 'powerup-dropped', kind: enemy.drop, x: enemy.cx, y: enemy.y });
    }
  };

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
  state.twinMs = Math.max(0, state.twinMs - STEP_MS);
  state.rapidMs = Math.max(0, state.rapidMs - STEP_MS);

  // Auto-fire.
  state.fireInMs -= STEP_MS;
  if (state.fireInMs <= 0) {
    if (state.twinMs > 0) {
      state.shots.push({ x: ship.x - TWIN_OFFSET, y: SHIP_Y - 14 });
      state.shots.push({ x: ship.x + TWIN_OFFSET, y: SHIP_Y - 14 });
    } else {
      state.shots.push({ x: ship.x, y: SHIP_Y - 16 });
    }
    state.fireInMs += state.rapidMs > 0 ? RAPID_FIRE_EVERY_MS : FIRE_EVERY_MS;
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
      kill(enemy);
    }
  }
  state.shots = state.shots.filter((s) => s.y > -20);

  // Power-ups fall; the ship catches them.
  for (const power of state.powerUps) power.y += POWER_FALL_SPEED * dt;
  const caught = state.powerUps.filter((p) =>
    overlaps(ship.x, SHIP_Y, SHIP_HITBOX, p.x, p.y, POWER_HITBOX),
  );
  state.powerUps = state.powerUps.filter((p) => !caught.includes(p) && p.y < HEIGHT + 20);
  for (const power of caught) {
    events.push({ type: 'powerup', kind: power.kind, x: power.x });
    switch (power.kind) {
      case 'twin':
        state.twinMs = POWER_MS.twin;
        break;
      case 'rapid':
        state.rapidMs = POWER_MS.rapid;
        break;
      case 'shield':
        state.shield = true;
        break;
      case 'life':
        state.lives = Math.min(MAX_LIVES, state.lives + 1);
        break;
      case 'bomb':
        // Everything on screen; enemies still entering are spared, as with shots.
        for (const enemy of state.enemies) if (enemy.hp > 0 && enemy.y > 0) kill(enemy);
        state.enemyShots = [];
        break;
    }
  }

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
    }
    if ((rammer || bullet) && state.shield) {
      state.shield = false;
      state.invulnerableMs = SHIELD_GRACE_MS;
      events.push({ type: 'shield-broken' });
    } else if (rammer || bullet) {
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
