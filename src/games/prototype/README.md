# Stack Test (`prototype`)

**Status:** disposable. It exists to prove the game host (lifecycle, input, scaling, saving,
sharing). Delete this folder and its registry entry once the first real game ships.

| | |
|---|---|
| Loop | A block slides above the tower; tap to drop it. The overhang is cut off. Miss entirely and the run ends. |
| Controls | Tap / click anywhere, or Space. Esc leaves. |
| Score | Blocks placed. |
| Orientation | Portrait, 360×640 world, scaled to fit. |
| Randomness | `beginRun()` decides each block's spawn side and the starting speed. |
| Rules | `logic/placement.ts` (pure, unit-tested). |
