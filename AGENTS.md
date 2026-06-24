# AGENTS.md

Concise repo guide for OpenCode sessions. Only facts that took digging to find.

## Stack

- pnpm workspaces (Node >=22, pnpm 9). Workspaces: `apps/*`, `packages/*`.
- Apps: `web` (Vue 3 + Vite + Pinia + TanStack Query), `api` (Fastify + tRPC 11 + Drizzle + better-sqlite3).
- Packages: `contracts` (Zod schemas, compiled), `db` (raw src, Drizzle client), `ui` (raw src, Vue 3 + Tailwind + reka-ui), `api` (AppRouter type mirror, compiled — see warning below).
- No test framework, no linter, no formatter, no CI, no pre-commit hooks. The root `pnpm lint` is a no-op (no workspace defines a `lint` script).

## Commands

```bash
pnpm install                # required first step
pnpm dev                    # runs web (5173) + api (3001) in parallel
pnpm typecheck              # tsc/vue-tsc across all workspaces; the only real verification
pnpm build                  # builds everything; note compiled packages below
pnpm --filter @finances/web dev          # one app only
pnpm --filter @finances/api typecheck   # one package only
```

After editing code in compiled packages, rebuild them or web/api will not see the changes:
```bash
pnpm --filter @finances/contracts build
pnpm --filter @finances/api build
```

## Critical: two packages named `@finances/api`

There are TWO distinct packages with the same name. Confusing them breaks the build.

| Path | Purpose | Runtime? |
|---|---|---|
| `apps/api` | The actual Fastify + tRPC server (`src/index.ts` → port 3001) | Yes |
| `packages/api` | Type-only mirror of the AppRouter for the web client | **Types only** |

Boundary rule (from `packages/api/src/index.ts`):
- `apps/web` imports `import type { AppRouter } from '@finances/api'` for types only.
- The runtime tRPC client lives at `apps/web/src/trpc/client.ts`.
- `apps/api` does NOT import the `packages/api` package — it defines its own router.

## Critical: AppRouter is manually mirrored

`packages/api/src/index.ts` explicitly states the router is "Mantingut sincronitzat manualment fins que tRPC ofereixi typegen automàtic cross-package."

When you add or change a tRPC procedure in `apps/api/src/trpc/router.ts` or `apps/api/src/routers/*`, you MUST mirror the same shape in `packages/api/src/index.ts`. Then rebuild `packages/api`. Forgetting this breaks web type inference silently.

## Package types — compiled vs raw

- Compiled (`main: dist/index.js`, requires `pnpm build` before consumers see changes):
  - `@finances/contracts`
  - `@finances/api` (the packages/ one)
- Raw source (`main: src/index.ts`, no build step):
  - `@finances/db`
  - `@finances/ui`

`@finances/ui` also exports `./styles/*` — web imports `@finances/ui/styles/tokens.css` and `@finances/ui/styles/base.css` for design tokens.

## Database

- SQLite via `better-sqlite3` at `process.env.DATABASE_URL ?? './data/finances.db'`. `data/` is gitignored and auto-created at startup.
- Drizzle wrapper at `packages/db/src/client.ts` with WAL mode and `foreign_keys = ON`.
- `drizzle-kit` is installed but **not yet wired**: no `drizzle.config.ts`, no schema files, no migrations folder exist. Adding schema/migrations is open work — search the repo before assuming it's there.

## API endpoints

- `GET /health` → `{ status: 'ok' }` (Fastify direct route)
- `GET /trpc/health.get` → full `Health` payload via tRPC (superjson-transformed)
- tRPC mount prefix is `/trpc`. Procedures: `apps/api/src/trpc/router.ts` mounts `apps/api/src/routers/*.ts`.
- CORS default origin: `http://localhost:5173`. Override with `CORS_ORIGIN`.
- Vite dev proxy (`apps/web/vite.config.ts`) forwards `/trpc` and `/health` to `http://localhost:3001`.

## Environment variables (api)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | |
| `CORS_ORIGIN` | `http://localhost:5173` | |
| `NODE_ENV` | — | Drives Fastify log level |
| `DATABASE_URL` | `./data/finances.db` | SQLite path |

`.env.example` lives at `apps/api/.env.example`.

## Docker (partially set up)

`docker/finances/web/nginx.conf` exists and proxies `/trpc/*` and `/health` to the `api` service on port 3001, plus SPA fallback. **No Dockerfile and no docker-compose.yml yet** — the deploy pipeline is incomplete. Don't claim "docker works" without checking.

## Repo conventions worth knowing

- Spanish/Catalan team context: comments in `packages/api/src/index.ts` are in Catalan. UI strings, README, and code identifiers are English — keep new artifacts in English.
- Web uses `@/` alias for `./src/*` (Vite + tsconfig).
- API uses `.js` extensions on relative TS imports (`./server.js`) — required by `moduleResolution: "Bundler"`.
- Root `tsconfig.base.json` enables `noUncheckedIndexedAccess` and `noImplicitOverride` — strict by default.
- No AGENTS.md existed before this file. No `opencode.json`, no `.cursorrules`, no `.github/`.

## Things explicitly NOT in this repo (do not assume)

- No tests. Do not run `pnpm test` — it does not exist.
- No ESLint / Prettier config. The `pnpm lint` script exists at root but no workspace defines `lint`.
- No GitHub Actions / CI.
- No schema or migrations for Drizzle despite the README claiming Drizzle as the ORM.