# AGENTS.md

Repo guide for OpenCode sessions. Only facts that took digging to find.

## Quick start

```bash
pnpm install
cd backend && go run ./cmd/server     # gin :3001 (WAL SQLite, JWT cookie)
cd apps/web && pnpm dev               # vite :5173 (proxies /api + /health)
```

Open `http://localhost:5173/login`. Backend Swagger UI: `http://localhost:3001/swagger/index.html`.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vue 3 + Vite + Pinia + TanStack Query + openapi-fetch | `apps/web` |
| Design system | `@finances/ui` | raw src, no build |
| Backend | Go 1.26 + Gin + sqlite (modernc.org, no CGO) | `backend/go.mod` |
| API contract | swaggo → `swagger.json` → `swagger2openapi` → `openapi-typescript` → `schema.d.ts` | generated |
| Auth | cookie `finances_session` (JWT, HttpOnly, SameSite=Strict) | `backend/internal/auth/` |
| Node | 22 LTS | `.nvmrc` |
| Tests | Go `go test`; web `vitest run` | `apps/web/tests/` |

## How to explore this repo

**Use codegraph first.** Indexed (102 files, 1163 nodes, 2322 edges; `go`+`typescript`+`vue`+`yaml`) — answers most "how does X work" questions in one call.

- `codegraph_context({ task: "..." })` — default for "how does this work".
- `codegraph_explore({ query: "Symbols Files" })` — several related symbols with source.
- `codegraph_trace({ from: "...", to: "..." })` — call path (e.g. router → handler → store → SQL).
- `codegraph_search` / `codegraph_callers` / `codegraph_callees` — narrower lookups + impact analysis.
- `codegraph_status` — verify the index before trusting results.

Codegraph replaces directory layouts, dependency diagrams, and hand-traced call chains. **Do not write layouts in this file** — they go stale fast in dev. Point at codegraph instead.

Fall back to `Grep` / `Glob` / `Read` only for: free-form regex, non-indexed files, prose docs.

## Architecture (where things live)

- **Browser** → `apps/web/src/views/` (Vue 3 SPA) → Pinia stores + `composables/queries.ts` (Vue Query) → `apps/web/src/api/client.ts` (openapi-fetch).
- **Vite dev server** proxies `/api` and `/health` to `:3001`. In prod, nginx in `docker/finances/web/nginx.conf` does the same.
- **Go server** entry is `backend/cmd/server/main.go`. Wires `apitypes.Server` + `db.Open()` + migrations + seed → `api.RegisterRoutes(...)`.
- **Routes** are in `backend/internal/api/routes.go`. Handlers in `internal/api/handlers/<resource>.go`. Data access in `internal/db/<resource>.go`.
- **SQLite** via `modernc.org/sqlite` (pure Go, no CGO), WAL + `foreign_keys=ON`. Migrations in `internal/db/migrations/` embedded with `//go:embed`.
- **API contract** is the OpenAPI spec. Go is source of truth → swaggo generates `swagger.json` → web generates `schema.d.ts`.

Use `codegraph_trace` for any "how does request X reach the DB" question.

## Backend

- Money = integer cents everywhere. No float math. Never divide by 100 in middleware.
- Booleans are `INTEGER 0/1` in SQLite. `models.BoolInt` marshals to JSON `true`/`false`. Don't introduce a second way.
- Handlers import `internal/apitypes` for `*Server`, NOT `internal/api` — keeps `Server`/`Config` out of the cycle with `routes.go`. Don't move them.
- No ORM. `database/sql` + handwritten SQL. Each resource file owns its queries.
- ENUMs are `CHECK` constraints, not lookup tables.
- Indexes: every FK column, plus `transactions(account_id, date)` composite for monthly queries, `budgets(category_id, month)` unique for upsert.

## Frontend

- API calls go through `apps/web/src/api/client.ts` and the typed wrappers in `composables/queries.ts`. The `get/post/put/patch/del` helpers there cast through `unknown` because openapi-fetch v0.17 types `data` as a Svelte Readable — runtime value is the JSON body. Keep the cast pattern.
- Mutations call `qc.invalidateQueries({ queryKey: [...] })` in `onSuccess`. Invalidate the resource key AND any aggregation that reads it (`['dashboard']`, `['budgets']`, `['accountBalances']`).
- Router guard: `apps/web/src/router/index.ts:54` calls `/auth/status` once, redirects to `/login` on miss. Public routes set `meta: { public: true }`.
- Money helpers: `formatMoney` / `parseMoneyInput` from `@finances/ui`. Locale defaults to `ca-ES`.
- Strict TS (`noUncheckedIndexedAccess`): `string.split('-').map(Number)` is `number | undefined`. Guard explicitly — `useMonth.ts:22-39` is the canonical pattern.
- Orphan deps still listed: `@trpc/server`, `@trpc/client`, `superjson` (left from prior stack). Safe to delete.

## Auth and cookies

- Cookie `finances_session` set by `backend/internal/auth/cookie.go:14`. `HttpOnly; SameSite=Strict`, `Secure` only when `NODE_ENV=production`, `Max-Age=7d`.
- JWT signed with `APP_JWT_SECRET` (HS256). `middleware.go:36` `AuthMiddleware` verifies; `RequireAuth()` returns 401 on miss.
- `RequireAuth` wraps the `protected` route group in `routes.go`. Public: `/health`, `/auth/{login,logout,status}`.
- Password = bcrypt. Hash in `APP_PASSWORD_HASH`. Never log it.
- Login rate limiter: `internal/auth/ratelimit.go` (in-memory).

## Database

- Driver `modernc.org/sqlite`, no CGO.
- Path `DATABASE_URL ?? './data/finances.db'` (auto-created on startup, `data/` is gitignored).
- Startup order in `cmd/server/main.go`: `db.Open()` → `db.RunMigrations()` → `db.Seed()`. Seed is idempotent — only inserts when accounts/categories are empty.
- Schema source: `backend/internal/db/migrations/0001_init.sql`. New migrations: `NNNN_xxx.sql`, auto-picked up by `//go:embed migrations/*.sql` in `migrate.go`.

## API contract (regenerating types)

After editing handlers with `@Router` / `@Param` / `@Success`:

```bash
cd backend && swag init -g cmd/server/main.go -o internal/docs
pnpm gen:api        # swagger2openapi + openapi-typescript → apps/web/src/api/schema.d.ts
pnpm typecheck      # canary
```

The hand-written `apps/web/src/api/types.ts` carries the domain interfaces used by stores/views. Keep it in sync with Go struct `json:` tags.

Run `git config core.hooksPath .githooks` once after cloning — the pre-push hook will refuse to push if `apps/web/src/api/schema.d.ts` is out of date relative to `backend/internal/api/handlers/*.go` (regenerates, stages, aborts push so the diff can be reviewed and committed).

## Environment variables (backend)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | |
| `CORS_ORIGIN` | `http://localhost:5173` | set in prod |
| `NODE_ENV` | unset | drives log level + `Secure` cookie flag |
| `DATABASE_URL` | `./data/finances.db` | SQLite path |
| `APP_JWT_SECRET` | `unsafe-dev-secret-change-me` | **set in prod** |
| `APP_PASSWORD_HASH` | dev fallback | **set in prod** — bcrypt hash |

`.env.example` at `backend/.env.example`.

## Deploy

Canonical path: `scripts/deploy.sh`. Idempotent — re-runs with no source changes exit early.

Order: typecheck → `pnpm install --frozen-lockfile` (only on lockfile change) → build compiled packages (hash-tracked) → `pnpm --filter ./apps/api deploy` to bundle prod-only deps → `pnpm --filter @finances/web build` → `docker build` for api + web → `docker compose up -d --force-recreate --no-deps` → 30s healthcheck.

Compose file lives at `$HOME/docker/finances/` (not committed). Dockerfiles in `docker/finances/{api,web}/`.

`dev-start.cmd` (root) is **stale** — references `apps/api` which no longer exists.

## Tests

```bash
cd backend && go test ./...              # conn, migrate, seed, stores, models, auth, middleware, handlers
pnpm --filter @finances/web test         # autoCategorize, importParsers (CSV/OFX with fixture)
```

Vitest config: `apps/web/vite.config.ts` — `environment: 'node'`, `include: ['tests/**/*.test.ts']`. No integration / e2e tests.

## Cookbook

| Task | Steps |
|---|---|
| Add a REST endpoint | handler in `backend/internal/api/handlers/<resource>.go` + route in `routes.go` + `@Router` swaggo annotation + `pnpm gen:api` |
| Add a Vue view | entry in `apps/web/src/router/index.ts` + `src/views/<Name>.vue` + wrapper in `queries.ts` if it needs data |
| Add a DB column | new `NNNN_xxx.sql` migration + matching Go struct in `models/models.go` + matching field in `apps/web/src/api/types.ts` + `pnpm gen:api` |
| Verify before push | `pnpm typecheck && cd backend && go test ./... && pnpm --filter @finances/web test` |

## Conventions

- **Language:** UI strings, README, code identifiers in English. Catalan for user-facing copy is fine (dashboard mixes `Compte corrent`, `Estalvi net`). Keep code comments technical, not Catalan.
- **JSON ↔ TS field names:** `accountId`, `categoryId`, `createdAt`, `importHash`, `transferAccountId`. Camel case, no abbreviations. Sync with Go `json:` tags.
- **Vue:** Composition API + `<script setup lang="ts">`. Tailwind tokens via CSS vars in `packages/ui/src/styles/tokens.css`.
- **Go:** stdlib `database/sql` + handwritten SQL. No ORM. Queries live next to their resource.

## Missing or incomplete

**Missing (do not assume):**
- No linter / formatter / pre-commit. Root `pnpm lint` is no-op. Run `gofmt` manually.
- No GitHub Actions / CI. Tests + typecheck run locally.
- No Vitest coverage.
- No end-to-end tests (web ↔ live API).

**Stale — fix when you touch them:**
- `dev-start.cmd` references `apps/api` (no longer exists). Backend is `backend/cmd/server`.
- `README.md` describes the prior Fastify + tRPC + Drizzle stack. Does not reflect current Go + OpenAPI architecture.
- Root has stray `web/` and `ui/` directories (residue of the old scaffold). Not in `pnpm-workspace.yaml` — safe to delete.
- `tmp-web.log` in root from `dev-start.cmd`. Safe to delete.

## Not in this repo

- Drizzle, better-sqlite3, tRPC, Fastify, Zod, the pnpm `contracts` package — all replaced by Go + OpenAPI.
- Hand-maintained TS API types in a shared package — types live in `apps/web/src/api/{schema.d.ts,types.ts}` and Go struct tags.
- ESLint / Prettier config files.