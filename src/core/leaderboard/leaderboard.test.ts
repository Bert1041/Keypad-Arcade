import { beforeEach, describe, expect, it } from 'vitest';
import { AppDb } from '@/core/storage/db';
import { getNickname, playerSecret, saveNickname } from './leaderboard';

let db: AppDb;
let n = 0;
beforeEach(() => {
  db = new AppDb(`leaderboard-test-${n++}`);
});

describe('the player on this device', () => {
  it('gets a 256-bit secret once, and keeps it', async () => {
    const first = await playerSecret(db);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await playerSecret(db)).toBe(first);
    expect(await playerSecret(new AppDb(`leaderboard-test-${n++}`))).not.toBe(first);
  });

  it('replaces a corrupt stored secret instead of sending it', async () => {
    await db.settings.put({ key: 'player.secret', value: 'oops' });
    expect(await playerSecret(db)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('saves a tidy nickname, and refuses one the server would refuse for its form', async () => {
    expect(await getNickname(db)).toBeNull();
    expect(await saveNickname('  Ada   L ', db)).toBe('Ada L');
    expect(await getNickname(db)).toBe('Ada L');
    expect(await saveNickname('x', db)).toBeNull();
    expect(await saveNickname('Аda', db)).toBeNull(); // Cyrillic А
    expect(await getNickname(db)).toBe('Ada L');
  });
});
