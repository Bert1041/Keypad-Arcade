import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { findGame } from '@/games/registry';
import type { GameDefinition, GameServices, RunResult } from '@/games/types';
import { getStats, recordRun } from '@/core/scores/scores';
import { createSfx } from '@/core/audio/sfx';
import { parseChallenge, type Challenge } from '@/core/challenge/challenge';
import { createRunSeeds } from '@/core/random/runSeeds';
import { TopBar } from '@/components/TopBar';
import { useLeave } from '@/app/useLeave';
import { GameHost } from './GameHost';
import { RunBar, type FinishedRun } from './RunBar';
import styles from './GamePlayerScreen.module.css';

const sfx = createSfx();

export function GamePlayerScreen() {
  const { gameId } = useParams();
  const [searchParams] = useSearchParams();
  const game = findGame(gameId);
  const query = searchParams.toString();
  const challenge = useMemo(() => parseChallenge(new URLSearchParams(query)), [query]);

  if (!game) return <Navigate to="/" replace />;
  // A new key per game and per challenge: switching remounts with fresh state.
  return <GameSession key={`${game.id}?${query}`} game={game} challenge={challenge} />;
}

function GameSession({ game, challenge }: { game: GameDefinition; challenge: Challenge | null }) {
  const leave = useLeave();
  // Read once before the game starts so it can judge "new best"; never changes afterwards,
  // so the game is never recreated by a score update.
  const [launchBest, setLaunchBest] = useState<number | undefined>(undefined);
  // What the top bar shows; updated after every run.
  const [bestScore, setBestScore] = useState<number | undefined>(undefined);
  const [lastRun, setLastRun] = useState<FinishedRun | null>(null);
  const seeds = useMemo(() => createRunSeeds(challenge?.seed ?? null), [challenge]);

  useEffect(() => {
    let cancelled = false;
    // Can't reject: a storage failure is turned into a best of 0 above the last step.
    void getStats(game.id)
      .then((s) => s.bestScore)
      .catch(() => 0)
      .then((best) => {
        if (cancelled) return;
        setLaunchBest(best);
        setBestScore(best);
      });
    return () => {
      cancelled = true;
    };
  }, [game]);

  const onRunComplete = useCallback(
    (result: RunResult) => {
      setLastRun({ score: result.score, seed: seeds.current() });
      recordRun(game.id, result.score)
        .then((s) => setBestScore(s.bestScore))
        .catch(() => {
          // Storage can be unavailable (private mode); the run still counts on screen.
          setBestScore((b) => Math.max(b ?? 0, result.score));
        });
    },
    [game, seeds],
  );

  const services = useMemo<GameServices | undefined>(
    () =>
      launchBest === undefined
        ? undefined
        : {
            sfx,
            bestScore: launchBest,
            beginRun: seeds.begin,
            onRunComplete,
            onExitRequested: leave,
          },
    [launchBest, seeds, onRunComplete, leave],
  );

  return (
    <main className={styles.screen}>
      <TopBar
        onBack={leave}
        title={game.title}
        right={<span data-testid="player-best">Best: {bestScore ?? '…'}</span>}
      />
      {services && <GameHost game={game} services={services} />}
      <RunBar game={game} challenge={challenge} lastRun={lastRun} />
    </main>
  );
}
