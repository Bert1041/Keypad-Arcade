import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import { createSeeds, legalMoves, move, phoneChoice } from '../src/games/seeds/logic/seeds';
import { replayRun, type SeedsReplay } from '../src/games/seeds/verify';
import { expect, test } from './fixtures';
import { expectOneRunningGame } from './helpers';

const debug = (page: Page) => page.evaluate(() => window.__SEEDS_DEBUG__?.());

async function tapWorld(page: Page, x: number, y: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const k = box.width / 360;
  await page.mouse.click(box.x + x * k, box.y + y * k);
}

/** Waits until it is the player's turn with nothing moving (or the run is over). */
async function yourTurn(page: Page) {
  await expect
    .poll(
      async () => {
        const s = await debug(page);
        return s?.over || (s?.turn === 'player' && !s.busy);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function tapPit(page: Page, pit: number) {
  const centre = (await debug(page))?.pits[pit];
  if (!centre) throw new Error(`no pit ${pit}`);
  await tapWorld(page, centre.x, centre.y);
}

test('only your pits with seeds play; an extra turn keeps the move; the phone answers', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/play/seeds');
  await expectOneRunningGame(page);
  const start = await debug(page);
  expect(start).toMatchObject({ started: false, turn: 'player', game: 1 });

  await tapWorld(page, 255, 150 + 2 * 58); // one of the phone's pits: nothing happens
  await page.waitForTimeout(300);
  expect(await debug(page)).toMatchObject({ started: false, board: start?.board });

  await tapPit(page, 2); // four seeds: the last lands in your store
  await yourTurn(page);
  const extra = await debug(page);
  expect(extra?.board[6]).toBe(1);
  expect(extra?.shown).toEqual(extra?.board);

  await tapPit(page, 2); // now empty: refused
  await page.waitForTimeout(300);
  expect((await debug(page))?.board).toEqual(extra?.board);

  await tapPit(page, 0);
  await expect.poll(async () => (await debug(page))?.turn).toBe('phone');
  await yourTurn(page);
  const after = await debug(page);
  // The phone has moved: its store or your pits changed, and no seed went missing.
  expect(after?.board.reduce((a, b) => a + b, 0)).toBe(48);
  expect(after?.shown).toEqual(after?.board);
});

test('the run the browser played replays on the server to the same score and board', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto('/play/seeds');
  await expectOneRunningGame(page);
  // A simple player: the rightmost pit with seeds. Plays until the run ends.
  for (let i = 0; i < 400; i++) {
    await yourTurn(page);
    const s = await debug(page);
    if (!s || s.over) break;
    const pit = Math.max(...legalMoves(s.board, 'player'));
    await tapPit(page, pit);
    await expect
      .poll(async () => (await debug(page))?.busy || (await debug(page))?.over)
      .toBe(true);
  }
  await expect.poll(() => page.evaluate(() => window.__LAST_RUN__?.gameId)).toBe('seeds');
  const run = await page.evaluate(() => window.__LAST_RUN__);
  const final = await debug(page);
  expect(final?.over).toBe(true);
  expect(run?.score).toBe(final?.score);
  expect(replayRun(seededRandom(run?.seed ?? 0), run?.replay)).toEqual({
    ok: true,
    score: run?.score,
  });
  // And the same games: Node, fed the recorded pits, ends on the same board with the same results.
  const random = seededRandom(run?.seed ?? 0);
  const state = createSeeds(random);
  const moves = [...(run?.replay as SeedsReplay).moves];
  while (!state.over) {
    move(state, state.turn === 'phone' ? phoneChoice(state, random) : (moves.shift() ?? -1));
  }
  expect(state.board).toEqual(final?.board);
  expect(state.results).toEqual(final?.results);
});
