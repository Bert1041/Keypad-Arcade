# RetroBox

**Status:** Research and product definition; game selection is not final  
**Working name:** RetroBox (not final)  
**Product type:** Installable, offline-capable web app (PWA) for original games inspired by pre-smartphone mobile gaming

## 1. Product idea

RetroBox is a virtual retro mobile gaming collection inspired by the games people played on phones before Android and iOS became dominant. The research should cover more than the best-known Nokia built-ins: relevant eras and ecosystems include feature-phone built-in games, Java ME/J2ME downloads, Symbian titles, Nokia N-Gage, BlackBerry, and other regional mobile-game catalogues.

The product goal is to recreate the *feeling* of discovering and playing a small, memorable mobile game collection from the 2000s. RetroBox is not intended to be a launcher for copied ROMs or a catalogue of unofficial ports. The games we ship should be new implementations with original names, artwork, sounds, level layouts, characters, and presentation, using historical games as research references for their broad mechanics and player appeal.

**Do not commit to three specific launch games yet.** First research the era, make a curated candidate list, compare build effort and likely audience recognition, then choose a varied set of three concepts for the MVP. The games listed later in this document are candidates, not launch commitments.

### Product principles

- **Nostalgia with purpose:** choose games because people remember them or because their core loop is compelling, not just because a title appears on an archive list.
- **Fast to play:** each game should be easy to start and offer a satisfying short session.
- **Touch-first:** phone controls are the priority; add keyboard support where natural.
- **Collection-first:** the launcher, selection experience, and consistent return-to-library flow make the collection feel like one product.
- **Original implementations:** borrow broad gameplay concepts, not protected source code, artwork, music, characters, level layouts, logos, or branding.
- **Local-first:** no account or backend is needed for the first release.
- **Research before production:** a short discovery phase is cheaper than building three games that do not resonate with the intended audience.
- **Ship incrementally:** launch a small, polished collection and add more games only after the core experience has been tested.

## 2. Game research and MVP definition

### Research scope

Build a curated history-led catalogue rather than attempting to enumerate every mobile game ever released. Search and compare titles across these groups:

- Built-in games on Nokia and other feature phones.
- Downloadable Java ME / J2ME games distributed by carriers, portals, and handset vendors.
- Symbian games and titles associated with Nokia N-Gage.
- BlackBerry-era games and other notable pre-smartphone ecosystems.
- Regionally popular games, including titles remembered in Nigeria and other African markets, as well as globally recognisable releases.

Use historical catalogues, articles, archived screenshots, gameplay videos, and community memories as discovery sources. A title's existence in an archive is not evidence by itself that it was popular with our target audience. Popularity, regional familiarity, and willingness to replay should be treated as hypotheses to validate.

### Initial candidate shortlist

These are research references to investigate, not a confirmed launch lineup. New builds should use distinct names, visual designs, assets, and level structures.

| Historical reference | Original game concept to investigate | Why it is worth evaluating | Main concern |
|---|---|---|---|
| Bounce / Bounce Tales | Physics-based ball platformer | Strong platforming loop, obstacles, collectibles, and potential for level progression | Medium level-design and physics effort; distinctive original art required |
| Space Impact | Scrolling space shooter | Short sessions, straightforward controls, score chasing, and boss/weapon progression | Needs enough variety to avoid repetitive gameplay |
| Tower Bloxx | Precision timing / tower stacker | Simple controls, satisfying timing loop, low content burden | Must add enough personality and replayability |
| Diamond Rush | Puzzle-adventure platformer | Exploration, hazards, puzzle rooms, secrets, and progression | Greater level-design and content effort |
| Gravity Defied | Physics-based trials racer | Distinctive, skill-based feel remembered by Java-game fans | Vehicle physics and touch controls need careful tuning |
| Snake / Snake II | Grid-based survival arcade game | Broad recognition and a very small technical scope | Familiar mechanic; needs a distinctive mode or twist |
| Rapid Roll | Reflex-based falling / avoidance game | Fast attempts and a natural difficulty ramp | Validate recognition with the intended audience |
| BrickBreaker / Block Breaker | Paddle-and-ball arcade game | Familiar loop, practical to build, easy to expand with stages and power-ups | Crowded genre; needs a polished feel and original presentation |
| Pocket pool / bowling games | Physics-driven casual sports game | Offers variety beyond platformers and shooters | Physics and input need to feel good on touchscreens |
| Ancient Empires-style mobile tactics | Turn-based mini tactics game | Adds strategic depth to the collection | Higher effort for maps, unit rules, and opponent behaviour |

The initial shortlist should be expanded to roughly **25–40 candidate titles** before the final decision. Include titles that were prominent in different regions and ecosystems, not only titles that are easy to implement.

### How to select the first three games

Score candidate concepts from 1–5 against:

1. **Recall:** do people recognise the game or its core mechanic quickly?
2. **Replayability:** is there a reason to play again after a loss or a completed run?
3. **Short-session fit:** can a satisfying session happen in around 1–5 minutes?
4. **PWA fit:** does it work well with touch input and phone-sized screens?
5. **Build effort:** can one developer make a polished original version in a manageable period?
6. **Content burden:** how many levels, animations, assets, dialogue, or complex rules are needed?
7. **Originality and rights risk:** can the concept be reinterpreted with a distinct identity and original content?

The launch collection should demonstrate three different kinds of fun, for example a platformer, a score-chasing arcade game, and a compact timing/reflex game. Do not select all three from the same genre simply because they are easiest to build. Validate the shortlist with conversations or lightweight polls—particularly among people who played these games in Nigeria and the wider African market—before locking the lineup.

### V1 scope (after research is complete)

The planned first release is a small, curated collection of **three selected original games**, plus:

- A retro-styled home screen and game library.
- A consistent flow to launch a game and return to the library.
- Game-specific pause, resume, restart, and game-over flows where relevant.
- A score or progress record appropriate to each game.
- Locally saved best scores and essential progress.
- Basic settings, including sound on/off.
- Installable PWA metadata and app icons.
- Offline launch and gameplay after the required app files and assets have been cached successfully.
- Responsive layouts and controls for mobile, with desktop support where practical.

The final game names, mechanics, orientations, and save requirements must be decided before detailed game-specific implementation begins.

### Not included in V1

- User accounts, authentication, or cloud saves.
- Online leaderboards, multiplayer, chat, or social features.
- Virtual currency, battle pass, or complex achievement economy.
- Remote code loading or a downloadable plugin system.
- Ads or in-app purchases.
- A backend API or database server.
- A large library of games before the first collection has been validated.

Do not add an excluded feature to V1 without a concrete user need and an explicit scope decision.

## 3. Technology decisions

| Area | Choice | Responsibility |
|---|---|---|
| Language | TypeScript | Application and game code with static type checking |
| UI | React | Library, menus, settings, navigation, and surrounding interface |
| Game engine | Phaser 3 | 2D rendering, game loop, sprites, collisions, input, and gameplay audio |
| Build tooling | Vite | Local development and production builds |
| PWA | `vite-plugin-pwa` | Web app manifest and service-worker integration |
| Local persistence | IndexedDB via Dexie | Best scores and simple settings |
| Styling | CSS / CSS Modules | Retro visual system and responsive app layout |
| Hosting | Static HTTPS hosting | Serve the built PWA; no application server is needed for V1 |

Keep dependencies limited. Do not add a state-management framework, backend, dependency-injection framework, or elaborate plugin architecture unless the current code demonstrates a real need.

## 4. Architecture

The application has two main parts:

1. **React app shell** — owns navigation, the library, settings, game selection, and presentation outside the game canvas.
2. **Phaser runtime** — owns the active game's rendering, game loop, world state, collisions, in-game controls, and gameplay rules.

React should not run per-frame gameplay logic. Phaser should not own the app's library screen or global navigation.

```text
RetroBox PWA
├── React app shell
│   ├── Home / game library
│   ├── Game screen container
│   ├── Settings
│   └── Shared UI components
│
├── Game host
│   ├── Creates the selected Phaser game
│   ├── Provides shared services/callbacks
│   └── Destroys the Phaser instance when leaving the game
│
├── Selected game modules
│   ├── Game module A (chosen after research)
│   ├── Game module B (chosen after research)
│   └── Game module C (chosen after research)
│
└── Shared services
    ├── Local storage
    ├── Score recording
    └── Audio/settings configuration
```

### Game lifecycle

- The user chooses a game from the library.
- The app opens a game screen with a dedicated element for the Phaser canvas.
- The game host creates the selected game's Phaser instance inside that element.
- The game reports completed-run results through a small typed callback/service interface.
- The app persists the result and displays the appropriate result state.
- When the user leaves the game, the host destroys the Phaser instance and removes its canvas and event listeners.

The Phaser instance must not be created during React render. Create it in an effect after the container element exists, and clean it up when the game screen unmounts or the selected game changes. This avoids duplicate game loops and canvases during React lifecycle changes.

### Game registry

Use a simple, explicit registry that contains the metadata required to display and launch each game. Do not build a general-purpose plugin system for three games.

A game definition should provide, at minimum:

- A stable lowercase ID chosen when the game concept is approved; do not rename it casually after saves begin using it.
- A display title and short description.
- A thumbnail/icon path.
- The intended display orientation (`portrait`, `landscape`, or `any`).
- A factory function that creates the game's Phaser instance for a provided parent element and shared services.

The library reads the registry to render game cards. Game IDs must remain stable because saved scores use them as keys.

### Ownership boundaries

- **React:** routes, menus, library cards, app settings UI, loading/error states, exit controls.
- **Phaser game module:** scenes, rules, sprites, physics, level design, in-game input and game-over presentation.
- **Shared services:** saving scores/settings and passing configuration or results between the app shell and a game.
- **PWA/service worker:** caching the shell and built assets; not game rules or save data.

Keep communication between React and Phaser narrow. Use typed callbacks or a small typed event contract for necessary events such as `scoreSubmitted`, `gameOver`, and `exitRequested`. Do not introduce a global event bus unless callbacks become impractical.

## 5. Suggested project structure

```text
retrobox/
├── public/
│   ├── icons/
│   └── images/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── routes.tsx
│   ├── features/
│   │   ├── library/
│   │   ├── game-player/
│   │   └── settings/
│   ├── games/
│   │   ├── registry.ts
│   │   ├── types.ts
│   │   └── selected-game-id/
│   │       ├── createGame.ts
│   │       ├── scenes/
│   │       ├── components/   # only if the game needs them
│   │       └── assets/
│   ├── core/
│   │   ├── storage/
│   │   ├── scores/
│   │   └── audio/
│   ├── components/
│   ├── styles/
│   └── main.tsx
├── vite.config.ts
├── package.json
└── README.md
```

Each selected game gets its own directory named after its stable game ID. Do not create all game folders before they have a design brief or implementation. Add subfolders when the code needs them; avoid empty scaffolding.

## 6. Local data

V1 needs only a small amount of persistent data. Use IndexedDB through Dexie; do not create a backend just to save high scores.

Suggested records:

### `gameStats`

- `gameId` — stable game ID and primary key.
- `bestScore` — best recorded score.
- `playCount` — completed or started runs, with the meaning kept consistent.
- `lastPlayedAt` — timestamp of the most recent run.

### `settings`

- `key` — setting key.
- `value` — typed or validated value, such as whether sound is enabled.

Store only values the app actually uses. Add per-level progress or achievement tables only when a launch game requires them. Handle missing, malformed, or outdated saved data without crashing the app.

Cloud sync can be added later behind a storage interface if there is a validated need for it. Do not implement that abstraction prematurely.

## 7. PWA and offline behaviour

The PWA should include:

- A valid web app manifest with app name, short name, icons, theme colour, and display mode.
- A service worker configured through `vite-plugin-pwa`.
- HTTPS hosting.
- Caching for the app shell and the assets needed by the launch games.
- A clear update path so a new deployment does not unexpectedly reload the app during a game.
- Testing of install, update, and offline behaviour on real devices.

Offline support is not automatic just because a manifest exists. Confirm that the required JavaScript bundles, fonts, images, and game assets are cached. A first visit generally requires a connection; users must load the app successfully before they can rely on offline use. Newly deployed games or assets may also require an online visit before being available offline.

Browser storage can be cleared by the user or browser, so local records must not be described as a guaranteed backup.

## 8. Controls and responsive behaviour

- Design touch controls for small screens and keep them clear of important game content.
- Support keyboard controls where natural, such as arrow keys or WASD for desktop play.
- Avoid relying on hover for essential actions.
- Handle screen resizing and device orientation changes without stretching the game incorrectly.
- Pause or safely suspend gameplay when the user leaves the game or the page becomes hidden.
- Prevent app-shell buttons from accidentally triggering gameplay input.
- Make sound optional and respect the saved sound setting.

Each game can choose its own controls and orientation, but those choices must be documented in its game definition and tested on a phone.

## 9. Development plan

### Phase 0 — Research the catalogue and choose the first three concepts

- Build the candidate list to roughly 25–40 titles across feature-phone, Java ME/J2ME, Symbian/N-Gage, BlackBerry, and other relevant ecosystems.
- Record for each candidate: historical reference, platform/era, genre, core loop, controls, progression, reference screenshots/video, likely effort, and original reinterpretation options.
- Look for evidence from more than one source; separate broad historical visibility from popularity in the audience we want to serve.
- Ask a small group of people who played mobile games in the target era—especially in Nigeria and nearby markets—which titles they remember and would replay.
- Score the candidates using the criteria in Section 2 and select three varied game concepts.
- Write a one-page design brief for each selected concept, including its original identity, gameplay loop, controls, minimum content, and completion criteria.

**Exit condition:** the first three game concepts are selected based on research and audience feedback, each has a brief, and the rights/originality approach is clear. Do not start full production before this condition is met.

### Phase 1 — Prove the game host

- Create the Vite + React + TypeScript project.
- Add Phaser and the PWA plugin.
- Build a basic library with temporary game cards.
- Implement the simple game registry and game host lifecycle.
- Build a disposable prototype to verify canvas sizing, touch input, cleanup, navigation, and returning to the library.

**Exit condition:** a user can enter a prototype game, play, exit, and re-enter without duplicate canvases or game loops.

### Phase 2 — Build the first selected game

- Implement the chosen flagship concept to the scope in its design brief.
- Add only the mechanics and content needed to demonstrate the core loop.
- Add pause/restart/game-over or completion flows as appropriate.
- Save the score or progress required by that game.
- Test on a real Android phone and a desktop browser; test on iPhone/Safari if it is in the intended support scope.

**Exit condition:** the game is stable and enjoyable enough to test with people from the target audience.

### Phase 3 — Add the other two selected games

- Implement the other two selected concepts using the same app shell and storage conventions where useful.
- Keep each game's gameplay code and assets inside its module.
- Share only genuinely common behaviour; do not force different genres into a generic system that makes them harder to build.

**Exit condition:** all three games can be launched, played, exited, and have their own score/progress data saved independently.

### Phase 4 — PWA, polish, and release

- Add final app icons, manifest metadata, and installation guidance.
- Configure and test offline asset caching and app updates.
- Polish the launcher, transitions, sound, loading states, and game controls.
- Check accessibility basics, performance, and small-screen behaviour.
- Deploy to HTTPS hosting and verify on actual target devices.

**Exit condition:** installation, core gameplay, persistence, and offline behaviour have been tested on supported browsers.

## 10. Definition of done for V1

V1 is ready for release when:

- The library displays the three selected games and their descriptions.
- Each game can be opened and exited repeatedly without duplicate canvases, listeners, or game loops.
- Each game has working controls, pause/restart behaviour, and a game-over state.
- Best scores persist across page reloads and app restarts.
- The app is installable on supported browsers.
- The cached app and launch-game assets work offline after a successful initial load.
- A service-worker update does not interrupt an active run without warning.
- Layout and controls have been checked on real mobile devices, not only desktop emulation.
- There are no known release-blocking crashes or console errors.
- All names, art, sounds, level designs, and other assets are original or properly licensed.

## 11. Engineering rules

1. **Build the smallest working version first.** Prefer a working vertical slice over extensive scaffolding.
2. **React owns app UI; Phaser owns gameplay.** Do not put frame-by-frame game state in React.
3. **Keep each game self-contained.** A change to one game should not require edits to unrelated game modules.
4. **Share behaviour only after a real pattern appears.** Do not build a framework for hypothetical future games.
5. **Keep the registry explicit.** Do not add remote module loading or a plugin marketplace to V1.
6. **Use TypeScript types at boundaries.** Especially for game IDs, game metadata, saved records, and game result callbacks.
7. **Clean up resources.** Destroy Phaser instances and unsubscribe listeners when leaving a game.
8. **Persist only useful data.** Start with settings and the score/progress data selected games need; add complexity only when a game requires it.
9. **Test on devices early.** Touch, audio, resizing, PWA installation, and offline caching can behave differently across browsers.
10. **Avoid premature backend work.** No server is needed for the MVP as currently defined.
11. **Keep dependencies justified.** Every new package should solve a concrete problem in the current scope.
12. **Protect original IP.** Use retro-era games as inspiration, not as a source for copied names, logos, sprites, music, code, or level layouts.

## 12. Future possibilities — not V1 commitments

Only consider these after the core app has users and evidence of demand:

- More game releases and themed game collections.
- Additional visual themes, such as CRT-like effects.
- Achievements and challenges across games.
- Optional cloud backup and cross-device sync.
- Leaderboards or other online features.
- Ethical monetisation, such as a premium no-ads option or paid game packs.
- A native wrapper if browser limitations create a clear user or distribution problem.

## 13. Research reference and rights guidance

Keep the detailed candidate catalogue in `RETROBOX_GAME_CATALOGUE.md` so this README remains the main product and engineering brief. Update that catalogue when candidates, sources, scores, or selection decisions change. Once the first three concepts are selected, update this README and create a separate game design brief for each one.

Discovery sources can include retrospectives on pre-smartphone mobile gaming, Java ME game archives, Symbian/N-Gage catalogues, period screenshots and videos, and community discussions. Treat archive lists as discovery tools, not authoritative popularity rankings. Record sources and uncertainty; do not present a qualitative guess as measured demand.

**Originality and rights:** old games should be used as research references, not assumed to be free to copy. Reimplement broad mechanics with original code, names, characters, artwork, sounds, user interface and level layouts. Avoid copying extracted assets, ROMs, source code, branded presentation or distinctive level designs, and do not imply endorsement by the original rights holder. If exact branding or protected content is essential, investigate licensing before production. This is practical product guidance, not a legal opinion.

## 14. Product success question

Before and after launch, RetroBox should answer two questions:

1. **Selection:** which pre-smartphone mobile-game experiences do the intended audience remember and want to replay?
2. **Product:** once the three selected original games are available, do people enjoy opening RetroBox often enough to return and play more than one game?

Optimise first for learning and the quality of a small collection. Do not optimise for a large game count, monetisation systems, or speculative future features before demand is demonstrated.
