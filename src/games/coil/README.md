# Coil (`coil`)

Inspired by Snake / Snake II. Original name, art and rules presentation.

| | |
|---|---|
| Loop | Steer a growing snake to pellets. Walls and your own body end the run. |
| Start | The run waits for the first swipe / arrow, so nobody dies while reading the screen. |
| Controls | Swipe (phones); arrow keys or WASD (desktop). Two quick turns both count (queue of 2). Esc leaves. Tap / Space / Enter retries after game over. |
| Score | Pellet 10. Every 5th pellet spawns a bonus worth 50 that blinks out after 30 steps. |
| Speed | 150 ms per step, 3 ms faster per pellet, floor 70 ms. |
| Orientation | Portrait. 15 × 22 board of 24 px cells in a 360 × 600 world, scaled to fit. |
| Randomness | `beginRun()` decides every food and bonus position. Positions come from the seed, not from the free cells, so a challenge replays the same food sequence whatever path each player takes (only if the snake covers the chosen cell does it step to the next free one). |
| Rules | `logic/coil.ts` (pure, unit-tested), `logic/swipe.ts`. The scene only draws and forwards input. |

Not yet: levels with inner walls, wrap-around mode, a daily seed.
