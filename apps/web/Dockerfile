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
 && pnpm install --frozen-lockfile

# Source.
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

# Build only the web workspace. vite emits to apps/web/dist.
RUN pnpm --filter @finances/web build

# ===============================================
# Runtime — nginx-unprivileged (nginx user, uid 101, port 8080)
# ===============================================
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/finances/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

USER nginx