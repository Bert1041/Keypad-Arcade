import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDb } from '@/core/storage/db';
import { getStats, recordLevelReached, recordRun, sanitizeStats } from './scores';

let db: AppDb;
let n = 0;

beforeEach(() => {
  db = new AppDb(`test-${n++}`);
});
afterEach(async () => {
  await db.delete();
});

describe('recordRun', () => {
  it('keeps the best score, counts every run and stamps the time', async () => {
    await recordRun('prototype', 5, db, 1000);
    await recordRun('prototype', 3, db, 2000);
    const stats = await recordRun('prototype', 9, db, 3000);
    expect(stats).toEqual({ bestScore: 9, playCount: 3, lastPlayedAt: 3000, reachedLevel: 1 });
    expect(await getStats('prototype', db)).toEqual(stats);
  });

  it('a lower score never lowers the best', async () => {
    await recordRun('prototype', 9, db, 1);
    const stats = await recordRun('prototype', 2, db, 2);
    expect(stats.bestScore).toBe(9);
  });

  it('keeps games independent', async () => {
    await recordRun('a', 10, db);
    await recordRun('b', 1, db);
    expect((await getStats('a', db)).bestScore).toBe(10);
    expect((await getStats('b', db)).bestScore).toBe(1);
  });

  it('recovers from a corrupt saved record instead of throwing', async () => {
    await db.gameStats.put({
      gameId: 'prototype',
      bestScore: 'lots',
      playCount: NaN,
      lastPlayedAt: null,
    } as never);
    const stats = await recordRun('prototype', 4, db, 50);
    expect(stats).toEqual({ bestScore: 4, playCount: 1, lastPlayedAt: 50, reachedLevel: 1 });
  });
});

describe('sanitizeStats', () => {
  it('returns empty stats for a missing record', () => {
    expect(sanitizeStats(undefined)).toEqual({
      bestScore: 0,
      playCount: 0,
      lastPlayedAt: null,
      reachedLevel: 1,
    });
  });

  it('rejects negative and non-finite numbers', () => {
    expect(sanitizeStats({ bestScore: -3, playCount: Infinity })).toMatchObject({
      bestScore: 0,
      playCount: 0,
    });
  });
});

describe('level progress', () => {
  it('unlocks levels and never goes backwards', async () => {
    expect((await recordLevelReached('rebound', 3, db)).reachedLevel).toBe(3);
    expect((await recordLevelReached('rebound', 2, db)).reachedLevel).toBe(3);
    expect((await getStats('rebound', db)).reachedLevel).toBe(3);
  });

  it('saving a score keeps the level progress', async () => {
    await recordLevelReached('rebound', 4, db);
    await recordRun('rebound', 120, db, 10);
    expect(await getStats('rebound', db)).toMatchObject({ reachedLevel: 4, bestScore: 120 });
  });

  it('saving progress keeps the scores', async () => {
    await recordRun('rebound', 120, db, 10);
    await recordLevelReached('rebound', 2, db);
    expect(await getStats('rebound', db)).toEqual({
      bestScore: 120,
      playCount: 1,
      lastPlayedAt: 10,
      reachedLevel: 2,
    });
  });

  it('reads records saved before progress existed as level 1', async () => {
    await db.gameStats.put({ gameId: 'rebound', bestScore: 5, playCount: 1, lastPlayedAt: 1 });
    expect((await getStats('rebound', db)).reachedLevel).toBe(1);
  });
});
