# Architecture

How Keypad Arcade is built and why. What we build and in which order is in
[PLAN.md](../PLAN.md); the original product brief is
[README_RetroBox_updated.md](../README_RetroBox_updated.md).

## 1. The big picture

```text
Browser (installable PWA)
├── React shell ─────────── library, settings, game screen, result bar, sharing
│     │  GameServices (typed, narrow)
│     ▼
├── Game host ───────────── creates ONE Phaser game per visit to /play/:id, destroys it on leave
│     │  lazy import()
│     ▼
├── Game modules ────────── src/games/<id>/ — rules, scenes, art; know nothing about React
│
├── Core services ───────── scores + settings (IndexedDB via Dexie), sound, seeded random,
│                           challenge links, share card
└── Service worker ──────── precaches the shell and every game chunk for offline play
```

- **React owns the app; Phaser owns gameplay.** React never runs per-frame logic; a game never
  touches React, storage or the URL.
- **Phaser loads only when a game opens** (~320 KB gz). The library's first load is budgeted at
  150 KB gz and the build fails above it (`scripts/check-budget.ts`).
- **No backend.** Scores and settings live on the device. Sharing and challenges are links.

## 2. Where things live

```text
src/
  appInfo.ts              Product name and database name (see §6 before changing DB_NAME)
  main.tsx                Loads settings, then renders the app
  app/                    Routes and app-wide hooks (useLeave)
  features/               One folder per screen
    library/              Game list, best scores, "update available" prompt
    game-player/          GameHost (Phaser lifecycle), GamePlayerScreen, RunBar (result + share)
    settings/             Sound toggle
  components/             Shared UI (TopBar)
  core/                   Product logic with no UI — unit-tested in plain Node
    storage/db.ts         The only file that talks to Dexie
    scores/  settings/    Read/write saved data; tolerate corrupt or missing records
    audio/sfx.ts          Synthesised sounds; the one place the sound setting is enforced
    random/               Mulberry32 + per-run seeds (createRunSeeds)
    challenge/            Parse/build /play/:id?seed=&beat= links
    share/                Score-card PNG + share sheet → text → clipboard fallback
  games/
    types.ts              The game ↔ shell contract (GameServices, GameDefinition)
    registry.ts           The list of games, in library order
    shared/               Helpers for game code only: lifecycle counter, input filter, game-over
                          panel, pixel-art textures, the games' shared style
    <game-id>/            One folder per game — see §3
  architecture.test.ts    Guard tests for the rules in §3 and §1
  styles/global.css       Colour tokens and base styles
e2e/                      Playwright tests against a production build
scripts/                  Bundle budget, icon rendering
```

Rule of thumb: **`features/` decides what is shown, `core/` decides what is true, a game folder
decides how its game plays.**

## 3. A game is a folder

Every game lives entirely in `src/games/<game-id>/`, where `<game-id>` is its stable id:

```text
src/games/<game-id>/
  index.ts        GameDefinition: id, title, description, thumbnail, orientation, load().
                  Imported by the registry, so it must NOT import Phaser.
  createGame.ts   Builds the Phaser.Game. Reached only through load() → its own lazy chunk.
  scenes/         Phaser scenes.
  logic/          Pure rules (scoring, collisions, level generation) with *.test.ts beside them.
                  No Phaser here, so the rules are tested in milliseconds.
  assets/         Thumbnail, sprites, sounds. Imported, so they are hashed and precached.
  README.md       One-page design brief: loop, controls, scoring, orientation, randomness.
```

Enforced by `src/architecture.test.ts` (each rule was mutation-checked):

| Rule | Why |
|---|---|
| Every folder in `games/` is registered under its own name, and vice versa | No orphan or ghost games |
| Each game folder has `index.ts`, `createGame.ts`, `README.md` | Same shape for every game |
| A game imports only its own files, `@/games/types`, `@/games/shared/*` and `phaser` | Games stay independent; deleting one touches nothing else |
| No `../` out of the game folder | Same, for relative paths |
| No `Math.random`, `crypto.getRandomValues`, `crypto.randomUUID` in a game | Challenge links must replay the same run (§5) |
| Only game code imports Phaser; the shell reaches a game only through `registry.ts` → `index.ts` | Keeps Phaser out of the first load |
| Only `core/storage/db.ts` imports Dexie | One place for the schema |

**Delete a game:** remove its folder and its line in `registry.ts`. Its saved scores stay in the
player's database, harmlessly.

**`prototype` (Stack Test) is a test fixture**, not a game: the registry includes it only in
development and `VITE_E2E=1` builds, and a production build contains no trace of it. The shared
host tests (lifecycle, persistence, sharing) drive it because its first tap always scores.

**`star-raid`** shows the pattern for real-time games: a fixed 60 Hz simulation in `logic/`,
waves generated on the clock (never from player actions), and e2e fixtures found by simulation.

**`coil`** is the reference implementation of a real game: rules in `logic/`, a thin scene, and an
e2e test that predicts the score from the seed with the game's own rules module and checks the
real browser matches.

**`rebound`** shows the pattern for hand-made levels: `levels/levelNN.ts` holds a text map *and a
recorded solution*. The tests replay every solution and require each level to be finished without
dying while collecting every ring, gem and life, and every input change in it may be ±2 ticks
early or late without the move it belongs to failing (a jump that needs one exact tick is too
precise for a person; later steps are not judged, because a player — unlike a fixed script —
adjusts to where the ball landed). `logic/replay.ts`'s
`scriptInputs()` is the single definition of how long a scripted step lasts; the unit tests and the
e2e-driven game both use it. Levels are generated by `scripts/rebound-levels/` (Python 3, places
features by coordinate) rather than typed by hand, and checked by `parseLevel()`.

## 4. The game ↔ shell contract

`src/games/types.ts`. A game receives `GameServices` and nothing else:

| Member | Use |
|---|---|
| `beginRun()` | Call at the start of every run; use the returned function for **all** randomness |
| `onRunComplete({ score })` | Once per finished run; the shell saves it and shows the share bar |
| `onExitRequested()` | E.g. Esc; the shell navigates back |
| `sfx.blip()` | Sound; silently does nothing when sound is off |
| `bestScore` | Best at launch, for "new best!" (track later runs yourself) |
| `progress` | For games with levels: `reachedLevel` at launch, and `reachLevel(n)` to save a new one |

In return a game's `createGame` hands back a `GameInstance` — `destroy`, `pause`, `resume` — by
returning `trackPhaserGame(new Phaser.Game(...))`, so all games behave the same. The shell pauses
on its pause button, on P, and whenever the app is hidden (a call, switching apps); only the player
resumes it. Pausing also switches the game's input off: Phaser queues keys while paused and
replays them on resume.

The host creates the game in an effect, never during render, and destroys it on unmount. Loading
is async, so a cleanup that runs before the module arrives (React StrictMode does this on every
mount in development) cancels the creation. Tested in the `dev-strictmode` e2e project.

Keyboard: Phaser listens on the whole window. Check `isForShellControl(event)` before acting on a
key, so a focused button still works with Space and Enter.

## 5. Runs, seeds and challenge links

- `createRunSeeds(challengeSeed)` picks each run's seed: the challenger's seed on every run of a
  challenge (retries included), a fresh one otherwise. It remembers the current seed so a result
  can be shared as a replayable link.
- `/play/<id>?seed=<uint32>&beat=<score>` — anything malformed means "no challenge"; the game
  still opens.
- **Mulberry32's output is pinned by golden-value tests.** Changing the generator changes every
  run behind every link already shared.
- Real-time games are only replayable as far as the seed decides: the same blocks/enemies/levels,
  not the same tap timing.

## 6. Saved data

IndexedDB database `DB_NAME` (`src/appInfo.ts`), schema in `core/storage/db.ts`:

- `gameStats` — `gameId` (key), `bestScore`, `playCount` (completed runs), `lastPlayedAt`,
  `reachedLevel` (furthest level unlocked; not indexed, so it needed no schema version — records
  from before it read as level 1)
- `settings` — `key`, `value`

Every write goes through `toRecord()` in `core/scores/scores.ts`, so saving a score keeps level
progress and saving progress keeps scores (both directions tested).

Rules: readers sanitise every record (corrupt → defaults, never a crash); storage failures fall back
to in-memory behaviour. **Changing `DB_NAME` after launch orphans every player's scores.** A
schema change is a new `this.version(n)` with an upgrade function, and a test that opens a database
written by version n−1.

## 7. Offline and updates

`vite-plugin-pwa` (Workbox) precaches every built file, including lazy game chunks. Updates use
`registerType: 'prompt'`: the "new version" prompt appears only in the library, never during a run.
The offline e2e test proves a game that was never opened online still starts offline.

## 8. Testing

| Layer | Command | Runs against |
|---|---|---|
| Static | `npm run check` | ESLint (type-aware), tsc, Prettier, knip, then unit tests and build + budget |
| Unit + guard | `npm test` | Plain Node; IndexedDB via fake-indexeddb |
| Browser | `npm run e2e` | Production build: Pixel 7 (Chromium), iPhone 14 (WebKit), desktop Chrome; desktop Firefox on CI; plus the dev server under StrictMode |

Habits:

- **Mutation-check every test**: break the rule, watch the test fail *for the right reason*,
  restore. A failing build is not a failing test — read the failure.
- **Real browsers for anything stored or rendered.** Unit tests use fake IndexedDB; persistence is
  also proven in real browsers.
- **Every e2e test fails on any page error or `console.error`** (`e2e/fixtures.ts`).
- **No retries**, locally or on CI: a retry hides exactly the flaky test we need to see.
- **Lifecycle is counted, not eyeballed:** `VITE_E2E=1` builds expose live/playable Phaser game
  counts; a canvas can vanish while its loop keeps running.
- **axe** checks WCAG A/AA on the shell screens.

## 9. Lessons learned (bugs we actually hit)

| What went wrong | Why | Fix |
|---|---|---|
| Two Phaser games running in dev | StrictMode mounts effects twice; the async import resolved after cleanup | `cancelled` flag in GameHost; `dev-strictmode` e2e project |
| A leaked game passed a "canvas is gone" check | React removed the container but the Phaser loop kept running | Tests count live games through a lifecycle hook |
| Game-over rescale test could never fail | Phaser notices parent resizes on a 500 ms poll; the test measured before it | Measure after the poll interval; mutation-checked |
| Scripted taps produced scores of 2, not 1 | Each Playwright tap takes ~100 ms while blocks move | Tests tap until the run ends and read the real score |
| Settings test lost the value on reload | Reload raced the async IndexedDB write | Test waits for the committed value |
| Space could not press a focused button | The game captured Space for the whole window | `isForShellControl`; keyboard e2e presses a focused button |
| A mutation "passed" for the wrong reason | Removing a call left an unused import; the build failed, not the test | Read every failure; keep mutations compiling |
| Golden RNG values were wrong | Written from memory | Generated from the reference implementation |
| Firefox will not start locally | Firefox 157 on macOS 27 ("Could not find profile folder"), even by hand | Firefox runs on CI; locally `E2E_FIREFOX=1` |
| CI-only Firefox failure: "Navigated away from page" on reload | `void ctx.resume()` left the audio-resume promise unhandled; Firefox rejects pending ones on navigation | One resume at a time, rejection handled; the fixture now reports each error's source location |
| A test that could not fail ("can't shoot off-screen enemies") | Its bullet left the screen and was discarded before the collision check | Positions chosen so only the rule prevents the hit, plus an on-screen control case |
| "Waits for the first tap" passed when the game started at once | An idle run scores the same whenever it starts | Assert the tap-to-game-over time is at least the simulated run length |
| A sprite looked like a famous arcade alien | Drawn from memory of the genre | Redrawn; review every sprite against the originals it was inspired by |
| Star Raid power-ups shifted every later enemy id | Power-ups took ids from the enemy counter, which then depended on play | Separate counters; the fairness test compares spawn ids |
| A test computed its expectation from the function it tested | `hasCarrier()` asked to define its own expected waves | List expected values explicitly |
| A big ball sank in water | Buoyancy (1100) was weaker than gravity (1500) | Buoyancy 2200; a test floats a big ball |
| Three of five Rebound test failures were my own maps | Hand-typed rows: a start with no floor under it, a row one character short | Levels come from a coordinate-based builder; `parseLevel()` rejects malformed maps |
| A gem could only be reached by dying | Placed where the only jump to it ended on spikes | Solutions must collect every pickup without dying |
| The e2e-played level 3 died where the unit test cleared it | Tests and scene each counted scripted milliseconds their own way (one carried float remainders) | One `scriptInputs()` for both; solutions must survive ±2 ticks |
| The solver accepted routes the tests rejected, and rejected fair ones | Its in-search fairness check approximated the tests' rule (held jump for 500 ms; ignored the last 1.6 s) | It now applies the exact rule, once everything after an input change is known, and to the final moves before accepting |
| Level files held stale maps or solutions | The solver read levelNN.ts before it was regenerated; a solution was recorded but not emitted | `levels:solve` rebuilds before solving and writes the solution after |
| Jumping off a moving platform stopped dead in the air | No momentum transfer | Platform speed carries into the jump (tested, mutation-checked) |
| Every underwater ring was a tiny air pocket | A pickup replaces the `~` in the map | A water mask decides; each of its rules has a case only it covers |
| Pads you could jump over, tunnels too low to hop in, ferries ending a tile short, 5-wide pits off walls | Level design | Found by the solver: a level it cannot solve fairly gets redesigned |
| Offline was only proven for the test prototype | One game's chunk loading offline says nothing about the others | The offline test opens every game; dropping one game's chunk from the cache fails it |
| Keys pressed on the pause screen started a run behind it | Phaser queues keys while paused and replays them on resume | Pausing turns the game's input off; the test presses keys with focus off the buttons, the only path that reaches the game |

## 10. Adding a game: checklist

1. Passes the scope test in PLAN.md; has a one-page brief.
2. Create `src/games/<id>/` with `index.ts`, `createGame.ts`, `README.md`; add the id to `GameId`
   in `types.ts` and the definition to `registry.ts`. Guard tests tell you what is missing.
3. Put rules in `logic/` with unit tests; scenes stay thin.
4. Randomness only from `beginRun()`; report every finished run; Esc exits; respect
   `isForShellControl`; call `trackPhaserGame()` on the game you create.
5. Add its id to `GAME_IDS` in `e2e/helpers.ts` (lifecycle tests run per game), and give it a
   spec like `e2e/coil.spec.ts`: a seed whose run scores, predicted by the game's own logic.
6. Mutation-check each new test. Run `npm run check` and `npm run e2e`.
7. Test on a real phone (docs/MANUAL_QA.md). Update this file and the decision log.
