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
  howToPlay: {
    goal: 'Pop the bubbles before the pile reaches the line above you.',
    controls: [
      'Drag to aim: the dotted line shows where the bubble will go, bouncing off the walls. Let go to shoot.',
      'Let go down by the shooter to cancel the shot.',
      'On a computer: aim with the mouse and click, or aim with the arrow keys and shoot with Space.',
    ],
    rules: [
      'Three or more of the same colour touching pop.',
      'Bubbles left hanging from nothing fall, for double points.',
      'Every few shots a new row pushes down from the top. The dots at the top right count down to it.',
      "Don't wait too long: after 8 seconds the bubble fires by itself.",
      '10 a popped bubble, 20 a falling one, 500 for clearing the board.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
