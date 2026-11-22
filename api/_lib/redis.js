import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
/** Whether there is a daily on `date` (none before Daily #1). */
function hasDaily(date) {
	return isDate(date) && date >= "2026-10-26";
}
/** Today's date in UTC — one day boundary for everyone, wherever they are. */
function utcDate(now = /* @__PURE__ */ new Date()) {
	return now.toISOString().slice(0, 10);
}
/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30 and friends). */
function isDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
/** A run finished just after midnight UTC may still be posted to the day it was played on. */
var POST_GRACE_MS = 9e5;
/**
* The dailies a run finished at `now` may be posted to a leaderboard: today's, and for
* POST_GRACE_MS after midnight, yesterday's. The server enforces it; the app uses it to offer
* "Post" only when the post can succeed (a friend's daily link from yesterday cannot).
*/
function postableDates(now) {
	const today = utcDate(new Date(now));
	const earlier = utcDate(/* @__PURE__ */ new Date(now - POST_GRACE_MS));
	return [.../* @__PURE__ */ new Set([today, earlier])].filter(hasDaily);
}
/**
* The day's seed for a game: FNV-1a (32-bit) of "gameId:date". Pinned by golden-value tests —
* changing it would change every daily already played and shared.
*/
function dailySeed(gameId, date) {
	let hash = 2166136261;
	for (const byte of new TextEncoder().encode(`${gameId}:${date}`)) {
		hash ^= byte;
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash >>> 0;
}
// src/core/random/seededRandom.ts
var UINT32 = 4294967296;
/**
* Mulberry32: tiny, fast, and identical on every browser — which is the point. A challenge link
* only works if the friend's phone generates exactly the same sequence as the sharer's.
* Returns floats in [0, 1), like Math.random.
*/
function seededRandom(seed) {
	let a = seed >>> 0;
	return () => {
		a = a + 1831565813 >>> 0;
		let t = a;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / UINT32;
	};
}
var MAX_QUEUE = 2;
var DELTA = {
	up: {
		x: 0,
		y: -1
	},
	down: {
		x: 0,
		y: 1
	},
	left: {
		x: -1,
		y: 0
	},
	right: {
		x: 1,
		y: 0
	}
};
var OPPOSITE = {
	up: "down",
	down: "up",
	left: "right",
	right: "left"
};
var same = (a, b) => a.x === b.x && a.y === b.y;
/**
* Picks a cell from the seed alone, so a challenge replays the same food sequence whatever
* path each player takes. Only if the snake is on that cell do we move on, deterministically,
* to the next free one (reading order, wrapping). Returns null when the board is full.
*/
function placeFrom(random, state, taken) {
	const total = state.cols * state.rows;
	const start = Math.floor(random() * total);
	for (let i = 0; i < total; i++) {
		const index = (start + i) % total;
		const cell = {
			x: index % state.cols,
			y: Math.floor(index / state.cols)
		};
		if (!taken.some((t) => same(t, cell))) return cell;
	}
	return null;
}
function createCoil(random, cols, rows) {
	const y = Math.floor(rows / 2);
	const x = Math.floor(cols / 2);
	const snake = [
		{
			x,
			y
		},
		{
			x: x - 1,
			y
		},
		{
			x: x - 2,
			y
		}
	];
	const food = placeFrom(random, {
		cols,
		rows
	}, snake);
	if (!food) throw new Error("Coil: board too small");
	return {
		cols,
		rows,
		snake,
		dir: "right",
		queue: [],
		food,
		bonus: null,
		growth: 0,
		eaten: 0,
		score: 0,
		alive: true
	};
}
/** Queues a turn. Reversals into yourself and repeats of the current heading are ignored. */
function queueTurn(state, dir) {
	const last = state.queue.at(-1) ?? state.dir;
	if (!state.alive || state.queue.length >= MAX_QUEUE || dir === last || dir === OPPOSITE[last]) return state;
	return {
		...state,
		queue: [...state.queue, dir]
	};
}
function step(state, random) {
	if (!state.alive) return {
		state,
		events: []
	};
	const events = [];
	const [next, ...queue] = state.queue;
	const dir = next ?? state.dir;
	const head = state.snake[0];
	if (!head) throw new Error("Coil: snake has no head");
	const newHead = {
		x: head.x + DELTA[dir].x,
		y: head.y + DELTA[dir].y
	};
	const body = state.growth > 0 ? state.snake : state.snake.slice(0, -1);
	if (newHead.x < 0 || newHead.y < 0 || newHead.x >= state.cols || newHead.y >= state.rows || body.some((c) => same(c, newHead))) return {
		state: {
			...state,
			dir,
			queue,
			alive: false
		},
		events: ["died"]
	};
	let { growth, eaten, score, food, bonus } = state;
	const snake = [newHead, ...body];
	if (growth > 0) growth -= 1;
	if (bonus) {
		if (same(newHead, bonus.cell)) {
			score += 50;
			growth += 1;
			bonus = null;
			events.push("ate-bonus");
		} else if (bonus.stepsLeft <= 1) {
			bonus = null;
			events.push("bonus-expired");
		} else bonus = {
			...bonus,
			stepsLeft: bonus.stepsLeft - 1
		};
	}
	if (same(newHead, food)) {
		eaten += 1;
		score += 10;
		growth += 1;
		events.push("ate");
		const nextFood = placeFrom(random, state, bonus ? [...snake, bonus.cell] : snake);
		if (!nextFood) return {
			state: {
				...state,
				snake,
				dir,
				queue,
				growth,
				eaten,
				score,
				bonus,
				alive: false
			},
			events: [...events, "died"]
		};
		food = nextFood;
		if (eaten % 5 === 0 && !bonus) {
			const cell = placeFrom(random, state, [...snake, food]);
			if (cell) {
				bonus = {
					cell,
					stepsLeft: 30
				};
				events.push("bonus-appeared");
			}
		}
	}
	return {
		state: {
			...state,
			snake,
			dir,
			queue,
			food,
			bonus,
			growth,
			eaten,
			score
		},
		events
	};
}
// src/games/coil/verify.ts
var DIRS = {
	u: "up",
	d: "down",
	l: "left",
	r: "right"
};
/** The most steps a run can take: every cell twice over is far beyond a perfect game. */
var MAX_STEPS$6 = 13200;
var MAX_TURNS = 2e4;
function isReplay$7(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, turns } = value;
	if (v !== 1 || !Array.isArray(turns) || turns.length > MAX_TURNS) return false;
	let previous = 0;
	for (const turn of turns) {
		if (!Array.isArray(turn) || turn.length !== 2) return false;
		const [at, dir] = turn;
		if (!Number.isInteger(at) || at < previous || at > MAX_STEPS$6) return false;
		if (typeof dir !== "string" || !(dir in DIRS)) return false;
		previous = at;
	}
	return true;
}
var replayRun$7 = (random, replay) => {
	if (!isReplay$7(replay)) return {
		ok: false,
		reason: "not a Coil replay"
	};
	let state = createCoil(random, 15, 22);
	let next = 0;
	for (let taken = 0; taken <= MAX_STEPS$6; taken++) {
		for (let turn = replay.turns[next]; turn && turn[0] === taken; turn = replay.turns[next]) {
			const dir = DIRS[turn[1]];
			if (dir) state = queueTurn(state, dir);
			next += 1;
		}
		state = step(state, random).state;
		if (!state.alive) return next === replay.turns.length ? {
			ok: true,
			score: state.score
		} : {
			ok: false,
			reason: "inputs after the run ended"
		};
	}
	return {
		ok: false,
		reason: "the run never ended"
	};
};
// src/games/pairs/logic/pairs.ts
/**
* Pairs' rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
* per simulated second with the card the player tapped (if any), so a run depends only on the
* seed and which card was tapped when.
*
* Cards are numbered in reading order: index = row * cols + col.
*/
var STEP_MS$5 = 1e3 / 60;
/** Board sizes in play order; after the last, it repeats. */
var BOARDS = [
	{
		cols: 4,
		rows: 4
	},
	{
		cols: 4,
		rows: 5
	},
	{
		cols: 5,
		rows: 6
	},
	{
		cols: 6,
		rows: 6
	}
];
var START_MS = 6e4;
/** The clock never shows more than this. */
var MAX_MS = 99e3;
/**
* Only clearing a board adds time, and less each board: 10 s, 8, 6, 4, then 2 s for good. With a
* second for every pair found (the first version), a player with a good memory gained time
* faster than they spent it, and a run never ended.
*/
function clearBonusMs(board) {
	return Math.max(2e3, 12e3 - 2e3 * board);
}
function boardSize(board) {
	const size = BOARDS[Math.min(board, BOARDS.length) - 1];
	if (!size) throw new Error(`Pairs: no board ${board}`);
	return size;
}
/** Fisher–Yates with the seeded generator: always length − 1 draws. */
function shuffle(items, random) {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}
/**
* Deals board `board`: picks its symbols from all SYMBOLS, then lays out two of each. The number
* of draws depends only on the board's size, so the n-th board of a seed is the same however
* the player did on the ones before.
*/
function deal$1(state, board, random) {
	const { cols, rows } = boardSize(board);
	const symbols = shuffle(Array.from({ length: 18 }, (_, i) => i), random).slice(0, cols * rows / 2);
	const faces = shuffle([...symbols, ...symbols], random);
	state.board = board;
	state.cols = cols;
	state.rows = rows;
	state.cards = faces.map((symbol) => ({
		symbol,
		face: "down"
	}));
	state.first = null;
	state.wrong = null;
	state.nextBoardAtMs = null;
}
function createPairs(random) {
	const state = {
		timeMs: 0,
		leftMs: START_MS,
		board: 0,
		cols: 0,
		rows: 0,
		cards: [],
		first: null,
		wrong: null,
		wrongUntilMs: 0,
		nextBoardAtMs: null,
		score: 0,
		streak: 0,
		pairs: 0,
		over: false,
		lastTurnMs: Number.NEGATIVE_INFINITY
	};
	deal$1(state, 1, random);
	return state;
}
function hideWrong(state, events) {
	if (!state.wrong) return;
	for (const i of state.wrong) {
		const card = state.cards[i];
		if (card) card.face = "down";
	}
	events.push({
		type: "hide",
		cards: state.wrong
	});
	state.wrong = null;
}
/**
* Whether a tap at `atMs` may turn a card: a board is in play and the last turn was long enough
* ago. The scene asks for the coming step, and holds a tap until then rather than lose it.
*/
function canTurn(state, atMs = state.timeMs) {
	return !state.over && state.nextBoardAtMs === null && atMs - state.lastTurnMs >= 150;
}
function turn(state, index, events) {
	const card = state.cards[index];
	if (!card || card.face !== "down" || !canTurn(state)) return;
	state.lastTurnMs = state.timeMs;
	hideWrong(state, events);
	card.face = "up";
	events.push({
		type: "flip",
		card: index
	});
	const firstIndex = state.first;
	if (firstIndex === null) {
		state.first = index;
		return;
	}
	state.first = null;
	const first = state.cards[firstIndex];
	if (!first) return;
	if (first.symbol !== card.symbol) {
		state.streak = 0;
		state.wrong = [firstIndex, index];
		state.wrongUntilMs = state.timeMs + 700;
		events.push({
			type: "miss",
			cards: [firstIndex, index]
		});
		return;
	}
	first.face = "matched";
	card.face = "matched";
	state.streak += 1;
	state.pairs += 1;
	state.score += 10 * Math.min(state.streak, 5);
	events.push({
		type: "match",
		cards: [firstIndex, index],
		streak: state.streak
	});
	if (state.cards.every((c) => c.face === "matched")) {
		const points = 50 * state.board;
		state.score += points;
		state.leftMs = Math.min(MAX_MS, state.leftMs + clearBonusMs(state.board));
		state.nextBoardAtMs = state.timeMs + 900;
		events.push({
			type: "clear",
			board: state.board,
			points
		});
	}
}
/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
function tick$5(state, input, random) {
	if (state.over) return [];
	const events = [];
	state.timeMs += STEP_MS$5;
	if (state.nextBoardAtMs !== null) {
		if (state.timeMs >= state.nextBoardAtMs) {
			deal$1(state, state.board + 1, random);
			events.push({
				type: "board",
				board: state.board
			});
		}
		return events;
	}
	state.leftMs -= STEP_MS$5;
	if (state.leftMs <= 0) {
		state.leftMs = 0;
		state.over = true;
		return [{ type: "over" }];
	}
	if (state.wrong && state.timeMs >= state.wrongUntilMs) hideWrong(state, events);
	if (input.tap !== null) turn(state, input.tap, events);
	return events;
}
// src/games/pairs/verify.ts
/** The longest run accepted: 30 minutes of steps (the clock alone caps a run near 99 s plus bonuses). */
var MAX_STEPS$5 = 108e3;
var MAX_CARD = 36;
function isReplay$6(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, taps } = value;
	if (v !== 1 || !Array.isArray(taps) || taps.length > MAX_STEPS$5) return false;
	let previous = 0;
	for (const tap of taps) {
		if (!Array.isArray(tap) || tap.length !== 2) return false;
		const [step, card] = tap;
		if (!Number.isInteger(step) || step <= previous || step > MAX_STEPS$5) return false;
		if (!Number.isInteger(card) || card < 0 || card >= MAX_CARD) return false;
		previous = step;
	}
	return true;
}
var replayRun$6 = (random, replay) => {
	if (!isReplay$6(replay)) return {
		ok: false,
		reason: "not a Pairs replay"
	};
	const state = createPairs(random);
	let next = 0;
	for (let step = 1; step <= MAX_STEPS$5; step++) {
		const tap = replay.taps[next];
		const card = tap && tap[0] === step ? tap[1] : null;
		if (card !== null) next += 1;
		tick$5(state, { tap: card }, random);
		if (state.over) return next === replay.taps.length ? {
			ok: true,
			score: state.score
		} : {
			ok: false,
			reason: "inputs after the run ended"
		};
	}
	return {
		ok: false,
		reason: "the run never ended"
	};
};
// src/games/plunge/logic/plunge.ts
/**
* Plunge's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
* per simulated second with the direction held, so a run depends only on the seed and when the
* player held which way.
*
* World px, y downwards. Platforms rise from below the screen towards the spikes at the top.
*/
var STEP_MS$4 = 1e3 / 60;
var GRAVITY$1 = 1400;
var MIN_W = 72;
var RISE_GAIN = .8;
var SPIKE_CHANCE = .18;
var LIFE_CHANCE = .025;
var NO_INPUT$3 = { axis: 0 };
function riseSpeed(playedMs) {
	return 70 + RISE_GAIN * playedMs / 1e3;
}
/** Spiked platforms keep at least this far clear of the drop points of the safe one above. */
var TRAP_CLEARANCE = 70;
var frac = (n) => n - Math.floor(n);
/**
* Makes the next platform at `y`. Random placement left players stranded — every platform below
* out of reach — so safe platforms form a route: each within REACH of a drop point (an edge not
* against a wall) of the safe one before it. Spiked platforms are traps off that route, never
* under a drop point; with no room for one, the platform is safe instead.
*
* Always draws the same four numbers, so the n-th platform of a seed is the same however the
* player is doing.
*/
function makePlatform(state, y, random) {
	const wRoll = random();
	const xRoll = random();
	const spikeRoll = random();
	const pickupRoll = random();
	const w = Math.round(MIN_W + wRoll * 48);
	const fits = (x) => Math.max(0, Math.min(360 - w, Math.round(x)));
	const anchor = state.anchor;
	let spiked = false;
	let x = fits(xRoll * (360 - w));
	if (anchor) {
		const wantsSpikes = state.playedMs >= 2e4 && !state.lastSpiked && spikeRoll < SPIKE_CHANCE;
		const leftRoom = anchor.x - TRAP_CLEARANCE - w;
		const rightStart = anchor.x + anchor.w + TRAP_CLEARANCE;
		const rightRoom = 360 - w - rightStart;
		if (wantsSpikes && (leftRoom >= 0 || rightRoom >= 0)) {
			spiked = true;
			x = leftRoom >= 0 && (rightRoom < 0 || xRoll < .5) ? fits(frac(xRoll * 2) * leftRoom) : fits(rightStart + frac(xRoll * 2) * rightRoom);
		} else {
			const leftDrop = anchor.x - 9 - 2;
			const rightDrop = anchor.x + anchor.w + 9 + 2;
			x = fits((leftDrop > 18 && (!(rightDrop < 342) || xRoll < .5) ? leftDrop : rightDrop) + (frac(xRoll * 2) - .5) * 2 * 34 - w * (.15 + .7 * frac(xRoll * 7)));
		}
	}
	const pickup = spiked ? null : pickupRoll < LIFE_CHANCE ? "life" : pickupRoll < .145 ? "star" : null;
	state.lastSpiked = spiked;
	if (!spiked) state.anchor = {
		x,
		w
	};
	return {
		id: state.nextId++,
		x,
		y,
		w,
		spiked,
		pickup
	};
}
function createPlunge(random) {
	const state = {
		timeMs: 0,
		playedMs: 0,
		platforms: [],
		ball: {
			x: 180,
			y: 0,
			vy: 0,
			on: null
		},
		lives: 3,
		score: 0,
		pointsMs: 0,
		risen: 0,
		nextId: 1,
		lastSpiked: false,
		anchor: null,
		respawnAtMs: null,
		over: false
	};
	for (let y = 560; y > 124; y -= 72) state.platforms.unshift(makePlatform(state, y, random));
	placeBall(state);
	return state;
}
/** Stands the ball on the safe platform nearest mid-screen, clearing it of spikes if need be. */
function placeBall(state) {
	const middle = 300;
	const target = [...state.platforms].sort((a, b) => Math.abs(a.y - middle) - Math.abs(b.y - middle))[0];
	if (!target) throw new Error("Plunge: no platform to stand on");
	target.spiked = false;
	state.ball = {
		x: target.x + target.w / 2,
		y: target.y - 9,
		vy: 0,
		on: target.id
	};
}
function loseLife(state, cause) {
	state.lives -= 1;
	const events = [{
		type: "died",
		cause
	}];
	if (state.lives <= 0) {
		state.over = true;
		events.push({ type: "over" });
	} else state.respawnAtMs = state.timeMs + 800;
	return events;
}
/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
function tick$4(state, input, random) {
	if (state.over) return [];
	state.timeMs += STEP_MS$4;
	const dt = STEP_MS$4 / 1e3;
	if (state.respawnAtMs !== null) {
		if (state.timeMs < state.respawnAtMs) return [];
		state.respawnAtMs = null;
		placeBall(state);
		return [{ type: "respawn" }];
	}
	const events = [];
	state.playedMs += STEP_MS$4;
	state.pointsMs += STEP_MS$4;
	const per = 100;
	while (state.pointsMs >= per) {
		state.pointsMs -= per;
		state.score += 1;
	}
	const rise = riseSpeed(state.playedMs) * dt;
	for (const p of state.platforms) p.y -= rise;
	state.risen += rise;
	while (state.risen >= 72) {
		state.risen -= 72;
		const lowest = state.platforms.at(-1)?.y ?? 600;
		state.platforms.push(makePlatform(state, lowest + 72, random));
	}
	state.platforms = state.platforms.filter((p) => p.y > 4);
	const ball = state.ball;
	const axis = Math.sign(input.axis);
	ball.x = Math.max(9, Math.min(351, ball.x + axis * 210 * dt));
	const standing = state.platforms.find((p) => p.id === ball.on);
	if (standing && ball.x >= standing.x && ball.x <= standing.x + standing.w) {
		ball.y = standing.y - 9;
		ball.vy = 0;
	} else {
		ball.on = null;
		const before = ball.y + 9;
		ball.vy = Math.min(560, ball.vy + GRAVITY$1 * dt);
		ball.y += ball.vy * dt;
		const after = ball.y + 9;
		const landing = state.platforms.find((p) => before <= p.y + rise && after >= p.y && ball.x >= p.x && ball.x <= p.x + p.w);
		if (landing) {
			if (landing.spiked) return [...events, ...loseLife(state, "spikes")];
			ball.on = landing.id;
			ball.y = landing.y - 9;
			ball.vy = 0;
			events.push({ type: "land" });
		}
	}
	const on = state.platforms.find((p) => p.id === ball.on);
	if (on?.pickup && Math.abs(ball.x - (on.x + on.w / 2)) < 15) {
		if (on.pickup === "star") {
			state.score += 50;
			events.push({ type: "star" });
		} else {
			state.lives = Math.min(5, state.lives + 1);
			events.push({ type: "life" });
		}
		on.pickup = null;
	}
	if (ball.y - 9 <= 44) return [...events, ...loseLife(state, "ceiling")];
	if (ball.y - 9 > 600) return [...events, ...loseLife(state, "fell")];
	return events;
}
// src/games/plunge/verify.ts
/** The longest run accepted: 30 minutes of steps (the shaft outruns any ball after ~10). */
var MAX_STEPS$4 = 108e3;
function isReplay$5(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, input } = value;
	if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS$4) return false;
	let previous = 0;
	for (const change of input) {
		if (!Array.isArray(change) || change.length !== 2) return false;
		const [step, axis] = change;
		if (!Number.isInteger(step) || step <= previous || step > MAX_STEPS$4) return false;
		if (axis !== -1 && axis !== 0 && axis !== 1) return false;
		previous = step;
	}
	return true;
}
var replayRun$5 = (random, replay) => {
	if (!isReplay$5(replay)) return {
		ok: false,
		reason: "not a Plunge replay"
	};
	const state = createPlunge(random);
	let input = NO_INPUT$3;
	let next = 0;
	for (let step = 1; step <= MAX_STEPS$4; step++) {
		const change = replay.input[next];
		if (change && change[0] === step) {
			input = { axis: change[1] };
			next += 1;
		}
		tick$4(state, input, random);
		if (state.over) return next === replay.input.length ? {
			ok: true,
			score: state.score
		} : {
			ok: false,
			reason: "inputs after the run ended"
		};
	}
	return {
		ok: false,
		reason: "the run never ended"
	};
};
// src/games/pop-shot/logic/popShot.ts
/**
* Pop Shot's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
* per simulated second with where the player is aiming and whether they fired, so a run depends
* only on the seed and those inputs.
*
* World px, y downwards. Bubbles sit on a hex grid hanging from the ceiling: rows of 10 and 9
* alternate, the rows of 9 shifted half a bubble right. Only + − × ÷, Math.sqrt and rounding are
* used, which every engine computes alike (the leaderboard replays runs in Node).
*/
var STEP_MS$3 = 1e3 / 60;
var D = 36;
/** How far a shot moves each step. */
var SHOT_STEP = 1100 * STEP_MS$3 / 1e3;
/** The shot's upward share never drops below this, so it cannot be fired flat along the floor. */
var MIN_UP = .2;
/** Straight up, not firing. */
var NO_INPUT$2 = {
	aimX: 180,
	aimY: 348,
	fire: false
};
/** Shots per new row: 8 at first, one fewer every 4 rows, down to one. */
function shotsPerRow(pushes) {
	return Math.max(1, 8 - Math.floor(pushes / 4));
}
function activeColours(pushes) {
	return Math.min(6, 4 + Math.floor(pushes / 6));
}
/** Rows of 9 are shifted half a bubble right; which rows they are flips with every push. */
function isShifted(state, row) {
	return ((row - state.pushes) % 2 + 2) % 2 === 1;
}
function rowLength(state, row) {
	return isShifted(state, row) ? 9 : 10;
}
function cellCentre(state, row, col) {
	return {
		x: 18 + col * D + (isShifted(state, row) ? 18 : 0),
		y: 70 + row * 31
	};
}
function get(state, row, col) {
	return state.grid[row]?.[col] ?? null;
}
function set(state, row, col, value) {
	while (state.grid.length <= row) state.grid.push(new Array(10).fill(null));
	const cells = state.grid[row];
	if (cells) cells[col] = value;
}
/** The up-to-six cells touching one, on the board. */
function neighbours(state, row, col) {
	const lean = isShifted(state, row) ? 0 : -1;
	const out = [];
	const add = (r, c) => {
		if (r >= 0 && c >= 0 && c < rowLength(state, r)) out.push([r, c]);
	};
	add(row, col - 1);
	add(row, col + 1);
	for (const r of [row - 1, row + 1]) {
		add(r, col + lean);
		add(r, col + lean + 1);
	}
	return out;
}
function bubbles(state, cells) {
	return cells.map(([row, col]) => ({
		...cellCentre(state, row, col),
		colour: get(state, row, col) ?? 0
	}));
}
/** The colours on the board, lowest first. */
function present(state) {
	const seen = /* @__PURE__ */ new Set();
	for (const cells of state.grid) for (const c of cells) if (c !== null) seen.add(c);
	return [...seen].sort((a, b) => a - b);
}
/** The colour a roll deals: one of those still on the board (any, on an empty board). */
function colourFor(state, roll) {
	const colours = present(state);
	if (colours.length === 0) return Math.floor(roll * activeColours(state.pushes));
	return colours[Math.floor(roll * colours.length)] ?? 0;
}
/**
* Pushes a new row in at the top, moving every row down one. Always draws COLS numbers, so the
* n-th row of a seed is the same for everyone however their board looks.
*/
function pushRow(state, random) {
	state.pushes += 1;
	const colours = activeColours(state.pushes);
	const cells = new Array(10).fill(null);
	const length = rowLength(state, 0);
	for (let col = 0; col < 10; col++) {
		const roll = random();
		if (col < length) cells[col] = Math.floor(roll * colours);
	}
	state.grid.unshift(cells);
}
function createPopShot(random) {
	const state = {
		timeMs: 0,
		grid: [],
		pushes: 0,
		shotsSinceRow: 0,
		current: 0,
		next: 0,
		aim: {
			x: NO_INPUT$2.aimX,
			y: NO_INPUT$2.aimY
		},
		shot: null,
		readyAtMs: 0,
		score: 0,
		over: false
	};
	for (let row = 0; row < 5; row++) for (let col = 0; col < 10; col++) {
		const roll = random();
		if (col < rowLength(state, row)) set(state, row, col, Math.floor(roll * 4));
	}
	state.current = random();
	state.next = random();
	return state;
}
/** The unit direction a shot takes towards an aim point, never flatter than MIN_UP. */
function aimDirection(aim) {
	const vx = aim.x - 180;
	const vy = aim.y - 548;
	const length = Math.sqrt(vx * vx + vy * vy);
	if (length === 0 || vx === 0 && vy >= 0) return {
		dx: 0,
		dy: -1
	};
	const dx = vx / length;
	const dy = vy / length;
	if (dy <= -.2) return {
		dx,
		dy
	};
	return {
		dx: (vx < 0 ? -1 : 1) * Math.sqrt(1 - MIN_UP * MIN_UP),
		dy: -.2
	};
}
/** True if a bubble at (x, y) touches the ceiling or a bubble on the board. */
function touching(state, x, y) {
	if (y - 18 <= 52) return true;
	const near = Math.floor((y - 52 - 18) / 31);
	for (let row = Math.max(0, near - 1); row <= near + 2 && row < state.grid.length; row++) for (let col = 0; col < 10; col++) {
		if (get(state, row, col) === null) continue;
		const c = cellCentre(state, row, col);
		const ex = c.x - x;
		const ey = c.y - y;
		if (ex * ex + ey * ey < 900) return true;
	}
	return false;
}
/**
* Moves a flying bubble up to `distance`, in steps of at most 4 px, bouncing off the side walls.
* Stops where it first touches something.
*/
function moveShot(state, shot, distance) {
	const parts = Math.max(1, Math.ceil(distance / 4));
	const step = distance / parts;
	let bounces = 0;
	for (let i = 0; i < parts; i++) {
		shot.x += shot.dx * step;
		shot.y += shot.dy * step;
		if (shot.x < 18 || shot.x > 342) {
			shot.x = shot.x < 18 ? 36 - shot.x : 684 - shot.x;
			shot.dx = -shot.dx;
			bounces += 1;
		}
		if (touching(state, shot.x, shot.y)) {
			shot.y = Math.max(shot.y, 70);
			return {
				stuck: true,
				bounces
			};
		}
	}
	return {
		stuck: false,
		bounces
	};
}
/**
* The empty cell a stuck bubble settles in: the nearest one hanging from the ceiling or a bubble.
* While COLLIDE < 2R the nearest empty cell to where a shot stops is always beside a bubble, so
* the `hangs` test never changes the answer (a mutation test confirms it); it stays so a change
* of COLLIDE can never leave a bubble floating.
*/
function snapCell(state, x, y) {
	let best = null;
	let bestDistance = Infinity;
	for (let row = 0; row <= state.grid.length; row++) for (let col = 0; col < rowLength(state, row); col++) {
		if (get(state, row, col) !== null) continue;
		if (!(row === 0 || neighbours(state, row, col).some(([r, c]) => get(state, r, c) !== null))) continue;
		const c = cellCentre(state, row, col);
		const distance = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = [row, col];
		}
	}
	if (!best) throw new Error("Pop Shot: nowhere for the bubble to settle");
	return best;
}
/** The cells joined to (row, col) through cells of the same colour, including it. */
function sameColourGroup(state, row, col) {
	const colour = get(state, row, col);
	if (colour === null) return [];
	const seen = /* @__PURE__ */ new Set([`${row},${col}`]);
	const group = [[row, col]];
	for (let i = 0; i < group.length; i++) {
		const [r, c] = group[i] ?? [0, 0];
		for (const [nr, nc] of neighbours(state, r, c)) {
			const key = `${nr},${nc}`;
			if (seen.has(key) || get(state, nr, nc) !== colour) continue;
			seen.add(key);
			group.push([nr, nc]);
		}
	}
	return group;
}
/** Bubbles no longer joined to the ceiling through other bubbles. */
function looseCells(state) {
	const held = /* @__PURE__ */ new Set();
	const queue = [];
	for (let col = 0; col < 10; col++) if (get(state, 0, col) !== null) {
		held.add(`0,${col}`);
		queue.push([0, col]);
	}
	for (let i = 0; i < queue.length; i++) {
		const [r, c] = queue[i] ?? [0, 0];
		for (const [nr, nc] of neighbours(state, r, c)) {
			const key = `${nr},${nc}`;
			if (held.has(key) || get(state, nr, nc) === null) continue;
			held.add(key);
			queue.push([nr, nc]);
		}
	}
	const loose = [];
	state.grid.forEach((cells, row) => {
		cells.forEach((cell, col) => {
			if (cell !== null && !held.has(`${row},${col}`)) loose.push([row, col]);
		});
	});
	return loose;
}
function isEmpty(state) {
	return state.grid.every((cells) => cells.every((c) => c === null));
}
function fire(state, auto, random, events) {
	state.shot = {
		x: 180,
		y: 548,
		...aimDirection(state.aim),
		colour: colourFor(state, state.current)
	};
	state.current = state.next;
	state.next = random();
	events.push({
		type: "fire",
		auto
	});
}
/** Settles the shot: pops a group of MATCH or more, drops what came loose, then the pressure. */
function land$1(state, shot, random, events) {
	state.shot = null;
	const [row, col] = snapCell(state, shot.x, shot.y);
	set(state, row, col, shot.colour);
	events.push({
		type: "stick",
		bubble: {
			...cellCentre(state, row, col),
			colour: shot.colour
		}
	});
	const group = sameColourGroup(state, row, col);
	if (group.length >= 3) {
		const points = 10 * group.length;
		events.push({
			type: "pop",
			bubbles: bubbles(state, group),
			points
		});
		for (const [r, c] of group) set(state, r, c, null);
		state.score += points;
		const loose = looseCells(state);
		if (loose.length > 0) {
			const dropPoints = 20 * loose.length;
			events.push({
				type: "drop",
				bubbles: bubbles(state, loose),
				points: dropPoints
			});
			for (const [r, c] of loose) set(state, r, c, null);
			state.score += dropPoints;
		}
	}
	if (isEmpty(state)) {
		state.grid = [];
		state.score += 500;
		events.push({
			type: "clear",
			points: 500
		});
		for (let i = 0; i < 4; i++) pushRow(state, random);
		state.shotsSinceRow = 0;
		events.push({ type: "row" });
	} else {
		state.shotsSinceRow += 1;
		if (state.shotsSinceRow >= shotsPerRow(state.pushes)) {
			pushRow(state, random);
			state.shotsSinceRow = 0;
			events.push({ type: "row" });
		}
	}
	while (state.grid.length > 0 && (state.grid.at(-1) ?? []).every((c) => c === null)) state.grid.pop();
	if (state.grid.length > 14) {
		state.over = true;
		events.push({ type: "over" });
		return;
	}
	state.readyAtMs = state.timeMs;
}
/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
function tick$3(state, input, random) {
	if (state.over) return [];
	state.timeMs += STEP_MS$3;
	state.aim = {
		x: input.aimX,
		y: input.aimY
	};
	const events = [];
	if (!state.shot) {
		if (input.fire) fire(state, false, random, events);
		else if (state.timeMs - state.readyAtMs >= 8e3) fire(state, true, random, events);
	}
	const shot = state.shot;
	if (shot) {
		const moved = moveShot(state, shot, SHOT_STEP);
		for (let i = 0; i < moved.bounces; i++) events.push({ type: "bounce" });
		if (moved.stuck) land$1(state, shot, random, events);
	}
	return events;
}
// src/games/pop-shot/verify.ts
/** The longest run accepted: 30 minutes of steps. */
var MAX_STEPS$3 = 108e3;
var MAX_AIM = 5e3;
var isAim = (n) => Number.isInteger(n) && Math.abs(n) <= MAX_AIM;
function isReplay$4(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, input } = value;
	if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS$3) return false;
	let previous = 0;
	for (const change of input) {
		if (!Array.isArray(change) || change.length !== 4) return false;
		const [step, aimX, aimY, fire] = change;
		if (!Number.isInteger(step) || step <= previous || step > MAX_STEPS$3) return false;
		if (!isAim(aimX) || !isAim(aimY) || fire !== 0 && fire !== 1) return false;
		previous = step;
	}
	return true;
}
var replayRun$4 = (random, replay) => {
	if (!isReplay$4(replay)) return {
		ok: false,
		reason: "not a Pop Shot replay"
	};
	const state = createPopShot(random);
	let input = NO_INPUT$2;
	let next = 0;
	for (let step = 1; step <= MAX_STEPS$3; step++) {
		const change = replay.input[next];
		if (change && change[0] === step) {
			input = {
				aimX: change[1],
				aimY: change[2],
				fire: change[3] === 1
			};
			next += 1;
		}
		tick$3(state, input, random);
		if (state.over) return next === replay.input.length ? {
			ok: true,
			score: state.score
		} : {
			ok: false,
			reason: "inputs after the run ended"
		};
	}
	return {
		ok: false,
		reason: "the run never ended"
	};
};
/**
* How the phone plays each game: how far it looks ahead (its moves and yours), and how often it
* instead plays a move at random.
*/
var LEVELS = [
	{
		depth: 1,
		blunder: .35
	},
	{
		depth: 2,
		blunder: .2
	},
	{
		depth: 4,
		blunder: .1
	},
	{
		depth: 6,
		blunder: .04
	},
	{
		depth: 8,
		blunder: 0
	}
];
var storeOf = (side) => side === "player" ? 6 : 13;
var other = (side) => side === "player" ? "phone" : "player";
var firstPit = (side) => side === "player" ? 0 : 7;
function isOwnPit(side, place) {
	const first = firstPit(side);
	return place >= first && place < first + 6;
}
function legalMoves(board, side) {
	const moves = [];
	const first = firstPit(side);
	for (let pit = first; pit < first + 6; pit++) if ((board[pit] ?? 0) > 0) moves.push(pit);
	return moves;
}
var at = (board, i) => board[i] ?? 0;
/**
* Sows the seeds of `pit` one by one into the following places, skipping the other side's store.
* The last seed in your own store gives another turn; in your own empty pit, with seeds opposite,
* it takes them and itself into your store.
*/
function sow(board, side, pit) {
	const next = [...board];
	let seeds = at(next, pit);
	next[pit] = 0;
	const skip = storeOf(other(side));
	const path = [];
	let place = pit;
	while (seeds > 0) {
		place = (place + 1) % 14;
		if (place === skip) continue;
		next[place] = at(next, place) + 1;
		seeds -= 1;
		path.push(place);
	}
	const extra = place === storeOf(side);
	let captured = 0;
	const facing = 12 - place;
	if (!extra && isOwnPit(side, place) && at(next, place) === 1 && at(next, facing) > 0) {
		captured = at(next, facing) + 1;
		next[storeOf(side)] = at(next, storeOf(side)) + captured;
		next[place] = 0;
		next[facing] = 0;
	}
	return {
		board: next,
		path,
		extra,
		captured
	};
}
/** True when either side's pits are empty: the game is over. */
function sideEmpty(board) {
	return legalMoves(board, "player").length === 0 || legalMoves(board, "phone").length === 0;
}
/** Moves every seed left in a side's pits into that side's store. */
function sweep(board) {
	const next = [...board];
	for (const side of ["player", "phone"]) {
		const first = firstPit(side);
		for (let pit = first; pit < first + 6; pit++) {
			next[storeOf(side)] = at(next, storeOf(side)) + at(next, pit);
			next[pit] = 0;
		}
	}
	return next;
}
/** A starting board from one side's six pits, mirrored to the other side. */
function boardFrom(pits) {
	const board = new Array(14).fill(0);
	for (let i = 0; i < 6; i++) {
		board[i] = pits[i] ?? 0;
		board[7 + i] = pits[i] ?? 0;
	}
	return board;
}
/**
* Deals a game's pits: four in each for the first game, as the classic board is; later games
* move six seeds between random pits (never emptying one), so they differ day to day. Always
* draws 12 numbers.
*/
function deal(game, random) {
	const pits = new Array(6).fill(4);
	for (let i = 0; i < 6; i++) {
		const from = Math.floor(random() * 6);
		const to = Math.floor(random() * 6);
		if (game > 1 && at(pits, from) > 1) {
			pits[from] = at(pits, from) - 1;
			pits[to] = at(pits, to) + 1;
		}
	}
	return pits;
}
/** Who starts game `game`: you start the odd ones, the phone the even ones. */
var starter = (game) => game % 2 === 1 ? "player" : "phone";
function createSeeds(random) {
	const layouts = Array.from({ length: 5 }, (_, i) => deal(i + 1, random));
	return {
		layouts,
		game: 1,
		board: boardFrom(layouts[0] ?? []),
		turn: starter(1),
		plies: 0,
		score: 0,
		results: [],
		over: false
	};
}
/** Ends the current game: sweeps, scores, then the next game or the end of the run. */
function finishGame(state, events) {
	const board = sweep(state.board);
	const you = at(board, 6);
	const phone = at(board, 13);
	const result = you > phone ? "won" : you < phone ? "lost" : "drawn";
	const points = you + (result === "won" ? 20 * state.game : 0);
	state.score += points;
	state.results.push(result);
	events.push({
		type: "game",
		game: state.game,
		result,
		you,
		phone,
		points,
		board
	});
	if (result === "lost" || state.game >= 5) {
		state.board = board;
		state.over = true;
		events.push({ type: "over" });
		return;
	}
	state.game += 1;
	state.board = boardFrom(state.layouts[state.game - 1] ?? []);
	state.turn = starter(state.game);
	state.plies = 0;
}
/**
* Plays `pit` for whichever side's turn it is. Throws on an illegal move (the scene only offers
* legal ones; verify.ts checks before calling).
*/
function move(state, pit) {
	if (state.over) throw new Error("Seeds: the run is over");
	if (!legalMoves(state.board, state.turn).includes(pit)) throw new Error(`Seeds: ${pit} is not a legal move for the ${state.turn}`);
	const side = state.turn;
	const sown = sow(state.board, side, pit);
	state.board = sown.board;
	state.plies += 1;
	const events = [{
		type: "sow",
		side,
		pit,
		path: sown.path,
		captured: sown.captured,
		extra: sown.extra,
		board: [...sown.board]
	}];
	if (sideEmpty(state.board) || state.plies >= 200) finishGame(state, events);
	else if (!sown.extra) state.turn = other(side);
	return events;
}
var WIN_VALUE = 1e3;
/**
* The phone's view of a board, `depth` moves ahead (alpha-beta minimax). Positive is good for
* the phone: the difference between the stores, or a decided game's final difference plus
* WIN_VALUE. Moves are tried in pit order, so equal positions always resolve alike.
*/
function search(board, side, depth, alpha, beta) {
	if (sideEmpty(board)) {
		const final = sweep(board);
		const diff = at(final, 13) - at(final, 6);
		return diff === 0 ? 0 : diff + (diff > 0 ? WIN_VALUE : -1e3);
	}
	if (depth === 0) return at(board, 13) - at(board, 6);
	const maximising = side === "phone";
	let best = maximising ? -Infinity : Infinity;
	for (const pit of legalMoves(board, side)) {
		const sown = sow(board, side, pit);
		const value = search(sown.board, sown.extra ? side : other(side), depth - 1, alpha, beta);
		if (maximising) {
			best = Math.max(best, value);
			alpha = Math.max(alpha, value);
		} else {
			best = Math.min(best, value);
			beta = Math.min(beta, value);
		}
		if (alpha >= beta) break;
	}
	return best;
}
/**
* The phone's choice on its turn. Always draws two numbers: whether it plays at random this time
* (by its level's blunder rate), and which of the moves it picks — at random, or among those it
* rates best.
*/
function phoneChoice(state, random) {
	const blunder = random();
	const pick = random();
	const moves = legalMoves(state.board, "phone");
	const level = LEVELS[Math.min(state.game, LEVELS.length) - 1] ?? {
		depth: 1,
		blunder: 0
	};
	if (blunder < level.blunder) return moves[Math.floor(pick * moves.length)] ?? 0;
	let bestValue = -Infinity;
	let best = [];
	for (const pit of moves) {
		const sown = sow(state.board, "phone", pit);
		const value = search(sown.board, sown.extra ? "phone" : "player", level.depth - 1, -Infinity, Infinity);
		if (value > bestValue) {
			bestValue = value;
			best = [pit];
		} else if (value === bestValue) best.push(pit);
	}
	return best[Math.floor(pick * best.length)] ?? moves[0] ?? 0;
}
// src/games/seeds/verify.ts
/** No run can hold more of the player's moves than this. */
var MAX_MOVES = 1e3;
function isReplay$3(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, moves } = value;
	if (v !== 1 || !Array.isArray(moves) || moves.length > MAX_MOVES) return false;
	return moves.every((m) => Number.isInteger(m) && m >= 0 && m < 6);
}
var replayRun$3 = (random, replay) => {
	if (!isReplay$3(replay)) return {
		ok: false,
		reason: "not a Seeds replay"
	};
	const state = createSeeds(random);
	let next = 0;
	while (!state.over) {
		if (state.turn === "phone") {
			move(state, phoneChoice(state, random));
			continue;
		}
		const pit = replay.moves[next];
		if (pit === void 0) return {
			ok: false,
			reason: "the run never ended"
		};
		if (!legalMoves(state.board, "player").includes(pit)) return {
			ok: false,
			reason: "an illegal move"
		};
		move(state, pit);
		next += 1;
	}
	return next === replay.moves.length ? {
		ok: true,
		score: state.score
	} : {
		ok: false,
		reason: "moves after the run ended"
	};
};
// src/games/wallbreak/logic/wallbreak.ts
/**
* Wallbreak's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60
* times per simulated second with where the player wants the paddle and whether they served, so
* a run depends only on the seed and those inputs.
*
* World px, y downwards. Only + − × ÷, Math.sqrt and rounding are used, which every engine
* computes alike (the leaderboard replays runs in Node).
*/
var STEP_MS$2 = 1e3 / 60;
var PADDLE_KEY_SPEED = 420;
/**
* Ball speed, px/s: 40 more each level, and 2 more with every paddle hit within a level, without
* limit. By level 10 it crosses the screen in well under a second, past what a person can follow,
* so people's runs end. A perfect program that tracks the ball can go on far longer (tested to
* 30 minutes); the leaderboard refuses any run longer than that (verify.ts).
*/
function ballSpeed(level, hits) {
	return 280 + 40 * (level - 1) + 2 * hits;
}
/** How steep the paddle can send the ball: horizontal/vertical at the paddle's very edge. */
var STEER = 1.5;
/** The ball's vertical share never drops below this, so it cannot loop side to side for ever. */
var MIN_VERTICAL = .35;
var WIDE_MS = 12e3;
var SLOW_MS = 8e3;
var SLOW_FACTOR = .7;
var DROP_SPEED = 130;
var DROP_SIZE = 16;
/** Pause between a cleared wall and the next. */
var NEXT_LEVEL_MS = 1e3;
var NO_INPUT$1 = {
	targetX: null,
	axis: 0,
	serve: false
};
var POWERS = [
	["wide", .35],
	["multi", .3],
	["slow", .25],
	["life", .1]
];
function powerFor(roll) {
	let acc = 0;
	for (const [kind, share] of POWERS) {
		acc += share;
		if (roll < acc) return kind;
	}
	return "wide";
}
function brickRect(b) {
	return {
		x: 1 + b.col * 36,
		y: 80 + b.row * 16,
		w: 34,
		h: 14
	};
}
/**
* Builds level `level`'s wall: a pattern mirrored left to right. Every level draws exactly
* MAX_ROWS × COLS/2 × 3 numbers whatever it uses, so the n-th wall of a seed is the same for
* everyone however their earlier levels went.
*/
function buildWall(state, level, random) {
	const rows = Math.min(8, 3 + Math.ceil(level / 2));
	const fill = Math.min(.9, .6 + .04 * level);
	const strong = Math.min(.5, .05 + .06 * level);
	const bricks = [];
	for (let row = 0; row < 8; row++) for (let half = 0; half < 5; half++) {
		const present = random() < fill;
		const twoHits = random() < strong;
		const dropRoll = random();
		if (row >= rows || !present) continue;
		for (const col of [half, 9 - half]) {
			const mirrored = col !== half;
			bricks.push({
				id: state.nextId++,
				col,
				row,
				hits: twoHits ? 2 : 1,
				drop: !mirrored && dropRoll < .14 ? powerFor(dropRoll / .14) : null
			});
		}
	}
	if (bricks.length < 12) {
		for (let col = 0; col < 10; col++) if (!bricks.some((b) => b.row === 0 && b.col === col)) bricks.push({
			id: state.nextId++,
			col,
			row: 0,
			hits: 1,
			drop: null
		});
	}
	return bricks;
}
function serveBall(state) {
	state.serving = true;
	state.balls = [{
		x: state.paddle.x,
		y: 547,
		dx: 0,
		dy: 0
	}];
}
function createWallbreak(random) {
	const state = {
		timeMs: 0,
		level: 1,
		bricks: [],
		paddle: {
			x: 180,
			w: 64
		},
		balls: [],
		serving: true,
		hits: 0,
		drops: [],
		wideUntilMs: 0,
		slowUntilMs: 0,
		lives: 3,
		score: 0,
		nextLevelAtMs: null,
		nextId: 1,
		over: false
	};
	state.bricks = buildWall(state, 1, random);
	serveBall(state);
	return state;
}
/** A unit direction from a horizontal/vertical ratio, upwards (dy < 0). */
function upwards(ratio) {
	const length = Math.sqrt(ratio * ratio + 1);
	return {
		dx: ratio / length,
		dy: -1 / length
	};
}
/** Keeps a direction from going nearly flat after a bounce. */
function steepen(ball) {
	if (Math.abs(ball.dy) >= MIN_VERTICAL) return;
	const dy = ball.dy < 0 ? -.35 : MIN_VERTICAL;
	ball.dx = (ball.dx < 0 ? -1 : 1) * Math.sqrt(1 - MIN_VERTICAL * MIN_VERTICAL);
	ball.dy = dy;
}
function overlaps$1(ball, r) {
	return ball.x + 5 > r.x && ball.x - 5 < r.x + r.w && ball.y + 5 > r.y && ball.y - 5 < r.y + r.h;
}
/** The first brick the ball overlaps, if any. */
function brickAt(state, ball) {
	return state.bricks.find((b) => overlaps$1(ball, brickRect(b)));
}
function hitBrick(state, brick, events) {
	brick.hits -= 1;
	state.score += 10;
	const broken = brick.hits <= 0;
	events.push({
		type: "brick",
		id: brick.id,
		broken
	});
	if (!broken) return;
	state.bricks = state.bricks.filter((b) => b !== brick);
	if (brick.drop) {
		const r = brickRect(brick);
		state.drops.push({
			id: state.nextId++,
			kind: brick.drop,
			x: r.x + r.w / 2,
			y: r.y + r.h / 2
		});
	}
}
function movePaddle(state, input, dt) {
	const paddle = state.paddle;
	paddle.w = state.timeMs < state.wideUntilMs ? 100 : 64;
	const half = paddle.w / 2;
	if (input.targetX !== null) {
		const step = 900 * dt;
		paddle.x += Math.max(-step, Math.min(step, input.targetX - paddle.x));
	} else paddle.x += Math.sign(input.axis) * PADDLE_KEY_SPEED * dt;
	paddle.x = Math.max(half, Math.min(360 - half, paddle.x));
}
/** Moves one ball by `distance`, bouncing off walls, bricks and the paddle. */
function moveBall(state, ball, distance, events) {
	const parts = Math.max(1, Math.ceil(distance / 3));
	const step = distance / parts;
	for (let i = 0; i < parts; i++) {
		ball.x += ball.dx * step;
		if (ball.x - 5 < 0 || ball.x + 5 > 360) {
			ball.x = Math.max(5, Math.min(355, ball.x));
			ball.dx = -ball.dx;
			events.push({ type: "wall" });
		}
		const sideways = brickAt(state, ball);
		if (sideways) {
			ball.x -= ball.dx * step;
			ball.dx = -ball.dx;
			hitBrick(state, sideways, events);
		}
		ball.y += ball.dy * step;
		if (ball.y - 5 < 0) {
			ball.y = 5;
			ball.dy = -ball.dy;
			events.push({ type: "wall" });
		}
		const vertical = brickAt(state, ball);
		if (vertical) {
			ball.y -= ball.dy * step;
			ball.dy = -ball.dy;
			hitBrick(state, vertical, events);
		}
		const paddle = state.paddle;
		if (ball.dy > 0 && ball.y + 5 >= 552 && ball.y + 5 <= 562 && ball.x >= paddle.x - paddle.w / 2 - 5 && ball.x <= paddle.x + paddle.w / 2 + 5) {
			const dir = upwards(Math.max(-1, Math.min(1, (ball.x - paddle.x) / (paddle.w / 2))) * STEER);
			ball.dx = dir.dx;
			ball.dy = dir.dy;
			ball.y = 547;
			state.hits += 1;
			events.push({ type: "paddle" });
		}
		steepen(ball);
	}
}
function catchDrops(state, dt, events) {
	const paddle = state.paddle;
	const kept = [];
	for (const drop of state.drops) {
		drop.y += DROP_SPEED * dt;
		if (!(drop.y + DROP_SIZE / 2 >= 552 && drop.y - DROP_SIZE / 2 <= 562 && Math.abs(drop.x - paddle.x) <= paddle.w / 2 + DROP_SIZE / 2)) {
			if (drop.y - DROP_SIZE / 2 < 600) kept.push(drop);
			continue;
		}
		state.score += 25;
		events.push({
			type: "catch",
			kind: drop.kind
		});
		if (drop.kind === "wide") state.wideUntilMs = state.timeMs + WIDE_MS;
		else if (drop.kind === "slow") state.slowUntilMs = state.timeMs + SLOW_MS;
		else if (drop.kind === "life") state.lives = Math.min(5, state.lives + 1);
		else if (!state.serving) {
			const from = state.balls[0];
			if (from) for (const ratio of [-.8, .8]) {
				const dir = upwards(ratio);
				state.balls.push({
					x: from.x,
					y: from.y,
					dx: dir.dx,
					dy: dir.dy
				});
			}
		}
	}
	state.drops = kept;
}
/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
function tick$2(state, input, random) {
	if (state.over) return [];
	const events = [];
	state.timeMs += STEP_MS$2;
	const dt = STEP_MS$2 / 1e3;
	if (state.nextLevelAtMs !== null) {
		if (state.timeMs < state.nextLevelAtMs) return [];
		state.nextLevelAtMs = null;
		state.level += 1;
		state.hits = 0;
		state.bricks = buildWall(state, state.level, random);
		state.drops = [];
		state.wideUntilMs = 0;
		state.slowUntilMs = 0;
		serveBall(state);
		return [{
			type: "level",
			level: state.level
		}];
	}
	movePaddle(state, input, dt);
	if (state.serving) {
		const ball = state.balls[0];
		if (ball) ball.x = state.paddle.x;
		if (!input.serve) return events;
		state.serving = false;
		if (ball) Object.assign(ball, upwards(.25));
		events.push({ type: "serve" });
	}
	const slow = state.timeMs < state.slowUntilMs ? SLOW_FACTOR : 1;
	const distance = ballSpeed(state.level, state.hits) * slow * dt;
	for (const ball of state.balls) moveBall(state, ball, distance, events);
	catchDrops(state, dt, events);
	state.balls = state.balls.filter((b) => b.y - 5 < 600);
	if (state.balls.length === 0) {
		state.lives -= 1;
		events.push({ type: "lost" });
		state.drops = [];
		state.wideUntilMs = 0;
		state.slowUntilMs = 0;
		if (state.lives <= 0) {
			state.over = true;
			events.push({ type: "over" });
			return events;
		}
		serveBall(state);
	}
	if (state.bricks.length === 0 && state.nextLevelAtMs === null) {
		const points = 100 * state.level;
		state.score += points;
		events.push({
			type: "clear",
			level: state.level,
			points
		});
		state.nextLevelAtMs = state.timeMs + NEXT_LEVEL_MS;
		state.balls = [];
		state.drops = [];
	}
	return events;
}
// src/games/wallbreak/verify.ts
/** The longest run accepted: 30 minutes of steps. */
var MAX_STEPS$2 = 108e3;
var MAX_TARGET$1 = 5e3;
function isReplay$2(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, input } = value;
	if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS$2) return false;
	let previous = 0;
	for (const change of input) {
		if (!Array.isArray(change) || change.length !== 4) return false;
		const [step, targetX, axis, serve] = change;
		if (!Number.isInteger(step) || step <= previous || step > MAX_STEPS$2) return false;
		if (!(targetX === null || Number.isInteger(targetX) && Math.abs(targetX) <= MAX_TARGET$1) || axis !== -1 && axis !== 0 && axis !== 1 || serve !== 0 && serve !== 1) return false;
		previous = step;
	}
	return true;
}
var replayRun$2 = (random, replay) => {
	if (!isReplay$2(replay)) return {
		ok: false,
		reason: "not a Wallbreak replay"
	};
	const state = createWallbreak(random);
	let input = NO_INPUT$1;
	let next = 0;
	for (let step = 1; step <= MAX_STEPS$2; step++) {
		const change = replay.input[next];
		if (change && change[0] === step) {
			input = {
				targetX: change[1],
				axis: change[2],
				serve: change[3] === 1
			};
			next += 1;
		}
		tick$2(state, input, random);
		if (state.over) return next === replay.input.length ? {
			ok: true,
			score: state.score
		} : {
			ok: false,
			reason: "inputs after the run ended"
		};
	}
	return {
		ok: false,
		reason: "the run never ended"
	};
};
// src/games/shared/detMath.ts
/**
* sin and cos built only from + − × ÷ and Math.round, which IEEE 754 and the language spec make
* exact and identical in every engine. Math.sin and Math.cos are not: V8 (Chrome, Node) and
* JavaScriptCore (Safari) may differ in the last bit, and the leaderboard server replays a run
* in Node — one bit apart, a floor lands on the other side of a line and an honest iPhone score
* is rejected. Game logic uses these (a guard test bans the Math ones); scenes, which only draw,
* may use either.
*
* Accurate to ~1e-9 against Math.sin. The output is pinned by golden values in detMath.test.ts:
* changing it changes every replay already posted.
*/
var PI = 3.141592653589793;
var HALF_PI = 1.5707963267948966;
var TAU = 6.283185307179586;
var C3 = -1 / 6;
var C5 = 1 / 120;
var C7 = -1 / 5040;
var C9 = 1 / 362880;
var C11 = -1 / 39916800;
var C13 = 1 / 6227020800;
function sin(x) {
	if (!Number.isFinite(x)) return NaN;
	let r = x - TAU * Math.round(x / TAU);
	if (r > HALF_PI) r = PI - r;
	else if (r < -1.5707963267948966) r = -3.141592653589793 - r;
	const r2 = r * r;
	return r * (1 + r2 * (C3 + r2 * (C5 + r2 * (C7 + r2 * (C9 + r2 * (C11 + r2 * C13))))));
}
function cos(x) {
	return sin(x + HALF_PI);
}
// src/games/skyline/logic/skyline.ts
/**
* Skyline's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
* per simulated second, so a run depends only on the seed and the moments the player taps.
*
* Horizontal positions are in world px, with the foundation's centre at 0. The crane always
* swings over the top floor, so only offsets between floors matter.
*/
var STEP_MS$1 = 1e3 / 60;
var GRAVITY = 2e3;
/** How long a fall takes, from DROP_PX and GRAVITY. Used to size the swing (see swingFor). */
var FALL_S = Math.sqrt(200 / GRAVITY);
/**
* The share of the swing's speed a dropped floor keeps. Small on purpose: with all of it, a
* floor dropped when it looked lined up drifted ~37 px and missed — players read that as a bug.
* Enough remains that the swing still pulls a late tap off-centre.
*/
var CARRY = .15;
/** Each off-centre landing adds this × its offset to the lean; a perfect one halves it. */
var LEAN_GAIN = .3;
var SWAY_MS = 3e3;
/** Swing period in ms at a height, before any rope change. */
function basePeriodMs(height) {
	if (height < 10) return 2600;
	if (height < 20) return 2200;
	if (height < 40) return 1900;
	return Math.max(1400, 1900 - (height - 40) * 20);
}
/**
* How fast the landing point sweeps past the target, in px/s. This, not the swing itself, is
* what decides how much time a player has, so difficulty is set here and the swing is derived.
* Its ceiling keeps the fairness promises (see skyline.test.ts): ≥ 250 ms to land, ≥ 50 ms for
* a perfect drop, with the tower swaying at its most.
*/
function crossSpeed(height) {
	if (height < 10) return 150;
	if (height < 20) return 190;
	if (height < 30) return 215;
	if (height < 40) return 240;
	return Math.min(285, 240 + (height - 40) * 2.5);
}
/**
* The swing amplitude that makes the landing point cross the target at `speed`. A floor keeps
* CARRY of the swing's speed as it falls, so where it lands is the swing position plus that
* speed × fall time — a slightly wider curve than the swing, by √(1 + (CARRY·ωT)²).
*/
function swingFor(periodMs, speed) {
	const omega = 2 * Math.PI / (periodMs / 1e3);
	return speed / (omega * Math.sqrt(1 + CARRY * omega * FALL_S * (CARRY * omega * FALL_S)));
}
function topX(state) {
	return state.floors.at(-1)?.x ?? 0;
}
/** How far the top of the tower is displaced from its rest position at `timeMs`. */
function swayAt(state, timeMs) {
	return Math.min(12, state.lean) * sin(2 * Math.PI * timeMs / SWAY_MS);
}
/** The hooked floor's centre and sideways speed (px/s) now; at its start until it swings. */
function hookAt(state) {
	const { side, amplitude, periodMs, spawnMs } = state.hook;
	const omega = 2 * Math.PI / periodMs;
	const t = Math.max(0, state.timeMs - spawnMs);
	return {
		x: topX(state) + side * amplitude * cos(omega * t),
		vx: -side * amplitude * omega * 1e3 * sin(omega * t)
	};
}
/**
* Hangs the next floor on the crane, to start swinging at `startMs`. Always draws the same five
* numbers, so the n-th floor of a seed is the same whatever happened before it — a challenge
* replays the same tower.
*/
function prepare(state, random, startMs) {
	const side = random() < .5 ? -1 : 1;
	const windRoll = random();
	const rope = random();
	const color = Math.floor(random() * 4);
	random();
	if (state.drops % 4 === 0) state.windDir = windRoll < .5 ? -1 : 1;
	state.drops += 1;
	const height = state.floors.length;
	const periodMs = basePeriodMs(height) * (height >= 30 ? .8 + rope * .45 : 1);
	state.hook = {
		spawnMs: startMs,
		side,
		periodMs,
		amplitude: swingFor(periodMs, crossSpeed(height)),
		color
	};
	state.wind = height >= 20 ? state.windDir * 400 : 0;
}
/** Hangs the next floor and starts it swinging now. */
function spawn(state, random) {
	prepare(state, random, state.timeMs);
	state.phase = "swinging";
	return [{ type: "spawn" }];
}
function createSkyline(random) {
	const state = {
		timeMs: 0,
		phase: "waiting",
		floors: [],
		inHand: 3,
		score: 0,
		streak: 0,
		lean: 0,
		drops: 0,
		hook: {
			spawnMs: 0,
			side: 1,
			periodMs: 1,
			amplitude: 0,
			color: 0
		},
		falling: null,
		wind: 0,
		windDir: 1,
		waitUntilMs: 0
	};
	spawn(state, random);
	return state;
}
function land(state, falling, random) {
	const events = [];
	const rest = topX(state);
	const offset = falling.x - (rest + swayAt(state, state.timeMs));
	if (Math.abs(offset) <= 8) {
		state.streak += 1;
		state.floors.push({
			x: rest,
			color: falling.color
		});
		state.score += 10 + 25 * Math.min(state.streak, 5);
		state.lean /= 2;
		events.push({
			type: "perfect",
			streak: state.streak
		});
	} else if (Math.abs(offset) < 36) {
		state.streak = 0;
		state.floors.push({
			x: rest + offset,
			color: falling.color
		});
		state.score += 10;
		state.lean += Math.abs(offset) * LEAN_GAIN;
		events.push({
			type: "land",
			offset
		});
	} else {
		state.streak = 0;
		state.inHand -= 1;
		events.push({ type: "miss" });
		if (state.inHand <= 0) {
			state.phase = "over";
			events.push({ type: "over" });
			return events;
		}
	}
	if (events[0]?.type !== "miss" && state.floors.length % 10 === 0) {
		const points = 100 * state.inHand;
		state.score += points;
		events.push({
			type: "bonus",
			points
		});
	}
	state.phase = "waiting";
	state.waitUntilMs = state.timeMs + 450;
	prepare(state, random, state.waitUntilMs);
	return events;
}
/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
function tick$1(state, input, random) {
	if (state.phase === "over") return [];
	state.timeMs += STEP_MS$1;
	const dt = STEP_MS$1 / 1e3;
	switch (state.phase) {
		case "waiting":
			if (state.timeMs < state.waitUntilMs) return [];
			state.hook.spawnMs = state.timeMs;
			state.phase = "swinging";
			return [{ type: "spawn" }];
		case "swinging": {
			if (!input.drop) return [];
			const { x, vx } = hookAt(state);
			state.falling = {
				x,
				y: 0,
				vx: vx * CARRY,
				vy: 0,
				color: state.hook.color
			};
			state.phase = "falling";
			return [{ type: "drop" }];
		}
		case "falling": {
			const f = state.falling;
			if (!f) throw new Error("Skyline: falling without a floor");
			f.vy += GRAVITY * dt;
			f.vx += state.wind * dt;
			f.x += f.vx * dt;
			f.y += f.vy * dt;
			if (f.y < 100) return [];
			state.falling = null;
			return land(state, f, random);
		}
	}
}
// src/games/skyline/verify.ts
/** The longest run accepted: 30 minutes of steps. */
var MAX_STEPS$1 = 108e3;
function isReplay$1(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, drops } = value;
	if (v !== 1 || !Array.isArray(drops) || drops.length > MAX_STEPS$1) return false;
	let previous = 0;
	for (const step of drops) {
		if (!Number.isInteger(step) || step <= previous || step > MAX_STEPS$1) return false;
		previous = step;
	}
	return true;
}
var replayRun$1 = (random, replay) => {
	if (!isReplay$1(replay)) return {
		ok: false,
		reason: "not a Skyline replay"
	};
	const state = createSkyline(random);
	let next = 0;
	for (let step = 1; step <= MAX_STEPS$1; step++) {
		const drop = replay.drops[next] === step;
		if (drop) next += 1;
		tick$1(state, { drop }, random);
		if (state.phase === "over") return next === replay.drops.length ? {
			ok: true,
			score: state.score
		} : {
			ok: false,
			reason: "inputs after the run ended"
		};
	}
	return {
		ok: false,
		reason: "the run never ended"
	};
};
var STEP_MS = 1e3 / 60;
var SHIP_MIN_X = 18;
var SHIP_MAX_X = 342;
/** Following a finger: fast, but not a teleport. */
var SHIP_FOLLOW_SPEED = 520;
/** Arrow keys / A-D. */
var SHIP_KEY_SPEED = 300;
/** Smaller than the sprite: near misses should feel like misses. */
var SHIP_HITBOX = {
	w: 14,
	h: 12
};
var ENEMY_HITBOX = {
	w: 24,
	h: 20
};
var SHOT_HITBOX = {
	w: 4,
	h: 10
};
var FIRE_EVERY_MS = 160;
var RAPID_FIRE_EVERY_MS = 80;
/** Twin shot: two streams this far either side of the ship's centre. */
var TWIN_OFFSET = 7;
var SHOT_SPEED = 640;
var ENEMY_SHOT_SPEED = 240;
var INVULNERABLE_MS = 1500;
var ENEMY = {
	drifter: {
		hp: 1,
		points: 10
	},
	weaver: {
		hp: 2,
		points: 20
	},
	gunner: {
		hp: 3,
		points: 30
	},
	carrier: {
		hp: 2,
		points: 50
	}
};
var POWER_MS = {
	twin: 1e4,
	rapid: 8e3
};
var POWER_FALL_SPEED = 100;
/** Generous on purpose: a catch you almost made should count. */
var POWER_HITBOX = {
	w: 26,
	h: 26
};
/** Which power-up a carrier holds, rolled when its wave is generated. */
var DROP_TABLE = [
	["twin", .3],
	["rapid", .3],
	["shield", .25],
	["bomb", .1],
	["life", .05]
];
function rollDrop(roll) {
	let acc = 0;
	for (const [kind, weight] of DROP_TABLE) {
		acc += weight;
		if (roll < acc) return kind;
	}
	return "twin";
}
/** A carrier joins waves 2, 6, 10, … */
var hasCarrier = (wave) => wave % 4 === 2;
var NO_INPUT = {
	targetX: null,
	axis: 0
};
function waveIntervalMs(wave) {
	return Math.max(1400, 3e3 - wave * 80);
}
/** Bigger waves and new enemy kinds as the run goes on. */
function generateWave(random, wave, startMs) {
	const count = Math.min(3 + Math.floor(wave / 2), 9);
	const spawns = [];
	for (let i = 0; i < count; i++) {
		const roll = random();
		const kind = wave >= 6 && roll < .25 ? "gunner" : wave >= 3 && roll < .6 ? "weaver" : "drifter";
		spawns.push({
			atMs: startMs + i * 220,
			kind,
			x: 30 + random() * 300,
			speed: (kind === "gunner" ? 55 : kind === "weaver" ? 80 : 90) + random() * 40 + wave * 2,
			amplitude: 30 + random() * 40,
			firstShotMs: 500 + random() * 900
		});
	}
	if (hasCarrier(wave)) spawns.push({
		atMs: startMs + count * 220 + 400,
		kind: "carrier",
		x: 40 + random() * 280,
		speed: 60 + random() * 20,
		amplitude: 0,
		firstShotMs: 0,
		drop: rollDrop(random())
	});
	return spawns;
}
function createRaid() {
	return {
		timeMs: 0,
		ship: { x: 180 },
		lives: 3,
		invulnerableMs: 0,
		fireInMs: 0,
		score: 0,
		kills: 0,
		enemies: [],
		shots: [],
		enemyShots: [],
		powerUps: [],
		twinMs: 0,
		rapidMs: 0,
		shield: false,
		pending: [],
		wave: 0,
		nextWaveAtMs: 1e3,
		nextId: 1,
		nextPowerId: 1,
		alive: true
	};
}
function overlaps(ax, ay, a, bx, by, b) {
	return Math.abs(ax - bx) * 2 < a.w + b.w && Math.abs(ay - by) * 2 < a.h + b.h;
}
/**
* Advances one fixed step. Mutates `state` (60 copies a second would be waste) and returns
* what happened, for sound and effects. Randomness is consumed only when a wave is generated,
* on the clock — so every player on the same seed meets the same waves.
*/
function tick(state, input, random) {
	if (!state.alive) return [];
	const events = [];
	const dt = STEP_MS / 1e3;
	state.timeMs += STEP_MS;
	const kill = (enemy) => {
		enemy.hp = 0;
		state.score += ENEMY[enemy.kind].points;
		state.kills += 1;
		events.push({
			type: "kill",
			kind: enemy.kind,
			x: enemy.cx,
			y: enemy.y
		});
		if (enemy.drop) {
			state.powerUps.push({
				id: state.nextPowerId++,
				kind: enemy.drop,
				x: enemy.cx,
				y: enemy.y
			});
			events.push({
				type: "powerup-dropped",
				kind: enemy.drop,
				x: enemy.cx,
				y: enemy.y
			});
		}
	};
	while (state.timeMs >= state.nextWaveAtMs) {
		state.pending.push(...generateWave(random, state.wave, state.nextWaveAtMs));
		events.push({
			type: "wave",
			index: state.wave
		});
		state.nextWaveAtMs += waveIntervalMs(state.wave);
		state.wave += 1;
	}
	while (state.pending[0] && state.pending[0].atMs <= state.timeMs) {
		const spawn = state.pending.shift();
		if (!spawn) break;
		const id = state.nextId++;
		events.push({
			type: "spawn",
			id,
			kind: spawn.kind,
			x: spawn.x,
			atMs: spawn.atMs
		});
		state.enemies.push({
			...spawn,
			id,
			y: -20,
			hp: ENEMY[spawn.kind].hp,
			ageMs: 0,
			nextShotMs: spawn.firstShotMs,
			cx: spawn.x
		});
	}
	const ship = state.ship;
	if (input.targetX !== null) ship.x += Math.max(-8.666666666666666, Math.min(SHIP_FOLLOW_SPEED * dt, input.targetX - ship.x));
	else ship.x += Math.sign(input.axis) * SHIP_KEY_SPEED * dt;
	ship.x = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, ship.x));
	state.invulnerableMs = Math.max(0, state.invulnerableMs - STEP_MS);
	state.twinMs = Math.max(0, state.twinMs - STEP_MS);
	state.rapidMs = Math.max(0, state.rapidMs - STEP_MS);
	state.fireInMs -= STEP_MS;
	if (state.fireInMs <= 0) {
		if (state.twinMs > 0) {
			state.shots.push({
				x: ship.x - TWIN_OFFSET,
				y: 526
			});
			state.shots.push({
				x: ship.x + TWIN_OFFSET,
				y: 526
			});
		} else state.shots.push({
			x: ship.x,
			y: 524
		});
		state.fireInMs += state.rapidMs > 0 ? RAPID_FIRE_EVERY_MS : FIRE_EVERY_MS;
	}
	for (const shot of state.shots) shot.y -= SHOT_SPEED * dt;
	state.shots = state.shots.filter((s) => s.y > -20);
	for (const enemy of state.enemies) {
		enemy.ageMs += STEP_MS;
		enemy.y += enemy.speed * dt;
		enemy.cx = enemy.kind === "weaver" ? enemy.x + sin(enemy.ageMs / 450) * enemy.amplitude : enemy.x;
		if (enemy.kind === "gunner") {
			enemy.nextShotMs -= STEP_MS;
			if (enemy.nextShotMs <= 0 && enemy.y > 0 && enemy.y < 480) {
				state.enemyShots.push({
					x: enemy.cx,
					y: enemy.y + 12
				});
				enemy.nextShotMs += 1400;
			}
		}
	}
	for (const shot of state.enemyShots) shot.y += ENEMY_SHOT_SPEED * dt;
	state.enemyShots = state.enemyShots.filter((s) => s.y < 620);
	for (const shot of state.shots) {
		const enemy = state.enemies.find((e) => e.hp > 0 && e.y > 0 && overlaps(shot.x, shot.y, SHOT_HITBOX, e.cx, e.y, ENEMY_HITBOX));
		if (!enemy) continue;
		shot.y = -100;
		enemy.hp -= 1;
		if (enemy.hp > 0) events.push({
			type: "enemy-hit",
			x: enemy.cx,
			y: enemy.y
		});
		else kill(enemy);
	}
	state.shots = state.shots.filter((s) => s.y > -20);
	for (const power of state.powerUps) power.y += POWER_FALL_SPEED * dt;
	const caught = state.powerUps.filter((p) => overlaps(ship.x, 540, SHIP_HITBOX, p.x, p.y, POWER_HITBOX));
	state.powerUps = state.powerUps.filter((p) => !caught.includes(p) && p.y < 620);
	for (const power of caught) {
		events.push({
			type: "powerup",
			kind: power.kind,
			x: power.x
		});
		switch (power.kind) {
			case "twin":
				state.twinMs = POWER_MS.twin;
				break;
			case "rapid":
				state.rapidMs = POWER_MS.rapid;
				break;
			case "shield":
				state.shield = true;
				break;
			case "life":
				state.lives = Math.min(5, state.lives + 1);
				break;
			case "bomb":
				for (const enemy of state.enemies) if (enemy.hp > 0 && enemy.y > 0) kill(enemy);
				state.enemyShots = [];
		}
	}
	if (state.invulnerableMs === 0) {
		const rammer = state.enemies.find((e) => e.hp > 0 && overlaps(ship.x, 540, SHIP_HITBOX, e.cx, e.y, ENEMY_HITBOX));
		const bullet = state.enemyShots.find((s) => overlaps(ship.x, 540, SHIP_HITBOX, s.x, s.y, SHOT_HITBOX));
		if (rammer || bullet) {
			if (rammer) rammer.hp = 0;
			if (bullet) bullet.y = 700;
		}
		if ((rammer || bullet) && state.shield) {
			state.shield = false;
			state.invulnerableMs = 800;
			events.push({ type: "shield-broken" });
		} else if (rammer || bullet) {
			state.lives -= 1;
			state.invulnerableMs = INVULNERABLE_MS;
			events.push({
				type: "ship-hit",
				livesLeft: state.lives
			});
			if (state.lives <= 0) {
				state.alive = false;
				events.push({ type: "died" });
			}
		}
	}
	state.enemies = state.enemies.filter((e) => e.hp > 0 && e.y < 630);
	state.enemyShots = state.enemyShots.filter((s) => s.y < 620);
	return events;
}
// src/games/star-raid/verify.ts
/** The longest run accepted: 30 minutes of steps. */
var MAX_STEPS = 108e3;
/** A finger can drag the ship target well off-screen; the rules clamp the ship. */
var MAX_TARGET = 5e3;
function isReplay(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, input } = value;
	if (v !== 1 || !Array.isArray(input) || input.length > MAX_STEPS) return false;
	let previous = 0;
	for (const change of input) {
		if (!Array.isArray(change) || change.length !== 3) return false;
		const [at, targetX, axis] = change;
		if (!Number.isInteger(at) || at <= previous || at > MAX_STEPS) return false;
		if (!(targetX === null || Number.isInteger(targetX) && Math.abs(targetX) <= MAX_TARGET) || axis !== -1 && axis !== 0 && axis !== 1) return false;
		previous = at;
	}
	return true;
}
var replayRun = (random, replay) => {
	if (!isReplay(replay)) return {
		ok: false,
		reason: "not a Star Raid replay"
	};
	const state = createRaid();
	let input = NO_INPUT;
	let next = 0;
	for (let step = 1; step <= MAX_STEPS; step++) {
		const change = replay.input[next];
		if (change && change[0] === step) {
			input = {
				targetX: change[1],
				axis: change[2]
			};
			next += 1;
		}
		tick(state, input, random);
		if (!state.alive) return next === replay.input.length ? {
			ok: true,
			score: state.score
		} : {
			ok: false,
			reason: "inputs after the run ended"
		};
	}
	return {
		ok: false,
		reason: "the run never ended"
	};
};
// server/nickname.ts
/**
* Nicknames shown on the public boards: 3–12 characters of plain letters, digits, space, _ . -
* (ASCII only, so no look-alike letters from other scripts), and nothing from a short list of
* words we will not display — checked after undoing common letter swaps (0→o, 1→i, $→s, …) and
* ignoring spaces and punctuation, so "B.A.D" and "b4d" read as "bad".
*/
var ALLOWED = /^[A-Za-z0-9 _.-]{3,12}$/;
var SWAPS = {
	"0": "o",
	"1": "i",
	"2": "z",
	"3": "e",
	"4": "a",
	"5": "s",
	"7": "t",
	"8": "b",
	"9": "g"
};
var BLOCKED = [
	"fuck",
	"shit",
	"cunt",
	"nigg",
	"fag",
	"bitch",
	"whore",
	"slut",
	"rape",
	"nazi",
	"hitler",
	"dick",
	"pussy",
	"penis",
	"vagina",
	"porn",
	"admin",
	"moderator"
];
function cleanNickname(raw) {
	if (typeof raw !== "string") return null;
	const name = raw.trim().replace(/\s+/g, " ");
	if (!ALLOWED.test(name)) return null;
	const plain = [...name.toLowerCase()].map((ch) => SWAPS[ch] ?? ch).join("").replace(/[^a-z]/g, "");
	return BLOCKED.some((word) => plain.includes(word)) ? null : name;
}
// server/leaderboard.ts
/**
* The daily leaderboards. A posted run is never trusted: the server rebuilds the day's seed
* itself, replays the recorded inputs with the game's own rules, and stores only the score that
* replay reaches. Players have no account — a random secret on their device, of which the
* boards show only a hash.
*/
var BOARD_GAMES = {
	skyline: replayRun$1,
	coil: replayRun$7,
	"star-raid": replayRun,
	pairs: replayRun$6,
	plunge: replayRun$5,
	wallbreak: replayRun$2,
	"pop-shot": replayRun$4,
	seeds: replayRun$3
};
var KEEP_DAYS = 8;
/**
* Sorted-set scores carry the score and, below it, how early in the day it was set, so equal
* scores rank first-come. 2^17 > the seconds in a day; scores stay exact below 2^36.
*/
var TIE = 131072;
var key = {
	board: (game, date) => `ka:lb:${game}:${date}`,
	name: (player) => `ka:name:${player}`,
	ip: (ip, minute) => `ka:rl:${ip}:${minute}`,
	posts: (player, date) => `ka:posts:${player}:${date}`
};
var fail = (status, error) => ({
	ok: false,
	status,
	error
});
/** The public id for a device's secret. The secret itself is never stored or shown. */
function playerId(secret) {
	return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}
var isSecret = (value) => typeof value === "string" && /^[0-9a-f]{32,64}$/.test(value);
async function postRun(redis, body, { now, ip }) {
	if (typeof body !== "object" || body === null) return fail(400, "Expected a JSON object");
	const { game, date, player, nickname, score, replay } = body;
	const replayRun = typeof game === "string" ? BOARD_GAMES[game] : void 0;
	if (!replayRun || typeof game !== "string") return fail(400, "No board for that game");
	if (typeof date !== "string" || !isDate(date) || !postableDates(now).includes(date)) return fail(400, "Only today’s daily can be posted");
	if (!isSecret(player)) return fail(400, "Missing player");
	const name = cleanNickname(nickname);
	if (!name) return fail(400, "Nickname not allowed");
	if (!Number.isInteger(score) || score < 0) return fail(400, "Missing score");
	const id = playerId(player);
	const minute = Math.floor(now / 6e4);
	const [fromIp, fromPlayer] = await Promise.all([redis.incr(key.ip(ip, minute)), redis.incr(key.posts(id, date))]);
	await Promise.all([redis.expire(key.ip(ip, minute), 120), redis.expire(key.posts(id, date), 172800)]);
	if (fromIp > 20 || fromPlayer > 300) return fail(429, "Too many posts — try again in a minute");
	const replayed = replayRun(seededRandom(dailySeed(game, date)), replay);
	if (!replayed.ok) return fail(422, `Replay rejected: ${replayed.reason}`);
	if (replayed.score !== score) return fail(422, "Replay does not match the score");
	const board = key.board(game, date);
	const secondOfDay = Math.floor(now % 864e5 / 1e3);
	await redis.zadd(board, { gt: true }, {
		score: replayed.score * TIE + (131071 - secondOfDay),
		member: id
	});
	await Promise.all([redis.expire(board, KEEP_DAYS * 86400), redis.set(key.name(id), name, { ex: KEEP_DAYS * 86400 })]);
	const [rank, best, players] = await Promise.all([
		redis.zrevrank(board, id),
		redis.zscore(board, id),
		redis.zcard(board)
	]);
	return {
		ok: true,
		value: {
			score: replayed.score,
			best: Math.floor(Number(best) / TIE),
			rank: (rank ?? 0) + 1,
			players
		}
	};
}
async function readBoard(redis, { game, date, player }) {
	if (!BOARD_GAMES[game]) return fail(400, "No board for that game");
	if (!isDate(date)) return fail(400, "Bad date");
	const board = key.board(game, date);
	const flat = await redis.zrange(board, 0, 49, {
		rev: true,
		withScores: true
	});
	const ids = [];
	const scores = [];
	for (let i = 0; i + 1 < flat.length; i += 2) {
		ids.push(String(flat[i]));
		scores.push(Math.floor(Number(flat[i + 1]) / TIE));
	}
	const names = ids.length ? await redis.mget(...ids.map(key.name)) : [];
	const you = isSecret(player) ? playerId(player) : null;
	const top = ids.map((id, i) => ({
		rank: i + 1,
		name: names[i] ?? "Player",
		score: scores[i] ?? 0,
		...id === you ? { you: true } : {}
	}));
	let mine = null;
	if (you && !ids.includes(you)) {
		const [rank, score, name] = await Promise.all([
			redis.zrevrank(board, you),
			redis.zscore(board, you),
			redis.get(key.name(you))
		]);
		if (rank !== null && score !== null) mine = {
			rank: rank + 1,
			name: name ?? "You",
			score: Math.floor(Number(score) / TIE),
			you: true
		};
	}
	return {
		ok: true,
		value: {
			game,
			date,
			players: await redis.zcard(board),
			top,
			you: mine
		}
	};
}
// server/handlers.ts
/** Well above the longest replay a 30-minute run records. */
var MAX_BODY_BYTES = 4e5;
function reply(outcome, cache = "no-store") {
	return outcome.ok ? Response.json(outcome.value, { headers: { "Cache-Control": cache } }) : Response.json({ error: outcome.error }, { status: outcome.status });
}
function clientIp(request) {
	return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
async function handlePost(request, redis, now = Date.now()) {
	if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return reply({
		ok: false,
		status: 413,
		error: "Too large"
	});
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return reply({
		ok: false,
		status: 413,
		error: "Too large"
	});
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		return reply({
			ok: false,
			status: 400,
			error: "Expected JSON"
		});
	}
	return reply(await postRun(redis, body, {
		now,
		ip: clientIp(request)
	}));
}
async function handleGet(request, redis) {
	const url = new URL(request.url);
	const player = url.searchParams.get("player");
	return reply(await readBoard(redis, {
		game: url.searchParams.get("game") ?? "",
		date: url.searchParams.get("date") ?? "",
		player
	}), player ? "no-store" : "public, s-maxage=10, stale-while-revalidate=30");
}
// server/redis.ts
/**
* Upstash, as connected from Vercel's marketplace (KV_* names) or set by hand (UPSTASH_*).
* Created on first use, so importing a handler never needs the network. Values are stored as
* plain strings (the client's default JSON-encodes them, quotes and all), so the data reads the
* same from redis-cli or any other client.
*/
var client = null;
function redis() {
	if (client) return client;
	const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
	if (!url || !token) throw new Error("Leaderboard storage is not configured");
	client = new Redis({
		url,
		token,
		automaticDeserialization: false
	});
	return client;
}
export { handleGet as n, handlePost as r, redis as t };
