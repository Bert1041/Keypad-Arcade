import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@/appInfo';
import { games } from '@/games/registry';
import { getStats, onStatsChanged, type GameStats } from '@/core/scores/scores';
import { dailyPath } from '@/core/challenge/challenge';
import { dailyNumber, hasDaily, utcDate } from '@/core/challenge/daily';
import { UpdatePrompt } from './UpdatePrompt';
import styles from './LibraryScreen.module.css';

export function LibraryScreen() {
  const [stats, setStats] = useState<Record<string, GameStats>>({});
  const today = utcDate();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all(games.map(async (g) => [g.id, await getStats(g.id)] as const))
        .then((entries) => {
          if (!cancelled) setStats(Object.fromEntries(entries));
        })
        .catch(() => {
          // Storage unavailable: show the library without scores.
        });
    void load();
    // A game left a moment ago may still be saving its score.
    const unsubscribe = onStatsChanged(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <h1 className={`${styles.logo} pixel`}>{APP_NAME}</h1>
        <nav className={styles.nav}>
          <Link to="/boards" className={styles.settings} data-testid="boards-link">
            Boards
          </Link>
          <Link to="/settings" className={styles.settings}>
            Settings
          </Link>
        </nav>
      </header>
      <p className={styles.tagline}>The games from your old phone, rebuilt.</p>
      <ul className={styles.grid}>
        {games.map((game) => {
          const best = stats[game.id]?.bestScore ?? 0;
          return (
            <li key={game.id} className={styles.item}>
              <Link
                to={`/play/${game.id}`}
                className={styles.card}
                data-testid={`game-card-${game.id}`}
              >
                <img className={styles.thumb} src={game.thumbnail} alt="" width={96} height={96} />
                <strong className={styles.cardTitle}>{game.title}</strong>
                <span className={styles.cardText}>{game.description}</span>
                <span className={styles.best} data-testid={`best-${game.id}`}>
                  Best: {best}
                </span>
              </Link>
              {game.daily && hasDaily(today) && (
                <Link
                  to={dailyPath(game.id, today)}
                  className={styles.daily}
                  data-testid={`daily-${game.id}`}
                >
                  Daily #{dailyNumber(today)}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {/* Only offered here, never on the game screen, so an update cannot interrupt a run. */}
      <UpdatePrompt />
    </main>
  );
}
