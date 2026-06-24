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
  contracts/    # Zod schemas (shared)
  ui/           # Design system + base components
  db/           # Drizzle schema + migrations
```

## Design principles

1. 5-second dashboard comprehension
2. Zero hidden options
3. Privacy first (self-hosted)
4. Good defaults, zero config to start
