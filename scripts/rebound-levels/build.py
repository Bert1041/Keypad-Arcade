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

import os
HERE = os.path.dirname(os.path.abspath(__file__))
json.dump(levels, open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'levels.json'), 'w'), indent=1)
print('ok', {k: len(v['rows'][0]) for k, v in levels.items()})
