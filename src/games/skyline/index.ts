import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const skyline: GameDefinition = {
  id: 'skyline',
  title: 'Skyline',
  description: 'Drop each floor off the crane and build as high as you can. One tap.',
  thumbnail,
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
