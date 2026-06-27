#!/usr/bin/env bash
# ============================================================================
#  dev-restart.sh — relança el backend (Go) i el frontend (Vite) en local.
#
#  Fa:
#    1. mata el que escolta als ports 3001 (api) i 5173 (vite)
#    2. recompila el backend amb `go build` → $TMPDIR/finances-server
#    3. llança el backend en background amb APP_PASSWORD_HASH
#    4. llança el frontend (`pnpm dev`) en background
#    5. logs a $TMPDIR/finances-logs/
#
#  Us:
#    scripts/dev-restart.sh                # backend + frontend
#    scripts/dev-restart.sh backend        # només backend
#    scripts/dev-restart.sh web            # només frontend
#    scripts/dev-restart.sh --help         # ajuda
#
#  Variables d'entorn opcionals:
#    APP_PASSWORD_HASH    bcrypt hash per al login (default: "finances")
#    GO_BIN               ruta al go (default: go al PATH)
#    TMPDIR               on deixar el binari i els logs
# ============================================================================

set -euo pipefail

# --- paths --------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
WEB_DIR="$REPO_ROOT/apps/web"
: "${TMPDIR:=/tmp}"
BIN_PATH="$TMPDIR/finances-server"
LOG_DIR="$TMPDIR/finances-logs"

# --- defaults -----------------------------------------------------------------
# bcrypt hash de la password "finances" (dev only)
: "${APP_PASSWORD_HASH:=$2a\$10\$UOnIpxpZaDHM7ps65RZTj.trYBmU6ybIHtz/SAjfR1vmkuKajSEMS}"
: "${GO_BIN:=go}"

# --- args ---------------------------------------------------------------------
TARGET="all"
for arg in "$@"; do
  case "$arg" in
    backend) TARGET="backend" ;;
    web)     TARGET="web" ;;
    all)     TARGET="all" ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "[ERROR] argument desconegut: $arg" >&2; exit 2 ;;
  esac
done

# --- helpers ------------------------------------------------------------------
log()  { printf '\033[1;36m[%(%H:%M:%S)T] %s\033[0m\n' -1 "$*"; }
ok()   { printf '\033[1;32m[%(%H:%M:%S)T] \xe2\x9c\x93 %s\033[0m\n' -1 "$*"; }
warn() { printf '\033[1;33m[%(%H:%M:%S)T] \xe2\x9a\xa0 %s\033[0m\n' -1 "$*" >&2; }
die()  { printf '\033[1;31m[%(%H:%M:%S)T] \xe2\x9c\x97 %s\033[0m\n' -1 "$*" >&2; exit 1; }

# kill anything listening on $1 (defaults to SIGTERM then SIGKILL)
kill_port() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "$port"/tcp 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp "sport = :$port" 2>/dev/null | awk -F'pid=' 'NR>1 {split($2,a,","); print a[1]}' || true)"
  fi
  if [[ -z "$pids" ]]; then
    log "    (ningú escolta a :$port)"
    return 0
  fi
  for pid in $pids; do
    log "    killing PID $pid (port $port)"
    kill "$pid" 2>/dev/null || true
  done
  # SIGKILL als que resisteixin
  sleep 1
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

# espera que $1 estigui escoltant (max $2 segons)
wait_listen() {
  local port="$1"
  local max="$2"
  local elapsed=0
  while (( elapsed < max )); do
    if command -v ss >/dev/null 2>&1; then
      ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN && return 0
    elif command -v lsof >/dev/null 2>&1; then
      lsof -i tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    else
      # fallback: nc -z
      if (echo > "/dev/tcp/127.0.0.1/$port") 2>/dev/null; then return 0; fi
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  warn "el port $port no ha pujat en ${max}s"
  return 1
}

# --- preflight ----------------------------------------------------------------
mkdir -p "$LOG_DIR"

log "=== Finances dev-restart ==="
log "    backend  port 3001  (TARGET=$TARGET)"
log "    web      port 5173"
log "    logs     $LOG_DIR"

# --- backend ------------------------------------------------------------------
if [[ "$TARGET" == "backend" || "$TARGET" == "all" ]]; then
  log "[backend] aturant..."
  kill_port 3001

  log "[backend] compilant..."
  ( cd "$BACKEND_DIR" && "$GO_BIN" build -o "$BIN_PATH" ./cmd/server )
  ok "binari: $BIN_PATH"

  log "[backend] arrencant (logs: $LOG_DIR/backend.log)..."
  (
    cd "$BACKEND_DIR"
    APP_PASSWORD_HASH="$APP_PASSWORD_HASH" \
    PORT="${PORT:-3001}" \
    NODE_ENV=development \
      nohup "$BIN_PATH" >"$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$LOG_DIR/backend.pid"
  )
  wait_listen 3001 15 || true
fi

# --- web ----------------------------------------------------------------------
if [[ "$TARGET" == "web" || "$TARGET" == "all" ]]; then
  log "[web] aturant..."
  kill_port 5173

  log "[web] arrencant (logs: $LOG_DIR/web.log)..."
  (
    cd "$WEB_DIR"
    nohup pnpm dev >"$LOG_DIR/web.log" 2>&1 &
    echo $! > "$LOG_DIR/web.pid"
  )
  wait_listen 5173 20 || true
fi

echo
ok "=== fet ==="
log "    api:   http://localhost:3001/health"
log "    web:   http://localhost:5173"
log "    logs:  $LOG_DIR"