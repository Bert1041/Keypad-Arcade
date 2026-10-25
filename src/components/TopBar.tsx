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
          <svg
            width="16"
            height="16"
            viewBox="0 0 8 8"
            aria-hidden="true"
            shapeRendering="crispEdges"
          >
            <path d="M5 1h1v1H5zM4 2h1v1H4zM3 3h1v2H3zM4 5h1v1H4zM5 6h1v1H5z" fill="currentColor" />
          </svg>
          <span className={styles.backText}>Back</span>
        </button>
      ) : (
        <span />
      )}
      <h1 className={`${styles.title} pixel`}>{title}</h1>
      <div className={styles.right}>{right}</div>
    </header>
  );
}
