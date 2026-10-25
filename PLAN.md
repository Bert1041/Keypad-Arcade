# Keypad Arcade — Delivery Plan

*(working name was RetroBox)*

**Drafted:** 2026-10-25 · **Companion to:** `README_RetroBox_updated.md` (engineering brief) and `RETROBOX_GAME_CATALOGUE.md` (research)

The README stays the source of truth for architecture and engineering rules. This document says
*what we ship, in what order, how we know it worked*, and records where it deliberately departs from
the README.

---

## 1. The goal, stated so it can be measured

"Go viral like Lagos Life" means people share it unprompted. Translate that into numbers we can
actually watch, otherwise every decision becomes taste:

| Signal | Why it matters | First target (soft launch, ~100 players) |
|---|---|---|
| **Share rate** — shares ÷ completed runs | The viral engine. Nothing else spreads it. | ≥ 5% |
| **Invite conversion** — new players ÷ shares | Whether a shared link is worth tapping | ≥ 20% |
| **D1 / D7 return** | Viral spikes die without retention | ≥ 30% / ≥ 10% |
| **Runs per session** | Is the loop "one more go"? | ≥ 3 |

These are hypotheses, not promises. A V1 without any way to *measure* them is flying blind — see
Decision D3.

## 2. Strategy: neutral retro remakes

**Decided 2026-10-25 (D2):** original games on proven feature-phone loops, in a neutral retro
style — not Naija-themed reskins.

That means local identity is no longer the hook, so spreading depends on:

1. **The share loop (§3)** — now the main viral mechanism, not an extra. D1 matters more.
2. **The nostalgia challenge** — "you played this in 2006; can you still beat it?" Share cards
   should lean on that.
3. **Feel and polish** — remakes compete with every Snake/Breakout clone online; ours must feel
   better on a budget phone than theirs.

**Launch lineup (decided 2026-10-25):** three games, all built before launch:

| Working title | Id | Inspired by | Role |
|---|---|---|---|
| **Coil** | `coil` | Snake / Snake II | Instant recognition, 1-minute runs — built first |
| **Star Raid** | `star-raid` | Space Impact | Score-chasing arcade action |
| **Rebound** | `rebound` | Bounce / Bounce Tales | Physics platformer flagship |

Titles are working names (not checked for conflicts). Ids are permanent once a build ships.

Original names, art, sound and levels are still required (README §13) — "neutral" does not mean
lookalike.

## 3. The viral loop — inside the "no backend" constraint

V1 stays local-first and serverless. That does **not** rule out sharing:

1. **Share card.** On game over, render a score card client-side (canvas → PNG) with a funny
   context line, and open the native share sheet (Web Share API) — WhatsApp is the channel that
   matters. Fallback: copy link.
2. **Challenge links.** `retrobox.app/play/go-slow?seed=8812&beat=4500` — the seed makes the run
   deterministic, so a friend plays *the same* traffic and tries to beat your number. No server
   needed.
3. **Daily seed.** Everyone gets the same run each day (date-derived seed) — a Wordle-style
   conversation starter, still serverless.

> **This departs from the README**, which excludes "social features" from V1. Approved as D1.

**Status (2026-10-25):** 1 and 2 are built and tested (seeded runs via `GameServices.beginRun`,
`/play/:id?seed=&beat=` links, PNG score card, share sheet → text → clipboard fallback). 3 is built
too (2026-10-25): Coil and Star Raid have a numbered daily (`?daily=YYYY-MM-DD`), the same run for
everyone on a UTC day, shared as "Coil Daily #12: 230". Rebound has none — its levels are the same
every day. **At launch, set `DAILY_EPOCH` (src/core/challenge/daily.ts) to the launch date** so the
first day is Daily #1. Link previews have title/description; the preview **image needs the
production domain** (absolute `og:image` URL).

**Rule for every game:** all gameplay randomness must come from the function `beginRun()`
returns. A single `Math.random()` in gameplay silently breaks challenge links; a guard test in
`src/architecture.test.ts` fails the build if one appears in a game folder.

## 4. Audience constraints that shape engineering

- **Low/mid-range Android** is the primary device, not an iPhone. Test on a ~₦80k phone.
- **Data is expensive and networks drop.** Offline PWA is a *feature*, not a checkbox.
  - Budget: library screen ≤ 150 KB gzipped on first load; each game chunk loaded lazily.
  - Phaser 3 is ~340 KB gz — loaded only when a game opens, then cached offline.
- **Links open in WhatsApp's / social apps' in-app browsers**, where install prompts and storage
  behave differently. Challenge links must work with zero install.

## 5. Phases

Phase 0 and Phase 1 run **in parallel** — the game host does not depend on which games we pick.

| Phase | Work | Exit condition | Est. |
|---|---|---|---|
| **0 — Validate** | WhatsApp/X polls ranking the catalogue shortlist; 10 short chats with people who played Nokia/Java games in Nigeria | 3 concepts chosen with evidence; one-page brief each | 1–2 wk |
| **1 — Game host** *(built 2026-10-25; real-device check pending)* | Vite/React/TS shell, registry, Phaser lifecycle, local saves, settings, PWA, disposable prototype game, e2e lifecycle test | Enter → play → exit → re-enter ×N with exactly one live game and canvas; best score survives reload | 1 wk |
| **2 — Share loop + new look** *(share loop built 2026-10-25)* | Share card, challenge links, seeded RNG; modern theme with pixel accents | Share → open link → same run works from WhatsApp on a real phone | 1–2 wk |
| **3 — The three launch games** *(all three built 2026-10-25; real-phone testing pending)* | Coil → Star Raid → Rebound, each to its brief, each in its own folder | All three playable on a budget Android, independent saves, challenge links replay each | 4–6 wk |
| **3.5 — Soft launch** | Ship to ~100 people via WhatsApp groups | §1 numbers measured for 2 weeks | 2 wk |
| **4 — Polish + public launch** | Fix what 3.5 showed; icons, offline/update testing on devices, perf pass, launch content | README §10 definition of done | 1–2 wk |

**Changed 2026-10-25:** launch with three games rather than soft-launching one. Costs ~4 weeks
before the first real player feedback; buys a collection that feels like a product on day one.

## 6. Engineering standards (non-negotiable)

How we test and build is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §8 and the commands in
[README.md](README.md). In short: `npm run check` and `npm run e2e` pass before anything is
called done; every test is mutation-checked; anything stored or rendered is verified in a real
browser; the first-load budget is enforced in the build.

## 7. Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Allow client-only share cards + challenge links in V1 (README currently excludes social features) | ✅ **Decided: yes** (2026-10-25). Built — see §3 status |
| **D2** | Naija-themed originals vs. neutral retro remakes | ✅ **Decided: neutral retro remakes** (2026-10-25) |
| **D3** | Privacy-respecting analytics (e.g. Plausible/Umami: count runs and shares, no personal data) | ✅ **Decided: yes** (2026-10-25). **Open: which provider** — needs your account. Then a privacy note. |
| **D4** | Product name | ✅ **Decided: Keypad Arcade** (2026-10-25). Domain/trademark **not yet checked**. |

## 8. Scope-change test

Before adding any feature, answer:

1. Which player problem does it solve, or which §1 number does it move?
2. Is it needed for the current phase's exit condition?
3. Does it add personal data, a server, an account, or a cost that grows with players?
4. Can a simpler feature do the same job?
5. Which planned work does it delay?
6. What evidence says now rather than later?

If it doesn't serve **play → share → a friend plays → they share**, defer it.

Defer by default: accounts and cloud saves, all-time leaderboards, multiplayer, currencies or
loot, ads, a native app, more than three games before the share loop is measured.

## 9. Decision log

Update when a decision changes. Dates are when it was made.

| Decision | Current baseline | Revisit when |
|---|---|---|
| Theme (2026-10-25) | Modern dark app with pixel-art accents (pixel font for titles, pixel game icons); replaces the green LCD look | Player feedback |
| Launch lineup (2026-10-25) | Coil (snake), Star Raid (shooter), Rebound (ball platformer), all before launch | Soft-launch data |
| Star Raid orientation (2026-10-25) | Vertical scrolling in portrait (Space Impact scrolled sideways) — the app is held upright | Players ask for landscape |
| Name (2026-10-25) | Keypad Arcade. Domain/trademark **not checked** | Before buying a domain |
| Games (2026-10-25) | Neutral retro remakes, original names/art/levels | Phase 0 polls disagree |
| Sharing (2026-10-25) | Client-only: share card + seeded challenge links | — |
| Leaderboards (2026-10-25) | **Global daily boards** per game (Coil, Star Raid, Skyline — the games with a daily); nickname, no account. Every posted run is **replayed on the server** from its seed and inputs, and only the server's score is stored. Rebound has no daily, so no board | Players ask for all-time boards |
| Backend (2026-10-25) | **Vercel Functions + Upstash Redis** (from Vercel's marketplace), for the leaderboards only. Scores and settings stay on the device. Replaces "none yet"; the Hunt can build on it later | Costs beyond the free tier |
| Analytics (2026-10-25) | Yes, privacy-respecting; **provider not chosen** | — |
| Stack | React 19 + Phaser 3.90 + Vite 8 + TypeScript 6 + Dexie 4 + vite-plugin-pwa | — |
| Phaser 3, not 4 | Brief specifies 3; 4 is six months old. Dependabot ignores Phaser majors | First real game is stable, or a Phaser 4 feature is needed |
| TypeScript 6, not 7 | 7 is the new native compiler; typescript-eslint supports < 6.1 | typescript-eslint supports 7 |
| Package manager | npm (lockfile committed) | — |
| Game structure | One self-contained folder per game, enforced by guard tests (docs/ARCHITECTURE.md §3) | — |
| Randomness | Mulberry32, seed chosen by the shell per run; golden values pinned | Never change the generator for existing games |
| Storage | IndexedDB `keypad-arcade`; no cloud | Validated need for cross-device sync |
| First-load budget | 150 KB gz JS, enforced in the build | Measured on a budget phone |
| Browser tests | Production build; Pixel 7 Chromium, iPhone WebKit, desktop Chrome, StrictMode dev; Firefox on CI only | Firefox runs on macOS 27 again |
| Test retries | None, locally or on CI | — |
| Updates | Prompt in the library only, never mid-run | — |
| Practices adopted from Civic Sentinel NG (2026-10-25) | Type-aware ESLint, Prettier, knip, guard tests, page-error fixture, axe, CI with secret scan + audit, Dependabot, docs set, scope test, decision log | — |
