import { Redis } from '@upstash/redis';

/**
 * Upstash, as connected from Vercel's marketplace (KV_* names) or set by hand (UPSTASH_*).
 * Created on first use, so importing a handler never needs the network. Values are stored as
 * plain strings (the client's default JSON-encodes them, quotes and all), so the data reads the
 * same from redis-cli or any other client.
 */
let client: Redis | null = null;

export function redis(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Leaderboard storage is not configured');
  client = new Redis({ url, token, automaticDeserialization: false });
  return client;
}
