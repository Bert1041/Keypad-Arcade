/**
 * The leaderboard API on this machine, for `npm run dev`, `vite preview` and the leaderboard
 * browser tests: the same handlers Vercel runs, against the local test Redis (npm run
 * redis:test). Vite proxies /api here (vite.config.ts).
 *
 * DEV_API_NOW=<ISO time> fixes the server's clock, so tests can play a daily after Daily #1.
 */
import { createServer } from 'node:http';
import { handleGet, handlePost } from '../server/handlers';
import { testRedis } from '../server/testRedis';

const PORT = Number(process.env.DEV_API_PORT ?? 8788);
const fixedNow = process.env.DEV_API_NOW ? Date.parse(process.env.DEV_API_NOW) : null;
const redis = testRedis();

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const url = `http://localhost${req.url ?? '/'}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    });
    const path = new URL(url).pathname;
    const handled =
      path === '/api/scores' && req.method === 'POST'
        ? handlePost(request, redis, fixedNow ?? Date.now())
        : path === '/api/leaderboard' && req.method === 'GET'
          ? handleGet(request, redis)
          : Promise.resolve(Response.json({ error: 'Not found' }, { status: 404 }));
    handled
      .then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch((error: unknown) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(error) }));
      });
  });
}).listen(PORT, () => {
  console.log(`Leaderboard API on http://localhost:${PORT}`);
});
