# Manual QA: real phones

Automated tests run emulated phones in Chromium and WebKit. They cannot tell you how a game
*feels* under a thumb, how the share sheet hands off to WhatsApp, or how a ₦80k Android copes.
Do this before any soft launch and after major changes. About 30 minutes.

Write down the date, devices, browser versions and anything that failed.

## Setup

- Install, offline and sharing need **https**. Use a hosted preview, or a temporary https tunnel
  to `npm run preview`. Plain `http://<LAN-IP>:5173` works for gameplay only.
- Devices: one **low-cost Android** (the main target) and one **iPhone** if available.

## 1. Play

- [ ] Library loads quickly on mobile data; best scores are shown.
- [ ] Open a game: it fills the space between the bars, nothing is cut off, no page scroll.
- [ ] Taps register immediately; no double-tap zoom, no text selection, no long-press menu.
- [ ] Rotate the phone mid-game: the game rescales without stretching, keeps running or pauses.
- [ ] Switch apps mid-run and come back: no crash; the run has paused, not raced ahead.
- [ ] Sound plays after the first tap; turn sound off in Settings → silent.
- [ ] Android back gesture leaves the game for the library; doing it again leaves the app.

## 2. Save

- [ ] Finish a run → best score updates; close the browser fully, reopen → still there.

## 3. Share and challenge

- [ ] "Challenge a friend" opens the share sheet with the score card image and the text + link.
- [ ] Send to WhatsApp: the image and the message both arrive; the link is tappable.
- [ ] Open the link on another phone (not logged in, no app installed): "Challenge: beat N".
- [ ] The link preview in WhatsApp shows the title and description.
- [ ] Beat the challenge → "You beat N!"; "Brag" shares a new link with the same run.

## 4. Install and offline

- [ ] Install to the home screen; the icon and name ("Keypad") look right.
- [ ] Launch from the icon: opens full-screen (no browser bar).
- [ ] Turn on airplane mode, relaunch: library and every game open and play.
- [ ] Deploy a new version, reopen: "A new version is ready" appears in the library — never
      during a run.

## 5. Bad network

- [ ] Chrome DevTools → Network → "Slow 3G" (or a real weak signal): library usable within a few
      seconds; opening a game shows no broken state while Phaser downloads.

## 6. Screen reader (library and settings only)

- [ ] TalkBack / VoiceOver reads each game card's title, description and best score.
- [ ] The sound toggle is announced as "Sound, switch/checkbox, on/off".

## Record

| Date | Device / browser | Section | Result / notes |
|---|---|---|---|
| | | | |

## Emulated pass — 2026-10-25

Run against a production build in emulated phones (Playwright: Pixel 7 and Galaxy S9+ in
Chromium; iPhone SE and iPhone 14 in WebKit), all three games. **Not a substitute for the
checklist above on real phones** — the items marked "real phone" could not be checked this way.

| Item | Result |
|---|---|
| 1. Library loads; best scores shown | Pass. Slow 3G (400 ms, 500 kbit/s): usable in 2.9 s |
| 1. Game fills the space, no page scroll | Pass on all four phones, every game |
| 1. No double-tap zoom / selection / long-press menu | Set in CSS (`touch-action`, `user-select`, `touch-callout`) on the game area. **Real phone** |
| 1. Rotate mid-game | **Bug, fixed:** the game resized one rotation late — overlapping the bars in landscape, shrunk in portrait. Now tested per game, both ways |
| 1. Switch apps mid-run | Pass: pauses, and stays paused until Resume (tested) |
| 1. Sound on / off | Pass: tones play with sound on, none with it off. How it sounds: **real phone** |
| 1. Android back | Pass: back from a game returns to the library |
| 2. Best survives closing the browser | Pass (a fully closed and reopened browser profile) |
| 3. Share sheet with image, text, link | Pass with the browser's share API stubbed; the WhatsApp hand-off: **real phone** |
| 3. Link preview in WhatsApp | Title and description tags present; **no preview image** until the production domain exists |
| 3. Challenge and "Brag" | Pass (tested) |
| 4. Installable | Pass: Chrome's installability check reports no errors; manifest icons load. Installing and launching: **real phone** |
| 4. Offline | Pass: every game opens offline after one online visit (tested) |
| 4. New version | Pass: a deploy during a game does not interrupt it; the prompt appears back in the library; Update loads the new version |
| 5. Opening a game on slow 3G | **Bug, fixed:** ~6 s of an empty dark area while the game downloaded. Now says "Loading Star Raid…" (tested with the download held back) |
| 6. Screen reader names | Pass in the accessibility tree: each card reads title, description and best; the toggle is "checkbox Sound". Spoken by TalkBack / VoiceOver: **real phone** |

Also found and fixed:

- **Dying while holding a button restarted the run on release** (Star Raid's drag, Rebound's pad,
  Coil): you never saw your score. Now only a fresh tap after game over restarts. Unit-tested for
  every case; tested in the browser for Rebound (the other two games share the same code but expose
  no state to a browser test).
- **Top bar wrapped on a 320 px phone** ("Best:" over its number). The score never wraps now;
  the title truncates; the Back button shows only its arrow below 360 px.
- **One-column library on a 320 px phone**, each thumbnail screen-wide. Two columns now.
- **Rebound's pad with two fingers** (hold ▶, tap JUMP) had no test; it works, and is now tested.

Open, needing a decision: **leaving a run before it ends discards its score** in every game. For
Coil and Star Raid that is the arcade convention; in Rebound, where a run lasts minutes, a player
who quits after level 6 keeps their level progress but their score is never recorded.
