import { describe, expect, it } from 'vitest';
import { TILE, parseLevel, type LevelDef } from './level';
import {
  NO_INPUT,
  POINTS,
  RADIUS,
  START_LIVES,
  STEP_MS,
  createRebound,
  nextLevel,
  tick,
  timeBonus,
  type ReboundEvent,
  type ReboundInput,
  type ReboundState,
} from './rebound';

const level = (rows: string[], extra: Partial<LevelDef> = {}) =>
  parseLevel({ name: 'test', rows, ...extra });

/** A floor, a start, and whatever you put in between. */
function flat(middle: string, height = 8) {
  const width = middle.length + 2;
  const rows = ['#'.repeat(width)];
  for (let i = 0; i < height - 3; i++) rows.push('#' + '.'.repeat(width - 2) + '#');
  rows.push('#' + middle + '#');
  rows.push('#'.repeat(width));
  return rows;
}

function run(state: ReboundState, ms: number, input: ReboundInput = NO_INPUT) {
  const events: ReboundEvent[] = [];
  for (let t = 0; t < ms; t += STEP_MS) events.push(...tick(state, input));
  return events;
}

const tileX = (s: ReboundState) => Math.floor(s.ball.x / TILE);

describe('parseLevel', () => {
  const ok = flat('S..o..E');
  it('accepts a valid level and counts its rings', () => {
    expect(level(ok).rings).toBe(1);
  });
  it.each([
    ['uneven rows', [...ok.slice(0, -1), '##']],
    ['unknown tile', ok.map((r, i) => (i === 6 ? r.replace('o', 'x') : r))],
    ['no start', ok.map((r) => r.replace('S', '.'))],
    ['no exit', ok.map((r) => r.replace('E', '.'))],
    ['no rings', ok.map((r) => r.replace('o', '.'))],
    ['an open bottom', [...ok.slice(0, -1), '#.' + '#'.repeat(ok[0]!.length - 2)]],
    ['an open side', ok.map((r, i) => (i === 3 ? '.' + r.slice(1) : r))],
  ])('rejects %s', (_name, rows) => {
    expect(() => level(rows)).toThrow();
  });
});

describe('moving', () => {
  it('falls onto the floor and rests there', () => {
    const s = createRebound([level(flat('S..o..E'))]);
    const events = run(s, 1000);
    expect(events).toContainEqual({ type: 'land' });
    expect(s.ball.grounded).toBe(true);
    expect(s.ball.y).toBe(7 * TILE - RADIUS.normal);
  });

  it('rolls up to a top speed and stops when let go', () => {
    const s = createRebound([level(flat('S....................o.E'))]);
    run(s, 500);
    run(s, 800, { move: 1, jump: false });
    expect(s.ball.vx).toBe(175);
    run(s, 500);
    expect(s.ball.vx).toBe(0);
  });

  it('is stopped by a wall', () => {
    const s = createRebound([level(flat('S..#.o.E'))]);
    run(s, 2000, { move: 1, jump: false });
    expect(s.ball.x).toBe(4 * TILE - RADIUS.normal);
  });
});

describe('jumping', () => {
  /** Highest point of one jump, in tiles above the floor. */
  function jumpHeight(holdMs: number) {
    const s = createRebound([level(flat('S..o..E', 12))]);
    run(s, 500);
    const floorY = s.ball.y;
    let top = floorY;
    for (let t = 0; t < 1200; t += STEP_MS) {
      tick(s, { move: 0, jump: t < holdMs });
      top = Math.min(top, s.ball.y);
    }
    return (floorY - top) / TILE;
  }

  it('clears about four tiles when held', () => {
    const h = jumpHeight(1000);
    expect(h).toBeGreaterThan(3.5);
    expect(h).toBeLessThan(4.5);
  });

  it('a tap gives a short hop', () => {
    expect(jumpHeight(60)).toBeLessThan(jumpHeight(1000) * 0.6);
  });

  it('cannot jump again in mid-air', () => {
    const s = createRebound([level(flat('S..o..E', 12))]);
    run(s, 500);
    tick(s, { move: 0, jump: true });
    run(s, 100);
    const events = run(s, 100, { move: 0, jump: true });
    expect(events.filter((e) => e.type === 'jump')).toHaveLength(0);
  });

  it('a jump pressed just before landing still happens', () => {
    const s = createRebound([level(flat('S..o..E', 12))]);
    // Drop from the start; press jump a few frames before touching down.
    for (let t = 0; t < 2000 && !s.ball.grounded; t += STEP_MS) {
      const nearFloor = s.ball.y > 7 * TILE + 3 * TILE - RADIUS.normal - 12;
      tick(s, { move: 0, jump: nearFloor });
    }
    const events = run(s, 100, { move: 0, jump: true });
    expect(events).toContainEqual({ type: 'jump' });
  });

  it('a jump just after rolling off a ledge still happens', () => {
    //   ledge, then a drop
    // The start sits on a three-tile ledge; beyond it, a drop to the floor.
    const s = createRebound([
      level([
        '##########',
        '#........#',
        '#S.......#',
        '####.....#',
        '#........#',
        '#..o....E#',
        '##########',
      ]),
    ]);
    run(s, 300);
    let left: number | null = null;
    const events: ReboundEvent[] = [];
    for (let t = 0; t < 2000; t += STEP_MS) {
      if (left === null && !s.ball.grounded && s.ball.x > 3 * TILE) left = t;
      const press = left !== null && t - left > 40; // 40 ms after leaving the ledge
      events.push(...tick(s, { move: 1, jump: press }));
      if (press) break;
    }
    expect(events).toContainEqual({ type: 'jump' });
  });
});

describe('collecting', () => {
  it('rings score and open the exit only when all are taken', () => {
    const s = createRebound([level(flat('S.E.o.o.'))]);
    const events = run(s, 500);
    expect(events.some((e) => e.type === 'level-clear')).toBe(false);
    run(s, 2500, { move: 1, jump: false }); // over the closed exit, through both rings
    expect(s.ringsLeft).toBe(0);
    expect(s.score).toBe(2 * POINTS.ring);
    const back = run(s, 3000, { move: -1, jump: false });
    expect(back).toContainEqual(expect.objectContaining({ type: 'level-clear', level: 1 }));
    expect(s.levelCleared).toBe(true);
    expect(run(s, 500, { move: -1, jump: false })).toEqual([]); // frozen until nextLevel()
  });

  it('gems score, extra lives add a life', () => {
    const s = createRebound([level(flat('S.*.+.o.E'))]);
    run(s, 2000, { move: 1, jump: false });
    expect(s.score).toBeGreaterThanOrEqual(POINTS.gem + POINTS.ring);
    expect(s.lives).toBe(START_LIVES + 1);
  });
});

describe('dying', () => {
  it('spikes cost a life and send the ball back to the last checkpoint', () => {
    const s = createRebound([level(flat('S.o.C..^...E'))]);
    const events: ReboundEvent[] = [];
    // Roll right until the first death, then look at where the ball was put back.
    for (let t = 0; t < 5000 && !events.some((e) => e.type === 'died'); t += STEP_MS) {
      events.push(...tick(s, { move: 1, jump: false }));
    }
    expect(events).toContainEqual({ type: 'checkpoint', x: 5, y: 6 });
    expect(events).toContainEqual({ type: 'died', livesLeft: START_LIVES - 1 });
    expect(tileX(s)).toBe(5); // the checkpoint, not the start
    expect(s.ringsLeft).toBe(0); // collected rings stay collected
  });

  it('the run ends when the last life is lost', () => {
    const s = createRebound([level(flat('S.^.o.E'))]);
    const events = run(s, 10_000, { move: 1, jump: false });
    expect(events.filter((e) => e.type === 'died')).toHaveLength(START_LIVES);
    expect(events).toContainEqual({ type: 'game-over' });
    expect(s.over).toBe(true);
  });

  it('only the spikes themselves hurt, not the air above them', () => {
    const s = createRebound([level(flat('S..^.o.E', 12))]);
    run(s, 300);
    // Jump over the spikes.
    const events = run(s, 1500, { move: 1, jump: true });
    expect(events.some((e) => e.type === 'died')).toBe(false);
  });
});

describe('sizes and water', () => {
  it('pads change size, but growing needs room', () => {
    const s = createRebound([level(flat('S.s.o..E'))]);
    run(s, 2000, { move: 1, jump: false });
    expect(s.ball.size).toBe('small');

    // A one-tile-high tunnel (24 px): a big ball (28 px) cannot grow inside it.
    const tunnel = createRebound([
      level(['##########', '#........#', '#...######', '#S..g.o.E#', '##########']),
    ]);
    const events = run(tunnel, 4000, { move: 1, jump: false });
    expect(events.some((e) => e.type === 'resize')).toBe(false);
    expect(tunnel.ball.size).toBe('normal');
    // and it rolled on through
    expect(events).toContainEqual(expect.objectContaining({ type: 'level-clear', level: 1 }));
  });

  it('a big ball floats up through water; a normal one sinks slowly', () => {
    const pool = (pad: string) =>
      level([
        '##########',
        '#........#',
        `#S${pad}.....o#`,
        '##~~~~~~##',
        '#~~~~~~~~#',
        '#~~~~~~~E#',
        '##########',
      ]);
    const big = createRebound([pool('g')]);
    run(big, 400, { move: 1, jump: false });
    run(big, 3000);
    expect(big.ball.size).toBe('big');
    expect(big.ball.y).toBeLessThan(4 * TILE); // bobbing at the surface

    const normal = createRebound([pool('.')]);
    run(normal, 400, { move: 1, jump: false });
    run(normal, 600);
    expect(normal.ball.inWater).toBe(true);
    expect(normal.ball.vy).toBeLessThanOrEqual(120);
  });
});

describe('grates and ceiling spikes', () => {
  it('a grate stops a normal ball but lets a small one through', () => {
    const normal = createRebound([level(flat('S..H.o.E'))]);
    run(normal, 2000, { move: 1, jump: false });
    expect(normal.ball.x).toBe(4 * TILE - RADIUS.normal);

    const small = createRebound([level(flat('Ss.H.o.E'))]);
    const events = run(small, 3000, { move: 1, jump: false });
    expect(events).toContainEqual(expect.objectContaining({ type: 'level-clear' }));
  });

  it('a small ball cannot grow inside a grate', () => {
    // The grow pad sits in a grate-lined channel: growing would put a big ball inside solid bars.
    const s = createRebound([
      level(['##########', '#........#', '#..HHHHHH#', '#Ss.g..oE#', '##########']),
    ]);
    run(s, 3000, { move: 1, jump: false });
    expect(s.ball.size).toBe('small');
  });

  it('ceiling spikes kill a ball that jumps into them, not one rolling beneath', () => {
    const rows = (mid: string) => [
      '########',
      '#..vv..#',
      '#......#',
      '#......#',
      `#${mid}#`,
      '########',
    ];
    const under = createRebound([level(rows('S.o..E'))]);
    expect(run(under, 2000, { move: 1, jump: false }).some((e) => e.type === 'died')).toBe(false);

    const jumper = createRebound([level(rows('S.o..E'))]);
    run(jumper, 300, { move: 1, jump: false });
    const events = run(jumper, 600, { move: 0, jump: true });
    expect(events.some((e) => e.type === 'died')).toBe(true);
  });

  it('small and big balls jump lower than a normal one', () => {
    const peak = (pad: string) => {
      const s = createRebound([level(flat(`S${pad}..o.E`, 12))]);
      run(s, 400, { move: 1, jump: false });
      run(s, 600);
      const floor = s.ball.y;
      let top = floor;
      for (let t = 0; t < 1200; t += STEP_MS) {
        tick(s, { move: 0, jump: true });
        top = Math.min(top, s.ball.y);
      }
      return (floor - top) / TILE;
    };
    const normal = peak('.');
    expect(peak('s')).toBeLessThan(normal - 0.6);
    expect(peak('g')).toBeLessThan(normal - 0.6);
  });
});

describe('moving platforms', () => {
  it('carry a ball standing on them', () => {
    const s = createRebound([
      level(
        [
          '##############',
          '#............#',
          '#S...........#',
          '#............#',
          '#.^^^^^^^^^o.#',
          '#E############',
          '##############',
        ],
        { platforms: [{ x: 1, y: 3, width: 2, dx: 8, dy: 0, periodMs: 4000 }] },
      ),
    ]);
    run(s, 500); // lands on the platform
    const x0 = s.ball.x;
    run(s, 1500);
    expect(s.ball.x).toBeGreaterThan(x0 + 3 * TILE);
    expect(s.lives).toBe(START_LIVES);
  });
});

describe('time bonus', () => {
  it('pays more for faster finishes, rounded to tens, nothing at or after par', () => {
    expect(timeBonus(0, 30_000)).toBe(POINTS.timeBonusMax);
    expect(timeBonus(15_000, 30_000)).toBe(250);
    expect(timeBonus(10_000, 30_000)).toBe(330); // 333.3 → 330
    expect(timeBonus(30_000, 30_000)).toBe(0);
    expect(timeBonus(45_000, 30_000)).toBe(0);
  });

  it('is added when the level is cleared, against that level’s par', () => {
    const fast = createRebound([level(flat('S.o.E'), { parMs: 60_000 })]);
    const events = run(fast, 3000, { move: 1, jump: false });
    const clear = events.find((e) => e.type === 'level-clear');
    expect(clear).toBeDefined();
    const bonus = clear?.type === 'level-clear' ? clear.timeBonus : -1;
    expect(bonus).toBe(timeBonus(fast.levelMs, 60_000));
    expect(bonus).toBeGreaterThan(400); // a few seconds on a one-minute par
    expect(fast.score).toBe(POINTS.ring + POINTS.levelClear + bonus);

    const slow = createRebound([level(flat('S.o.E'), { parMs: 100 })]); // finished in ~0.5 s: past par
    const late = run(slow, 3000, { move: 1, jump: false }).find((e) => e.type === 'level-clear');
    expect(late).toMatchObject({ timeBonus: 0 });
  });
});

describe('levels in a run', () => {
  const one = level(flat('S.o.E'));
  it('nextLevel keeps score and lives; the last level ends the run as all clear', () => {
    const s = createRebound([one, one]);
    run(s, 3000, { move: 1, jump: false });
    expect(s.levelCleared).toBe(true);
    const second = nextLevel(s);
    expect(second.levelIndex).toBe(1);
    expect(second.score).toBe(s.score);
    expect(second.lives).toBe(s.lives);
    const events = run(second, 3000, { move: 1, jump: false });
    expect(events).toContainEqual({ type: 'all-clear' });
    expect(second.over).toBe(true);
  });
});
