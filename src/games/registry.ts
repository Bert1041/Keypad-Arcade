import type { GameDefinition } from './types';
import { prototype } from './prototype';

/**
 * Every playable game, in library order. Import only a game's index.ts here — never its
 * createGame, which would pull Phaser into the first-load bundle.
 */
export const games: readonly GameDefinition[] = [prototype];

export function findGame(id: string | undefined): GameDefinition | undefined {
  return games.find((g) => g.id === id);
}
