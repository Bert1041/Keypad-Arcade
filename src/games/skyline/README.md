# Skyline (`skyline`)

Inspired by Tower Bloxx (Java, 2005). Original name, art and rules presentation.

| | |
|---|---|
| Loop | A floor swings on a crane above the tower. Tap to drop it; build as high as you can. |
| Start | The first tap starts the run; the floor on the crane waits until then. |
| Controls | Tap anywhere (phones); Space, Enter or ↓ (desktop). Esc leaves. Tap / Space / Enter retries after game over. |
| Landing | Within 8 px of the top floor's centre: **perfect** (locks to the centre). Otherwise it stays where it lands if more than half of it is on the floor below; if not, it falls off and costs one of the **3 floors in hand**. Losing all three ends the run. |
| Momentum | A dropped floor keeps 15% of the swing's sideways speed: tap when it looks lined up and it lands comfortably on (tested at every stage, in the unit tests and in real browsers); a perfect drop needs a slight lead. With all of the speed (the first version), a floor dropped when it looked lined up drifted ~37 px and missed — it felt broken. |
| Between floors | 450 ms. The next floor is hung on the crane as soon as one lands and lowered in, so it never pops into view. |
| Lean and sway | Each off-centre landing adds 0.3 × its offset to the lean; a perfect one halves it. The top of the tower sways by the lean (at most 12 px, a 3 s cycle), so the target moves. |
| Getting harder | The landing point sweeps past the target faster with height (150 px/s up to 285 px/s) and the swing gets quicker (2.6 s to 1.4 s). Wind from 20 floors (±400 px/s², direction shown, re-rolled every 4 drops). From 30 floors the rope changes length floor to floor (0.8× to 1.25× the swing period). |
| Fairness | Every stage leaves at least 250 ms to land a floor and 50 ms for a perfect one, with the tower at its most sway, wind either way, the shortest and longest rope (`logic/skyline.test.ts` sweeps 1,200 cases). Difficulty is set as the landing point's speed past the target, and the swing is derived from it, so the promise holds by construction and the test proves it. |
| Score | 10 a floor. A perfect drop adds 25 × the perfect streak (up to × 5). Every 10th floor: 100 × the floors still in hand. |
| Orientation | Portrait, 360 × 600 world, scaled to fit. The camera follows the top of the tower. |
| Randomness | `beginRun()` decides each floor's starting side, colour, wind direction and rope length. Every floor draws the same five numbers, so the n-th floor of a seed is the same however the player has done — a challenge replays the same crane. |
| Rules | `logic/skyline.ts` (pure, unit-tested). The scene only draws and forwards taps. |
