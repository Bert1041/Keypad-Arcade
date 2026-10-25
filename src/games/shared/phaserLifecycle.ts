import Phaser from 'phaser';

/**
 * Counts Phaser games that have been created but not yet fully destroyed. End-to-end
 * tests read this to prove that leaving a game really stops its loop, rather than
 * trusting that the canvas disappeared from the DOM.
 */
const live = new Set<Phaser.Game>();

if (import.meta.env.VITE_E2E === '1' && typeof window !== 'undefined') {
  window.__GAME_HOST_E2E__ = {
    liveGames: () => live.size,
    // A game exists before it boots; taps sent before a scene is active are silently lost.
    playableGames: () =>
      [...live].filter((g) => g.isRunning && g.scene.getScenes(true).length > 0).length,
  };
}

export function trackPhaserGame(game: Phaser.Game): Phaser.Game {
  live.add(game);
  game.events.once(Phaser.Core.Events.DESTROY, () => live.delete(game));
  return game;
}
