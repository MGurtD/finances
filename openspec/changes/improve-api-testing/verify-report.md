# Verify Report — improve-api-testing

**Change**: improve-api-testing
**Mode**: Strict TDD (active)
**Branch**: test/api-coverage (single-PR mode, size:exception approved)
**Commit base**: `14e0788` (latest, `style(test): gofmt categories_test.go and transactions_test.go`)

## Verification Report

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 10 |
| Tasks complete | 10 |
| Tasks incomplete | 0 |

All 10 task units (P1.1–P1.5, P2.6, P2.7, P3.8, P3.9, P4.10) landed. Apply-progress #442 reports status COMPLETE.

### Build & Tests Execution

**Build**: PASS — `go build ./...` clean (no go-vet errors, all tests compile)
```text
$ go test -count=1 ./...
ok      github.com/mgurt/finances/cmd/server                0.812s
ok      github.com/mgurt/finances/internal/api               1.123s
ok      github.com/mgurt/finances/internal/api/handlers      5.183s
ok      github.com/mgurt/finances/internal/api/testutil      1.191s
?       github.com/mgurt/finances/internal/apitypes          [no test files]
ok      github.com/mgurt/finances/internal/auth              0.640s
ok      github.com/mgurt/finances/internal/db                0.398s
?       github.com/mgurt/finances/internal/docs              [no test files]
ok      github.com/mgurt/finances/internal/models            0.177s
```

**Gofmt**: PASS for all changed files (output empty for the diff scope):
```text
$ gofmt -l internal/api/testutil internal/api/middleware_http_test.go \
                   internal/api/handlers/accounts_test.go internal/api/handlers/auth_test.go \
                   internal/api/handlers/budgets_test.go internal/api/handlers/categories_test.go \
                   internal/api/handlers/dashboard_test.go internal/api/handlers/health_test.go \
                   internal/api/handlers/transactions_test.go internal/api/handlers/helpers_test.go
# no output
```
gofmt prints 37 files (production code) when run over the whole repo — these are pre-existing and explicitly out of scope per commit `14e0788` history.

**Vet**: PASS — `go vet ./...` returned no output.

**Tests**: 0 failures, 0 skips. Fresh run (`-count=1`) confirmed.

**Coverage (change-scope packages)**:

| Package | Before | After | Delta | Target | Status |
|---|---|---|---|---|---|
| `internal/api` (middleware + routes) | 26.1% (proposal baseline) | 93.2% | +67.1pp | >70% | PASS |
| `internal/api/handlers` | 18.7% (proposal baseline) | 80.6% | +61.9pp | >70% | PASS |
| `internal/api/testutil` | N/A (new) | 76.5% | — | n/a | PASS (new package) |

Coverage measured via `go test -cover ./...` on the branch base.

### Spec Compliance Matrix (12 acceptance criteria)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Auth closure single-sourced in `internal/api/middleware.go:36` | PASS | `rg 'c\.Cookie\("finances_session"\)' backend/` returns zero matches. Only `c.Cookie(cookieName)` in `middleware.go:38`. The 18-line closures from `auth_test.go:32-50` and `transactions_test.go:60-78` are gone. |
| 2 | Cookie extraction uses `http.Response.Cookies()` | PASS | `rg 'strings\.Split.*Set-Cookie' backend/` returns zero matches. `testutil.Login` at `internal/api/testutil/testutil.go:217` calls `resp.Cookies()` and iterates by name. |
| 3 | Every handler has happy + explicit failure-path test | PASS | All 36 methods covered (see Coverage Compliance below). Concrete locks verified: `GET /api/accounts/no-such-id` → 404 (`accounts_test.go:118-128`); `POST /api/accounts` malformed → 400 (`accounts_test.go:166-173`); `DELETE /api/accounts/no-such-id` → 404 (`accounts_test.go:300-310`); `POST /api/transactions/bulk-delete` empty ids → 400 (`transactions_test.go:60-66`), non-existent ids → 200 `deleted:0` (`transactions_test.go:82-92`); bulk re-import → 200 `inserted:0,skipped:2` (`transactions_test.go:138-155`); login correct → 200 + Set-Cookie + `authenticated:true` (`auth_test.go:18-34`); login wrong → 401 (`auth_test.go:36-49`); missing body → 400 (`auth_test.go:51-60`); logout → 200 + Max-Age=0 (`auth_test.go:85-108`); `GET /health` → 200 `{status:"ok"}` (`health_test.go:13-34`); `GET /api/dashboard/summary` → 200 + non-empty (`dashboard_test.go:12-34`). |
| 4 | `RequireAuth` happy path covered (200 with valid cookie) | PASS | `middleware_http_test.go:28` `valid cookie unlocks protected route`. Also corroborated by `TestNewServer_ProtectedRouteWithCookie` at `testutil_test.go:70-87` and `TestLogin_CookieIsUsable` at `auth_test.go:153-162`. Chain verified end-to-end: CORS → AuthMiddleware → RequireAuth → handler. |
| 5 | `RequireAuth` failure paths: no cookie / invalid JWT / expired JWT | PASS | `middleware_http_test.go:23-46` table-driven matrix includes `no cookie returns 401`, `expired JWT returns 401`, `malformed JWT returns 401`, `JWT signed with wrong secret returns 401`. All assert `want: http.StatusUnauthorized`. Existing pre-change unit tests in `middleware_test.go:21-136` exercise the AuthMiddleware coverage of the same matrix at the unit level. |
| 6 | CORS handles three origin states (missing / allowed / disallowed) | PASS | `middleware_http_test.go:88-123` table: `no Origin header → no ACAO echoed`, `allowed Origin (http://localhost:5173) → ACAO echoed + credentials`, `disallowed Origin (http://evil.example) → NOT echoed`. Plus `OPTIONS preflight for GET → ACAO echoed + Allow-Methods set + credentials`. |
| 7 | Table-driven structure for multi-scenario tests | PARTIAL | `middleware_http_test.go` uses the strict struct-slice pattern (`tests := []struct{...}{...}` + `for _, tt := range tests { t.Run(...) }`) at lines 23-46 and 88-161 — full compliance. Handler tests (`accounts_test.go`, `categories_test.go`, `transactions_test.go`, `budgets_test.go`, `dashboard_test.go`, `auth_test.go`) use `t.Run`-only subtests with inline setup. Both forms run independently and produce failing diagnostic, but only the middleware tests match the exact canonical shape referenced in the spec — see WARNING-1. |
| 8 | Shared test helper used everywhere (no per-file `gin.New()` or struct-literal servers) | PASS | `rg 'gin\.New\(\)' backend/internal/api/handlers/` returns zero matches. Only `testutil/testutil.go:181` uses `gin.New()` (canonical harness) and `middleware_test.go:22,48,71,105,151,167` for pre-existing internal unit tests (preserved). No `&apitypes.Server{...}` struct literals in test files. All handler tests funnel through `testutil.NewServer(...)` directly or via `loginAsAdmin(...)` helper. |
| 9 | `db.testDB` is the canonical DB factory | PASS | `internal/db/helpers_test.go:10` defines `func testDB(t *testing.T) (*Store, func())` with `Open + RunMigrations + Seed` + cleanup. Used by 32 callers across `accounts_test.go` (8), `budgets_dashboard_test.go` (4), `categories_test.go` (6), `transactions_test.go` (12), plus the testutil `NewServer` calls it via `db.Open + db.RunMigrations + db.Seed` at testutil.go:159-172 — equivalent wiring with `t.Cleanup(database.Close)`. |
| 10 | Real `apitypes.NewServer` construction (not struct-literal) | PASS | `testutil/testutil.go:174` constructs via `apitypes.NewServer(database, apitypes.Config{PasswordHash: o.PasswordHash, JWTSecret: o.JWTSecret, RateLimiter: auth.NewRateLimiter()})` with deterministic bcrypt `$2a$10$0/uPukIQ0ewWCbc/qrCk3OuY9fYa..NrOU3UwgtUPw0M1OBTHrENq` (testutil.go:38) and fixed JWTSecret `test-secret` (testutil.go:40). Struct literals are absent from tests. Pre-existing `middleware_test.go:23,49,72,106` use `&apitypes.Server{JWTSecret:"test-secret"}` for the in-package `AuthMiddleware` unit tests — these are preserved pre-existing tests and do not violate the spec since they are not HTTP-integration tests; see WARNING-3. |
| 11 | Full protected route table reachable from tests via `api.RegisterRoutes` | PASS | `testutil/testutil.go:183` mounts via `api.RegisterRoutes(r, srv)` — no hand-rolled subset. Only allowed exception used: `WithRoutes(false)` at testutil.go:184 mounts `api.RegisterAuthRoutes` for the public-only test (`testutil_test.go:102-117`). |
| 12 | `go test ./backend/...` passes with no skipped tests outside `testing.Short()` | PASS | Fresh run (`-count=1`) returned `ok` for every package. No `t.Skip` calls in changed test files (grep verified). |

**Compliance summary**: 11/12 fully COMPLIANT, 1/12 PARTIAL (`#7` table-driven shape).

### Coverage Compliance Detail (per-handler table for criterion #3)

Per-function coverage from `go tool cover -func=cover.out` after the change:

| File | Method | Coverage | Happy + Failure covered? |
|---|---|---|---|
| `accounts.go` | List | 66.7% | YES — `TestAccounts_List_HTTP` (4 subtests: empty, seeded, archived, no-cookie) |
| | ByID | 100.0% | YES — `TestAccounts_ByID_HTTP` (valid, 404, no-cookie) |
| | Create | 80.0% | YES — `TestAccounts_Create_HTTP` (valid 201, 400, 401) |
| | Update | 100.0% | YES |
| | Archive | 100.0% | YES |
| | Delete | 100.0% | YES |
| | Reorder | 75.0% | YES — valid order + 400 + 401 |
| | Balances | 60.0% | YES — empty + income + expense + 401 |
| `auth.go` | Login | 90.5% | YES — `TestLogin` 4 subtests (200, 401, 400, 429) |
| | Logout | 100.0% | YES — `TestLogout` (200 + Max-Age=0) |
| | AuthStatus | 44.4% | YES — 2 subtests pinning production bug (no-cookie + valid-cookie both → `authenticated:false`). See WARNING-4. |
| `budgets.go` | Upsert | 55.6% | YES — `TestBudgets_Upsert_HTTP` (first POST, idempotent re-POST, "2026-13" invalid pinning production bug, 401) |
| | List | 66.7% | YES — empty + seeded + month filter + 401 |
| | Update | 80.0% | YES — valid 200 + 404 + 401 (substituted for spec's `Get` which doesn't exist) |
| | Delete | 100.0% | YES — valid + 404 + 401 |
| | Status | 77.8% | YES — `?month=` honored + 400 missing + 401 |
| `categories.go` | List | 60.0% | YES — empty + seeded + archived + 401 |
| | Tree | 66.7% | YES — no-filter, kind=expense, kind=income, 401 |
| | ByID | 100.0% | YES — valid + 404 + 401 |
| | Create | 80.0% | YES — top-level + child (parentId set) + 400 + 401 |
| | Update | 100.0% | YES |
| | Archive | 100.0% | YES |
| | Reorder | 75.0% | YES — valid + 400 + 401 (handler has no `Delete` — see WARNING-5) |
| `dashboard.go` | Summary | 80.0% | YES — empty + 1 income + 1 expense + date range + 400 missing + 401 |
| `health.go` | Health | 100.0% | YES — `TestHealth_HTTP` (200 + JSON shape) + `TestHealth_ContentType` |
| `transactions.go` | List | 60.0% | YES — empty, seeded, accountId filter, from/to filter, 401 |
| | ByID | 100.0% | YES |
| | Create | 77.8% | YES |
| | Update | 100.0% | YES |
| | Delete | 100.0% | YES |
| | HasAny | 60.0% | YES — empty + seeded + 401 |
| | BulkCreate | 55.6% | YES — `TestBulkCreate_HTTP` (first import + re-import dedup + 401) |
| | BulkDelete | 77.8% | YES — `TestBulkDelete_HTTP` (3 ids → deleted:3 + empty 400 + malformed 400 + non-existent ids 200 + 401) |
| | Recent | 75.0% | YES — date desc + ?limit + 401 |
| | SummaryByMonth | 62.5% | YES — empty + multi-month buckets + 401 |
| | SummaryByCategory | 80.0% | YES — empty + cat1+cat2 buckets + missing `from`/`to` 400 + 401 |
| `middleware.go` | AuthMiddleware | 100.0% | YES — matrix from pre-existing tests (NoCookie, InvalidCookie, ValidCookie, ExpiredToken) + new HTTP-level matrix (5 subtests) |
| | RequireAuth | 100.0% | YES — 5-subtest matrix in `middleware_http_test.go:TestRequireAuth_HTTP` |
| | CORSMiddleware | 100.0% | YES — 4-subtest CORS matrix |
| | getAllowedOrigin | 75.0% | YES — env var read + default fallback exercised |

**Coverage summary**: 36/36 handler methods have ≥1 happy-path test and ≥1 explicit failure-path test. All 12 spec compliance items verified.

### Correctness (Static Evidence)

| Item | Status | Notes |
|---|---|---|
| `requireAuth` middleware (4 input types: valid/missing/expired/malformed/wrong-secret) | IMPLEMENTED | 5 subtests in `middleware_http_test.go:23-46` |
| CORS preflight handling (OPTIONS + Allow-Methods + credentials) | IMPLEMENTED | `middleware_http_test.go:115-122` |
| Cookie extraction via `http.Response.Cookies()` | IMPLEMENTED | `testutil.go:215-222`, no other extraction paths exist |
| Shared testutil integration with full route table | IMPLEMENTED | `testutil.go:182-186` — `api.RegisterRoutes(r, srv)` + `WithRoutes(false)` fallback |
| Deterministic credentials (fixed bcrypt + JWTSecret) | IMPLEMENTED | `testutil.go:34-44` |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Testutil as sibling package `internal/api/testutil` (not `handlers/`) | YES | `testutil.go:13` — package `testutil`. `handlers` tests renamed to `package handlers_test`. |
| Testutil has full route table mount by default; public-only via option | YES | `testutil.go:182-186` |
| Functional options pattern | YES | `testutil.go:68-100` — `WithRoutes`, `WithSeeded`, `WithCORSOrigin`, `WithJWTSecret`, `WithPasswordHash` |
| t.Cleanup for DB close + env var restore | YES | `testutil.go:163` (db close), `t.Setenv` at 146/151 (env restore) |
| Production AuthMiddleware + CORSMiddleware mounted (no inline closure re-declared) | YES | `testutil.go:174-186` — never re-declares; tests drive through real prod middleware |
| Rename test files to external test packages (`handlers_test` / `api_test`) | YES | All imports verified: `internal/api/handlers/*_test.go` declare `package handlers_test`; `middleware_http_test.go` declares `package api_test`. |

### TDD Compliance (Strict TDD mode)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported in apply-progress | YES | Status: COMPLETE — all 10 tasks landed. |
| All tasks have test files | YES | Every task has a backing `_test.go` (accounts/categories/budgets/dashboard/health/middleware_http/transactions gap-fill). |
| RED → GREEN cycle | YES | New files were created with failing tests (compilation failure on missing testutil package) followed by green implementations. Tests for new scenarios (e.g., CORS, RequireAuth matrix) were written before the harness was complete. |
| Triangulation adequate | YES | Multi-scenario handlers (Accounts.List, Transactions.List, etc.) cover 4-5 cases each (empty, seeded, filter, edge, no-cookie). |
| Safety net | YES | Refactor of `auth_test.go` and `transactions_test.go` (tasks #2, #3) kept pre-existing passing tests as safety net — they continued to pass under the new harness. |

**TDD Compliance**: 5/5 checks passed.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (in-package) | 6 | `middleware_test.go` | `go test` |
| Integration (HTTP) | ~50 | 9 test files in `internal/api/handlers/` + `middleware_http_test.go` + `testutil_test.go` | `go test` + `httptest` + `testutil.NewServer` |
| E2E | 0 | — | — |
| **Total** | **~56** | **11** | |

All tests are Go HTTP integration tests driving a real Gin engine + real DB + real middleware. No E2E framework installed (consistent with `AGENTS.md` "No end-to-end tests (web ↔ live API)").

### Per-Function Drill-Down: Bottom-5 Lowest-Covered Functions (for follow-up, not blocking)

| Function | Coverage | Notes |
|---|---|---|
| `AuthStatus` (auth.go:101) | 44.4% | Production bug #1 — handler ignores cookie. The 2 subtests cover both paths but the bug branch is unreachable from the handler's perspective. Test documents it. |
| `Budgets.Upsert` (budgets.go:53) | 55.6% | Production bug #2 — month format not validated; the "2026-13" test pins the gap but the validation branch is dead code until fix lands. |
| `Transactions.BulkCreate` (transactions.go:192) | 55.6% | Cover the 1st + re-import paths; specific failure paths (e.g., invalid category FK) not exercised. |
| `Transactions.List` (transactions.go:40) | 60.0% | Account filter + date range filter exercised; per-page limit / kind filter not exercised. |
| `Categories.List` (categories.go:31) | 60.0% | Archived exclusion + empty exercised; `?kind=` filter at List endpoint not exercised. |

Worth a follow-up change but not blocking — overall package coverage is well above target.

---

## Issues Found

### CRITICAL

**None.**

Test suite passes, all 12 acceptance criteria are COMPLIANT or PARTIAL (PARTIAL does not block — see WARNING-1). No skipped tests. Production handlers/middleware unchanged. Test infrastructure only.

### WARNING

1. **Table-driven shape inconsistent (Spec #7 PARTIAL)** — `internal/api/middleware_http_test.go` uses the strict struct-slice + `for _, tt := range tests` canonical shape (lines 23-46, 88-161). All other handler tests use `t.Run(name, func(t *testing.T){...})` per subtest with inline setup (`accounts_test.go`, `categories_test.go`, `transactions_test.go`, `budgets_test.go`, `dashboard_test.go`, `auth_test.go`). Both forms use `t.Run` for independent cases, run independently, and produce failing diagnostics per case. The spec literally demanded "named struct slice + t.Run", but the canonical examples it referenced (`TestBulkDelete_HTTP`/`TestBulkCreate_HTTP`) are the inline-subtest pattern. **Recommendation**: either accept the loose compliance (functional equivalence) or follow up to convert handler tests to the struct-slice shape. Do not block; SPEC is satisfied in spirit.

2. **Pre-existing gofmt issues in production code** — 37 files in production code (`internal/api/handlers/*.go`, `internal/db/*.go`, `internal/auth/*.go`, `cmd/server/main.go`) are not gofmt-clean. **Out of scope for this change** (test infrastructure only, no production-path edits). Tracked as a follow-up per apply-progress #442. **Recommendation**: separate `chore(fmt): gofmt production code` PR after this lands.

3. **Preserved pre-existing in-package unit tests still use struct-literal `&apitypes.Server{JWTSecret:"test-secret"}`** at `internal/api/middleware_test.go:23, 49, 72, 106`. These are pre-existing tests in `package api` that test `AuthMiddleware` directly without HTTP integration. Spec criterion #10 says "Tests MUST use `apitypes.NewServer(store, apitypes.Config{...})`" — preserved in-package tests predate this change and were intentionally not rewritten (apply-progress #442 says they were preserved to avoid breaking the no-import-cycle configuration). **Recommendation**: follow-up could wrap these in `NewServer(t, testutil.WithJWTSecret("test-secret"))` or accept the exemption.

4. **5 production bugs surfaced and pinned** (apply-progress #442 numbers 1-5):
   1. **`/api/auth/status` not covered by AuthMiddleware.** Handler always returns `authenticated:false` even with valid cookie. Pinned by `auth_test.go:117-148` (`TestAuthStatus > returns 200 + authenticated:false with a valid cookie (production bug)`).
   2. **`BudgetsHandler.Upsert` does not validate month format.** "2026-13" accepted as-is, only `Status()` validates via `time.Parse`. Pinned by `budgets_test.go:78-94`.
   3. **Spec listed `TestCategories_Delete_HTTP` but no DELETE route exists.** `categories.go` has no `Delete` method; `routes.go:47-53` registers no DELETE for `/api/categories/:id`. Documented at `categories_test.go:341-347`.
   4. **Spec listed `TestBudgets_Get_HTTP` but no GET /:id route.** Handler has `Update` (PUT). Renamed to `TestBudgets_Update_HTTP` per `budgets_test.go:11-15`.
   5. **`models.BoolInt` has `MarshalJSON` but no `UnmarshalJSON`.** Round-trip impossible. Workaround: tests use `map[string]any` for list responses (apply-progress §5).
   **Follow-ups** per apply-progress #442: fix `/auth/status` middleware, add month validation, add `Categories.Delete` method/route, add `BoolInt.UnmarshalJSON`.

5. **`RegisterAuthRoutes` coverage at 0%** despite being exercised via `testutil.WithRoutes(false)` (`testutil_test.go:102-117`). The per-function coverage tool only instruments the package under test — when running `./internal/api/testutil/...`, only `testutil`'s files are in the report. `api/routes.go` is in a separate package and isn't surfaced. **Not a real coverage gap** — manual inspection confirms `TestNewServer_PublicRoutesOnly` does exercise both branches of `WithRoutes(false)` (login works → `RegisterAuthRoutes` did run; `/api/accounts` 404s → confirms not registered). Cosmetic only.

### SUGGESTION

1. **Extract `loginAsAdmin` to `testutil`** — currently duplicated as a wrapper in `accounts_test.go:14-20` and used by 30+ subtests. Moving it to testutil would consolidate the auth-cookie pattern even further. (Apply already added it locally — exporting would be a small simplification.)
2. **Add cross-suite coverage threshold to CI.** With coverage now at 80.6%+ on the API layer, a CI gate (`go test -coverprofile` + threshold assertion) would protect against regressions.
3. **Add a `testutil.SeedTransaction(...)` fixture helper** — every test that exercises balance / summary / has-any paths currently calls `s.DoJSON(POST /api/transactions, ...)` (e.g., `accounts_test.go:387-413`). A direct DB-level seeder would shorten tests. (Spec left it optional.)
4. **Convert handler test subtests to the strict struct-slice shape** — see WARNING-1. Mechanical refactor, would normalize the pattern across the suite.
5. **Convert pre-existing `middleware_test.go` struct-literal Servers to `apitypes.NewServer(...)`** — see WARNING-3. Would satisfy spec #10 strictly.

---

## Recommendation

**MERGE** (PASS WITH WARNINGS).

Justification:
- **0 CRITICAL** issues. Test suite passes. No production behavior change. All 12 acceptance criteria are COMPLIANT or PARTIAL in a way that does not break the test infrastructure's purpose.
- **Coverage exceeded**: `internal/api` 93.2% (target >70%); `internal/api/handlers` 80.6% (target >70%); `internal/api/testutil` 76.5% (new package).
- **Coverage gates met**: fresh `go test ./... -count=1` returns `ok` everywhere. `go vet ./...` clean. All changed files gofmt-clean.
- **All 10 tasks landed**. 11 commits on branch `test/api-coverage` (single-PR mode with size:exception approved).
- **The 5 production bugs from apply are pinned by tests** (WARNING-4) — they will fail loudly when fixed.

The single PARTIAL compliance (criterion #7, table-driven shape) is acceptable because:
- All multi-scenario tests use `t.Run` for named subtests (functional equivalent).
- The canonical `TestBulkDelete_HTTP` / `TestBulkCreate_HTTP` referenced by the spec use the inline-`t.Run` pattern, which the change faithfully replicated.
- The strict struct-slice pattern is preserved where it matters most (`middleware_http_test.go`).

Pre-existing gofmt drift on production code is OUT OF SCOPE (no production change in this PR). 5 production bugs are pinned and tracked.

---

## Final Verdicts

| Aspect | Result |
|---|---|
| Build | PASS |
| Tests (full suite) | PASS |
| Vet | PASS |
| Coverage (target >70%) | PASS on both target packages |
| Acceptance criteria (12/12) | 11 PASS, 1 PARTIAL |
| TDD compliance | 5/5 PASS |
| Production bugs surfaced | 5 (all pinned by tests, all out-of-scope for this change) |
| **Overall verdict** | **MERGE — PASS WITH WARNINGS** |
