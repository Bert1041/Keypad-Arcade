import { TopBar } from '@/components/TopBar';
import { setSoundEnabled, useSettings } from '@/core/settings/settings';
import { useLeave } from '@/app/useLeave';
import { NicknameRow } from './NicknameRow';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const { soundEnabled } = useSettings();
  const leave = useLeave();

  return (
    <main className={styles.screen}>
      <TopBar onBack={leave} title="Settings" />
      <div className={styles.list}>
        <label className={styles.row}>
          <span>Sound</span>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => void setSoundEnabled(e.target.checked)}
            data-testid="sound-toggle"
          />
        </label>
        <NicknameRow />
        <p className={styles.note}>
          Your scores and settings are saved on this device. Clearing your browser data removes
          them. When you post a daily run to a board, we receive your nickname, that run (its score
          and moves) and a random ID made on this device — no account, email or location. Boards are
          public and kept for about a week.
        </p>
      </div>
    </main>
  );
}
