import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NICKNAME, saveNickname, tidyNickname } from '@/core/leaderboard/leaderboard';
import styles from './Leaderboard.module.css';

interface Props {
  initial?: string;
  onSaved: (nickname: string) => void;
  onCancel: () => void;
}

/** Asks for the name shown on the public boards. Escape or Cancel closes it. */
export function NicknameDialog({ initial = '', onSaved, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!NICKNAME.test(tidyNickname(value))) {
      setError('3–12 letters, numbers, spaces or _ . -');
      return;
    }
    const saved = await saveNickname(value).catch(() => null);
    if (saved) onSaved(saved);
    else setError('Couldn’t save it on this device');
  }

  return (
    <div
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nickname-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <form className={styles.dialogBox} onSubmit={(e) => void submit(e)}>
        <h2 id="nickname-title" className={`${styles.dialogTitle} pixel`}>
          Your name
        </h2>
        <p className={styles.muted}>Shown next to your score on today’s public board.</p>
        <input
          ref={input}
          className={styles.input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          maxLength={20}
          autoComplete="nickname"
          aria-label="Nickname"
          aria-invalid={error !== ''}
          aria-describedby="nickname-error"
          data-testid="nickname-input"
        />
        <p id="nickname-error" className={styles.error} role="alert">
          {error}
        </p>
        <div className={styles.dialogButtons}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button-primary" data-testid="nickname-save">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
