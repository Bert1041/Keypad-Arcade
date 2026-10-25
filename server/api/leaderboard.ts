import { handleGet } from '../handlers';
import { redis } from '../redis';

/** GET /api/leaderboard?game=&date=[&player=] — the top of a daily board. */
export function GET(request: Request): Promise<Response> {
  return handleGet(request, redis());
}
