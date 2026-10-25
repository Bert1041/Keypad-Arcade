import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameDefinition, GameInstance, GameServices } from '@/games/types';
import styles from './GamePlayerScreen.module.css';

interface Props {
  game: GameDefinition;
  services: GameServices;
  /** Freezes the game while true (and resumes it when false). */
  paused: boolean;
  /** Drawn over the game, e.g. the pause screen. */
  overlay?: ReactNode;
}

/**
 * Owns exactly one Phaser instance for as long as it is mounted.
 *
 * The game is created in an effect (never during render) and destroyed in its cleanup.
 * Loading is async, so a cleanup that runs before the module arrives — React StrictMode
 * does this on every mount — must stop the late arrival from creating a game at all.
 */
export function GameHost({ game, services, paused, overlay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef(services);
  const instanceRef = useRef<GameInstance | null>(null);
  const pausedRef = useRef(paused);
  const [failed, setFailed] = useState(false);
  // On a slow connection the game's code takes seconds to arrive: say so, or it looks broken.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) instanceRef.current?.pause();
    else instanceRef.current?.resume();
  }, [paused]);

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
      progress: {
        reachedLevel: servicesRef.current.progress.reachedLevel,
        reachLevel: (level) => servicesRef.current.progress.reachLevel(level),
      },
      onRunComplete: (r) => servicesRef.current.onRunComplete(r),
      onExitRequested: () => servicesRef.current.onExitRequested(),
    };

    setFailed(false);
    setLoading(true);
    game
      .load()
      .then((create) => {
        if (cancelled) return;
        // Don't let a focused shell button keep receiving key presses meant for the game.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        instance = create(parent, stable);
        instanceRef.current = instance;
        setLoading(false);
        // Paused before it finished loading (e.g. the app went to the background): stay paused.
        if (pausedRef.current) instance.pause();
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      instance?.destroy();
      instanceRef.current = null;
    };
  }, [game]);

  return (
    <div className={styles.stage}>
      <div ref={containerRef} className={styles.canvasHost} data-testid="game-container" />
      {loading && !failed && (
        <p className={styles.loading} role="status">
          Loading {game.title}…
        </p>
      )}
      {overlay}
      {failed && (
        <p className={styles.error} role="alert">
          This game couldn't load. If you're offline, open it once with a connection so it can be
          saved for offline play.
        </p>
      )}
    </div>
  );
}
