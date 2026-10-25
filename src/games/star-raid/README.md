# Star Raid (`star-raid`)

Inspired by Space Impact (and the vertical shooters of the Java era). Original name, art,
enemies and waves.

| | |
|---|---|
| Loop | Survive waves of enemies; you fire automatically. Three lives, then the run ends. |
| Orientation | **Portrait, vertical scrolling** — unlike Space Impact's sideways scroll, because the app is held upright in one hand. 360 × 600 world, scaled to fit. |
| Start | Waits for the first touch or key, so nobody gets hit while reading. |
| Controls | Drag anywhere: the ship moves *with* your finger (relative), never under it. Arrows or A/D on desktop. Esc leaves. Tap / Space / Enter retries. |
| Enemies | Drifter (1 hit, 10), Weaver (sways, 2 hits, 20, from wave 3), Gunner (fires, 3 hits, 30, from wave 6). Rammers cost a life and give no points. |
| Waves | 3 enemies, +1 every 2 waves (max 9); every 3 s, speeding up to every 1.4 s. |
| Hits | 1.5 s of invulnerability after a hit (the ship blinks). Enemies can only be shot once on screen. |
| Randomness | `beginRun()` generates each wave on a fixed clock, never from player actions, so everyone on a challenge link meets the same waves. Effects (stars, explosions) use fixed patterns, not randomness. |
| Simulation | `logic/raid.ts`: fixed 60 Hz steps, no Phaser — the same run on a slow phone and a fast one. |

Not yet: bosses, power-ups, a smart bomb.
