#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${ATHENAEUM_HOME:-$HOME/.athenaeum-dev}"
ENV_FILE="$HOME_DIR/api.env"
PIDS="$HOME_DIR/pids"
LOGS="$HOME_DIR/logs"

MYSQLD=/usr/local/mysql/bin/mysqld
MYSQLADMIN=/usr/local/mysql/bin/mysqladmin
MONGOD=/opt/homebrew/bin/mongod

MYSQL_PORT=3307
MONGO_PORT=27018
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

start_mysql() {
  if listening "$MYSQL_PORT"; then echo "• MySQL already on $MYSQL_PORT"; return; fi
  "$MYSQLD" --basedir=/usr/local/mysql \
    --datadir="$HOME_DIR/mysql" \
    --port="$MYSQL_PORT" --bind-address=127.0.0.1 \
    --socket="$HOME_DIR/mysql.sock" --mysqlx=OFF \
    --pid-file="$PIDS/mysql.pid" --log-error="$LOGS/mysql.log" \
    >/dev/null 2>&1 &
  wait_port MySQL "$MYSQL_PORT"
  echo "✔ MySQL on $MYSQL_PORT"
}

start_mongo() {
  if listening "$MONGO_PORT"; then echo "• MongoDB already on $MONGO_PORT"; return; fi
  nohup "$MONGOD" --dbpath "$HOME_DIR/mongo" --port "$MONGO_PORT" --bind_ip 127.0.0.1 \
    >"$LOGS/mongod.log" 2>&1 &
  echo $! >"$PIDS/mongod.pid"
  wait_port MongoDB "$MONGO_PORT"
  echo "✔ MongoDB on $MONGO_PORT"
}

start_api() {
  if listening "$API_PORT"; then echo "• API already on $API_PORT"; return; fi
  if [[ "${1:-}" == "--build" || ! -f "$ROOT/server/dist/index.js" ]]; then
    (cd "$ROOT/server" && npm run build >"$LOGS/build.log" 2>&1) || {
      echo "✖ server build failed — see $LOGS/build.log" >&2; return 1; }
    echo "✔ server built"
  fi
  (cd "$ROOT/server" && nohup node --env-file="$ENV_FILE" dist/index.js >"$LOGS/api.log" 2>&1 &
   echo $! >"$PIDS/api.pid")
  wait_port API "$API_PORT"
  echo "✔ API on $API_PORT"
}

start_web() {
  if listening "$WEB_PORT"; then echo "• Web already on $WEB_PORT"; return; fi
  (cd "$ROOT/web" && nohup npx vite --port "$WEB_PORT" --strictPort >"$LOGS/web.log" 2>&1 &
   echo $! >"$PIDS/web.pid")
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
  if listening "$MYSQL_PORT"; then
    "$MYSQLADMIN" --socket="$HOME_DIR/mysql.sock" -uroot shutdown >/dev/null 2>&1 || true
    echo "✔ MySQL stopped"
  fi
  stop_pid_file "$PIDS/mysql.pid" MySQL
  stop_pid_file "$PIDS/mongod.pid" MongoDB
  if listening "$MONGO_PORT"; then
    mongosh --quiet --port "$MONGO_PORT" --eval 'db.getSiblingDB("admin").shutdownServer()' >/dev/null 2>&1 \
      || kill "$(lsof -tiTCP:$MONGO_PORT -sTCP:LISTEN)" 2>/dev/null || true
    echo "✔ MongoDB stopped"
  fi
}

status() {
  for pair in "MySQL:$MYSQL_PORT" "MongoDB:$MONGO_PORT" "API:$API_PORT" "Web:$WEB_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    if listening "$port"; then echo "● $name  :$port up"; else echo "○ $name  :$port down"; fi
  done
  echo "logs: $LOGS"
}

start_all() {
  start_mongo || true
  start_mysql || true
  start_api "${1:-}" || true
  start_web || true
}

supervise() {
  echo "[$(date '+%F %T')] supervising Athenaeum stack"
  start_all
  while true; do
    sleep 10
    for port in "$MONGO_PORT" "$MYSQL_PORT" "$API_PORT" "$WEB_PORT"; do
      if ! listening "$port"; then
        echo "[$(date '+%F %T')] port $port down — restarting"
        start_all
        break
      fi
    done
  done
}

case "${1:-start}" in
  start)   start_mongo; start_mysql; start_api "${2:-}"; start_web; status ;;
  supervise) supervise ;;
  stop)    stop_all; status ;;
  restart) stop_all; sleep 1; start_mongo; start_mysql; start_api "${2:-}"; start_web; status ;;
  status)  status ;;
  logs)    tail -n "${3:-50}" "$LOGS/${2:-api}.log" ;;
  *) echo "usage: $0 {start [--build]|stop|restart [--build]|status|logs <api|web|mysql|mongod|build> [lines]}" >&2; exit 1 ;;
esac
