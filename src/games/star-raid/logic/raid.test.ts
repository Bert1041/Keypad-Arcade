import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import {
  ENEMY,
  HEIGHT,
  MAX_LIVES,
  POWER_MS,
  SHIELD_GRACE_MS,
  rollDrop,
  type PowerKind,
  INVULNERABLE_MS,
  NO_INPUT,
  SHIP_Y,
  START_LIVES,
  STEP_MS,
  WIDTH,
  createRaid,
  generateWave,
  tick,
  waveIntervalMs,
  type Enemy,
  type RaidEvent,
  type RaidInput,
  type RaidState,
} from './raid';

const never = () => {
  throw new Error('no randomness expected here');
};

/** A state whose first wave never arrives, so tests control every enemy. */
function quiet(): RaidState {
  return { ...createRaid(), nextWaveAtMs: Number.POSITIVE_INFINITY };
}

function enemy(overrides: Partial<Enemy>): Enemy {
  return {
    atMs: 0,
    kind: 'drifter',
    x: WIDTH / 2,
    speed: 0,
    amplitude: 0,
    firstShotMs: 99_999,
    id: 1,
    y: 100,
    hp: 1,
    ageMs: 0,
    nextShotMs: 99_999,
    cx: WIDTH / 2,
    ...overrides,
  };
}

function runFor(state: RaidState, ms: number, input: RaidInput = NO_INPUT, random = never) {
  const events: RaidEvent[] = [];
  for (let t = 0; t < ms; t += STEP_MS) events.push(...tick(state, input, random));
  return events;
}

describe('ship', () => {
  it('follows a drag target at a limited speed', () => {
    const s = quiet();
    tick(s, { targetX: 0, axis: 0 }, never);
    expect(s.ship.x).toBeCloseTo(WIDTH / 2 - 520 / 60);
  });

  it('moves with the keyboard axis', () => {
    const s = quiet();
    tick(s, { targetX: null, axis: 1 }, never);
    expect(s.ship.x).toBeCloseTo(WIDTH / 2 + 300 / 60);
  });

  it('stays on screen', () => {
    const s = quiet();
    runFor(s, 3000, { targetX: -500, axis: 0 });
    expect(s.ship.x).toBe(18);
    runFor(s, 3000, { targetX: null, axis: 1 });
    expect(s.ship.x).toBe(WIDTH - 18);
  });

  it('auto-fires about six shots a second', () => {
    const s = quiet();
    let fired = 0;
    for (let t = 0; t < 1000; t += STEP_MS) {
      const before = s.shots.length;
      tick(s, NO_INPUT, never);
      if (s.shots.length > before) fired += 1;
    }
    expect(fired).toBeGreaterThanOrEqual(6);
    expect(fired).toBeLessThanOrEqual(7);
  });
});

describe('combat', () => {
  it('kills an enemy in the line of fire and scores its points', () => {
    const s = quiet();
    s.enemies.push(enemy({ kind: 'drifter', y: 300 }));
    const events = runFor(s, 1000);
    expect(events).toContainEqual(expect.objectContaining({ type: 'kill', kind: 'drifter' }));
    expect(s.score).toBe(ENEMY.drifter.points);
    expect(s.enemies).toHaveLength(0);
  });

  it('a tougher enemy takes several hits', () => {
    const s = quiet();
    s.enemies.push(enemy({ kind: 'gunner', hp: ENEMY.gunner.hp, y: 300 }));
    const events = runFor(s, 1500);
    expect(events.filter((e) => e.type === 'enemy-hit')).toHaveLength(ENEMY.gunner.hp - 1);
    expect(s.score).toBe(ENEMY.gunner.points);
  });

  it('misses an enemy outside the line of fire', () => {
    const s = quiet();
    s.enemies.push(enemy({ x: 40, cx: 40, y: 300 }));
    runFor(s, 1000);
    expect(s.score).toBe(0);
  });

  it('a hit costs a life, then the ship is briefly invulnerable', () => {
    const s = quiet();
    s.enemyShots.push({ x: s.ship.x, y: SHIP_Y }, { x: s.ship.x, y: SHIP_Y - 30 });
    const first = tick(s, NO_INPUT, never);
    expect(first).toContainEqual({ type: 'ship-hit', livesLeft: START_LIVES - 1 });
    // The second bullet arrives during invulnerability and does nothing.
    runFor(s, INVULNERABLE_MS - 100);
    expect(s.lives).toBe(START_LIVES - 1);
  });

  it('a rammer is destroyed without points', () => {
    const s = quiet();
    s.enemies.push(enemy({ y: SHIP_Y }));
    tick(s, NO_INPUT, never);
    expect(s.lives).toBe(START_LIVES - 1);
    expect(s.enemies).toHaveLength(0);
    expect(s.score).toBe(0);
  });

  it('the run ends when the last life is lost', () => {
    const s = { ...quiet(), lives: 1 };
    s.enemyShots.push({ x: s.ship.x, y: SHIP_Y });
    expect(tick(s, NO_INPUT, never)).toEqual([
      { type: 'ship-hit', livesLeft: 0 },
      { type: 'died' },
    ]);
    expect(s.alive).toBe(false);
    expect(tick(s, NO_INPUT, never)).toEqual([]);
  });

  it('gunners fire downwards', () => {
    const s = quiet();
    s.enemies.push(enemy({ kind: 'gunner', hp: 3, x: 40, cx: 40, y: 100, nextShotMs: 50 }));
    runFor(s, 200);
    expect(s.enemyShots.length).toBe(1);
    expect(s.enemyShots[0]?.x).toBe(40);
  });

  it('cannot hit an enemy that has not reached the screen yet', () => {
    const s = quiet();
    // After this step's move the shot is at y≈-12.7, squarely on the enemy at y=-12 —
    // and still on the list (shots are dropped above y=-20), so only the rule protects it.
    s.enemies.push(enemy({ y: -12 }));
    s.shots.push({ x: WIDTH / 2, y: -2 });
    tick(s, NO_INPUT, never);
    expect(s.enemies[0]?.hp).toBe(1);
    // Control: the same overlap on screen is a kill.
    const control = quiet();
    control.enemies.push(enemy({ y: 12 }));
    control.shots.push({ x: WIDTH / 2, y: 22 });
    tick(control, NO_INPUT, never);
    expect(control.score).toBe(ENEMY.drifter.points);
  });

  it('forgets enemies and shots that leave the screen', () => {
    const s = quiet();
    s.enemies.push(enemy({ x: 40, cx: 40, y: HEIGHT + 25, speed: 100 }));
    runFor(s, 200);
    expect(s.enemies).toHaveLength(0);
    expect(s.shots.every((shot) => shot.y > -20)).toBe(true);
  });
});

describe('waves', () => {
  it('get bigger and introduce weavers, then gunners', () => {
    const kinds = (wave: number) =>
      new Set(
        Array.from({ length: 20 }, (_, i) => generateWave(seededRandom(i), wave, 0))
          .flat()
          .map((s) => s.kind),
      );
    expect([...kinds(0)]).toEqual(['drifter']);
    expect(kinds(3).has('weaver')).toBe(true);
    expect(kinds(3).has('gunner')).toBe(false);
    expect(kinds(6).has('gunner')).toBe(true);
    expect(generateWave(seededRandom(1), 0, 0)).toHaveLength(3);
    expect(generateWave(seededRandom(1), 20, 0)).toHaveLength(9);
  });

  it('arrive faster as the run goes on, down to a floor', () => {
    expect(waveIntervalMs(0)).toBe(3000);
    expect(waveIntervalMs(5)).toBe(2600);
    expect(waveIntervalMs(100)).toBe(1400);
  });
});

describe('challenge fairness', () => {
  /** Every enemy spawned in the first `ms`, as reported by the simulation. */
  function wavesMet(seed: number, input: (t: number) => RaidInput, ms: number) {
    const random = seededRandom(seed);
    const s = createRaid();
    const met: string[] = [];
    for (let t = 0; t < ms && s.alive; t += STEP_MS) {
      for (const e of tick(s, input(t), random)) {
        if (e.type === 'spawn') met.push(`${e.id}:${e.kind}@${e.x.toFixed(3)}:${e.atMs}`);
      }
    }
    return { met, s };
  }

  it('replays identically from the same seed and the same inputs', () => {
    const input = (t: number): RaidInput => ({ targetX: 100 + (t % 3000) / 15, axis: 0 });
    const a = wavesMet(7, input, 20_000);
    const b = wavesMet(7, input, 20_000);
    expect(a.met).toEqual(b.met);
    expect(a.s.score).toBe(b.s.score);
  });

  it('sends the same waves whatever the player does', () => {
    const still = wavesMet(7, () => NO_INPUT, 15_000);
    const weaving = wavesMet(7, (t) => ({ targetX: t % 2000 < 1000 ? 30 : 330, axis: 0 }), 15_000);
    const n = Math.min(still.met.length, weaving.met.length);
    expect(n).toBeGreaterThan(10);
    expect(weaving.met.slice(0, n)).toEqual(still.met.slice(0, n));
  });
});

describe('power-ups', () => {
  /** Puts a power-up right on the ship, so the next step catches it. */
  function give(s: RaidState, kind: PowerKind) {
    s.powerUps.push({ id: 99, kind, x: s.ship.x, y: SHIP_Y });
    return tick(s, NO_INPUT, never);
  }

  /** Shots fired in `ms`, counting each volley's bullets. */
  function shotsFired(s: RaidState, ms: number) {
    let fired = 0;
    for (let t = 0; t < ms; t += STEP_MS) {
      const before = s.shots.length;
      tick(s, NO_INPUT, never);
      fired += Math.max(0, s.shots.length - before);
    }
    return fired;
  }

  it('a carrier joins waves 2, 6, 10 … and no others, holding a power-up', () => {
    // Listed, not computed from hasCarrier(): a test that asks the code what to expect agrees
    // with whatever the code does.
    const withCarrier = new Set([2, 6, 10, 14]);
    for (let wave = 0; wave < 16; wave++) {
      const carriers = generateWave(seededRandom(wave + 1), wave, 0).filter(
        (sp) => sp.kind === 'carrier',
      );
      expect(carriers.length, `wave ${wave}`).toBe(withCarrier.has(wave) ? 1 : 0);
      if (carriers[0]) expect(carriers[0].drop).toBeDefined();
    }
  });

  it.each([
    [0, 'twin'],
    [0.299, 'twin'],
    [0.3, 'rapid'],
    [0.6, 'shield'],
    [0.85, 'bomb'],
    [0.95, 'life'],
    [0.9999, 'life'],
  ] as const)('a drop roll of %f holds %s', (roll, kind) => {
    expect(rollDrop(roll)).toBe(kind);
  });

  it('destroying a carrier releases its power-up where it was', () => {
    const s = quiet();
    s.enemies.push(enemy({ kind: 'carrier', hp: 1, y: 300, drop: 'shield' }));
    const events = runFor(s, 500);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'powerup-dropped', kind: 'shield' }),
    );
    expect(s.powerUps).toHaveLength(1);
    expect(s.powerUps[0]?.x).toBe(WIDTH / 2);
  });

  it('a falling power-up is caught by flying into it, and lost if missed', () => {
    const caught = quiet();
    caught.powerUps.push({ id: 1, kind: 'shield', x: WIDTH / 2, y: 200 });
    const events = runFor(caught, 5000);
    expect(events).toContainEqual({ type: 'powerup', kind: 'shield', x: WIDTH / 2 });
    expect(caught.shield).toBe(true);

    const missed = quiet();
    missed.powerUps.push({ id: 1, kind: 'shield', x: 40, y: 200 });
    runFor(missed, 5000);
    expect(missed.shield).toBe(false);
    expect(missed.powerUps).toHaveLength(0);
  });

  it('twin shot fires two streams for 10 s, then one', () => {
    const s = quiet();
    give(s, 'twin');
    expect(shotsFired(s, 1000)).toBeGreaterThanOrEqual(12);
    runFor(s, POWER_MS.twin);
    expect(shotsFired(s, 1000)).toBeLessThanOrEqual(7);
  });

  it('rapid fire doubles the rate for 8 s', () => {
    // Fire timing snaps to 60 Hz steps, so compare rates over a few seconds, not exact counts.
    const normal = shotsFired(quiet(), 3000);
    const s = quiet();
    give(s, 'rapid');
    const rapid = shotsFired(s, 3000);
    expect(rapid / normal).toBeGreaterThan(1.8);
    runFor(s, POWER_MS.rapid);
    expect(shotsFired(s, 3000)).toBe(normal);
  });

  it('a shield soaks one hit, then hits cost lives again', () => {
    const s = quiet();
    give(s, 'shield');
    s.enemyShots.push({ x: s.ship.x, y: SHIP_Y });
    expect(tick(s, NO_INPUT, never)).toContainEqual({ type: 'shield-broken' });
    expect(s.lives).toBe(START_LIVES);
    expect(s.shield).toBe(false);
    runFor(s, SHIELD_GRACE_MS);
    s.enemyShots.push({ x: s.ship.x, y: SHIP_Y });
    tick(s, NO_INPUT, never);
    expect(s.lives).toBe(START_LIVES - 1);
  });

  it('a bomb destroys everything on screen, with points, and spares what has not arrived', () => {
    const s = quiet();
    s.enemies.push(
      enemy({ id: 1, x: 40, cx: 40, y: 100 }),
      enemy({ id: 2, kind: 'gunner', hp: 3, x: 300, cx: 300, y: 200 }),
      enemy({ id: 3, x: 200, cx: 200, y: -15 }),
    );
    s.enemyShots.push({ x: 100, y: 300 });
    give(s, 'bomb');
    expect(s.score).toBe(ENEMY.drifter.points + ENEMY.gunner.points);
    expect(s.enemies.map((e) => e.id)).toEqual([3]);
    expect(s.enemyShots).toHaveLength(0);
  });

  it(`an extra life, up to ${MAX_LIVES}`, () => {
    const s = quiet();
    give(s, 'life');
    expect(s.lives).toBe(START_LIVES + 1);
    for (let i = 0; i < 5; i++) give(s, 'life');
    expect(s.lives).toBe(MAX_LIVES);
  });
});
