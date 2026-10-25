import { beforeEach, describe, expect, it } from 'vitest';
import { dailySeed } from '../src/core/challenge/daily';
import { seededRandom } from '../src/core/random/seededRandom';
import { createSkyline, hookAt, tick, topX } from '../src/games/skyline/logic/skyline';
import { COLS, ROWS, createCoil, queueTurn, step } from '../src/games/coil/logic/coil';
import type { CoilReplay } from '../src/games/coil/verify';
import type { SkylineReplay } from '../src/games/skyline/verify';
import { handleGet, handlePost } from './handlers';
import { IP_PER_MINUTE, TOP, postRun, readBoard } from './leaderboard';
import { testRedis, wipe } from './testRedis';

const redis = testRedis();
const DAY = '2026-11-03';
const NOON = Date.parse(`${DAY}T12:00:00Z`);

const secret = (n: number) => n.toString(16).padStart(64, 'a');

/**
 * A real Skyline daily run: drops when lined up, except that floors `missFrom` onwards are
 * dropped at once (off the end). Lower `missFrom`, lower score.
 */
function skylineRun(date: string, missFrom = 9) {
  const random = seededRandom(dailySeed('skyline', date));
  const state = createSkyline(random);
  const replay: SkylineReplay = { v: 1, drops: [] };
  for (let step = 1; state.phase !== 'over' && step < 100_000; step++) {
    const early = state.drops >= missFrom && state.timeMs - state.hook.spawnMs < 40;
    const lined = Math.abs(hookAt(state).x - topX(state)) < 3;
    const drop = state.phase === 'swinging' && (early || lined);
    if (drop) replay.drops.push(step);
    tick(state, { drop }, random);
  }
  return { score: state.score, replay };
}

/** A real Coil daily run: steer straight at the food until it ends. */
function coilRun(date: string) {
  const random = seededRandom(dailySeed('coil', date));
  let state = createCoil(random, COLS, ROWS);
  const replay: CoilReplay = { v: 1, turns: [] };
  const code = { up: 'u', down: 'd', left: 'l', right: 'r' } as const;
  for (let taken = 0; state.alive && taken < 5000; taken++) {
    const head = state.snake[0];
    if (head) {
      const dx = state.food.x - head.x;
      const dy = state.food.y - head.y;
      const dir = dx !== 0 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      state = queueTurn(state, dir);
      replay.turns.push([taken, code[dir]]);
    }
    state = step(state, random).state;
  }
  return { score: state.score, replay };
}

const HIGH = skylineRun(DAY, 9);
const LOW = skylineRun(DAY, 3);

function post(
  overrides: Record<string, unknown> = {},
  { now = NOON, ip = '10.0.0.1' }: { now?: number; ip?: string } = {},
) {
  return postRun(
    redis,
    {
      game: 'skyline',
      date: DAY,
      player: secret(1),
      nickname: 'Ada',
      ...HIGH,
      ...overrides,
    },
    { now, ip },
  );
}

/** A post that is set-up for a test, not under test: it must succeed. */
async function posted(...args: Parameters<typeof post>) {
  const outcome = await post(...args);
  expect(outcome, JSON.stringify(args[0])).toMatchObject({ ok: true });
  return outcome;
}

beforeEach(async () => {
  await wipe(redis);
});

describe('posting a daily run', () => {
  it('stores the score the server replays, and ranks it', async () => {
    expect(HIGH.score).toBeGreaterThan(LOW.score);
    expect(await post()).toEqual({
      ok: true,
      value: { score: HIGH.score, best: HIGH.score, rank: 1, players: 1 },
    });
    const board = await readBoard(redis, { game: 'skyline', date: DAY });
    expect(board).toMatchObject({
      ok: true,
      value: { players: 1, top: [{ rank: 1, name: 'Ada', score: HIGH.score }], you: null },
    });
  });

  it('rejects a score the replay does not reach, and stores nothing', async () => {
    expect(await post({ score: HIGH.score + 10 })).toEqual({
      ok: false,
      status: 422,
      error: 'Replay does not match the score',
    });
    expect(await readBoard(redis, { game: 'skyline', date: DAY })).toMatchObject({
      value: { players: 0, top: [] },
    });
  });

  it('judges a replay against today’s seed: another day’s Coil run does not reach its score', async () => {
    const yesterday = coilRun('2026-11-02');
    expect(yesterday.score).toBeGreaterThan(0);
    expect(await post({ game: 'coil', ...yesterday })).toEqual({
      ok: false,
      status: 422,
      error: 'Replay does not match the score',
    });
    expect(await post({ game: 'coil', ...coilRun(DAY) })).toMatchObject({ ok: true });
  });

  it('rejects a doctored or malformed replay', async () => {
    const doctored = { ...HIGH.replay, drops: HIGH.replay.drops.slice(0, -1) };
    expect(await post({ replay: doctored })).toMatchObject({ ok: false, status: 422 });
    expect(await post({ replay: { v: 1, drops: 'all of them' } })).toEqual({
      ok: false,
      status: 422,
      error: 'Replay rejected: not a Skyline replay',
    });
  });

  it('only takes today’s daily — and yesterday’s for 15 minutes after midnight', async () => {
    const next = Date.parse('2026-11-04T00:00:00Z');
    expect(await post({}, { now: next + 5 * 60_000 })).toMatchObject({ ok: true });
    await wipe(redis);
    expect(await post({}, { now: next + 20 * 60_000 })).toMatchObject({ ok: false, status: 400 });
    expect(await post({}, { now: Date.parse('2026-11-02T23:00:00Z') })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('refuses unknown games, dates before Daily #1, bad nicknames and missing fields', async () => {
    const refusals = [
      { game: 'rebound' },
      { game: 'nope' },
      { date: '2026-10-01' },
      { date: 'today' },
      { nickname: 'x' },
      { nickname: 'Sh1t' },
      { player: 'not-a-secret' },
      { player: undefined },
      { score: -5 },
      { score: '120' },
    ];
    for (const overrides of refusals) {
      const outcome = await post(overrides, {
        now: overrides.date === '2026-10-01' ? Date.parse('2026-10-01T12:00:00Z') : NOON,
      });
      expect(outcome, JSON.stringify(overrides)).toMatchObject({ ok: false, status: 400 });
    }
    expect(await postRun(redis, 'hello', { now: NOON, ip: 'x' })).toMatchObject({ status: 400 });
  });
});

describe('the board', () => {
  it('keeps each player’s best, and a player’s latest nickname', async () => {
    await posted({ ...LOW });
    expect(await post({ ...HIGH, nickname: 'Ada L' })).toMatchObject({
      value: { score: HIGH.score, best: HIGH.score },
    });
    expect(await post({ ...LOW })).toMatchObject({ value: { score: LOW.score, best: HIGH.score } });
    expect(await readBoard(redis, { game: 'skyline', date: DAY })).toMatchObject({
      value: { players: 1, top: [{ name: 'Ada', score: HIGH.score }] },
    });
  });

  it('ranks higher scores first, and on a tie whoever got there first', async () => {
    // Both ways round: without the tie-break, Redis orders ties by player id, which one of the
    // two orders would pass by luck.
    for (const [early, late] of [
      [2, 3],
      [3, 2],
    ] as const) {
      await wipe(redis);
      await posted({ ...LOW, player: secret(1), nickname: 'Low' }, { now: NOON });
      await posted({ ...HIGH, player: secret(late), nickname: 'Late' }, { now: NOON + 60_000 });
      await posted({ ...HIGH, player: secret(early), nickname: 'Early' }, { now: NOON + 1_000 });
      const board = await readBoard(redis, { game: 'skyline', date: DAY, player: secret(1) });
      expect(board).toMatchObject({
        value: {
          top: [
            { rank: 1, name: 'Early', score: HIGH.score },
            { rank: 2, name: 'Late', score: HIGH.score },
            { rank: 3, name: 'Low', score: LOW.score, you: true },
          ],
          you: null,
        },
      });
    }
  });

  it(`shows the top ${TOP}, plus the asking player’s place below it`, async () => {
    for (let n = 1; n <= TOP; n++) {
      await posted({ player: secret(100 + n), nickname: `Player ${n}` }, { ip: `10.1.0.${n}` });
    }
    await posted({ ...LOW, player: secret(1), nickname: 'Mine' }, { ip: '10.2.0.1' });
    const board = await readBoard(redis, { game: 'skyline', date: DAY, player: secret(1) });
    expect(board.ok && board.value.top).toHaveLength(TOP);
    expect(board).toMatchObject({
      value: {
        players: TOP + 1,
        you: { rank: TOP + 1, name: 'Mine', score: LOW.score, you: true },
      },
    });
  });

  it('shows nicknames exactly as typed, even ones that look like numbers', async () => {
    await posted({ player: secret(1), nickname: '007' }, { ip: '10.3.0.1' });
    await posted({ ...LOW, player: secret(2), nickname: '1e5' }, { ip: '10.3.0.2' });
    expect(await readBoard(redis, { game: 'skyline', date: DAY })).toMatchObject({
      value: { top: [{ name: '007' }, { name: '1e5' }] },
    });
  });

  it('never reveals a player’s secret, or the id derived from it', async () => {
    await posted();
    const text = JSON.stringify(await readBoard(redis, { game: 'skyline', date: DAY }));
    expect(text).not.toContain(secret(1));
    expect(
      Object.keys((JSON.parse(text) as { value: { top: object[] } }).value.top[0] ?? {}),
    ).toEqual(['rank', 'name', 'score']);
  });
});

describe('limits', () => {
  it(`allows ${IP_PER_MINUTE} posts a minute from one address`, async () => {
    for (let n = 0; n < IP_PER_MINUTE; n++) {
      expect(await post({ player: secret(200 + n) })).toMatchObject({ ok: true });
    }
    expect(await post({ player: secret(300) })).toMatchObject({ ok: false, status: 429 });
    expect(await post({ player: secret(300) }, { ip: '10.9.9.9' })).toMatchObject({ ok: true });
    expect(await post({ player: secret(301) }, { now: NOON + 60_000 })).toMatchObject({
      ok: true,
    });
  });
});

describe('HTTP', () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://keypad.test/api/scores', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', ...headers },
    });

  it('posts JSON, refusing what is not JSON or too large', async () => {
    const body = JSON.stringify({
      game: 'skyline',
      date: DAY,
      player: secret(1),
      nickname: 'Ada',
      ...HIGH,
    });
    const ok = await handlePost(
      request(body, { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }),
      redis,
      NOON,
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ rank: 1 });
    expect((await handlePost(request('{nope'), redis, NOON)).status).toBe(400);
    expect((await handlePost(request('x'.repeat(500_000)), redis, NOON)).status).toBe(413);
  });

  it('lets the public board be cached briefly, but never a reply about you', async () => {
    const url = `https://keypad.test/api/leaderboard?game=skyline&date=${DAY}`;
    const shared = await handleGet(new Request(url), redis);
    expect(shared.headers.get('cache-control')).toContain('s-maxage=10');
    const personal = await handleGet(new Request(`${url}&player=${secret(1)}`), redis);
    expect(personal.headers.get('cache-control')).toBe('no-store');
    expect(
      (await handleGet(new Request('https://keypad.test/api/leaderboard'), redis)).status,
    ).toBe(400);
  });
});
