import { Redis } from '@upstash/redis';

/**
 * The tests' database: a local Redis behind Upstash's REST adapter. Refuses anything that is
 * not on this machine or a CI service container, because the tests delete every leaderboard key.
 */
export function testRedis(): Redis {
  const url = process.env.TEST_REDIS_URL ?? 'http://localhost:8079';
  const token = process.env.TEST_REDIS_TOKEN ?? 'local_dev_token';
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', 'srh'].includes(host)) {
    throw new Error(`Refusing to run leaderboard tests against ${host}: they wipe the boards`);
  }
  // As in production (server/redis.ts): plain strings, not JSON-encoded.
  return new Redis({ url, token, automaticDeserialization: false });
}

export async function wipe(redis: Redis): Promise<void> {
  const keys = await redis.keys('ka:*');
  if (keys.length) await redis.del(...keys);
}
