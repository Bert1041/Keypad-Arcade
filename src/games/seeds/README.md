# Seeds (`seeds`)

Inspired by Bantumi (Nokia) and the traditional game Kalah (mancala). Original name, art and rules presentation.

| | |
|---|---|
| Loop | A ladder of five games of mancala against the phone, each sharper than the last. A lost game ends the run; win all five and it ends there too. |
| Rules | Six pits a side and a store at each end, sown anticlockwise. Pick one of your pits: its seeds go one by one into the places after it, skipping the phone's store. The last in your store: go again. The last in an empty pit of yours, with seeds opposite: take them both into your store. A game ends when either side's pits are empty; each side's leftover seeds go to its own store. Most seeds wins. |
| Board | Upright on screen: your pits down the left, your store at the bottom, the phone's pits up the right and its store at the top. A pit faces the one beside it. |
| Controls | Tap a pit (only your pits with seeds light up). Keys 1–6 play a pit; ↑ ↓ choose and Space / Enter plays. Esc leaves. Tap / Space / Enter retries after game over. |
| The phone | Game *n* is played by level *n*: it looks 1, 2, 4, 6 and 8 moves ahead (its and yours), and plays a random move 35%, 20%, 10%, 4% and 0% of the time. You start games 1, 3 and 5; the phone starts 2 and 4. Simulated players: a random one wins game 1 a quarter of the time; one that looks 8 moves ahead clears all five about half the time. |
| Layouts | Game 1 is the classic board, four seeds a pit. Games 2–5 move six seeds between pits (no pit left empty), mirrored on both sides so neither is favoured. All five are dealt at the start, so the n-th game of a seed is the same for everyone. |
| Score | Each game pays the seeds in your store; a win adds 20 × the game's number. |
| Ends | Always: at most five games, and a game stops after 200 moves (real ones take 30–60) with each side keeping its seeds. |
| Randomness | `beginRun()` deals the five layouts and decides the phone's choices among equal moves and its random moves — always two draws a phone move. Nothing else is random. |
| Replay | The scene records only the pits you chose; `verify.ts` rebuilds the phone's moves from the seed and replays the run for the leaderboard. Integers only. Like any turn-based daily, a day's winning line can be shared between players. |
| Rules code | `logic/seeds.ts` (pure, unit-tested). The scene only animates the sowing and forwards taps. |
