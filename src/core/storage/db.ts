import Dexie, { type EntityTable } from 'dexie';
import { DB_NAME } from '@/appInfo';

export interface GameStatsRecord {
  gameId: string;
  bestScore: number;
  /** Number of completed runs. */
  playCount: number;
  /** Epoch milliseconds of the most recent completed run. */
  lastPlayedAt: number;
  /**
   * Furthest level unlocked, for games with levels (1 = the first). Not indexed, so adding it
   * needed no schema version; records saved before it existed read as level 1.
   */
  reachedLevel?: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class AppDb extends Dexie {
  gameStats!: EntityTable<GameStatsRecord, 'gameId'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      gameStats: 'gameId',
      settings: 'key',
    });
  }
}

export const db = new AppDb();
