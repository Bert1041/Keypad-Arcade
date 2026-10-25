import { isSeed } from '@/core/random/seededRandom';
import { dailyNumber, dailySeed, hasDaily } from './daily';

/** A run to replay: a friend's, or the day's — same seed for everyone — and maybe a score to beat. */
export interface Challenge {
  seed: number;
  /** The score to beat, when someone shared one. */
  beat: number | null;
  /** Set for the daily challenge. */
  daily: { date: string; number: number } | null;
}

/** Scores above this are not plausible and would only come from a hand-edited link. */
const MAX_SCORE = 1_000_000;

function parseNonNegativeInt(raw: string | null): number | null {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  return Number(raw);
}

function parseBeat(raw: string | null): number | null {
  const beat = parseNonNegativeInt(raw);
  return beat !== null && beat <= MAX_SCORE ? beat : null;
}

/**
 * Links are typed by hand, truncated by chat apps and edited by curious people. Anything
 * malformed means "no challenge" — the game still opens normally.
 *
 * `?daily=YYYY-MM-DD[&beat=N]` — the day's run, for games that have one, from Daily #1 up to
 * `today`. `?seed=N&beat=N` — a friend's run.
 */
export function parseChallenge(
  params: URLSearchParams,
  game: { id: string; daily?: boolean },
  today: string,
): Challenge | null {
  const date = params.get('daily');
  if (date !== null) {
    if (!game.daily || !hasDaily(date) || date > today) return null;
    return {
      seed: dailySeed(game.id, date),
      beat: parseBeat(params.get('beat')),
      daily: { date, number: dailyNumber(date) },
    };
  }
  const seed = parseNonNegativeInt(params.get('seed'));
  const beat = parseBeat(params.get('beat'));
  if (seed === null || beat === null || !isSeed(seed)) return null;
  return { seed, beat, daily: null };
}

/** The link that replays `challenge` with `beat` as the score to beat. */
export function challengeUrl(
  origin: string,
  gameId: string,
  challenge: Pick<Challenge, 'seed' | 'daily'>,
  beat: number,
): string {
  const url = new URL(`/play/${encodeURIComponent(gameId)}`, origin);
  if (challenge.daily) url.searchParams.set('daily', challenge.daily.date);
  else url.searchParams.set('seed', String(challenge.seed));
  url.searchParams.set('beat', String(beat));
  return url.toString();
}

/** Today's daily, as a link path, for a game that has one. */
export function dailyPath(gameId: string, today: string): string {
  return `/play/${encodeURIComponent(gameId)}?daily=${today}`;
}
