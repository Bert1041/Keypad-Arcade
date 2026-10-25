#!/bin/sh
# Rebuild the level files from build.py, solve one level, then write its solution into levelNN.ts.
# Both regenerations matter: the solver reads the level file (so it must be current), and the
# solution only reaches the game through emit.py. (Each one, skipped, has bitten once.)
set -e
cd "$(dirname "$0")"
python3 build.py > /dev/null
python3 emit.py > /dev/null
npx tsx solve.ts "$@"
case " $* " in *" --dump "*) exit 0 ;; esac
python3 emit.py
