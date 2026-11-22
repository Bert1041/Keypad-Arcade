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
  howToPlay: {
    goal: 'Eat the pellets and grow as long as you can.',
    controls: ['Swipe up, down, left or right to turn.', 'Keyboard: arrow keys or WASD.'],
    rules: [
      'Running into a wall or your own tail ends the run.',
      'Each pellet makes you longer and a little faster.',
      'A pellet is worth 10. Every 5th one brings a bonus worth 50: grab it before it blinks out.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
