# Wallbreak (`wallbreak`)

Inspired by BrickBreaker (BlackBerry) and Arkanoid. Original name, art and rules presentation.

| | |
|---|---|
| Loop | Keep the ball in play with the paddle and break every brick; a cleared wall brings the next, faster one. 3 lives; losing the last ball in play costs one. |
| Controls | Drag (the paddle chases the finger at up to 900 px/s) and tap to serve; on desktop the mouse steers, or arrows / A-D, and Space serves. Esc leaves. Tap / Space / Enter retries after game over. |
| Aiming | Where the ball meets the paddle sets where it goes: straight up from the middle, up to ~56° from the edges. The ball never runs nearly flat (at least 35% of its motion is up or down), so it cannot loop side to side for ever. |
| Bricks | Two-hit bricks (darker, outlined) grow more common with the level. Walls are mirrored patterns that grow from 4 rows to 8. |
| Power-ups | Hidden in about 1 in 7 brick pairs: **W** wide paddle (12 s), **M** two more balls, **S** slow ball (8 s), **+** a life (up to 5). Catch them with the paddle. |
| Score | 10 per brick hit, 25 per power-up caught, 100 × the level for a cleared wall. |
| Speed | 280 px/s, +40 each level and +2 each paddle hit, without limit — past what a person can follow by about level 10. A program that tracks the ball perfectly can go on much longer; the leaderboard refuses runs over 30 minutes. |
| Randomness | `beginRun()` builds each wall and hides its power-ups, with the same number of draws every level, so the n-th wall of a seed is the same for everyone. Nothing else is random. |
| Replay | The scene records each change of input (finger, keys, serve) with its step; `verify.ts` replays it for the leaderboard. Only `+ − × ÷` and `Math.sqrt`, which every engine computes alike. |
| Rules | `logic/wallbreak.ts` (pure, unit-tested). The scene only draws and forwards input. |
