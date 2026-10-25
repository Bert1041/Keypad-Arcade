# Keypad Arcade

Original pocket games inspired by the phones we grew up with — an installable, offline web app
(PWA). Finish a run, send a friend the exact same run on WhatsApp, and dare them to beat you.

**Status:** Game host, saving, offline and the challenge/share loop are built and tested. The only
game is a disposable prototype ("Stack Test"); the launch games are being chosen (PLAN.md,
Phase 0). Not deployed.

## Documentation

| Read | For |
|---|---|
| [PLAN.md](PLAN.md) | Goals, phases, decisions, scope test, decision log |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built, where things live, the game-folder rules, testing, lessons learned, adding a game |
| [docs/MANUAL_QA.md](docs/MANUAL_QA.md) | Real-phone checklist before any launch |
| [RETROBOX_GAME_CATALOGUE.md](RETROBOX_GAME_CATALOGUE.md) | Research: candidate games |
| [README_RetroBox_updated.md](README_RetroBox_updated.md) | Original product and engineering brief |

**Learning path:** this file → ARCHITECTURE §1–4 → run the app, play a run, share it, open the
link → read `src/games/prototype/` top to bottom → ARCHITECTURE §5–10.

## Requirements

- Node 24+ (`.nvmrc`) and npm

## First run

```sh
npm install
npx playwright install chromium webkit   # browsers for the e2e tests (firefox runs on CI)
npm run dev                              # http://localhost:5173
```

On a phone on the same Wi-Fi: `npm run dev -- --host`, then open the "Network" URL. Sharing,
install and offline need https (see docs/MANUAL_QA.md).

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | App with hot reload (React StrictMode on) |
| `npm run check` | Lint, type-check, format check, unused code (knip), unit + guard tests, build + bundle budget |
| `npm run e2e` | Browser tests on a production build: Android Chrome, iPhone WebKit, desktop Chrome, StrictMode dev server |
| `npm run test:all` | `check`, then `e2e` |
| `npm run format` | Format everything |
| `npm run icons` | Re-render the PNG app icons from `public/icons/icon.svg` |
| `E2E_FIREFOX=1 npm run e2e` | Include desktop Firefox locally (always on in CI) |

CI (`.github/workflows/ci.yml`) runs a secret scan, a production-dependency audit, `check` and the
browser tests on every push to `main` and on pull requests; WebKit weekly and on demand.

## Rules for contributors (including future me)

- Each game lives entirely in `src/games/<id>/`; the guard tests enforce it.
- All gameplay randomness comes from `beginRun()` — never `Math.random()`.
- No test counts until it has been seen failing for the right reason (mutation check).
- Anything stored or rendered is verified in a real browser, not only against mocks.
- Never change `DB_NAME` or a released game id: saved scores are keyed by them.
- Record major decisions in PLAN.md's decision log.
