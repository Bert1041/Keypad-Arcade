import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './LibraryScreen.module.css';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className={styles.toast} role="status">
      <span>A new version is ready.</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Update
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
