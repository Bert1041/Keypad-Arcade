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
