import type { Redis } from '@upstash/redis';
import { postRun, readBoard, type Outcome } from './leaderboard';

/** Well above the longest replay a 30-minute run records. */
const MAX_BODY_BYTES = 400_000;

function reply<T>(outcome: Outcome<T>, cache = 'no-store'): Response {
  return outcome.ok
    ? Response.json(outcome.value, { headers: { 'Cache-Control': cache } })
    : Response.json({ error: outcome.error }, { status: outcome.status });
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function handlePost(request: Request, redis: Redis, now = Date.now()) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return reply({ ok: false, status: 413, error: 'Too large' });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return reply({ ok: false, status: 413, error: 'Too large' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ ok: false, status: 400, error: 'Expected JSON' });
  }
  return reply(await postRun(redis, body, { now, ip: clientIp(request) }));
}

export async function handleGet(request: Request, redis: Redis) {
  const url = new URL(request.url);
  const player = url.searchParams.get('player');
  const outcome = await readBoard(redis, {
    game: url.searchParams.get('game') ?? '',
    date: url.searchParams.get('date') ?? '',
    player,
  });
  // The public top can be cached briefly at the edge; a reply that includes "you" cannot.
  return reply(outcome, player ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30');
}
