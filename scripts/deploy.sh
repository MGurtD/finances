#!/usr/bin/env bash
# Idempotent local deploy for the Finances stack.
#
# Targets the same images that CI publishes to GHCR (see
# .github/workflows/docker-publish.yml):
#   - finances-api:latest ← backend/Dockerfile  (multi-stage, distroless static)
#   - finances-web:latest ← apps/web/Dockerfile (multi-stage, nginx)
#
# Both Dockerfiles do their own in-container build, so this script is
# just: typecheck → pnpm install (lockfile-cached) → docker build
# (git-tree-cached) → docker compose up --force-recreate → healthcheck.
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
HASH_DIR="$REPO_ROOT/.deploy-cache"

API_DOCKERFILE="$REPO_ROOT/backend/Dockerfile"
WEB_DOCKERFILE="$REPO_ROOT/apps/web/Dockerfile"

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
      sed -n '2,28p' "$0"
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

# Hash the current tracked state of a set of paths (relative to REPO_ROOT).
# Two trees with the same paths but different content produce different hashes.
tree_hash() {
  git -C "$REPO_ROOT" ls-files -s -- "$@" \
    | git -C "$REPO_ROOT" hash-object --stdin
}

# --- preflight ------------------------------------------------------------
SCRIPT_T0=$(date +%s)
[[ -d "$COMPOSE_DIR" ]] || die "Missing compose dir: $COMPOSE_DIR"
[[ -f "$ENV_FILE"     ]] || die "Missing $ENV_FILE"
command -v pnpm       >/dev/null || die "pnpm not on PATH"
command -v docker     >/dev/null || die "docker not on PATH"
[[ -f "$API_DOCKERFILE" ]] || die "Missing $API_DOCKERFILE"
[[ -f "$WEB_DOCKERFILE" ]] || die "Missing $WEB_DOCKERFILE"
mkdir -p "$HASH_DIR"
cd "$REPO_ROOT"

# --- typecheck ------------------------------------------------------------
if [[ "$SKIP_TYPECHECK" -eq 0 ]]; then
  step_start "typecheck"
  pnpm typecheck >/tmp/deploy-tc.log 2>&1 || {
    cat /tmp/deploy-tc.log
    die "typecheck failed"
  }
  step_end "typecheck"
fi

# --- pnpm install (only when lockfile or root manifests change) -----------
LOCK_HASH=$(sha256sum "$REPO_ROOT/pnpm-lock.yaml" \
          "$REPO_ROOT/package.json" \
          "$REPO_ROOT/pnpm-workspace.yaml" \
          "$REPO_ROOT/.npmrc" 2>/dev/null | sha256sum | awk '{print $1}')
LAST_LOCK_HASH=$(cat "$HASH_DIR/lock" 2>/dev/null || echo "")
if [[ "$LOCK_HASH" != "$LAST_LOCK_HASH" ]]; then
  step_start "pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile >/tmp/deploy-pi.log 2>&1 || {
    cat /tmp/deploy-pi.log
    die "pnpm install failed"
  }
  echo "$LOCK_HASH" > "$HASH_DIR/lock"
  step_end "pnpm install --frozen-lockfile"
else
  ok "pnpm install (cache hit)"
fi

# --- docker build ---------------------------------------------------------
# We hash the relevant source trees so a no-op push exits early without
# paying for a docker build invocation. Docker's own layer cache still
# kicks in inside the multi-stage Dockerfile when only some layers change.

need_api=0
need_web=0

if [[ "$TARGET" == "api" || "$TARGET" == "all" ]]; then
  CUR_API=$(tree_hash backend)
  LAST_API=$(cat "$HASH_DIR/api" 2>/dev/null || echo "")
  if [[ "$CUR_API" != "$LAST_API" ]]; then
    need_api=1
  else
    ok "build api (cache hit)"
  fi
fi

if [[ "$TARGET" == "web" || "$TARGET" == "all" ]]; then
  CUR_WEB=$(tree_hash apps/web packages package.json pnpm-lock.yaml \
                       pnpm-workspace.yaml tsconfig.base.json \
                       docker/finances/web/nginx.conf)
  LAST_WEB=$(cat "$HASH_DIR/web" 2>/dev/null || echo "")
  if [[ "$CUR_WEB" != "$LAST_WEB" ]]; then
    need_web=1
  else
    ok "build web (cache hit)"
  fi
fi

if [[ "$need_api" -eq 1 ]]; then
  step_start "docker build api"
  docker build -q -t finances-api:latest \
    -f "$API_DOCKERFILE" "$REPO_ROOT" \
    >/tmp/deploy-dba.log 2>&1 \
    || { cat /tmp/deploy-dba.log; die "docker build api failed"; }
  echo "$CUR_API" > "$HASH_DIR/api"
  step_end "docker build api"
fi

if [[ "$need_web" -eq 1 ]]; then
  step_start "docker build web"
  docker build -q -t finances-web:latest \
    -f "$WEB_DOCKERFILE" "$REPO_ROOT" \
    >/tmp/deploy-dbw.log 2>&1 \
    || { cat /tmp/deploy-dbw.log; die "docker build web failed"; }
  echo "$CUR_WEB" > "$HASH_DIR/web"
  step_end "docker build web"
fi

if [[ "$need_api" -eq 0 && "$need_web" -eq 0 ]]; then
  log "no changes — nothing to deploy"
fi

# --- recreate containers --------------------------------------------------
cd "$COMPOSE_DIR"
if [[ "$need_api" -eq 1 || "$TARGET" == "api" ]]; then
  step_start "recreate container: api"
  docker compose up -d --force-recreate --no-deps api >/tmp/deploy-ra.log 2>&1 \
    || { cat /tmp/deploy-ra.log; die "recreate api failed"; }
  step_end "recreate container: api"
fi
if [[ "$need_web" -eq 1 || "$TARGET" == "web" ]]; then
  step_start "recreate container: web"
  docker compose up -d --force-recreate --no-deps web >/tmp/deploy-rw.log 2>&1 \
    || { cat /tmp/deploy-rw.log; die "recreate web failed"; }
  step_end "recreate container: web"
fi

# --- healthcheck ----------------------------------------------------------
# Only wait for containers we actually touched.
WAIT_API=0
WAIT_WEB=0
[[ "$need_api" -eq 1 || "$TARGET" == "api" ]] && WAIT_API=1
[[ "$need_web" -eq 1 || "$TARGET" == "web" ]] && WAIT_WEB=1

if [[ "$WAIT_API" -eq 0 && "$WAIT_WEB" -eq 0 ]]; then
  ok "deploy complete in $(( $(date +%s) - SCRIPT_T0 ))s total (no containers restarted)"
  exit 0
fi

step_start "healthcheck"
HEALTHY=0
for _ in $(seq 1 30); do
  sleep 1
  API_HEALTHY=$(docker inspect --format '{{.State.Health.Status}}' finances-api 2>/dev/null || echo "missing")
  WEB_HEALTHY=$(docker inspect --format '{{.State.Health.Status}}' finances-web 2>/dev/null || echo "missing")
  if [[ "$WAIT_API" -eq 1 && "$API_HEALTHY" != "healthy" ]]; then continue; fi
  if [[ "$WAIT_WEB" -eq 1 && "$WEB_HEALTHY" != "healthy" ]]; then continue; fi
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