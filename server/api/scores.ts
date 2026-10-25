import { handlePost } from '../handlers';
import { redis } from '../redis';

/** POST /api/scores — post a finished daily run. */
export function POST(request: Request): Promise<Response> {
  return handlePost(request, redis());
}
