# Pop Shot (`pop-shot`)

Inspired by Bubble Bash (Nokia) and Puzzle Bobble. Original name, art and rules presentation.

| | |
|---|---|
| Loop | Fire bubbles into the pile hanging from the ceiling. Three or more of a colour touching pop; anything no longer hanging from the ceiling falls. The run ends when the pile reaches the line above the shooter. |
| Controls | Drag to aim (the dotted guide shows the real path, wall bounces included), let go to shoot; letting go down by the shooter cancels. On desktop the mouse aims and a click shoots, or arrows / A-D aim and Space / Enter / Up shoots. Esc leaves. Tap / Space / Enter retries after game over. |
| Pressure | Every few shots — popped or not — a new row pushes in from the top: every 8 shots at first, one fewer every 4 rows, down to every shot. Dots at the top right count down to the next row. After 140 shots it is a row a shot, which buries even a perfect player, so **every run ends** (tested with a bot that always finds the best shot: ~140–150 shots). |
| Hurry | A loaded bubble not fired within 8 s fires by itself, wherever it aims (the last 3 s count down). |
| Colours | 4 at first, a 5th after 6 rows pushed, a 6th after 12. The loaded and next bubbles are dealt from the colours still on the board. Each colour carries its own mark, so they can be told apart without colour. |
| Score | 10 per bubble popped, 20 per bubble that falls, 500 for clearing the board (which then refills with 4 rows). |
| Randomness | `beginRun()` deals the starting board, every pushed row (always 10 draws, rows of 9 or 10), and one roll per bubble. Nothing else is random. |
| Replay | The scene records each change of input (the aim point in whole px, and fire) with its step; `verify.ts` replays it for the leaderboard. Only `+ − × ÷` and `Math.sqrt`, which every engine computes alike. |
| Rules | `logic/popShot.ts` (pure, unit-tested). The scene only draws and forwards input; the aim guide is drawn from `shotPath()`, the same code that moves a real shot. |
