import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const starRaid: GameDefinition = {
  id: 'star-raid',
  title: 'Star Raid',
  description: 'Hold the line against wave after wave. Drag to steer; you fire automatically.',
  thumbnail,
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
