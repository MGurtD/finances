# Proposal: improve-api-testing

## Intent

The API layer (`backend/internal/api/handlers/` + `backend/internal/api/middleware.go`) is the HTTP boundary of the finances backend — every feature reaches the database through it. Today only 5 of 36 handler functions (14%) are tested, and the existing tests duplicate an 18-line cookie auth closure in two files and rebuild per-file mini gin engines. This change raises API-layer coverage to a level that gives confidence in the HTTP boundary — happy paths, error paths, auth, and CORS — by replacing the ad-hoc setups with one shared `testutil` and adopting the table-driven pattern from the `go-testing` skill across every endpoint.

## Scope

### In Scope
- New `backend/internal/api/handlers/testutil.go` — shared `testServer(t, opts...)` helper, cookie login helper, JSON helpers, fixture seeders.
- New `handlers/accounts_test.go` — all 8 funcs (List, Get, Create, Update, Delete, Balances, listScopedByUser).
- New `handlers/categories_test.go` — all 7 funcs (List, Get, Create, Update, Delete, plus seed/in-use edge cases).
- New `handlers/budgets_test.go` — all 5 funcs (upsert unique-by-category-month, list-by-month, delete).
- New `handlers/dashboard_test.go` — `Summary` aggregation correctness.
- New `handlers/health_test.go` — `Health` 200 + JSON shape.
- Extended `handlers/transactions_test.go` — fill the 8 untested CRUD funcs (List/Get/Create/Update/Delete/UpdateCategory/BulkUpdateCategory/BulkDelete; keep existing BulkCreate/BulkDelete coverage).
- Extended `backend/internal/api/middleware_test.go` — `RequireAuth` happy path, missing cookie, invalid JWT, CORS preflight (allowed origin), CORS preflight (disallowed origin), `corsMiddleware` default headers.

### Out of Scope
- No changes to handler logic, middleware logic, or route wiring.
- No new test frameworks (no testify, no gomock, no testify suites). Stdlib `testing` + Gin `httptest` only.
- No new coverage in `internal/db/`, `internal/auth/`, or `internal/apitypes/`.
- No changes to the public HTTP API contract (paths, methods, request/response shapes stay identical).
- No CI integration (still locally run via `go test ./...`).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None — this change is test-infrastructure only. It does not alter any spec-level behavior in `openspec/specs/`. (The `sdd-spec` phase should produce a short note that this change introduces no delta specs.)

## Approach

1. **Shared `testutil`** — `testServer(t, opts...)` returns `(*gin.Engine, *apitypes.Server, func())`. Internally calls `db.Open(":memory:")` + `db.RunMigrations()` + `db.Seed()`, then mounts the **real** `AuthMiddleware` (drops the duplicated inline closure at `auth_test.go:32-50` and `transactions_test.go:60-78`) and wires only the routes the caller needs via route-mount options. Helper `loginAs(t, r, srv, password)` returns the JWT cookie value (parses `Set-Cookie` via `http.Response.Cookies()`, not `strings.Split` — fixes the fragile attr-contains-`=` bug).
2. **Table-driven everywhere** — per `go-testing` decision gate, every handler gets a `[]struct{ name, method, path, body, wantStatus, wantBody }` slice with cases named by **scenario** ("create returns 201 and echoes id", not "POST /accounts with valid body"). Each case is a `t.Run` subtest asserting status, JSON body shape, and DB state when relevant.
3. **Auth + CORS edges** — `middleware_test.go` adds the missing `RequireAuth` happy path (valid cookie → handler runs, `authenticated=true`), plus CORS preflight for allowed origin (echoes `Access-Control-Allow-Origin`), disallowed origin (no CORS headers), and default `corsMiddleware` headers on a normal GET.
4. **Pattern standardization** — every test calls `apitypes.NewServer(...)` (replaces the `auth_test.go:25` struct literal); reuses `db.testDB()` instead of inlining `Open+RunMigrations+Seed`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/internal/api/handlers/testutil.go` | New | Shared test helper (~80 LOC). |
| `backend/internal/api/handlers/*_test.go` | New/Modified | Six files; ~1,570 LOC new test code. |
| `backend/internal/api/middleware_test.go` | Extended | ~50 LOC new test cases. |
| `backend/internal/api/handlers/auth_test.go` | Modified | Replace `testAuthServer` body to call `testutil.testServer` (no semantic change). |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Auth middleware drift between prod and test | Med (inherited) | Tests now mount the real `AuthMiddleware` from `internal/api/middleware.go` — drift eliminated, not just reduced. |
| Fragile `strings.Split` cookie parsing breaks on attr containing `=` | Med (inherited) | `testutil.loginAs` uses `http.Response.Cookies()` — bug fixed. |
| `db.testDB` not reused → divergent fixture setup | Med (inherited) | `testutil.testServer` calls `db.testDB()` — pattern unified. |
| Coverage gain doesn't catch a real bug | Low | RequireAuth + CORS + every status code path covered; strict TDD ensures RED tests exist before any refactor. |
| Test maintenance burden grows | Low | One helper, one pattern; future endpoints drop in with the same table-driven shape. |

## Rollback Plan

Revert the commit. Tests are additive and standalone — no production code path is changed. If a single test file misbehaves, revert only that file; remaining tests continue to run.

## Dependencies

- `github.com/gin-gonic/gin` `httptest` (already in use).
- `internal/db/testDB` helper (exists; will be reused).
- `internal/api/middleware.AuthMiddleware` + `corsMiddleware` (exist; will be mounted directly).

## Success Criteria

- [ ] Every handler function in `backend/internal/api/handlers/*.go` has at least one happy-path and one error-path test.
- [ ] `go test ./backend/...` passes.
- [ ] No duplicated cookie auth closure remains across test files.
- [ ] `RequireAuth` and `corsMiddleware` have dedicated test cases (happy + error + edge).
- [ ] All test files use `apitypes.NewServer(...)` and `db.testDB()` — no struct literal servers, no inlined `Open+RunMigrations+Seed`.

## Size Forecast

- New/extended code: **~1,650 LOC** (handlers/testutil.go ~80 + six *_test.go files + middleware_test.go).
- This **exceeds the 400-line PR review budget** → `sdd-tasks` MUST emit C1 ask-always with chained-PR recommendation. Likely slicing: (P1) `testutil.go` + `health_test.go` + `middleware_test.go`, (P2) `accounts_test.go` + `categories_test.go`, (P3) `budgets_test.go` + `dashboard_test.go`, (P4) `transactions_test.go` gap fill. Each slice is independently green.