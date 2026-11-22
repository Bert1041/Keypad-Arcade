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
  howToPlay: {
    goal: 'Find all the matching pairs before the clock runs out.',
    controls: ['Tap a card to turn it over, then tap another.', 'On a computer, click.'],
    rules: [
      'A matching pair stays face up. A miss turns both back down: remember where they were.',
      'You start with 60 seconds. Clearing a board adds time and deals a bigger one.',
      'Pairs found in a row score more: 10, 20, 30… up to 50 a pair. A miss starts the count again.',
      'A cleared board pays 50 × its number.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
