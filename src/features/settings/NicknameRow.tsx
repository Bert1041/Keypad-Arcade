import { useEffect, useState } from 'react';
import { getNickname } from '@/core/leaderboard/leaderboard';
import { NicknameDialog } from '@/features/leaderboard/NicknameDialog';
import styles from './SettingsScreen.module.css';

/** The name on the boards; changing it renames you on boards you post to from now on. */
export function NicknameRow() {
  const [nickname, setNickname] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getNickname()
      .then((name) => {
        if (!cancelled) setNickname(name);
      })
      .catch(() => {
        // Storage unavailable: shown as not set.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.row}>
      <span>Name on boards</span>
      <button type="button" onClick={() => setEditing(true)} data-testid="nickname-edit">
        {nickname ?? 'Set'}
      </button>
      {editing && (
        <NicknameDialog
          initial={nickname ?? ''}
          onSaved={(name) => {
            setNickname(name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
