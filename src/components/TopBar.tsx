import type { ReactNode } from 'react';
import styles from './TopBar.module.css';

interface Props {
  onBack?: () => void;
  title: string;
  right?: ReactNode;
}

export function TopBar({ onBack, title, right }: Props) {
  return (
    <header className={styles.bar}>
      {onBack ? (
        <button type="button" className={styles.back} onClick={onBack} aria-label="Back to library">
          ◀ Back
        </button>
      ) : (
        <span />
      )}
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.right}>{right}</div>
    </header>
  );
}
