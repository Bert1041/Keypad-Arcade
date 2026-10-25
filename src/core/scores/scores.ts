import { db as defaultDb, type GameStatsRecord, type AppDb } from '@/core/storage/db';

export interface GameStats {
  bestScore: number;
  playCount: number;
  lastPlayedAt: number | null;
  /** Furthest level unlocked; 1 for games without levels. */
  reachedLevel: number;
}

const listeners = new Set<() => void>();

/**
 * Called after any score or progress write has been saved. A save can land after a screen has
 * already read the scores — leaving a game saves on the way out — so readers listen instead of
 * reading once. Returns the unsubscribe function.
 */
export function onStatsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed<T>(saved: T): T {
  for (const listener of listeners) listener();
  return saved;
}

const EMPTY: GameStats = { bestScore: 0, playCount: 0, lastPlayedAt: null, reachedLevel: 1 };

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Saved data can be corrupt or from an older shape; never let that crash the app. */
export function sanitizeStats(record: Partial<GameStatsRecord> | undefined): GameStats {
  if (!record || typeof record !== 'object') return { ...EMPTY };
  const last = record.lastPlayedAt;
  return {
    bestScore: nonNegativeInt(record.bestScore),
    playCount: nonNegativeInt(record.playCount),
    lastPlayedAt: typeof last === 'number' && Number.isFinite(last) ? last : null,
    reachedLevel: Math.max(1, nonNegativeInt(record.reachedLevel)),
  };
}

/** Back to the stored shape. Writes always go through this, so no field is ever dropped. */
function toRecord(gameId: string, stats: GameStats): GameStatsRecord {
  return {
    gameId,
    bestScore: stats.bestScore,
    playCount: stats.playCount,
    lastPlayedAt: stats.lastPlayedAt ?? 0,
    reachedLevel: stats.reachedLevel,
  };
}

export async function getStats(gameId: string, db: AppDb = defaultDb): Promise<GameStats> {
  return sanitizeStats(await db.gameStats.get(gameId));
}

export async function recordRun(
  gameId: string,
  score: number,
  db: AppDb = defaultDb,
  now: number = Date.now(),
): Promise<GameStats> {
  const saved = await db.transaction('rw', db.gameStats, async () => {
    const current = sanitizeStats(await db.gameStats.get(gameId));
    const next: GameStats = {
      ...current,
      bestScore: Math.max(current.bestScore, nonNegativeInt(score)),
      playCount: current.playCount + 1,
      lastPlayedAt: now,
    };
    await db.gameStats.put(toRecord(gameId, next));
    return next;
  });
  return changed(saved);
}

/** Unlocks up to `level`. Never goes backwards, and leaves scores untouched. */
export async function recordLevelReached(
  gameId: string,
  level: number,
  db: AppDb = defaultDb,
): Promise<GameStats> {
  const saved = await db.transaction('rw', db.gameStats, async () => {
    const current = sanitizeStats(await db.gameStats.get(gameId));
    const next: GameStats = {
      ...current,
      reachedLevel: Math.max(current.reachedLevel, nonNegativeInt(level)),
    };
    await db.gameStats.put(toRecord(gameId, next));
    return next;
  });
  return changed(saved);
}
