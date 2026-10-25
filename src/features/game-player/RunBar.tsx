import { useState } from 'react';
import { APP_NAME } from '@/appInfo';
import type { GameDefinition } from '@/games/types';
import { challengeUrl, type Challenge } from '@/core/challenge/challenge';
import { renderShareCard } from '@/core/share/shareCard';
import { shareRun, type ShareOutcome } from '@/core/share/share';
import styles from './GamePlayerScreen.module.css';

export interface FinishedRun {
  score: number;
  seed: number;
}

interface Props {
  game: GameDefinition;
  challenge: Challenge | null;
  lastRun: FinishedRun | null;
}

const OUTCOME_TEXT: Record<ShareOutcome, string> = {
  shared: '',
  cancelled: '',
  copied: 'Link copied — paste it in WhatsApp',
  failed: "Couldn't share from this browser",
};

function status(challenge: Challenge | null, lastRun: FinishedRun | null): string {
  if (challenge) {
    if (!lastRun) return `Challenge: beat ${challenge.beat}`;
    if (lastRun.score > challenge.beat) return `You beat ${challenge.beat}!`;
    return `${challenge.beat + 1 - lastRun.score} short of the challenge — again!`;
  }
  return lastRun ? `Score ${lastRun.score}` : '';
}

/**
 * Always rendered at a fixed height: if it appeared only after a run, the stage would shrink
 * and the game would rescale at the moment of game over.
 */
export function RunBar({ game, challenge, lastRun }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function share(run: FinishedRun) {
    setBusy(true);
    setNote('');
    const url = challengeUrl(window.location.origin, game.id, { seed: run.seed, beat: run.score });
    const text = `I scored ${run.score} on ${game.title} in ${APP_NAME}. Same run, same game — can you beat me? ${url}`;
    const image = await renderShareCard({
      appName: APP_NAME,
      gameTitle: game.title,
      score: run.score,
      host: window.location.host,
    }).catch(() => undefined);
    const outcome = await shareRun({ text, image });
    setNote(OUTCOME_TEXT[outcome]);
    setBusy(false);
    // Hand keyboard focus back so Space goes to the game, not this button.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  return (
    <footer className={styles.runBar} data-testid="run-bar" data-last-score={lastRun?.score}>
      <span className={styles.runStatus} data-testid="run-status" role="status">
        {note || status(challenge, lastRun)}
      </span>
      {lastRun && (
        <button
          type="button"
          className="button-primary"
          disabled={busy}
          onClick={() => void share(lastRun)}
          data-testid="share-button"
        >
          {challenge && lastRun.score > challenge.beat ? 'Brag' : 'Challenge a friend'}
        </button>
      )}
    </footer>
  );
}
