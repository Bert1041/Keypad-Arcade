# Star Raid (`star-raid`)

Inspired by Space Impact (and the vertical shooters of the Java era). Original name, art,
enemies and waves.

| | |
|---|---|
| Loop | Survive waves of enemies; you fire automatically. Three lives, then the run ends. |
| Orientation | **Portrait, vertical scrolling** — unlike Space Impact's sideways scroll, because the app is held upright in one hand. 360 × 600 world, scaled to fit. |
| Start | Waits for the first touch or key, so nobody gets hit while reading. |
| Controls | Drag anywhere: the ship moves *with* your finger (relative), never under it. Arrows or A/D on desktop. Esc leaves. Tap / Space / Enter retries. |
| Enemies | Drone (1 hit, 10), Saucer (sways, 2 hits, 20, from wave 3), Gunner (fires, 3 hits, 30, from wave 6), Carrier (2 hits, 50, holds a power-up). Rammers cost a life and give no points. Ids in code: `drifter`, `weaver`, `gunner`, `carrier`. |
| Power-ups | A **carrier** joins waves 2, 6, 10, … Shoot it and its capsule falls; fly into it to catch it. **Twin shot** (10 s), **Rapid fire** (8 s, 2× rate), **Shield** (soaks one hit), **Bomb** (destroys everything on screen, with points; spares enemies not yet on screen), **1UP** (max 5 lives). Odds 30 / 30 / 25 / 10 / 5 %. Timers show as bars under the score. |
| Waves | 3 enemies, +1 every 2 waves (max 9); every 3 s, speeding up to every 1.4 s. |
| Hits | 1.5 s of invulnerability after a hit (the ship blinks). Enemies can only be shot once on screen. |
| Randomness | `beginRun()` generates each wave on a fixed clock, never from player actions, so everyone on a challenge link meets the same waves — carriers and what they hold included (rolled with the wave, not when shot). Effects (stars, explosions) use fixed patterns, not randomness. |
| Simulation | `logic/raid.ts`: fixed 60 Hz steps, no Phaser — the same run on a slow phone and a fast one. |

Not yet: bosses. (Power-ups were cut from the first version without asking; added after the product owner asked why — scope cuts that change the feel of a game are their call.)
