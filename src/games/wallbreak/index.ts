import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const wallbreak: GameDefinition = {
  id: 'wallbreak',
  title: 'Wallbreak',
  description: 'Bounce the ball, break the wall. Where it hits the paddle is where it goes.',
  thumbnail,
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
