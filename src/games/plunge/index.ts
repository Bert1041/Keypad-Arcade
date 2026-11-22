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
  howToPlay: {
    goal: 'Keep dropping from platform to platform as they rise towards the spikes.',
    controls: [
      'Hold the left or right half of the screen to roll that way.',
      'Keyboard: arrow keys or A / D.',
    ],
    rules: [
      'The spikes at the top, falling off the bottom or landing on a spiked platform each cost a life. You have 3.',
      'The platforms rise faster and faster.',
      '10 points a second, 50 a star. A green heart gives you an extra life.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
