import { r as handlePost, t as redis } from "./_lib/redis.js";
// server/api/scores.ts
/** POST /api/scores — post a finished daily run. */
function POST(request) {
	return handlePost(request, redis());
}
export { POST };
