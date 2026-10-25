import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { useLeave } from '@/app/useLeave';
import { dailyPath } from '@/core/challenge/challenge';
import { DAILY_EPOCH, dailyNumber, hasDaily, utcDate } from '@/core/challenge/daily';
import { fetchBoard, type Board, type Entry } from '@/core/leaderboard/leaderboard';
import { games } from '@/games/registry';
import styles from './Leaderboard.module.css';

/** Games with a daily have a board: the same run for everyone makes it a fair race. */
const boardGames = games.filter((g) => g.daily);

type Load =
  { state: 'loading' } | { state: 'ready'; board: Board } | { state: 'error'; message: string };

function Row({ entry }: { entry: Entry }) {
  return (
    <li className={entry.you ? `${styles.row} ${styles.you}` : styles.row} data-testid="board-row">
      <span className={`${styles.rank} pixel`}>{entry.rank}</span>
      <span className={styles.name}>
        {entry.name}
        {entry.you && <span className={styles.youTag}> (you)</span>}
      </span>
      <span className={`${styles.score} pixel`}>{entry.score}</span>
    </li>
  );
}

export function LeaderboardScreen() {
  const leave = useLeave();
  const [params, setParams] = useSearchParams();
  const game = boardGames.find((g) => g.id === params.get('game')) ?? boardGames[0];
  const today = utcDate();
  const [attempt, setAttempt] = useState(0);
  // Each result remembers the request it answers; until the current request has its answer the
  // board is loading, so switching tabs never shows the previous game's board.
  const request = `${game?.id}:${today}:${attempt}`;
  const [result, setResult] = useState<{ request: string; load: Load } | null>(null);
  const load: Load = result?.request === request ? result.load : { state: 'loading' };

  useEffect(() => {
    if (!game || !hasDaily(today)) return;
    let cancelled = false;
    const answer = (load: Load) => {
      if (!cancelled) setResult({ request, load });
    };
    fetchBoard(game.id, today)
      .then((r) =>
        answer(r.ok ? { state: 'ready', board: r.value } : { state: 'error', message: r.message }),
      )
      .catch(() => answer({ state: 'error', message: 'Couldn’t load the board' }));
    return () => {
      cancelled = true;
    };
  }, [game, today, request]);

  if (!game) return null;
  return (
    <main className={styles.screen}>
      <TopBar onBack={leave} title="Boards" />
      <nav className={styles.tabs} aria-label="Game">
        {boardGames.map((g) => (
          <button
            key={g.id}
            type="button"
            className={styles.tab}
            aria-pressed={g.id === game.id}
            onClick={() => setParams({ game: g.id }, { replace: true })}
            data-testid={`board-tab-${g.id}`}
          >
            {g.title}
          </button>
        ))}
      </nav>
      {!hasDaily(today) ? (
        <p className={styles.muted}>The first daily — and its board — opens on {DAILY_EPOCH}.</p>
      ) : (
        <section aria-labelledby="board-title" aria-busy={load.state === 'loading'}>
          <h2 id="board-title" className={styles.heading}>
            {game.title} · Daily #{dailyNumber(today)}
          </h2>
          {load.state === 'loading' && <p className={styles.muted}>Loading…</p>}
          {load.state === 'error' && (
            <p className={styles.muted} data-testid="board-error">
              {load.message}{' '}
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
          {load.state === 'ready' &&
            (load.board.players === 0 ? (
              <p className={styles.muted} data-testid="board-empty">
                No scores yet today — be the first.
              </p>
            ) : (
              <>
                <p className={styles.muted} data-testid="board-players">
                  {load.board.players === 1 ? '1 player' : `${load.board.players} players`} today
                </p>
                <ol className={styles.list}>
                  {load.board.top.map((entry) => (
                    <Row key={entry.rank} entry={entry} />
                  ))}
                </ol>
                {load.board.you && (
                  <ol className={styles.list} aria-label="Your place">
                    <Row entry={load.board.you} />
                  </ol>
                )}
              </>
            ))}
          <Link className={`button button-primary ${styles.play}`} to={dailyPath(game.id, today)}>
            Play today’s {game.title}
          </Link>
        </section>
      )}
    </main>
  );
}
