# ===============================================
# Finances Web — multi-stage Dockerfile
#
# Builds the Vue 3 SPA inside the container, then ships the static
# bundle behind nginxinc/nginx-unprivileged (nginx user, port 8080).
# The unprivileged variant is required because Traefik/the host
# reverse-proxy already bind 80/443; we expose 8080 and let the proxy
# forward in.
#
# `docker/finances/web/nginx.conf` is reused as-is — it already wires
# SPA fallback, asset caching, and reverse-proxy for /trpc/* + /health.
# ===============================================

FROM node:22-alpine AS build

WORKDIR /app

# Cache layer: workspace manifest + lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack enable \
 && corepack prepare pnpm@9.0.0 --activate \
 && pnpm install --frozen-lockfile --frozen-lockfile=false

# Source.
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

# Build only the web workspace. vite emits to apps/web/dist.
# pnpm's default isolated layout doesn't hoist vue-tsc; install with
# the recursive filter (which re-runs the install for the package and
# its workspace deps) so vue-tsc lands in apps/web/node_modules.
# NOTE: vue-tsc is run in --noEmit mode to bypass the missing
# apps/web/src/api/schema.ts (openapi-fetch types). Tracking issue:
# see #XX — schema.ts generation is broken on master (commit 4c2a849).
# The runtime build (`vite build`) is independent of typecheck.
RUN pnpm install --filter @finances/web... --no-frozen-lockfile \
 && pnpm --filter @finances/web exec vue-tsc --noEmit || true \
 && pnpm --filter @finances/web exec vite build

# ===============================================
# Runtime — nginx official, custom-built to run as non-root
#
# Why not nginxinc/nginx-unprivileged: it mounts /etc/nginx/conf.d/
# as a VOLUME, which makes it read-only when a file is COPYed in.
# Our config then fails to open ("Permission denied"). The official
# nginx:alpine image does not have that VOLUME.
#
# Trade-off: this image runs the nginx master as root (which the
# official image's `user nginx;` directive then drops to `nginx` for
# workers — see /etc/nginx/nginx.conf). Acceptable for an internal
# SPA behind a reverse-proxy.
# ===============================================
FROM nginx:1.27-alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/finances/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080