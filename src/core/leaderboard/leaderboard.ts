import { db as defaultDb, type AppDb } from '@/core/storage/db';

/**
 * The client side of the daily leaderboards (the server is server/leaderboard.ts). A player is a
 * random secret kept on this device — no account — plus the nickname shown on the boards. The
 * server replays every posted run, so nothing here is trusted; it only carries the run there.
 */

/** Mirrors the server's rule for instant feedback; the server also refuses blocked words. */
export const NICKNAME = /^[A-Za-z0-9 _.-]{3,12}$/;
export const tidyNickname = (raw: string) => raw.trim().replace(/\s+/g, ' ');

const SECRET_KEY = 'player.secret';
const NICKNAME_KEY = 'player.nickname';

export interface Entry {
  rank: number;
  name: string;
  score: number;
  you?: boolean;
}

export interface Board {
  game: string;
  date: string;
  players: number;
  top: Entry[];
  you: Entry | null;
}

export interface Posted {
  score: number;
  best: number;
  rank: number;
  players: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** This device's player secret, created on first use. */
export async function playerSecret(db: AppDb = defaultDb): Promise<string> {
  const stored = await db.settings.get(SECRET_KEY);
  if (typeof stored?.value === 'string' && /^[0-9a-f]{64}$/.test(stored.value)) {
    return stored.value;
  }
  const secret = newSecret();
  await db.settings.put({ key: SECRET_KEY, value: secret });
  return secret;
}

export async function getNickname(db: AppDb = defaultDb): Promise<string | null> {
  const stored = await db.settings.get(NICKNAME_KEY);
  return typeof stored?.value === 'string' && NICKNAME.test(stored.value) ? stored.value : null;
}

export async function saveNickname(raw: string, db: AppDb = defaultDb): Promise<string | null> {
  const name = tidyNickname(raw);
  if (!NICKNAME.test(name)) return null;
  await db.settings.put({ key: NICKNAME_KEY, value: name });
  return name;
}

async function call<T>(request: Promise<Response>): Promise<Result<T>> {
  try {
    const response = await request;
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.ok) return { ok: true, value: body as T };
    return { ok: false, message: body.error ?? 'The boards are not available right now' };
  } catch {
    return { ok: false, message: 'Can’t reach the boards — check your connection' };
  }
}

export async function postDailyRun(
  run: { game: string; date: string; score: number; replay: unknown },
  nickname: string,
  db: AppDb = defaultDb,
): Promise<Result<Posted>> {
  const player = await playerSecret(db);
  return call<Posted>(
    fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...run, player, nickname }),
    }),
  );
}

export async function fetchBoard(
  game: string,
  date: string,
  db: AppDb = defaultDb,
): Promise<Result<Board>> {
  const player = await playerSecret(db);
  const query = new URLSearchParams({ game, date, player });
  return call<Board>(fetch(`/api/leaderboard?${query}`));
}
