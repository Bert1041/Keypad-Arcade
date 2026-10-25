import Phaser from 'phaser';
import type { GameInstance } from '@/games/types';

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
    pausedGames: () => [...live].filter((g) => g.isPaused).length,
  };
}

/** Phaser hands key and pointer events to scenes as they arrive, even while paused. */
function setInput(game: Phaser.Game, enabled: boolean) {
  game.input.enabled = enabled;
  if (game.input.keyboard) game.input.keyboard.enabled = enabled;
}

/**
 * Registers a Phaser game with the host and gives the shell its controls. Every game's
 * createGame returns this, so destroy, pause and resume behave the same in every game.
 */
export function trackPhaserGame(game: Phaser.Game): GameInstance {
  live.add(game);
  // Phaser misses its container changing size on rotation: it kept the old size, overflowing
  // the bars in landscape and shrinking back in portrait. Watch the container and refresh.
  let resize: ResizeObserver | null = null;
  game.events.once(Phaser.Core.Events.READY, () => {
    const parent = game.scale.parent as HTMLElement | null;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    resize = new ResizeObserver(() => game.scale.refresh());
    resize.observe(parent);
  });
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    resize?.disconnect();
    live.delete(game);
  });
  return {
    destroy: () => game.destroy(true),
    pause: () => {
      game.pause();
      // Without this, Space on the pause screen could start or change a run behind it.
      setInput(game, false);
    },
    resume: () => {
      setInput(game, true);
      game.resume();
    },
  };
}
