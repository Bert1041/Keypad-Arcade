import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const seeds: GameDefinition = {
  id: 'seeds',
  title: 'Seeds',
  description:
    'Mancala against the phone: five games, each sharper than the last. Lose one and it is over.',
  thumbnail,
  howToPlay: {
    goal: 'Beat the phone at mancala five games in a row. Lose a game and the run ends.',
    controls: [
      'Tap one of your pits (the left column) to sow its seeds.',
      'Keyboard: keys 1 to 6, or ↑ ↓ to choose and Space to play.',
    ],
    rules: [
      "The seeds are dropped one per place: down your side, into your store at the bottom, then up the phone's side.",
      'Last seed in your store: you go again.',
      "Last seed in an empty pit of yours: you take it, and all the seeds in the phone's pit beside it.",
      'When either side runs out, each side keeps the seeds left on it. Most seeds in the store wins.',
      'Each game pays the seeds in your store, and a win adds 20 × the game number. The phone gets smarter every game.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
