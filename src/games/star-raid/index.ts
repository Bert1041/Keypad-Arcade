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
  howToPlay: {
    goal: 'Survive the waves of enemy ships. You fire by yourself.',
    controls: [
      'Drag anywhere: your ship moves with your finger, so your thumb never hides it.',
      'Keyboard: arrow keys or A / D.',
    ],
    rules: [
      'You have 3 lives. Being shot or rammed costs one; you blink for a moment afterwards.',
      'Bigger ships take more hits and are worth more: 10 to 50 points.',
      'Shoot a carrier and catch the capsule it drops: twin shot, rapid fire, a shield, a bomb or an extra life.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
