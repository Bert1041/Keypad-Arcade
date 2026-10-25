import { db as defaultDb, type GameStatsRecord, type AppDb } from '@/core/storage/db';

export interface GameStats {
  bestScore: number;
  playCount: number;
  lastPlayedAt: number | null;
}

const EMPTY: GameStats = { bestScore: 0, playCount: 0, lastPlayedAt: null };

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
  return db.transaction('rw', db.gameStats, async () => {
    const current = sanitizeStats(await db.gameStats.get(gameId));
    const next: GameStatsRecord = {
      gameId,
      bestScore: Math.max(current.bestScore, nonNegativeInt(score)),
      playCount: current.playCount + 1,
      lastPlayedAt: now,
    };
    await db.gameStats.put(next);
    return sanitizeStats(next);
  });
}
