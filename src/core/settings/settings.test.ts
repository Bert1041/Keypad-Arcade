import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDb } from '@/core/storage/db';
import { getSettings, loadSettings, setSoundEnabled } from './settings';

let db: AppDb;
let n = 0;

beforeEach(() => {
  db = new AppDb(`settings-${n++}`);
});
afterEach(async () => {
  await db.delete();
});

describe('settings', () => {
  it('defaults sound on when nothing is saved', async () => {
    expect((await loadSettings(db)).soundEnabled).toBe(true);
  });

  it('persists a change and reads it back after a fresh load', async () => {
    await setSoundEnabled(false, db);
    await loadSettings(new AppDb(db.name)); // a new connection, like a reload
    expect(getSettings().soundEnabled).toBe(false);
  });

  it('ignores a malformed saved value', async () => {
    await db.settings.put({ key: 'soundEnabled', value: 'nope' });
    expect((await loadSettings(db)).soundEnabled).toBe(true);
  });
});
