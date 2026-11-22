import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const popShot: GameDefinition = {
  id: 'pop-shot',
  title: 'Pop Shot',
  description: 'Aim, bank off the walls, match three. Cut a cluster loose and it all falls.',
  thumbnail,
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
