import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@/appInfo';
import { games } from '@/games/registry';
import { getStats, type GameStats } from '@/core/scores/scores';
import { TopBar } from '@/components/TopBar';
import { UpdatePrompt } from './UpdatePrompt';
import styles from './LibraryScreen.module.css';

export function LibraryScreen() {
  const [stats, setStats] = useState<Record<string, GameStats>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(games.map(async (g) => [g.id, await getStats(g.id)] as const))
      .then((entries) => {
        if (!cancelled) setStats(Object.fromEntries(entries));
      })
      .catch(() => {
        // Storage unavailable: show the library without scores.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.screen}>
      <TopBar title={APP_NAME} right={<Link to="/settings">Settings</Link>} />
      <ul className={styles.grid}>
        {games.map((game) => {
          const best = stats[game.id]?.bestScore ?? 0;
          return (
            <li key={game.id}>
              <Link
                to={`/play/${game.id}`}
                className={styles.card}
                data-testid={`game-card-${game.id}`}
              >
                <img src={game.thumbnail} alt="" width={64} height={64} />
                <span className={styles.cardText}>
                  <strong>{game.title}</strong>
                  <span>{game.description}</span>
                  <span className={styles.best} data-testid={`best-${game.id}`}>
                    Best: {best}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Only offered here, never on the game screen, so an update cannot interrupt a run. */}
      <UpdatePrompt />
    </main>
  );
}
