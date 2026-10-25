import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const coil: GameDefinition = {
  id: 'coil',
  title: 'Coil',
  description: 'Eat, grow, and don’t hit the walls — or yourself.',
  thumbnail,
  orientation: 'portrait',
  load: () => import('./createGame').then((m) => m.createGame),
};
