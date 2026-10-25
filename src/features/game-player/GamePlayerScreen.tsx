import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { findGame } from '@/games/registry';
import type { GameDefinition, GameServices, RunResult } from '@/games/types';
import { getStats, recordLevelReached, recordRun, type GameStats } from '@/core/scores/scores';
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
  // Read once before the game starts (to judge "new best" and where to continue from); never
  // changes afterwards, so the game is never recreated by a score update.
  const [launch, setLaunch] = useState<Pick<GameStats, 'bestScore' | 'reachedLevel'> | undefined>(
    undefined,
  );
  // What the top bar shows; updated after every run.
  const [bestScore, setBestScore] = useState<number | undefined>(undefined);
  const [lastRun, setLastRun] = useState<FinishedRun | null>(null);
  const seeds = useMemo(() => createRunSeeds(challenge?.seed ?? null), [challenge]);

  useEffect(() => {
    let cancelled = false;
    // Can't reject: a storage failure is turned into a fresh start above the last step.
    void getStats(game.id)
      .then(({ bestScore, reachedLevel }) => ({ bestScore, reachedLevel }))
      .catch(() => ({ bestScore: 0, reachedLevel: 1 }))
      .then((stats) => {
        if (cancelled) return;
        setLaunch(stats);
        setBestScore(stats.bestScore);
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

  const reachLevel = useCallback(
    (level: number) => {
      // Progress is a convenience: if it cannot be saved, the player still plays on.
      recordLevelReached(game.id, level).catch(() => undefined);
    },
    [game],
  );

  const services = useMemo<GameServices | undefined>(
    () =>
      launch === undefined
        ? undefined
        : {
            sfx,
            bestScore: launch.bestScore,
            progress: { reachedLevel: launch.reachedLevel, reachLevel },
            beginRun: seeds.begin,
            onRunComplete,
            onExitRequested: leave,
          },
    [launch, seeds, onRunComplete, reachLevel, leave],
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
