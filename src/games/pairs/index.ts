import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const pairs: GameDefinition = {
  id: 'pairs',
  title: 'Pairs',
  description: 'Turn two cards, remember what you saw, find every pair before the clock runs out.',
  thumbnail,
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
