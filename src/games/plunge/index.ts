import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const plunge: GameDefinition = {
  id: 'plunge',
  title: 'Plunge',
  description: 'Roll and drop down the rising shaft. Keep off the spikes — it only gets faster.',
  thumbnail,
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
