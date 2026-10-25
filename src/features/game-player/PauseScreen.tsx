import { useEffect, useRef } from 'react';
import styles from './GamePlayerScreen.module.css';

interface Props {
  onResume: () => void;
  onQuit: () => void;
}

/** Drawn over a frozen game. Resume takes the focus, so Enter or Space continues. */
export function PauseScreen({ onResume, onQuit }: Props) {
  const resume = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    resume.current?.focus();
  }, []);

  return (
    <div className={styles.pause} role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <h2 id="pause-title" className={`${styles.pauseTitle} pixel`}>
        Paused
      </h2>
      <button ref={resume} type="button" className="button-primary" onClick={onResume}>
        Resume
      </button>
      <button type="button" onClick={onQuit}>
        Back to library
      </button>
    </div>
  );
}
