import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const rebound: GameDefinition = {
  id: 'rebound',
  title: 'Rebound',
  description: 'Roll, jump and collect every ring to open the exit. Mind the spikes.',
  thumbnail,
  howToPlay: {
    goal: 'Roll and bounce through the levels. Collect every ring to open the exit.',
    controls: [
      'Use the pad under the level: ◀ ▶ to roll, JUMP to jump. You can hold a direction and jump at once.',
      'Hold JUMP for a full jump, tap it for a small hop.',
      'Keyboard: arrows or A / D to roll; Space, W or ↑ to jump.',
    ],
    rules: [
      'Spikes cost a life; you have 3. Pass a checkpoint and you come back there.',
      'Pads change your size: a small ball fits through grates, a big one floats in water.',
      'Rings 20, gems 50, a cleared level 500, plus a bonus for finishing fast.',
      'Next time you play, you carry on from the furthest level you reached.',
    ],
  },
  orientation: 'portrait',
  load: () => import('./createGame').then((m) => m.createGame),
};
