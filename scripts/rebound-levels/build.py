"""Rebound level builder: place features by coordinate instead of typing rows by hand.

Regenerate every level file (maps from here, solutions from solutions.json):
    python3 scripts/rebound-levels/build.py && python3 scripts/rebound-levels/emit.py
Then run the tests: each level's solution must finish it (src/games/rebound/levels/levels.test.ts).
"""
import json, sys

class L:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.g = [['.'] * w for _ in range(h)]
        for x in range(w): s.g[0][x] = s.g[h-1][x] = '#'
        for y in range(h): s.g[y][0] = s.g[y][w-1] = '#'
    def put(s, x, y, ch):
        assert 0 < x < s.w-1 and 0 < y < s.h-1, (x, y, ch)
        s.g[y][x] = ch
    def fill(s, x0, y0, x1, y1, ch='#'):
        for y in range(y0, y1+1):
            for x in range(x0, x1+1): s.put(x, y, ch)
    def rows(s): return [''.join(r) for r in s.g]

def emit(name, l, platforms=None, par_ms=None):
    return {'name': name, 'rows': l.rows(), 'platforms': platforms or [], 'parMs': par_ms}

levels = {}

# 1 — Roll Out: roll, jump up, jump over, rings on the ground and in the air.
l = L(46, 12)
l.put(2, 10, 'S')
l.put(5, 10, 'o')
l.fill(10, 9, 12, 10); l.put(11, 8, 'o')          # a 2-high block, ring on top
l.fill(18, 8, 20, 10); l.put(19, 7, 'o')          # a 3-high step
l.fill(27, 8, 31, 8); l.put(29, 7, '*')            # a floating ledge with a gem
l.put(34, 10, 'o')
l.put(38, 8, 'o')                                  # a ring to jump through
l.put(43, 10, 'E')
levels['level01'] = emit('Roll Out', l, par_ms=17_000)

# 2 — Spike Garden: spike pits to hop, a checkpoint, a ring above spikes.
l = L(58, 12)
l.put(2, 10, 'S')
l.put(6, 10, 'o')
l.fill(10, 10, 11, 10, '^')                        # 2 wide: a small hop
l.put(15, 10, 'o')
l.fill(20, 10, 22, 10, '^')                        # 3 wide
l.put(21, 7, '*')                                  # gem at the top of the safe jump over the spikes
l.put(26, 10, 'C')
l.fill(30, 9, 31, 10)                              # block, then spikes behind it
l.fill(32, 10, 35, 10, '^')
l.put(33, 5, 'o')                                  # ring at the top of the jump over the spike bed
l.fill(36, 9, 37, 10)
l.put(41, 10, 'o')
l.fill(45, 10, 47, 10, '^')
l.put(51, 10, 'o')
l.put(55, 10, 'E')
levels['level02'] = emit('Spike Garden', l, par_ms=21_000)

# 3 — Stepping Stones: 4-wide stones over a spike floor; an extra life on a high ledge.
l = L(62, 14)
l.put(2, 12, 'S')
l.put(5, 12, 'o')
l.fill(9, 12, 52, 12, '^')                         # the floor is spikes from here on
l.fill(9, 10, 12, 10)                              # A: 2 up
l.fill(16, 9, 19, 9); l.put(18, 8, 'o')            # B: 1 up
l.fill(23, 9, 26, 9); l.put(25, 8, 'C')            # C: level, checkpoint
l.fill(30, 7, 33, 7); l.put(32, 6, 'o')            # D: 2 up
l.fill(36, 5, 38, 5); l.put(37, 4, '+')            # high ledge: 2 up again, extra life
l.fill(42, 9, 45, 9); l.put(43, 8, '*')            # F: back down
l.fill(49, 10, 52, 10); l.put(51, 9, 'o')          # G
l.put(56, 12, 'o')                                 # safe ground again
l.put(59, 12, 'E')
levels['level03'] = emit('Stepping Stones', l, par_ms=24_000)

# 4 — Squeeze: shrink through grates, change back to climb; ceiling spikes punish jumping.
l = L(88, 14)
l.put(2, 12, 'S')
l.put(5, 12, 'o')
l.put(8, 12, 's')                                  # shrink
l.fill(11, 1, 11, 8); l.fill(11, 9, 11, 12, 'H')   # a wall you only pass small
l.fill(12, 9, 20, 9)                               # a three-tile tunnel: room for a full hop…
l.fill(16, 12, 16, 12, '^')                        # …with one spike to hop
l.put(13, 12, 'o'); l.put(19, 12, '*')
l.fill(22, 11, 24, 11); l.put(23, 12, 'n')         # back to normal to climb (low roof: no skipping it)
l.fill(27, 10, 29, 12); l.put(28, 9, 'o')          # 3 high: too tall for a small ball
l.fill(30, 12, 33, 12, '^')                        # 4-wide pit, taken from the wall top
l.put(37, 12, 'C')
l.put(40, 12, 's')
l.fill(43, 1, 43, 10); l.fill(43, 11, 43, 12, 'H') # grate gate
l.fill(44, 11, 52, 11, 'v')                        # ceiling spikes: do not jump here
l.put(47, 12, 'o'); l.put(50, 12, 'o')
l.fill(53, 1, 53, 10); l.fill(53, 11, 53, 12, 'H')
l.fill(56, 11, 60, 11); l.put(58, 12, 'n')        # back to normal, under a low roof: no jumping over it
l.fill(67, 12, 69, 12, '^')                        # runway after the roof, then the pit
l.fill(75, 10, 76, 12); l.put(76, 9, '+')          # extra life on a block
l.put(81, 12, 'o')
l.put(85, 12, 'E')
levels['level04'] = emit('Squeeze', l, par_ms=32_000)

# 5 — Deep End: dive for rings as a normal ball, then grow and float up to a high ledge.
l = L(72, 18)
l.fill(1, 10, 8, 16); l.put(2, 9, 'S'); l.put(5, 9, 'o')      # start on a ledge above the pool
l.fill(9, 10, 24, 16, '~')                                     # pool A
l.put(12, 15, 'o'); l.put(17, 12, '*'); l.put(21, 15, 'o')     # dive for them
l.fill(25, 10, 34, 16)                                         # ground beyond the pool
l.fill(27, 6, 29, 7); l.fill(28, 8, 28, 9, 'g')                # grow: a tall pad under a roof
l.put(32, 9, 'C')
l.fill(35, 4, 50, 16, '~')                                     # pool B: deep — a big ball floats up
l.fill(35, 1, 50, 3, '.')
l.fill(51, 4, 62, 16)                                          # the high ledge…
l.put(53, 3, 'o'); l.put(56, 3, '+')
l.fill(58, 1, 60, 1); l.fill(59, 2, 59, 3, 'n')                # …back to normal before the drop
l.fill(63, 4, 70, 15, '.')
l.put(66, 16, 'o')
l.fill(51, 16, 62, 16)
l.put(69, 16, 'E')
levels['level05'] = emit('Deep End', l, par_ms=40_000)

# 6 — Lift Off: moving platforms over a spike floor. Each one meets solid ground at the ends of
# its path, so the patient route is "roll on, ride, roll off"; jumping between them is faster.
l = L(78, 16)
l.put(2, 14, 'S'); l.put(5, 14, 'o')
l.fill(9, 14, 67, 14, '^')                                     # spikes nearly all the way
l.fill(21, 12, 24, 12); l.put(22, 11, 'o')                     # island 1
l.fill(27, 6, 36, 6); l.put(31, 5, '*'); l.put(34, 5, 'C')     # high ledge
l.put(43, 3, 'o')                                              # over ferry 2: jump while riding
l.fill(50, 8, 53, 8); l.put(52, 7, 'o')                        # island 2
l.put(70, 14, 'o')
l.put(75, 14, 'E')
levels['level06'] = emit('Lift Off', l, [
  {'x': 9,  'y': 12, 'width': 3, 'dx': 9,  'dy': 0,  'periodMs': 4500},   # ferry 1: start ground ↔ island 1
  {'x': 25, 'y': 12, 'width': 2, 'dx': 0,  'dy': -6, 'periodMs': 5000},   # lift: island 1 ↔ ledge
  {'x': 37, 'y': 6,  'width': 3, 'dx': 10, 'dy': 0,  'periodMs': 5000},   # ferry 2: ledge ↔ island 2
  {'x': 54, 'y': 8,  'width': 3, 'dx': 10, 'dy': 4,  'periodMs': 5000},   # diagonal: island 2 ↔ near the ground
], par_ms=45_000)

# 7 — Tight Spots: short hops under ceiling spikes, a grate maze, a ferry under spikes, pillars.
# One checkpoint, late.
l = L(92, 16)
l.put(2, 14, 'S'); l.put(5, 14, 'o')
l.fill(8, 10, 27, 10, 'v')                                     # ceiling spikes: a hop is fine, a full jump is not
for x in (12, 18, 24): l.put(x, 14, '^')                       # spaced so a hop lands clear
l.put(15, 14, 'o'); l.put(21, 14, '*')
l.fill(29, 12, 31, 12); l.fill(30, 13, 30, 14, 's')            # shrink (tall pad, roofed)
l.fill(34, 1, 34, 11); l.fill(34, 12, 34, 14, 'H')             # grate gate into the maze
l.fill(35, 11, 44, 11)                                         # a low corridor: small hops only
l.fill(38, 14, 38, 14, '^'); l.fill(42, 14, 42, 14, '^')
l.put(40, 14, 'o')
l.fill(45, 1, 45, 11); l.fill(45, 12, 45, 14, 'H')
l.fill(46, 12, 48, 12); l.fill(47, 13, 47, 14, 'n')            # normal again (roofed)
l.fill(49, 14, 51, 14)                                         # a step up, flush with the ferry
l.fill(52, 14, 66, 14, '^')                                    # spike pit, ferried across…
l.fill(52, 9, 66, 9, 'v')                                      # …under ceiling spikes: no jumping
l.put(59, 13, 'o')                                             # in the riding lane
l.fill(67, 14, 70, 14); l.put(68, 13, 'C')                     # landing step, flush with the ferry
l.fill(72, 14, 88, 14, '^')                                    # pillars over spikes
for x in (73, 77, 81): l.fill(x, 12, x + 1, 13)
l.put(78, 11, '+')
l.fill(85, 12, 86, 13); l.put(86, 11, 'o')
l.fill(89, 14, 90, 14, '.')
l.put(90, 14, 'E')
levels['level07'] = emit('Tight Spots', l, [
  {'x': 52, 'y': 14, 'width': 3, 'dx': 12, 'dy': 0, 'periodMs': 6000},   # ferry: step ↔ landing step
], par_ms=50_000)

# 8 — Climb: go up. Ledges zig-zag over a spike floor; a lift; ceiling spikes guard shortcuts.
l = L(32, 30)
l.fill(1, 28, 30, 28, '^'); l.fill(1, 28, 5, 28, '#')          # spike floor, safe start
l.put(3, 27, 'S'); l.put(5, 27, 'o')
l.fill(7, 25, 11, 25); l.put(9, 24, 'o')                       # zig
l.fill(14, 22, 18, 22); l.put(16, 21, '*')                     # zag
l.fill(21, 19, 25, 19); l.put(23, 18, 'o'); l.put(25, 18, 'C')
l.fill(14, 16, 18, 16); l.fill(14, 15, 18, 15, '.')            # back left
l.put(15, 15, 'o')
l.fill(6, 13, 10, 13); l.fill(7, 10, 9, 10, 'v')               # ceiling spikes over this ledge: no big jumps
l.put(8, 12, 'o')
l.fill(13, 7, 30, 7)                                           # the top floor
l.put(20, 6, '+'); l.put(24, 6, 'o')
l.put(29, 6, 'E')
levels['level08'] = emit('Climb', l, [
  {'x': 11, 'y': 13, 'width': 2, 'dx': 0, 'dy': -6, 'periodMs': 5000},   # lift: ledge ↔ top floor
], par_ms=45_000)

# 9 — Long Way Round: everything, long, the checkpoint only past halfway.
l = L(128, 18)
l.put(2, 16, 'S'); l.put(4, 16, 'o')
l.fill(8, 16, 10, 16, '^'); l.fill(14, 14, 16, 16); l.put(15, 13, 'o')
l.fill(19, 16, 22, 16, '^')
l.fill(26, 13, 28, 13); l.fill(27, 15, 27, 16, 'g')            # grow (tall pad, roofed; room to grow)
l.fill(29, 10, 33, 16)                                          # pool wall
l.fill(34, 6, 46, 16, '~')                                      # a big ball floats up…
l.fill(47, 6, 58, 16); l.put(50, 5, 'o'); l.put(54, 5, '*')     # …to the upper path
l.fill(56, 2, 58, 2); l.fill(57, 3, 57, 4, 'n')                 # normal again (roofed)
l.fill(59, 5, 66, 16, '.'); l.fill(59, 16, 66, 16, '^')         # drop over spikes…
l.fill(61, 10, 63, 10); l.put(62, 9, 'o')                       # …onto a stepping stone
l.fill(67, 12, 70, 16); l.put(69, 11, 'C')                      # checkpoint, past halfway
l.fill(71, 16, 92, 16, '^')
l.put(80, 12, 'o')
l.fill(93, 14, 96, 16)
l.fill(97, 14, 99, 14); l.fill(98, 15, 98, 16, 's')            # shrink (roofed)
l.fill(101, 1, 101, 13); l.fill(101, 14, 101, 16, 'H')          # grate
l.fill(102, 13, 110, 13, 'v'); l.put(106, 16, 'o')
l.fill(111, 1, 111, 13); l.fill(111, 14, 111, 16, 'H')
l.fill(113, 14, 115, 14); l.fill(114, 15, 114, 16, 'n')        # normal (roofed)
l.fill(118, 16, 120, 16, '^')
l.put(124, 16, 'o')
l.put(126, 16, 'E')
levels['level09'] = emit('Long Way Round', l, [
  {'x': 72, 'y': 14, 'width': 3, 'dx': 18, 'dy': 0, 'periodMs': 9000},   # long ferry over spikes (peak ~150 px/s, slower than the ball)
], par_ms=70_000)

# 10 — Gauntlet: everything, quickly, with gems off the safe line.
l = L(104, 16)
l.put(2, 14, 'S'); l.put(5, 14, 'o')
for x in (8, 14): l.put(x, 14, '^')
l.put(10, 10, '*')                                             # at the top of the jump over the first spike
l.fill(21, 12, 23, 14); l.fill(24, 14, 27, 14, '^')            # wall, then a 4-wide pit from its top
l.put(26, 9, 'o')
l.fill(31, 12, 33, 12); l.fill(32, 13, 32, 14, 's')            # shrink (roofed)
l.fill(36, 1, 36, 11); l.fill(36, 12, 36, 14, 'H')
l.fill(37, 10, 47, 10, 'v'); l.put(41, 14, '^'); l.put(44, 14, 'o')   # hop, don't jump
l.fill(48, 1, 48, 11); l.fill(48, 12, 48, 14, 'H')
l.fill(50, 12, 52, 12); l.fill(51, 13, 51, 14, 'n')            # normal (roofed)
l.put(55, 14, 'C')
l.fill(58, 14, 76, 14, '^')
l.put(67, 9, '*')                                              # above the ferry: jump off and back on
l.fill(77, 12, 79, 14); l.fill(80, 14, 82, 14, '^'); l.fill(83, 12, 85, 14)   # pillar (flush with the ferry's end), gap, pillar
l.put(81, 9, 'o')                                              # over the gap: jump through it
l.fill(89, 14, 92, 14, '^')
l.put(96, 14, 'o')
l.put(101, 14, 'E')
levels['level10'] = emit('Gauntlet', l, [
  {'x': 58, 'y': 12, 'width': 3, 'dx': 16, 'dy': 0, 'periodMs': 8000},   # ferry over the long pit (peak ~150 px/s)
], par_ms=50_000)

import os
HERE = os.path.dirname(os.path.abspath(__file__))
json.dump(levels, open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'levels.json'), 'w'), indent=1)
print('ok', {k: len(v['rows'][0]) for k, v in levels.items()})
