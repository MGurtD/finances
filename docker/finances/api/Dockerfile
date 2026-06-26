# ===============================================
# API Dockerfile — Finances
#
# Fast build by leveraging the host's pnpm store and avoiding in-container
# TS compilation. The host runs `scripts/deploy.sh` which:
#   1. Compiles contracts/db/api on the host (cached by source hash).
#   2. Runs `pnpm --filter ./apps/api deploy /deploy/api` to bundle the
#      production node_modules into a self-contained directory.
#   3. Copies that directory + the secret .env.production into this
#      build context. The Dockerfile just glues them into a runtime
#      image — no in-container compile, no in-container pnpm install.
#
# Result: a code-only change rebuilds the image in ~10-20s.
# ===============================================

# Debian-based image (glibc) so the host-prebuilt better-sqlite3 binding
# works without a slow in-container recompile. Trade-off: ~30MB larger
# base image for a much faster deploy.
FROM node:22-bookworm-slim AS runtime

# OpenSSL + libstdc++ for native modules that link against them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget openssl \
 && rm -rf /var/lib/apt/lists/* \
 && addgroup --system --gid 10001 app \
 && adduser  --system --uid 10001 --gid 10001 app

WORKDIR /app

# The deploy script stages the prod bundle at deploy/api/ inside the build
# context (which is the repo root). It also stages .env.production at
# deploy/api/.env, replacing any dev .env that pnpm deploy bundled.
COPY --chown=app:app deploy/api/ ./

# Entrypoint is also overridden from the deploy script's staging.
COPY --chown=app:app docker/finances/api/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh \
 && chmod 600 /app/.env \
 && mkdir -p /app/data \
 && chown -R app:app /app

USER app
WORKDIR /app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:3001/health >/dev/null 2>&1 || exit 1

CMD ["/app/entrypoint.sh"]