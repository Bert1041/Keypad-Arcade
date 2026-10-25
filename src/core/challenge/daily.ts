/**
 * The daily challenge: one run per game per day, the same for everyone, numbered like a
 * newspaper puzzle. The seed comes from the date alone, so no server is needed.
 */

/** Daily #1. Earlier dates have no daily. Set this to the launch date when launching. */
export const DAILY_EPOCH = '2026-10-26';

/** Whether there is a daily on `date` (none before Daily #1). */
export function hasDaily(date: string): boolean {
  return isDate(date) && date >= DAILY_EPOCH;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in UTC — one day boundary for everyone, wherever they are. */
export function utcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30 and friends). */
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Days since the epoch, counting from 1. */
export function dailyNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / DAY_MS;
  return Math.round(days) + 1;
}

/**
 * The day's seed for a game: FNV-1a (32-bit) of "gameId:date". Pinned by golden-value tests —
 * changing it would change every daily already played and shared.
 */
export function dailySeed(gameId: string, date: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${gameId}:${date}`)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
