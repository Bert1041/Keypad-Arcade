import { useEffect, useRef, useState } from 'react';
import type { GameDefinition, GameInstance, GameServices } from '@/games/types';
import styles from './GamePlayerScreen.module.css';

interface Props {
  game: GameDefinition;
  services: GameServices;
}

/**
 * Owns exactly one Phaser instance for as long as it is mounted.
 *
 * The game is created in an effect (never during render) and destroyed in its cleanup.
 * Loading is async, so a cleanup that runs before the module arrives — React StrictMode
 * does this on every mount — must stop the late arrival from creating a game at all.
 */
export function GameHost({ game, services }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef(services);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    servicesRef.current = services;
  }, [services]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    let cancelled = false;
    let instance: GameInstance | undefined;

    // Delegate through the ref so the game always calls the latest callbacks without
    // being recreated when the parent re-renders.
    const stable: GameServices = {
      sfx: servicesRef.current.sfx,
      beginRun: () => servicesRef.current.beginRun(),
      bestScore: servicesRef.current.bestScore,
      onRunComplete: (r) => servicesRef.current.onRunComplete(r),
      onExitRequested: () => servicesRef.current.onExitRequested(),
    };

    setFailed(false);
    game
      .load()
      .then((create) => {
        if (cancelled) return;
        // Don't let a focused shell button keep receiving key presses meant for the game.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        instance = create(parent, stable);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [game]);

  return (
    <div className={styles.stage}>
      <div ref={containerRef} className={styles.canvasHost} data-testid="game-container" />
      {failed && (
        <p className={styles.error} role="alert">
          This game couldn't load. If you're offline, open it once with a connection so it can be
          saved for offline play.
        </p>
      )}
    </div>
  );
}
