import { useEffect, useState } from 'react';
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
  /**
   * A daily that can still go on today's board, decided when the run finished: not a friend's
   * daily link from an earlier day, which the server would refuse.
   */
  postable: boolean;
}

interface Props {
  game: GameDefinition;
  challenge: Challenge | null;
  lastRun: FinishedRun | null;
}

const OUTCOME_TEXT: Record<Exclude<ShareOutcome, 'failed'>, string> = {
  shared: '',
  cancelled: '',
  copied: 'Link copied — paste it in WhatsApp',
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
  /** The message, shown to copy by hand when neither a share sheet nor the clipboard worked. */
  const [manual, setManual] = useState<string | null>(null);
  const daily = challenge?.daily ?? null;

  // The card is drawn as soon as the run ends, not on the tap: browsers open the share sheet
  // only shortly after a real tap (Safari strictly), and drawing it on a budget phone takes a
  // noticeable moment. By the tap it is ready, and the sheet opens straight away.
  const [card, setCard] = useState<{ run: number; image: Blob } | null>(null);
  useEffect(() => {
    if (!lastRun) return;
    let cancelled = false;
    renderShareCard({
      appName: APP_NAME,
      gameTitle: daily ? `${game.title} · Daily #${daily.number}` : game.title,
      score: lastRun.score,
      host: window.location.host,
    })
      .then((image) => {
        if (!cancelled) setCard({ run: lastRun.id, image });
      })
      .catch(() => {
        // No card: the share goes out as text, which still carries the link.
      });
    return () => {
      cancelled = true;
    };
  }, [lastRun, game, daily]);

  /** Not async before the share call: it must start inside the tap that asked for it. */
  function share(run: FinishedRun) {
    setBusy(true);
    setNote('');
    setManual(null);
    // A daily is shared as the day (anyone's daily for that date is the same run); anything else
    // as the exact run that was played.
    const url = challengeUrl(window.location.origin, game.id, { seed: run.seed, daily }, run.score);
    const text = daily
      ? `${game.title} Daily #${daily.number}: I scored ${run.score} in ${APP_NAME}. Same run for everyone today — can you beat me? ${url}`
      : `I scored ${run.score} on ${game.title} in ${APP_NAME}. Same run, same game — can you beat me? ${url}`;
    const image = card?.run === run.id ? card.image : undefined;
    void shareRun({ text, image }).then((outcome) => {
      if (outcome === 'failed') setManual(text);
      else setNote(OUTCOME_TEXT[outcome]);
      setBusy(false);
      // Hand keyboard focus back so Space goes to the game, not this button.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
  }

  return (
    <footer className={styles.runBar} data-testid="run-bar" data-last-score={lastRun?.score}>
      {manual !== null ? (
        // In-app browsers (WhatsApp's own) often have no share sheet and no clipboard access:
        // the message is shown to select and copy by hand.
        <input
          className={styles.manualShare}
          readOnly
          value={manual}
          aria-label="Your challenge message — press and hold to copy"
          onFocus={(e) => e.currentTarget.select()}
          data-testid="manual-share"
        />
      ) : (
        <span className={styles.runStatus} data-testid="run-status" role="status">
          {note || status(challenge, lastRun)}
        </span>
      )}
      {lastRun?.postable && daily && lastRun.replay !== undefined && (
        // Keyed by the run, so a new run gets a fresh Post button.
        <PostToBoard
          key={lastRun.id}
          game={game.id}
          date={daily.date}
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
