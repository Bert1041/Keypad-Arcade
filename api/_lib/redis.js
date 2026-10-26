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
var MAX_STEPS$2 = 13200;
var MAX_TURNS = 2e4;
function isReplay$2(value) {
	if (typeof value !== "object" || value === null) return false;
	const { v, turns } = value;
	if (v !== 1 || !Array.isArray(turns) || turns.length > MAX_TURNS) return false;
	let previous = 0;
	for (const turn of turns) {
		if (!Array.isArray(turn) || turn.length !== 2) return false;
		const [at, dir] = turn;
		if (!Number.isInteger(at) || at < previous || at > MAX_STEPS$2) return false;
		if (typeof dir !== "string" || !(dir in DIRS)) return false;
		previous = at;
	}
	return true;
}
var replayRun$2 = (random, replay) => {
	if (!isReplay$2(replay)) return {
		ok: false,
		reason: "not a Coil replay"
	};
	let state = createCoil(random, 15, 22);
	let next = 0;
	for (let taken = 0; taken <= MAX_STEPS$2; taken++) {
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
	coil: replayRun$2,
	"star-raid": replayRun
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
