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
