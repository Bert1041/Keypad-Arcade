import type { GameDefinition } from './types';
import { coil } from './coil';
import { prototype } from './prototype';
import { rebound } from './rebound';
import { starRaid } from './star-raid';

/**
 * Every playable game, in library order. Import only a game's index.ts here — never its
 * createGame, which would pull Phaser into the first-load bundle.
 *
 * The prototype is the game host's test fixture: shown in development and e2e builds, never
 * to players (a production build drops it entirely).
 */
export const games: readonly GameDefinition[] = [
  coil,
  starRaid,
  rebound,
  ...(import.meta.env.DEV || import.meta.env.VITE_E2E === '1' ? [prototype] : []),
];

export function findGame(id: string | undefined): GameDefinition | undefined {
  return games.find((g) => g.id === id);
}
