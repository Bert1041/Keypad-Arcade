import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getNickname, postDailyRun } from '@/core/leaderboard/leaderboard';
import { NicknameDialog } from './NicknameDialog';

interface Props {
  game: string;
  date: string;
  score: number;
  replay: unknown;
  /** Status text for the run bar (the bar is too small for anything else). */
  onStatus: (text: string) => void;
}

/**
 * "Post" after a daily run: asks for a nickname the first time, sends the run (the server replays
 * it before it counts), then becomes a link to the board.
 */
export function PostToBoard({ game, date, score, replay, onStatus }: Props) {
  const [state, setState] = useState<'idle' | 'naming' | 'posting' | 'posted'>('idle');

  async function post(nickname: string) {
    setState('posting');
    onStatus('Posting…');
    const result = await postDailyRun({ game, date, score, replay }, nickname);
    if (result.ok) {
      const { rank, players, best } = result.value;
      onStatus(
        best > score
          ? `Your best today (${best}) is #${rank} of ${players}`
          : `#${rank} of ${players} today`,
      );
      setState('posted');
    } else {
      onStatus(result.message);
      setState('idle');
    }
  }

  async function start() {
    const nickname = await getNickname().catch(() => null);
    if (nickname) await post(nickname);
    else setState('naming');
  }

  if (state === 'posted') {
    return (
      <Link
        className="button"
        to={`/boards?game=${encodeURIComponent(game)}`}
        data-testid="see-board"
      >
        Board
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={state === 'posting'}
        onClick={() => void start()}
        data-testid="post-button"
      >
        Post
      </button>
      {state === 'naming' && (
        <NicknameDialog onSaved={(name) => void post(name)} onCancel={() => setState('idle')} />
      )}
    </>
  );
}
