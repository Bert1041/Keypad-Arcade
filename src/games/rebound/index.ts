import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const rebound: GameDefinition = {
  id: 'rebound',
  title: 'Rebound',
  description: 'Roll, jump and collect every ring to open the exit. Mind the spikes.',
  thumbnail,
  orientation: 'portrait',
  load: () => import('./createGame').then((m) => m.createGame),
};
