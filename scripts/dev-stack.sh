#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${ATHENAEUM_HOME:-$HOME/.athenaeum-dev}"
ENV_FILE="$HOME_DIR/api.env"
PIDS="$HOME_DIR/pids"
LOGS="$HOME_DIR/logs"

MONGOD=/opt/homebrew/bin/mongod
MONGOSH=/opt/homebrew/bin/mongosh

MONGO_PORT=27018
MONGO_REPLSET=rs0
API_PORT=4000
WEB_PORT=5173

mkdir -p "$HOME_DIR" "$PIDS" "$LOGS"

listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

wait_port() {
  local name="$1" port="$2"
  for _ in $(seq 1 60); do
    if listening "$port"; then return 0; fi
    sleep 0.5
  done
  echo "✖ $name did not bind port $port — see $LOGS" >&2
  return 1
}

ensure_replset() {
  "$MONGOSH" --quiet --port "$MONGO_PORT" --eval '
    if (db.hello().setName == null) {
      try { rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27018" }] }); } catch (e) {}
    }
    for (let i = 0; i < 40; i++) {
      if (db.hello().isWritablePrimary) quit(0);
      sleep(500);
    }
    quit(1);
  ' >/dev/null 2>&1
}

start_mongo() {
  if listening "$MONGO_PORT"; then
    if ensure_replset; then echo "• MongoDB already on $MONGO_PORT (replica set $MONGO_REPLSET)"; return; fi
    echo "✖ MongoDB on $MONGO_PORT is not a $MONGO_REPLSET primary — restart it: $0 stop && $0 start" >&2
    return 1
  fi
  nohup "$MONGOD" --dbpath "$HOME_DIR/mongo" --port "$MONGO_PORT" --bind_ip 127.0.0.1 \
    --replSet "$MONGO_REPLSET" >"$LOGS/mongod.log" 2>&1 &
  echo $! >"$PIDS/mongod.pid"
  wait_port MongoDB "$MONGO_PORT"
  ensure_replset || echo "⚠ replica set init pending — check $LOGS/mongod.log" >&2
  echo "✔ MongoDB on $MONGO_PORT (replica set $MONGO_REPLSET)"
}

start_api() {
  if listening "$API_PORT"; then echo "• API already on $API_PORT"; return; fi
  if [[ "${1:-}" == "--build" || ! -f "$ROOT/server/dist/index.js" ]]; then
    (cd "$ROOT/server" && npm run build >"$LOGS/build.log" 2>&1) || {
      echo "✖ server build failed — see $LOGS/build.log" >&2; return 1; }
    echo "✔ server built"
  fi
  (cd "$ROOT/server" && exec node --env-file="$ENV_FILE" dist/index.js) \
    >"$LOGS/api.log" 2>&1 </dev/null &
  echo $! >"$PIDS/api.pid"
  wait_port API "$API_PORT"
  echo "✔ API on $API_PORT"
}

start_web() {
  if listening "$WEB_PORT"; then echo "• Web already on $WEB_PORT"; return; fi
  (cd "$ROOT/web" && exec ./node_modules/.bin/vite --port "$WEB_PORT" --strictPort) \
    >"$LOGS/web.log" 2>&1 </dev/null &
  echo $! >"$PIDS/web.pid"
  wait_port Web "$WEB_PORT"
  echo "✔ Web on $WEB_PORT"
}

stop_pid_file() {
  local file="$1" name="$2"
  [[ -f "$file" ]] || return 0
  local pid; pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    echo "✔ $name stopped ($pid)"
  fi
  rm -f "$file"
}

stop_all() {
  stop_pid_file "$PIDS/web.pid" Web
  stop_pid_file "$PIDS/api.pid" API
  stop_pid_file "$PIDS/mongod.pid" MongoDB
  if listening "$MONGO_PORT"; then
    mongosh --quiet --port "$MONGO_PORT" --eval 'db.getSiblingDB("admin").shutdownServer()' >/dev/null 2>&1 \
      || kill "$(lsof -tiTCP:$MONGO_PORT -sTCP:LISTEN)" 2>/dev/null || true
    echo "✔ MongoDB stopped"
  fi
}

status() {
  for pair in "MongoDB:$MONGO_PORT" "API:$API_PORT" "Web:$WEB_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    if listening "$port"; then echo "● $name  :$port up"; else echo "○ $name  :$port down"; fi
  done
  echo "logs: $LOGS"
}

start_all() {
  start_mongo || true
  start_api "${1:-}" || true
  start_web || true
}

supervise() {
  echo "[$(date '+%F %T')] supervising Athenaeum stack"
  start_all
  while true; do
    sleep 10
    for port in "$MONGO_PORT" "$API_PORT" "$WEB_PORT"; do
      if ! listening "$port"; then
        echo "[$(date '+%F %T')] port $port down — restarting"
        start_all
        break
      fi
    done
  done
}

case "${1:-start}" in
  start)   start_mongo; start_api "${2:-}"; start_web; status ;;
  supervise) supervise ;;
  stop)    stop_all; status ;;
  restart) stop_all; sleep 1; start_mongo; start_api "${2:-}"; start_web; status ;;
  status)  status ;;
  logs)    tail -n "${3:-50}" "$LOGS/${2:-api}.log" ;;
  *) echo "usage: $0 {start [--build]|stop|restart [--build]|status|logs <api|web|mongod|build> [lines]}" >&2; exit 1 ;;
esac
