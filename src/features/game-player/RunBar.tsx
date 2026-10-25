import { useState } from 'react';
import { APP_NAME } from '@/appInfo';
import type { GameDefinition } from '@/games/types';
import { challengeUrl, type Challenge } from '@/core/challenge/challenge';
import { renderShareCard } from '@/core/share/shareCard';
import { shareRun, type ShareOutcome } from '@/core/share/share';
import { PostToBoard } from '@/features/leaderboard/PostToBoard';
import styles from './GamePlayerScreen.module.css';

export interface FinishedRun {
  score: number;
  seed: number;
  /** The run's inputs, for the leaderboard (the server replays them). */
  replay?: unknown;
  /** Counts up per finished run, so a retry that scores the same is still a new run. */
  id: number;
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
  const beat = challenge?.beat ?? null;
  const daily = challenge?.daily ? `Daily #${challenge.daily.number}` : null;
  if (beat !== null) {
    if (!lastRun) return daily ? `${daily}: beat ${beat}` : `Challenge: beat ${beat}`;
    if (lastRun.score > beat) return `You beat ${beat}!`;
    return `${beat + 1 - lastRun.score} short of the challenge — again!`;
  }
  if (daily)
    return lastRun
      ? `${daily}: you scored ${lastRun.score}`
      : `${daily} — the same run for everyone today`;
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
    // A daily is shared as the day (anyone's daily for that date is the same run); anything else
    // as the exact run that was played.
    const daily = challenge?.daily ?? null;
    const url = challengeUrl(window.location.origin, game.id, { seed: run.seed, daily }, run.score);
    const text = daily
      ? `${game.title} Daily #${daily.number}: I scored ${run.score} in ${APP_NAME}. Same run for everyone today — can you beat me? ${url}`
      : `I scored ${run.score} on ${game.title} in ${APP_NAME}. Same run, same game — can you beat me? ${url}`;
    const image = await renderShareCard({
      appName: APP_NAME,
      gameTitle: daily ? `${game.title} · Daily #${daily.number}` : game.title,
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
      {lastRun && challenge?.daily && lastRun.replay !== undefined && (
        // Keyed by the run, so a new run gets a fresh Post button.
        <PostToBoard
          key={lastRun.id}
          game={game.id}
          date={challenge.daily.date}
          score={lastRun.score}
          replay={lastRun.replay}
          onStatus={setNote}
        />
      )}
      {lastRun && (
        <button
          type="button"
          className="button-primary"
          disabled={busy}
          onClick={() => void share(lastRun)}
          data-testid="share-button"
        >
          {challenge?.beat != null && lastRun.score > challenge.beat
            ? 'Brag'
            : 'Challenge a friend'}
        </button>
      )}
    </footer>
  );
}
