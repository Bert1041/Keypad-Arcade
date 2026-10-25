import { isSeed } from '@/core/random/seededRandom';

/** A friend's run to replay: same seed, and the score to beat. */
export interface Challenge {
  seed: number;
  beat: number;
}

/** Scores above this are not plausible and would only come from a hand-edited link. */
const MAX_SCORE = 1_000_000;

function parseNonNegativeInt(raw: string | null): number | null {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Links are typed by hand, truncated by chat apps and edited by curious people. Anything
 * malformed means "no challenge" — the game still opens normally.
 */
export function parseChallenge(params: URLSearchParams): Challenge | null {
  const seed = parseNonNegativeInt(params.get('seed'));
  const beat = parseNonNegativeInt(params.get('beat'));
  if (seed === null || beat === null || !isSeed(seed) || beat > MAX_SCORE) return null;
  return { seed, beat };
}

export function challengeUrl(origin: string, gameId: string, challenge: Challenge): string {
  const url = new URL(`/play/${encodeURIComponent(gameId)}`, origin);
  url.searchParams.set('seed', String(challenge.seed));
  url.searchParams.set('beat', String(challenge.beat));
  return url.toString();
}
