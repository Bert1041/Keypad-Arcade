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
  howToPlay: {
    goal: 'Break every brick with the ball. A cleared wall brings the next, faster one.',
    controls: [
      'Drag to move the paddle; tap to serve the ball.',
      'Where the ball hits the paddle decides where it goes: the middle sends it straight up, the edges at an angle.',
      'On a computer: move the mouse, or use the arrow keys or A / D; Space serves.',
    ],
    rules: [
      'Let the ball past the paddle and you lose a life. You have 3.',
      'Darker bricks take two hits.',
      'Catch the falling capsules: W wide paddle, M more balls, S slower ball, + an extra life.',
      '10 a brick, 25 a capsule, 100 × the level for a cleared wall.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
