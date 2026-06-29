# Specs: improve-api-testing

## Why this change has no delta specs

The proposal declares **zero new capabilities** and **zero modified capabilities**. Nothing under `backend/internal/api/handlers/`, `backend/internal/api/middleware.go`, or any other production path changes behavior. This change is purely test-infrastructure: a shared `testutil` helper plus the test files themselves.

In OpenSpec terms, "no new/modified capabilities" means there is nothing to `## ADDED Requirements` or `## MODIFIED Requirements`. The test files are the executable specification — they assert the existing behavior of every handler, middleware, and route.

The numbered list below is the **test coverage acceptance contract**. Each item is a behavioral statement the test suite must prove. Every `sdd-verify` check on this change MUST walk this list.

## Coverage acceptance criteria

1. **Auth closure is single-sourced.** The 18-line cookie-auth closure currently duplicated at `backend/internal/api/handlers/auth_test.go:32-50` and `backend/internal/api/handlers/transactions_test.go:60-78` MUST be removed. After this change, only ONE definition of that closure exists in the entire `backend/` tree, and it is the production `api.AuthMiddleware` in `backend/internal/api/middleware.go:36`. No test file may re-declare it.

2. **Cookie extraction uses `http.Response.Cookies()`.** Any test helper that reads the `finances_session` value from a `*httptest.ResponseRecorder` MUST use the `(*http.Response).Cookies()` accessor (or, on a recorder, the equivalent `Result().Cookies()` path). String splitting on `;` or `=` against the raw `Set-Cookie` header is forbidden — that was the bug fixed by this change.

3. **Every handler function has a happy-path test and an explicit failure-path test.** Coverage target = 100% of the 36 handler methods across `accounts.go` (8), `categories.go` (7), `budgets.go` (5), `transactions.go` (11), `auth.go` (3), `dashboard.go` (1), `health.go` (1). For each method the test suite MUST assert (a) the documented 2xx success status + JSON shape and (b) at least one documented failure (4xx/5xx + `models.ErrorResponse` JSON shape). Concrete examples the suite must lock down:
   - `GET /api/accounts/{id}` for a missing id returns `404` with `{ "error": "account not found" }`.
   - `POST /api/accounts` with malformed JSON returns `400` with `{ "error": "invalid request" }`.
   - `DELETE /api/accounts/{id}` for a non-existent id returns `404` with `{ "error": "account not found" }`.
   - `POST /api/transactions/bulk-delete` with an empty `ids` array returns `400`; with non-existent ids returns `200` and `deleted: 0`; with valid ids returns `200` and `deleted: N`.
   - `POST /api/transactions/bulk` re-importing the same `importHash` set returns `200` with `{ "inserted": 0, "skipped": N }`.
   - `POST /api/auth/login` with the correct password returns `200`, sets a `Set-Cookie: finances_session=...` header, and `authenticated: true`; with a wrong password returns `401` and clears the cookie (`Max-Age=0`); with no password returns `400`.
   - `GET /health` returns `200` with `{"status":"ok"}`.
   - `GET /api/dashboard/summary` returns `200` and a non-empty JSON object.

4. **`RequireAuth` happy path is covered.** A test MUST exercise the `protected` route group end-to-end with a valid `finances_session` cookie and assert `200`. This is what proves the middleware chain (CORS → AuthMiddleware → RequireAuth → handler) composes correctly — something the per-handler tests do NOT prove on their own when each file mounts its own minimal router.

5. **`RequireAuth` failure paths are covered.** Separate tests MUST prove: (a) a request with no cookie returns `401` with `{ "error": "unauthorized" }`, (b) a request with an invalid JWT returns `401`, (c) a request with an expired JWT returns `401`.

6. **CORS handles three origin states.** Distinct test cases MUST assert: (a) request with no `Origin` header completes normally with no `Access-Control-Allow-Origin` echo, (b) request with the allowed origin (`http://localhost:5173` by default) returns `Access-Control-Allow-Origin: http://localhost:5173` and `Access-Control-Allow-Credentials: true`, (c) request with a disallowed origin (e.g. `http://evil.example`) does NOT echo the disallowed origin in the response headers.

7. **Table-driven structure for multi-scenario tests.** Every test that exercises more than one input/output combination MUST follow the `go-testing` skill decision gate: a named struct slice (`cases := []struct{ name string; ... }{ ... }`) iterated with `t.Run(tt.name, func(t *testing.T) { ... })`. Existing tests in `transactions_test.go` (`TestBulkDelete_HTTP`, `TestBulkCreate_HTTP`) are the canonical shape and MUST be replicated across `accounts_test.go`, `categories_test.go`, `budgets_test.go`, `dashboard_test.go`, and `middleware_test.go`. Single-case tests (e.g. `Health`) MAY use a flat `TestX` without `t.Run`.

8. **Shared test helper is used everywhere.** Every `*_test.go` file under `backend/internal/api/handlers/` MUST construct its test engine via the shared `testutil` helper — no per-file `gin.New()` + `r.Use(...)` setups, no struct-literal `&apitypes.Server{...}`, no inlined `db.Open + RunMigrations + Seed`. The canonical construction sequence is `testServer(t)` (or the equivalent exported symbol) → optionally `login(t, r)` for cookie → optionally a fixture seeder.

9. **`db.testDB` is the canonical DB factory.** All handler tests MUST obtain their `*db.Store` from `db.testDB(t)` (defined at `backend/internal/db/helpers_test.go:10`). This guarantees migrations + seed run identically to every other test in the repo and that `t.Cleanup` closes the connection.

10. **Real `apitypes.NewServer` construction.** Tests MUST build the server via `apitypes.NewServer(store, apitypes.Config{...})` with a deterministic bcrypt hash (`$2a$10$0/uPukIQ0ewWCbc/qrCk3OuY9fYa..NrOU3UwgtUPw0M1OBTHrENq`, matching the value already used in the existing tests), a fixed `JWTSecret`, and a fresh `auth.NewRateLimiter()`. Direct struct-literal servers that bypass the constructor are forbidden.

11. **The full protected route table is reachable from tests.** `testServer` MUST mount the protected routes via the real `api.RegisterRoutes(engine, srv)` — not a hand-rolled subset — so that adding a new protected route in `routes.go` is automatically testable without touching `testutil`. The only allowed exception is a public-routes-only variant (for the auth/login flow), exposed via an option flag.

12. **`go test ./backend/...` passes.** Final acceptance gate: `cd backend && go test ./...` exits 0 with no skipped tests outside `testing.Short()` opt-ins.

## Test-helper contract (`internal/api/handlers/testutil.go`)

Pseudocode signature, not a real Go file — `sdd-design` will refine the body:

```go
package handlers

// testServer builds a gin.Engine wired with:
//   - db.testDB(t) (in-memory SQLite, migrations + seed applied)
//   - apitypes.NewServer(store, Config{PasswordHash, JWTSecret, RateLimiter})
//   - api.CORSMiddleware() → api.AuthMiddleware(srv) → api.RequireAuth()
//   - api.RegisterRoutes(r, srv) — full route table
// It registers t.Cleanup to close the DB and returns (engine, server).
//   - Login(t, r) returns the finances_session cookie VALUE only,
//     parsed via w.Result().Cookies() — never by splitting the header.
//   - SeedAccount(t, srv) / SeedCategory(...) are fixture helpers that
//     return known IDs for tests that need a stable target row.
//   - options (variadic) let a test opt into a public-only engine
//     or override CORS_ORIGIN. No option may bypass CORSMiddleware,
//     AuthMiddleware, or RequireAuth — those are always mounted.
```

The contract is small on purpose: one constructor, one login helper, fixture seeders. Anything beyond that belongs in a test file, not in the helper.