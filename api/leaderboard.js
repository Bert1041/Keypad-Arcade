import { n as handleGet, t as redis } from "./_lib/redis.js";
// server/api/leaderboard.ts
/** GET /api/leaderboard?game=&date=[&player=] — the top of a daily board. */
function GET(request) {
	return handleGet(request, redis());
}
export { GET };
