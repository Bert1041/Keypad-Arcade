# Pairs (`pairs`)

Inspired by Pairs II (Nokia). Original name, art and rules presentation.

| | |
|---|---|
| Loop | Turn two cards; a matching pair stays up. Clear the board and a bigger one is dealt: 4×4, 4×5, 5×6, then 6×6 for good. |
| Clock | 60 s to start. Only a cleared board adds time — 10 s, then 8, 6, 4, and 2 s for good — never more than 99 s. It stops between boards and does not start until the first tap. The run ends when it runs out. (A second per pair, the first idea, let a good memory gain time faster than it spent it: runs never ended.) |
| Pace | A card can turn at most every 0.15 s (about its flip). A quicker tap waits for that moment rather than being lost. This also bounds a bot: even perfect play loses time on every 6×6 board, so every run ends. |
| Score | A pair: 10 × the streak of pairs found in a row (up to × 5); a miss resets the streak. A cleared board: 50 × its number. |
| Misses | A mismatched pair shows for 0.7 s — or until the next tap, which turns it down at once, so fast players never wait. |
| Controls | Tap a card (mouse on desktop). Esc leaves. Tap / Space / Enter retries after game over. |
| Faces | 18 pixel-art faces (`scenes/faces.ts`), each different in shape as well as colour. |
| Randomness | `beginRun()` picks each board's faces and shuffles its cards. Every board takes the same number of draws whatever happened before, so the n-th board of a seed is the same for everyone — a challenge or the daily is the same game of memory. |
| Replay | The scene records each tap with the step it was handled on; `verify.ts` replays it for the leaderboard. |
| Rules | `logic/pairs.ts` (pure, unit-tested). The scene only draws and forwards taps. |
