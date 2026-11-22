# Plunge (`plunge`)

Inspired by Rapid Roll (Nokia). Original name, art and rules presentation.

| | |
|---|---|
| Loop | Platforms rise towards spikes along the top. Roll off the edges and drop from platform to platform. Being carried into the spikes, falling out of the bottom or landing on a spiked platform costs one of 3 lives; the ball reappears on a safe platform after 0.8 s. |
| Controls | Hold the left or right half of the screen (a thumb on each side works; the newest wins); arrows or A/D on desktop. The first press starts. Esc leaves. Tap / Space / Enter retries after game over. |
| Score | 10 a second alive; a star 50. Extra lives (green hearts) now and then, up to 5. |
| Speed | The shaft rises at 70 px/s, +0.8 each second, without limit. Following the safe route keeps pace up to ~150 px/s (about 1.5 minutes in); beyond it the shaft gains, and once it rises faster than a ball can fall (~10 minutes) nothing survives — so every run ends, as the leaderboard needs. |
| Fairness | Random placement left players stranded with every platform below out of reach, so safe platforms form a route: each within reach of a drop point (an edge not against a wall) of the safe one before. Spiked platforms (from 20 s, never two in a row) are traps beside that route, never under a drop point. Tested: a plain strategy survives the first 90 s on 30 seeds losing at most one life. |
| Randomness | `beginRun()` decides every platform's width, place, spikes and pickup, four draws each, made on the clock (never in response to the player) — so the n-th platform of a seed is the same for everyone. |
| Replay | The scene records each change of direction with its step; `verify.ts` replays it for the leaderboard. |
| Rules | `logic/plunge.ts` (pure, unit-tested). The scene only draws and forwards input. |
