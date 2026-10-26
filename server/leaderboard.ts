import { createHash } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import { dailySeed, isDate, postableDates } from '../src/core/challenge/daily';
import { seededRandom } from '../src/core/random/seededRandom';
import { replayRun as replayCoil } from '../src/games/coil/verify';
import { replayRun as replaySkyline } from '../src/games/skyline/verify';
import { replayRun as replayStarRaid } from '../src/games/star-raid/verify';
import type { ReplayRun } from '../src/games/types';
import { cleanNickname } from './nickname';

/**
 * The daily leaderboards. A posted run is never trusted: the server rebuilds the day's seed
 * itself, replays the recorded inputs with the game's own rules, and stores only the score that
 * replay reaches. Players have no account — a random secret on their device, of which the
 * boards show only a hash.
 */

export const BOARD_GAMES: Readonly<Record<string, ReplayRun>> = {
  skyline: replaySkyline,
  coil: replayCoil,
  'star-raid': replayStarRaid,
};

export const TOP = 50;
/** Posts per minute from one network address, and per player per day. */
export const IP_PER_MINUTE = 20;
export const PLAYER_PER_DAY = 300;
const KEEP_DAYS = 8;

/**
 * Sorted-set scores carry the score and, below it, how early in the day it was set, so equal
 * scores rank first-come. 2^17 > the seconds in a day; scores stay exact below 2^36.
 */
const TIE = 131072;

const key = {
  board: (game: string, date: string) => `ka:lb:${game}:${date}`,
  name: (player: string) => `ka:name:${player}`,
  ip: (ip: string, minute: number) => `ka:rl:${ip}:${minute}`,
  posts: (player: string, date: string) => `ka:posts:${player}:${date}`,
};

export interface Entry {
  rank: number;
  name: string;
  score: number;
  /** True for the player who asked. */
  you?: boolean;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

/** The public id for a device's secret. The secret itself is never stored or shown. */
export function playerId(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

const isSecret = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{32,64}$/.test(value);

export interface Posted {
  score: number;
  best: number;
  rank: number;
  players: number;
}

export async function postRun(
  redis: Redis,
  body: unknown,
  { now, ip }: { now: number; ip: string },
): Promise<Outcome<Posted>> {
  if (typeof body !== 'object' || body === null) return fail(400, 'Expected a JSON object');
  const { game, date, player, nickname, score, replay } = body as Record<string, unknown>;
  const replayRun = typeof game === 'string' ? BOARD_GAMES[game] : undefined;
  if (!replayRun || typeof game !== 'string') return fail(400, 'No board for that game');
  if (typeof date !== 'string' || !isDate(date) || !postableDates(now).includes(date)) {
    return fail(400, 'Only today’s daily can be posted');
  }
  if (!isSecret(player)) return fail(400, 'Missing player');
  const name = cleanNickname(nickname);
  if (!name) return fail(400, 'Nickname not allowed');
  if (!Number.isInteger(score) || (score as number) < 0) return fail(400, 'Missing score');

  const id = playerId(player);
  const minute = Math.floor(now / 60_000);
  const [fromIp, fromPlayer] = await Promise.all([
    redis.incr(key.ip(ip, minute)),
    redis.incr(key.posts(id, date)),
  ]);
  await Promise.all([
    redis.expire(key.ip(ip, minute), 120),
    redis.expire(key.posts(id, date), 2 * 86_400),
  ]);
  if (fromIp > IP_PER_MINUTE || fromPlayer > PLAYER_PER_DAY) {
    return fail(429, 'Too many posts — try again in a minute');
  }

  const replayed = replayRun(seededRandom(dailySeed(game, date)), replay);
  if (!replayed.ok) return fail(422, `Replay rejected: ${replayed.reason}`);
  if (replayed.score !== score) return fail(422, 'Replay does not match the score');

  const board = key.board(game, date);
  const secondOfDay = Math.floor((now % 86_400_000) / 1000);
  await redis.zadd(
    board,
    { gt: true },
    { score: replayed.score * TIE + (TIE - 1 - secondOfDay), member: id },
  );
  await Promise.all([
    redis.expire(board, KEEP_DAYS * 86_400),
    redis.set(key.name(id), name, { ex: KEEP_DAYS * 86_400 }),
  ]);
  const [rank, best, players] = await Promise.all([
    redis.zrevrank(board, id),
    redis.zscore(board, id),
    redis.zcard(board),
  ]);
  return {
    ok: true,
    value: {
      score: replayed.score,
      best: Math.floor(Number(best) / TIE),
      rank: (rank ?? 0) + 1,
      players,
    },
  };
}

export interface Board {
  game: string;
  date: string;
  players: number;
  top: Entry[];
  /** The asking player's place, when they are on the board but below the top. */
  you: Entry | null;
}

export async function readBoard(
  redis: Redis,
  { game, date, player }: { game: string; date: string; player?: string | null },
): Promise<Outcome<Board>> {
  if (!BOARD_GAMES[game]) return fail(400, 'No board for that game');
  if (!isDate(date)) return fail(400, 'Bad date');
  const board = key.board(game, date);
  const flat = await redis.zrange<(string | number)[]>(board, 0, TOP - 1, {
    rev: true,
    withScores: true,
  });
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    ids.push(String(flat[i]));
    scores.push(Math.floor(Number(flat[i + 1]) / TIE));
  }
  const names = ids.length ? await redis.mget<(string | null)[]>(...ids.map(key.name)) : [];
  const you = isSecret(player) ? playerId(player) : null;
  const top: Entry[] = ids.map((id, i) => ({
    rank: i + 1,
    name: names[i] ?? 'Player',
    score: scores[i] ?? 0,
    ...(id === you ? { you: true } : {}),
  }));
  let mine: Entry | null = null;
  if (you && !ids.includes(you)) {
    const [rank, score, name] = await Promise.all([
      redis.zrevrank(board, you),
      redis.zscore(board, you),
      redis.get<string>(key.name(you)),
    ]);
    if (rank !== null && score !== null) {
      mine = {
        rank: rank + 1,
        name: name ?? 'You',
        score: Math.floor(Number(score) / TIE),
        you: true,
      };
    }
  }
  return { ok: true, value: { game, date, players: await redis.zcard(board), top, you: mine } };
}
