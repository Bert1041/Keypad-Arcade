# Game Engine, AI Playtesting & the Monthly Hunt

> **Status:** Planning document (2026-10-25). Extends [README.md](../README.md),
> [PLAN.md](../PLAN.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Sections 6–7 describe much
> that already exists — each says what is **built** and what is **planned**.
>
> **Decided 2026-10-25: no backend yet.** The Hunt (§8 on) needs one, so it is not being built
> now. The games, practice mode and the AI-playtesting work in §7 continue. See §2.1.
>
> Keypad Arcade was called RetroBox while it was being planned; the name in the original version
> of this document has been updated.

## 1. Product vision

Keypad Arcade is a collection of original games inspired by the phones people played before
Android and iOS, shipped as an installable web app (PWA).

Its planned differentiator is a **living, cross-game mystery**. Each month the Game Master (the
project owner) creates a hidden quest. Players find clues inside different games, connect them,
unlock hidden content and complete a final Easter egg spanning the library.

*The games are the playground; the mystery connects them into one bigger experience.* Take
inspiration from the idea of a connected puzzle hunt — never from protected storylines,
characters, puzzles, levels, artwork or branding of any film or game.

### Pillars

1. **Great games first.** Every game is worth playing for someone who never touches the Hunt.
2. **One connected mystery.** Clues lead between games to a final hidden encounter.
3. **A live Game Master.** A private admin area to draft, test, schedule, publish, hint, pause
   and close each month's event.
4. **Test before release.** The project's own automated and AI-assisted agents play and challenge
   every game release and every Hunt before publication.
5. **Fair play.** Official Hunt progress, records and achievements are validated by trusted
   server logic — never accepted just because the browser says so.
6. **Honest security.** Make exploits harder and easier to detect. Never promise that no person
   or AI can solve a clue or automate a browser game.

## 2. Scope

### In scope

- The React + TypeScript PWA shell and Phaser games (built — see ARCHITECTURE.md).
- The three launch games: **Coil**, **Star Raid**, **Rebound** (built).
- Shared game lifecycle: start, pause, game over, restart, return to library (built).
- Local practice progress and best scores (built).
- A test adapter and automated tests per game (built; §6–7 list the gaps).
- AI-assisted playtesting as a release gate (partly built — §7).
- A monthly cross-game Hunt with clues, hidden stages, hints and non-monetary recognition.
- A simple Game Master admin area with event versioning and an audit log.
- Server-validated Hunt progression, and leaderboards where they are needed.

### Out of scope

- Cash prizes, payouts, entry fees or prize competitions.
- Monetisation and ads; paid hints, paid attempts, pay-to-win.
- Multiplayer, chat, or a social network.
- Accounts or cloud sync for casual practice, unless a feature genuinely needs them.
- Microservices, Kubernetes, a backend per game, or a large analytics platform.

None of these may delay the core product. Revisit only through a deliberate decision recorded in
PLAN.md's decision log.

### 2.1 Decisions this plan needs before Hunt work starts

**Decided 2026-10-25: no backend yet.** Everything below that needs the server waits:
official completions, hidden clues, leaderboards, the Game Master dashboard. What continues:
the games, local practice progress, the client-only share loop, and the playtesting agents in §7
(which need no server — except Agent C, whose job is to attack one).

A Hunt *without* a backend would have to ship its clues and answers in the app, where anyone can
find them (§8, "Keep the mystery on the server"). It could only ever be an unofficial, local
Easter egg — no verified completions, no leaderboard. If that is wanted before the backend, it
is a separate decision.

When the backend is reconsidered, the Hunt changes three standing decisions in PLAN.md; each
needs an explicit yes:

| Standing decision | What the Hunt needs | Why it matters |
|---|---|---|
| **No backend in V1** (local-first) | One Node.js API + PostgreSQL | Clues and validation must live on a server (§8). The practice games stay serverless and offline. |
| **No accounts** | An identity for official Hunt progress (accounts, or at least server-issued sessions) | Official completions need someone to belong to. |
| **Sharing is client-only** (seeded challenge links) | Unchanged for practice — but Hunt results must never come from a client-built link or score | A shared link must not become a way to forge Hunt progress. |

Recommended order (§12): launch and learn from the games first; revisit the backend after the
soft launch, and build the Hunt as its own phase once these are agreed.

## 3. Engineering boundaries (non-negotiable)

- Never describe the platform as "AI-proof" or "impossible to cheat". Browser code can be
  inspected, inputs automated, and puzzles reasoned about with outside tools.
- Treat browser code and local saves as untrusted for official Hunt progress or leaderboards.
- Never ship unrevealed answers, future clues, solution keys or secret validation logic in the
  PWA bundle. (The bundle-budget and guard tests in ARCHITECTURE.md §8 are where a "no secrets
  in the bundle" check would live.)
- A client can never award itself an achievement or declare a Hunt complete; the platform
  validates the required progression.
- Practice stays usable offline. Say clearly that Hunt progress cannot sync or verify offline.
- An unusual input pattern, a fast completion, or assistive technology is never on its own proof
  of cheating.
- Original content only: no copied assets, music, characters, level layouts, names or branding.
- Build the simplest thing that works; add complexity only when a built feature needs it.

## 4. Technical stack

| Layer | Choice | Status |
|---|---|---|
| PWA and library | React + TypeScript + Vite + vite-plugin-pwa | Built |
| 2D games | Phaser 3 | Built |
| Game rules | Pure TypeScript modules, fixed 60 Hz steps, seeded randomness | Built (all three games) |
| Browser tests | Playwright (Android Chrome, iPhone WebKit, desktop Chrome/Firefox) | Built |
| Local storage | IndexedDB via Dexie | Built |
| Backend | **One** modular Node.js + TypeScript API — no microservices | **Not now** (decided 2026-10-25) |
| Database | PostgreSQL (a managed provider such as Supabase is fine; validation still runs in our own server code) | Planned |
| Game Master admin | A protected area in the same React app; authorization enforced by the API | Planned |
| Scheduled events | The host's scheduled jobs; queues only when real load needs them | Planned |

## 5. System architecture

```text
                       KEYPAD ARCADE PWA
            React library / game player / Hunt UI
                              |
              +---------------+---------------+
              |                               |
        Practice mode                     Hunt mode (planned)
     Local progress (built)          Online event progress
              |                               |
   Phaser game modules (built) ------->  Node.js API (planned)
              |                       - current campaign version
   Pure game logic (built)            - released clues and hints
   - seeded, fixed-step               - stage progress validation
   - emits semantic events            - completion + leaderboard records
                                      - audit events
                                              |
                                          PostgreSQL
                                              |
                               Private Game Master admin
```

### Trust boundaries

- **PWA / browser:** renders games, takes touch and keyboard input, caches assets, keeps
  practice progress. Never the authority for official results.
- **Game logic:** rules already live apart from rendering (`src/games/<id>/logic/`), with fixed
  steps and seeded randomness — so a server can replay an action log and verify a milestone
  instead of trusting a reported score.
- **API:** owns event state, clue release, accepted progress, official completions,
  leaderboards and admin actions.
- **Database:** event definitions and versions, progress, completions, audit events.
- **Game Master admin:** controls future events and approved live actions; every publish, pause,
  hint and material change is audited.

### Practice mode vs Hunt mode

- **Practice** is what exists today: low friction, offline, progress on the device.
- **Hunt** needs a connection to receive the clues currently released and to verify progress.
  When the service is unreachable, say that Hunt progress cannot be verified right now, and
  never show an unconfirmed completion as official.

## 6. Game module contract

Each game lives entirely in `src/games/<id>/` (ARCHITECTURE.md §3, enforced by guard tests). The
registry describes available games and must never hold Hunt solutions.

| Test-adapter capability | Status today |
|---|---|
| Reset to a known state and seed | **Built.** Every run starts from `beginRun()`'s seed; challenge links set it. |
| Start, end, restart a run | **Built.** Pause is not (tabs hidden pause the loop; there is no in-game pause yet). |
| Apply documented input actions | **Built.** Each game's rules take typed inputs (`queueTurn`, `RaidInput`, `ReboundInput`). |
| Advance with a controlled timestep | **Built.** Fixed 60 Hz in Star Raid and Rebound; step-based in Coil. |
| Expose state to tests in non-production builds | **Built** for lifecycle and Rebound (`VITE_E2E=1` only, absent from production builds). |
| Export a replay / action log | **Built** for Rebound (scripted solutions, `npm run levels:trace`). Planned for Coil and Star Raid. |
| Report semantic events | **Built**, with game-specific names (`ate`, `kill`, `powerup`, `ring`, `checkpoint`, `level-clear`…). A shared vocabulary (`level_started`, `checkpoint_reached`, `collectible_found`, `level_completed`) is planned for the Hunt. |

Test hooks are compiled out of production builds. Obfuscation is not an anti-cheat control.

The actual structure (illustrated with Rebound):

```text
src/
  app/  features/  components/  core/  styles/
  games/
    registry.ts            the list of games (metadata only)
    types.ts               the game ↔ shell contract (GameServices)
    shared/                helpers for game code only
    rebound/
      index.ts             metadata + lazy loader (no Phaser)
      createGame.ts        builds the Phaser game
      logic/               pure, tested rules (+ replay, fairness)
      levels/              text maps + recorded solutions
      scenes/              drawing and input only
      assets/  README.md
  hunt/   admin/   test-agent/      ← planned, not yet created
```

## 7. AI playtesting — a release gate

**Every release candidate is played and tested by our own agents before release.** It does not
replace unit tests or human review. Build in layers: deterministic scripts and search first;
a language or vision model only where a game needs one.

### Agent A — rules and simulation tester

Uses the pure game logic and structured state to explore actions, check scoring and win/loss,
and search edge cases.

**Built:** rule tests for every game; Rebound's beam-search solver (`npm run levels:solve`) finds
a route through every level, and the tests require each level to be finished without dying,
collecting every pickup, with every input change surviving ±2 ticks; Star Raid's fairness tests
check identical waves for different players; golden-value tests pin the random generator.

**Planned:** a search-based explorer for Coil and Star Raid; generic checks (score monotonic,
no event after a run ends, no double-recorded completion).

### Agent B — black-box player

Plays the real PWA in a real browser through Playwright, with only a player's inputs.

**Built (scripted):** launch, library, enter and leave each game repeatedly, play to game over,
retry, share, challenge links, offline, accessibility (axe); the real game plays all ten Rebound
levels to the exact predicted score.

**Planned:** a vision-capable agent behind a replaceable interface, for first-time play,
tutorials and Hunt clue discovery without being given the solution.

### Agent C — red team / integrity

Has permission to inspect the test build and tries to break it: bundled clues, out-of-order or
replayed API calls, expired tokens, edited local saves and timestamps, fabricated game state,
offline progress replayed on reconnect, duplicate completions from several sessions.

**Status:** planned. It only becomes meaningful once there is a server to fool — the goal is to
prove that manipulating the browser cannot make the **server** accept an invalid result.

### Report for every build

Machine- and human-readable: commit and game versions; agent and model versions; seeds and
scenarios; win/loss paths reached; bugs with reproduction steps, screenshots and action logs;
performance on target device profiles; unresolved failures and the decision taken on each.
CI already keeps Playwright traces and reports on failure; the full report is planned.

Never put production secrets, private user data or unreleased live solutions in an external AI
prompt.

### Release gate

1. Types, lint, unit and logic tests pass (`npm run check` — built).
2. The rules agent covers the required win/loss paths and edge cases.
3. The black-box agent plays the main flow (`npm run e2e` — built, scripted).
4. The red-team agent tests score, clue, progression and completion paths (planned).
5. A human checks feel, difficulty, accessibility and device layout (docs/MANUAL_QA.md).
6. Results are attached to the release; unexplained failures block it unless waived in writing.

Do not pay for a model call on every simulation step when deterministic testing does the job.

## 8. The monthly Hunt

Each Hunt is a versioned campaign run by the Game Master. Clues spread across several games and
end in a hidden stage, final phrase, secret room or final action. Completion earns non-monetary
recognition — an achievement, title, badge, or a place on a verified leaderboard.

### Example journey

1. The month's event opens with a theme and a first clue.
2. A normal milestone in one game reveals a clue fragment.
3. The fragment points to an object, place, pattern or action in a second game.
4. A third game reveals the next piece once the server has verified the earlier ones.
5. The player connects the fragments and triggers the final hidden encounter.
6. The server validates the sequence and records an official completion for that version.

Only an example: vary the mechanics and story each month, so solving one Hunt does not solve
the next.

### Campaign configuration (versioned data)

Stable event ID and immutable version; title, theme, opening and closing times, status;
participating game IDs and required stages; clue release conditions and hint schedule;
server-side validation rules (or references to approved validators); completion criteria and
leaderboard tie-breaks; public description and fair-play rules; created / published / changed-by
and audit information.

No visual puzzle editor at first: a validated configuration and a basic admin form are enough.

### Game Master controls

Draft and preview; test clues and validators in a sandbox; schedule start, end and hints;
publish a version; review stage completions and suspicious submissions; pause during an exploit
or outage; release an official hint; close and publish a summary; start next month's draft.

### Versioning rule

Never silently change a live Hunt's solution or requirements. Changes are a new version. If a
serious bug forces intervention: pause, show a clear notice, write an audit entry, and apply one
documented reset or extension policy to everyone affected.

### Keep the mystery on the server

The client receives only clues the player has already earned — never future answers or secret
validators. Endpoints reveal only what the player is entitled to now. Use expiring, single-use
attempt tokens where needed and check their use on the server.

Minified code, hidden DOM elements, or an answer encrypted with a key shipped in the same bundle
are not defences. If an answer must run entirely in the browser, assume a determined player will
find it.

## 9. Integrity and AI-assisted solving

No one can guarantee that players won't use an AI on a clue, read the client code, or automate a
browser. For a non-monetary Hunt the goal is credible official records without invasive
anti-cheat.

**Practical controls:** server-controlled event state and completions; authenticated sessions for
official progress; server-issued attempt IDs with expiry and replay protection; server checks
for stage order and valid transitions; rate limits on progress endpoints; detection of
impossible transitions, duplicates and malformed requests; an audit log; a simple process to
review and correct mistakes.

Validate the underlying milestones, not a final client-submitted score. The games' rules are
already deterministic and pure (§5), so a server can replay an action log to check one.

**Fairness and false positives:** a fast solve is a reason to look, not proof. Never disqualify
someone for an unusual browser, fast inputs or assistive technology. Publish whether bots, code
inspection and AI-assisted solving are allowed — detecting a separate AI used to reason about a
clue is unreliable. Prefer clear rules, transparent leaderboard criteria and consistent
moderation over fingerprinting.

## 10. Data

### Local (built)

`settings` (sound) and `gameStats` (best score, play count, last played, furthest level) in
IndexedDB via Dexie. No secrets in local storage. See ARCHITECTURE.md §6.

### Server (planned, with the Hunt)

| Table | Fields |
|---|---|
| `users` | id, public nickname, status, created |
| `games` | id, version, metadata, release status |
| `campaigns` | event id, title, status, public dates |
| `campaign_versions` | immutable version, configuration, published at, author |
| `campaign_stages` | stage id, campaign version, game id, sequence, public description, validation reference |
| `player_stage_progress` | user, campaign version, stage, state, evidence reference, timestamps |
| `game_attempts` | attempt id, user, game/version, campaign version, start/end, seed/session, result, evidence |
| `hunt_completions` | user, campaign version, verified completion time, validation status |
| `audit_events` | actor, action, entity/version, timestamp, reason, metadata snapshot |

Use constraints and transactions so a completion cannot be recorded twice. Keep high-frequency
input data only as long as debugging, validation and abuse review need it, under a written
retention policy.

## 11. API (conceptual)

Build each endpoint only when its feature exists:

- `GET /campaigns/current` — the public event and the clues released so far, nothing more.
- `POST /campaigns/:id/attempts` — create an authorised attempt.
- `POST /attempts/:id/events` — bounded, typed progress events or replay chunks.
- `POST /campaigns/:id/completions` — *request* validation; a client cannot declare completion.
- `GET /me/campaign-progress` — the player's revealed progress.
- Admin endpoints for draft, preview, schedule, publish, pause, hint and close.

Every write validates input, enforces authorisation and rate limits, and is safe to replay.
Admin rights are enforced by the API, not by hiding buttons.

## 12. Roadmap

Phases 0–2 of the original plan are largely done; the Hunt starts at Phase 3, after the decisions
in §2.1 and after the games have met real players.

| Phase | Work | Status |
|---|---|---|
| 0 — Ground the concept | Research, pick games, define controls and win/loss paths; sketch one Hunt **on paper only** | Games: done. Paper Hunt: **next** |
| 1 — Framework and testers | Game module + test adapter, deterministic tests, Playwright launch/play/restart/exit, repeatable report | Done, except the per-build report |
| 2 — Three playable games | Coil, Star Raid, Rebound; shared score and lifecycle; agents play every release; touch, layout, offline | Done; real-phone testing pending (MANUAL_QA.md) |
| — Soft launch | PLAN.md phase 3.5: real players, measured | Before the Hunt |
| 3 — Hunt prototype | Campaign versioning, a few clue stages, minimal admin; answers and validators on the server; private Hunt with test accounts; red-team tampering, replay and automation | Waits for a backend decision |
| 4 — Closed test | Small group, no prizes: do clues make sense, is it fun, do players return? Review false positives, devices, accessibility, reliability | Planned |
| 5 — Monthly operation | Draft and test each Hunt, freeze the live version, monitor, scheduled hints, publish a summary, learn | Planned |

## 13. Definition of done — a game release or a Hunt

- [ ] Unit, integration, lint and type checks pass.
- [ ] The rules agent covers success, failure and edge-case paths.
- [ ] The black-box agent has played the core journey.
- [ ] The red-team agent has tried inspection, local tampering, replay, out-of-order actions and
      automation (Hunt releases).
- [ ] Clues are understandable and solvable without the source code.
- [ ] Official progression is validated on the server where required.
- [ ] The Hunt version and public rules are recorded and auditable.
- [ ] Hints, dates, completion criteria and leaderboard rules are clear.
- [ ] Accessibility and real-device checks are complete.
- [ ] Monitoring, pause and rollback are ready for a live Hunt.
- [ ] It adds fun without making ordinary play frustrating.

## 14. Metrics

Players who start and finish each game; players who find their first clue; drop-off and hint use
per stage; verified completion rate and time to complete; players returning across months;
crash rate, load time and mobile performance; flagged submissions, confirmed exploits and wrong
flags; feedback on difficulty, clue clarity and enjoyment.

These sit alongside PLAN.md §1's share and retention numbers. Time to complete is never on its
own proof of cheating.

## 15. References

- [OWASP Game Security Framework](https://owasp.org/projects/gamesec-framework) — trust
  boundaries, client tampering, botting, risk-based security.
- [OWASP Bot Management and Anti-Automation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Bot_Management_and_Anti-Automation_Cheat_Sheet.html)
  — layered detection, rate limits, privacy, graduated responses, false positives.
- [Playwright documentation](https://playwright.dev/docs/intro)
- [Phaser documentation](https://docs.phaser.io/)

---

## Direction

Build a great collection of games first. Then add the Hunt as a live layer that gives players a
reason to come back every month. Our own agents play and challenge every release; the Game
Master's dashboard keeps monthly events manageable and auditable; official progress is validated
by the platform, not trusted to the browser. Gameplay, mystery and community recognition — money
stays out of this plan.
