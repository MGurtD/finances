# Finances

Self-hosted personal finance app. Warm, calm, fast.

## Stack

- Frontend: Vue 3 + Vite + Tailwind + shadcn-vue
- Backend: Fastify + tRPC + Drizzle
- DB: SQLite (better-sqlite3)
- Monorepo: pnpm workspaces

## Development

```bash
pnpm install
pnpm dev          # Runs web + api in parallel
pnpm typecheck
```

## Structure

```
apps/
  web/          # Vue 3 SPA
  api/          # Fastify + tRPC server
packages/
  api/          # AppRouter type (shared)
  contracts/    # Zod schemas (shared)
  ui/           # Design system + base components
  db/           # Drizzle schema + migrations
```

## Verified (Task 11)

- ✅ `pnpm install` — 273 packages, workspace links resolved
- ✅ `pnpm typecheck` — 0 errors across 7 workspaces
- ✅ `pnpm build` (web) — 182 modules, 46.93 kB gzip
- ✅ API `GET /health` → `{"status":"ok"}`
- ✅ API `GET /trpc/health.get` → returns Health via superjson
- ✅ Web `http://localhost:5173/` → 200 OK, SPA loads
- ✅ Web `/trpc/*` proxied to API

## Design principles

1. 5-second dashboard comprehension
2. Zero hidden options
3. Privacy first (self-hosted)
4. Good defaults, zero config to start

## Docker / CI

Docker images are built and published to GitHub Container Registry on every push via `.github/workflows/docker-publish.yml`. Multi-stage builds run entirely inside the container — no host bundle, no in-host `pnpm install`. The API image is `gcr.io/distroless/static-debian12:nonroot` (~2 MB base, runs as uid 65532). The web image is `nginxinc/nginx-unprivileged:1.27-alpine` on port 8080.

### Build locally

```bash
# API — distroless static, no shell, no healthcheck inside.
docker build -f backend/Dockerfile -t finances-api:dev .

# Web — nginx-unprivileged, listens on :8080.
docker build -f apps/web/Dockerfile -t finances-web:dev .
```

### Pull from GHCR

```bash
docker pull ghcr.io/mgurtd/finances-api:main
docker pull ghcr.io/mgurtd/finances-web:main
```

### Tag policy

| Trigger | Image tags |
|---|---|
| push to `main` | `main`, `sha-<short>`, `latest` |
| push to `dev` | `dev`, `sha-<short>` (no `latest`) |
| push tag `v1.2.3` | `1`, `1.2`, `1.2.3`, `v1`, `v1.2`, `v1.2.3`, `sha-<short>`, `latest` (only if from `main`) |
| pull request | built for validation, **never published** |

`latest` is reserved for `main` and always tracks the most recent successful build there — pin to a digest or semver tag for anything you want to keep stable.

### Secrets

None beyond the default `secrets.GITHUB_TOKEN` already granted to every workflow run (`packages: write`). No PAT, no deploy keys, no OIDC.
