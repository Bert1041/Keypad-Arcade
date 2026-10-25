#!/bin/sh
# Starts the leaderboard tests' database: a throwaway Redis on port 6390 and Upstash's REST
# adapter in front of it on 8079 (Docker). Safe to run again; `npm run test:server` uses it.
set -e
redis-cli -p 6390 ping >/dev/null 2>&1 || redis-server --port 6390 --save '' --appendonly no --daemonize yes
if ! docker ps --format '{{.Names}}' | grep -qx ka-srh; then
  docker rm -f ka-srh >/dev/null 2>&1 || true
  docker run -d --name ka-srh -p 8079:80 \
    -e SRH_MODE=env -e SRH_TOKEN=local_dev_token \
    -e SRH_CONNECTION_STRING=redis://host.docker.internal:6390 \
    hiett/serverless-redis-http@sha256:5b0bb9239fce53abf87b2018a7a0deb9ec7bd900c5360738fe5fbeeb426f9150 >/dev/null
fi
echo "Test Redis ready: http://localhost:8079 (token local_dev_token)"
