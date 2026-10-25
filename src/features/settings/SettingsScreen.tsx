import { TopBar } from '@/components/TopBar';
import { setSoundEnabled, useSettings } from '@/core/settings/settings';
import { useLeave } from '@/app/useLeave';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const { soundEnabled } = useSettings();
  const leave = useLeave();

  return (
    <main className={styles.screen}>
      <TopBar onBack={leave} title="Settings" />
      <label className={styles.row}>
        <span>Sound</span>
        <input
          type="checkbox"
          checked={soundEnabled}
          onChange={(e) => void setSoundEnabled(e.target.checked)}
          data-testid="sound-toggle"
        />
      </label>
      <p className={styles.note}>
        Scores are saved on this device only. Clearing your browser data removes them.
      </p>
    </main>
  );
}
