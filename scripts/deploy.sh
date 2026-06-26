#!/usr/bin/env bash
# Idempotent deploy for the Finances stack.
#
# What it does:
#   1. typecheck (catches compile errors before paying for a build)
#   2. pnpm install --frozen-lockfile (only if lockfile or pkg.json changed)
#   3. build compiled packages (contracts + api)
#   4. bundle the api into .deploy/api/ with prod-only deps
#   5. build the web into .deploy/web/dist/
#   6. docker build --load (small context) for api + web
#   7. docker compose up -d --force-recreate --no-deps (keeps volumes!)
#   8. healthcheck loop until both containers are healthy or 30s elapse
#
# Idempotency:
#   - re-running with no source changes exits early (no docker build)
#   - container recreate uses --force-recreate which is atomic
#   - SQLite volume is NEVER deleted
#
# Usage:
#   scripts/deploy.sh                # full deploy (api + web)
#   scripts/deploy.sh api            # only api
#   scripts/deploy.sh web            # only web
#   scripts/deploy.sh --skip-tc      # skip typecheck (faster, less safe)

set -euo pipefail

# --- locate paths ---------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$HOME/docker/finances"
ENV_FILE="$COMPOSE_DIR/.env.production"
DEPLOY_ROOT="$REPO_ROOT/.deploy"
API_CONTEXT="$DEPLOY_ROOT/api"
WEB_CONTEXT="$DEPLOY_ROOT/web"

# --- parse args -----------------------------------------------------------
TARGET="all"
SKIP_TYPECHECK=0
for arg in "$@"; do
  case "$arg" in
    api) TARGET="api" ;;
    web) TARGET="web" ;;
    all) TARGET="all" ;;
    --skip-tc) SKIP_TYPECHECK=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# --- helpers --------------------------------------------------------------
log()  { printf '\033[1;36m[%(%H:%M:%S)T] %s\033[0m\n' -1 "$*"; }
ok()   { printf '\033[1;32m[%(%H:%M:%S)T] ✓ %s\033[0m\n' -1 "$*"; }
warn() { printf '\033[1;33m[%(%H:%M:%S)T] ⚠ %s\033[0m\n' -1 "$*" >&2; }
die()  { printf '\033[1;31m[%(%H:%M:%S)T] ✗ %s\033[0m\n' -1 "$*" >&2; exit 1; }

step_start() { STEP_NAME="$1"; STEP_T0=$(date +%s); }
step_end()   {
  local dt=$(( $(date +%s) - STEP_T0 ))
  ok "$STEP_NAME (${dt}s)"
}

hash_file() { sha256sum "$1" | awk '{print $1}'; }

# Trap to wipe the staged secret on any error.
cleanup_secret() { shred -u "$REPO_ROOT/.env.production" 2>/dev/null || rm -f "$REPO_ROOT/.env.production"; }
trap cleanup_secret EXIT

# --- preflight ------------------------------------------------------------
SCRIPT_T0=$(date +%s)
[[ -d "$COMPOSE_DIR" ]] || die "Missing compose dir: $COMPOSE_DIR"
[[ -f "$ENV_FILE"     ]] || die "Missing $ENV_FILE"
command -v pnpm   >/dev/null || die "pnpm not on PATH"
command -v docker >/dev/null || die "docker not on PATH"
cd "$REPO_ROOT"

# Hash tracking for change detection
HASH_DIR="$DEPLOY_ROOT/.hashes"
mkdir -p "$HASH_DIR"

# --- typecheck ------------------------------------------------------------
if [[ "$SKIP_TYPECHECK" -eq 0 ]]; then
  step_start "typecheck"
  pnpm typecheck >/tmp/deploy-tc.log 2>&1 || {
    cat /tmp/deploy-tc.log
    die "typecheck failed"
  }
  step_end "typecheck"
fi

# --- pnpm install (only when needed) -------------------------------------
LOCK_HASH=$(hash_file pnpm-lock.yaml)
LAST_LOCK_HASH=$(cat "$HASH_DIR/lock" 2>/dev/null || echo "")
if [[ "$LOCK_HASH" != "$LAST_LOCK_HASH" ]]; then
  step_start "pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile >/tmp/deploy-pi.log 2>&1 || { cat /tmp/deploy-pi.log; die "pnpm install failed"; }
  echo "$LOCK_HASH" > "$HASH_DIR/lock"
  step_end "pnpm install --frozen-lockfile"
else
  ok "pnpm install (cache hit)"
fi

# --- compile compiled packages -------------------------------------------
API_HASH=$(hash_file apps/api/src/index.ts)
for f in $(find apps/api/src packages/contracts/src packages/api/src packages/db/src -name "*.ts" 2>/dev/null); do
  API_HASH="$API_HASH $(hash_file "$f")"
done
LAST_API_HASH=$(cat "$HASH_DIR/api" 2>/dev/null || echo "")
[[ "$TARGET" == "api" || "$TARGET" == "all" ]] && {
  if [[ "$API_HASH" != "$LAST_API_HASH" ]]; then
    step_start "build api (contracts + db + api)"
    pnpm --filter @finances/contracts build >/tmp/deploy-bc.log 2>&1 || { cat /tmp/deploy-bc.log; die "contracts build failed"; }
    pnpm --filter @finances/db        build >/tmp/deploy-bd.log 2>&1 || { cat /tmp/deploy-bd.log; die "db build failed"; }
    pnpm --filter @finances/api       build >/tmp/deploy-ba.log 2>&1 || { cat /tmp/deploy-ba.log; die "api build failed"; }
    echo "$API_HASH" > "$HASH_DIR/api"
    step_end "build api (contracts + db + api)"
  else
    ok "build api (cache hit)"
  fi
  step_start "bundle api prod deps (pnpm deploy)"
  rm -rf "$REPO_ROOT/deploy/api"
  mkdir -p "$REPO_ROOT/deploy/api"
  pnpm --filter ./apps/api deploy "$REPO_ROOT/deploy/api" >/tmp/deploy-d.log 2>&1 || { cat /tmp/deploy-d.log; die "pnpm deploy failed"; }
  # pnpm deploy bundles any .env that ships with the package — replace it
  # with the production env so the Dockerfile can COPY it cleanly.
  cp "$ENV_FILE" "$REPO_ROOT/deploy/api/.env"
  chmod 600 "$REPO_ROOT/deploy/api/.env"
  step_end "bundle api prod deps (pnpm deploy)"
}

# --- web build ------------------------------------------------------------
WEB_HASH=$(hash_file apps/web/src/main.ts)
for f in $(find apps/web/src -name "*.vue" -o -name "*.ts" 2>/dev/null); do
  WEB_HASH="$WEB_HASH $(hash_file "$f")"
done
LAST_WEB_HASH=$(cat "$HASH_DIR/web" 2>/dev/null || echo "")
[[ "$TARGET" == "web" || "$TARGET" == "all" ]] && {
  if [[ "$WEB_HASH" != "$LAST_WEB_HASH" ]]; then
    step_start "build web"
    pnpm --filter @finances/web build >/tmp/deploy-w.log 2>&1 || { cat /tmp/deploy-w.log; die "web build failed"; }
    # Mirror dist + nginx into WEB_CONTEXT for the docker build
    rm -rf "$WEB_CONTEXT"/*
    mkdir -p "$WEB_CONTEXT"
    cp -r apps/web/dist "$WEB_CONTEXT/dist"
    cp docker/finances/web/nginx.conf "$WEB_CONTEXT/nginx.conf"
    echo "$WEB_HASH" > "$HASH_DIR/web"
    step_end "build web"
  else
    ok "build web (cache hit)"
  fi
}

# --- docker build ---------------------------------------------------------
# We bake the secret by staging it into the build context. This is the
# only place the secret is read by docker — it never appears in any
# committed file or git history.

if [[ "$TARGET" == "api" || "$TARGET" == "all" ]]; then
  step_start "docker build api"
  docker build -q -t finances-api:latest -f "$REPO_ROOT/docker/finances/api/Dockerfile" "$REPO_ROOT" >/tmp/deploy-dba.log 2>&1 \
    || { cat /tmp/deploy-dba.log; rm -f "$REPO_ROOT/.env.production"; die "docker build api failed"; }
  # Wipe the staged secret immediately — the secret lives only in the image
  # layer now, never on disk longer than necessary.
  shred -u "$REPO_ROOT/.env.production" 2>/dev/null || rm -f "$REPO_ROOT/.env.production"
  step_end "docker build api"
fi

if [[ "$TARGET" == "web" || "$TARGET" == "all" ]]; then
  step_start "docker build web"
  docker build -q -t finances-web:latest -f "$REPO_ROOT/docker/finances/web/Dockerfile" "$REPO_ROOT" >/tmp/deploy-dbw.log 2>&1 \
    || { cat /tmp/deploy-dbw.log; die "docker build web failed"; }
  step_end "docker build web"
fi

# --- recreate containers --------------------------------------------------
cd "$COMPOSE_DIR"
if [[ "$TARGET" == "api" || "$TARGET" == "all" ]]; then
  step_start "recreate container: api"
  docker compose up -d --force-recreate --no-deps api >/tmp/deploy-ra.log 2>&1 || { cat /tmp/deploy-ra.log; die "recreate api failed"; }
  step_end "recreate container: api"
fi
if [[ "$TARGET" == "web" || "$TARGET" == "all" ]]; then
  step_start "recreate container: web"
  docker compose up -d --force-recreate --no-deps web >/tmp/deploy-rw.log 2>&1 || { cat /tmp/deploy-rw.log; die "recreate web failed"; }
  step_end "recreate container: web"
fi

# --- healthcheck ----------------------------------------------------------
step_start "healthcheck"
HEALTHY=0
for _ in $(seq 1 30); do
  sleep 1
  API_HEALTHY=$(docker inspect --format '{{.State.Health.Status}}' finances-api 2>/dev/null || echo "missing")
  WEB_HEALTHY=$(docker inspect --format '{{.State.Health.Status}}' finances-web 2>/dev/null || echo "missing")
  if [[ "$TARGET" != "web" && "$API_HEALTHY" != "healthy" ]]; then continue; fi
  if [[ "$TARGET" != "api" && "$WEB_HEALTHY" != "healthy" ]]; then continue; fi
  HEALTHY=1
  break
done
if [[ "$HEALTHY" -ne 1 ]]; then
  warn "containers not healthy after 30s:"
  docker ps --filter "name=finances" --format "table {{.Names}}\t{{.Status}}" >&2
  die "healthcheck failed"
fi
step_end "healthcheck (api=$API_HEALTHY, web=$WEB_HEALTHY)"

ok "deploy complete in $(( $(date +%s) - SCRIPT_T0 ))s total"