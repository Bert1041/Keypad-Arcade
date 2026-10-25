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
    shared/               Helpers for game code only (lifecycle counter, input filter)
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

## 4. The game ↔ shell contract

`src/games/types.ts`. A game receives `GameServices` and nothing else:

| Member | Use |
|---|---|
| `beginRun()` | Call at the start of every run; use the returned function for **all** randomness |
| `onRunComplete({ score })` | Once per finished run; the shell saves it and shows the share bar |
| `onExitRequested()` | E.g. Esc; the shell navigates back |
| `sfx.blip()` | Sound; silently does nothing when sound is off |
| `bestScore` | Best at launch, for "new best!" (track later runs yourself) |

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

- `gameStats` — `gameId` (key), `bestScore`, `playCount` (completed runs), `lastPlayedAt`
- `settings` — `key`, `value`

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

## 10. Adding a game: checklist

1. Passes the scope test in PLAN.md; has a one-page brief.
2. Create `src/games/<id>/` with `index.ts`, `createGame.ts`, `README.md`; add the id to `GameId`
   in `types.ts` and the definition to `registry.ts`. Guard tests tell you what is missing.
3. Put rules in `logic/` with unit tests; scenes stay thin.
4. Randomness only from `beginRun()`; report every finished run; Esc exits; respect
   `isForShellControl`; call `trackPhaserGame()` on the game you create.
5. Add the game to the e2e lifecycle/persistence/share tests (they currently drive the
   prototype).
6. Mutation-check each new test. Run `npm run check` and `npm run e2e`.
7. Test on a real phone (docs/MANUAL_QA.md). Update this file and the decision log.
