import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { GameDefinition } from '@/games/types';
import styles from './GamePlayerScreen.module.css';

interface Props {
  game: GameDefinition;
  /** Where closing goes: back to the game, or back to the pause screen it was opened from. */
  closeLabel: string;
  onClose: () => void;
}

/**
 * A game's rules and controls, drawn over the frozen game, opening at the top. The close button
 * takes the focus, so Enter, Space or Escape goes back.
 */
export function HowToPlayScreen({ game, closeLabel, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Without preventScroll, focusing the button at the bottom scrolls a long page down to it,
    // and players open the rules looking at the scoring, past the goal and controls.
    close.current?.focus({ preventScroll: true });
  }, []);
  const { goal, controls, rules } = game.howToPlay;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // The game is paused, so Escape is ours: close, rather than leave the game.
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className={styles.howTo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-to-title"
      onKeyDown={onKeyDown}
    >
      <div className={styles.howToBody}>
        <h2 id="how-to-title" className={`${styles.pauseTitle} pixel`}>
          How to play
        </h2>
        <p className={styles.howToGoal}>{goal}</p>
        <h3 className={styles.howToHeading}>Controls</h3>
        <ul className={styles.howToList}>
          {controls.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h3 className={styles.howToHeading}>Rules</h3>
        <ul className={styles.howToList}>
          {rules.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button ref={close} type="button" className="button-primary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
