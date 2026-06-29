# Tasks: improve-api-testing

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2,090 (new test code only, includes 80-LOC testutil) |
| 800-line budget risk | **High** (over budget) |
| Chained PRs recommended | **Yes** — 4 slices (P1 foundation → P2/P3/P4 siblings) |
| Decision needed before apply | **Yes** — must confirm chained vs single PR with `size:exception` |
| Delivery strategy | ask-always (from session preflight) |
| Chain strategy | pending — orchestrator will ask |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
800-line budget risk: High

### Suggested Work Units

| Slice | Goal | Likely PR | Notes |
|-------|------|-----------|-------|
| P1 | Foundation: testutil sibling package + health + middleware gap fill + auth/transactions refactor | PR 1 | Base = `main`; ~600 LOC. Must land first. |
| P2 | Accounts (8 funcs) + Categories (7 funcs) | PR 2 | Base = `main`; ~790 LOC. Depends on P1. |
| P3 | Budgets (5 funcs) + Dashboard (`Summary`) | PR 3 | Base = `main`; ~380 LOC. Depends on P1. |
| P4 | Transactions gap fill (9 funcs) | PR 4 | Base = `main`; ~320 LOC. Depends on P1. |

P2/P3/P4 are siblings — each can merge in any order after P1 is green. Each slice is independently reviewable and reverts cleanly without touching the others.

---

## Conventions (apply to every task)

- **Strict TDD**: every task begins with a failing test (RED), then minimum code to pass (GREEN), then cleanup (REFACTOR). Do NOT write production code before its test.
- **Testutil is the ONLY allowed route-table source** for handler tests. No per-file `gin.New()`, no struct-literal `&apitypes.Server{...}`, no inlined `db.Open+RunMigrations+Seed`.
- **Cookie extraction**: always `w.Result().Cookies()` and look up by name. Forbidden: `strings.Split` on the `Set-Cookie` header.
- **Auth closure uniqueness**: `rg 'c\.Cookie\("finances_session"\)' backend/internal/api/handlers/` MUST return exactly zero matches after P1.
- **Table-driven**: any test with more than one scenario uses `tests := []struct{...}{...}` + `t.Run(tt.name, ...)`. Single-case tests MAY be flat.
- **Verification command per task**: `cd backend && go test ./internal/api/... ./internal/api/handlers/... -count=1`.

---

## P1 — Foundation (single PR, must land first)

### 1. Create `internal/api/testutil` sibling package

- **Files**: `backend/internal/api/testutil/testutil.go` (new), `backend/internal/api/testutil/doc.go` (new, optional one-line).
- **TDD cycle**:
  1. **Red**: write `backend/internal/api/testutil/testutil_test.go` with one smoke test that calls `NewServer(t)`, expects a non-nil engine, server, and a non-empty cookie value after `Login(t, r, password)`.
  2. **Green**: implement `NewServer`, `Login`, `DoJSON`, `CookieValue`, `SeededAccountID`, `SeededCategoryID`, options `WithRoutes`, `WithSeeded`, `WithCORSOrigin`, `WithJWTSecret`. Wire `db.testDB(t)` → `apitypes.NewServer(...)` → `api.CORSMiddleware()` → `api.AuthMiddleware(srv)` → `api.RequireAuth()` → `api.RegisterRoutes(r, srv)`. Use the deterministic bcrypt hash and fixed JWTSecret from the spec.
  3. **Refactor**: extract `option` struct + functional options pattern; ensure no option can bypass `CORSMiddleware`/`AuthMiddleware`/`RequireAuth`.
- **Acceptance**:
  - `NewServer(t)` returns `(engine, server, cookie)` where engine mounts the FULL `api.RegisterRoutes` route table.
  - `Login(t, r, password)` parses cookie via `w.Result().Cookies()` (no string-split on `Set-Cookie`).
  - `WithRoutes(false)` mounts public-only variant; `WithCORSOrigin(s)` overrides CORS_ORIGIN via `t.Setenv`; `WithJWTSecret(s)` swaps JWT secret for negative tests.
  - `SeededAccountID(t, srv)` returns the first seeded account id (after `WithSeeded(true)`).
  - Smoke test passes; `cd backend && go test ./internal/api/testutil/...` green.
- **Commit message**: `test(api): add internal/api/testutil sibling package with NewServer/Login helpers`

### 2. Refactor `auth_test.go` to use `testutil`

- **Files**: `backend/internal/api/handlers/auth_test.go` (modified).
- **TDD cycle**:
  1. **Red**: convert each existing scenario in `auth_test.go` to call `testutil.NewServer`/`Login`/`DoJSON` and assert failure (the tests will fail to compile / fail until the helpers are wired correctly). Keep a TODO-marker test that calls `testutil.Login(t, r, "wrong")` and asserts 401 to lock the contract.
  2. **Green**: replace `testAuthServer` and the inlined cookie closure with `testutil.NewServer(t, testutil.WithRoutes(true))` + `testutil.Login`. Drop the per-test mini `gin.Engine`. Convert multi-scenario tests to `tests := []struct{name, password string; wantStatus int; ...}{...}` + `t.Run`.
  3. **Refactor**: extract a single `loginRequest(t, r, body)` helper inside the file that wraps `DoJSON` for `POST /auth/login`. Remove any leftover strings.Split on `Set-Cookie`.
- **Acceptance**:
  - `testAuthServer` and the 18-line cookie closure are GONE.
  - Cases: correct password → 200 + `Set-Cookie finances_session=...`; wrong password → 401; missing body → 400; logout → 200 + cookie cleared (`Max-Age=0` or `Expires` past).
  - `AuthStatus`: with cookie → 200 `authenticated:true`; without → 200 `authenticated:false`.
  - `rg 'c\.Cookie\("finances_session"\)' backend/internal/api/handlers/auth_test.go` returns zero matches.
  - `cd backend && go test ./internal/api/handlers/ -run Auth` green.
- **Commit message**: `test(auth): refactor auth_test.go to use shared testutil; drop inlined cookie closure`

### 3. Refactor `transactions_test.go` skeleton to use `testutil`

- **Files**: `backend/internal/api/handlers/transactions_test.go` (modified — refactor only; new cases land in task #10 / P4).
- **TDD cycle**:
  1. **Red**: the existing `transactions_test.go` builds its own mini engine (per design.md note about the import cycle workaround). Replace its setup with `testutil.NewServer(t)`. Existing scenarios will fail to compile until the swap is complete — that's the red.
  2. **Green**: drop the hand-rolled route subset. Use `testutil.DoJSON` for every HTTP call. Use `testutil.SeededAccountID` for fixture ids.
  3. **Refactor**: confirm `BulkCreate_HTTP` / `BulkDelete_HTTP` (the canonical table-driven shape from spec §7) still pass without modification; collapse any duplicate cookie logic.
- **Acceptance**:
  - Hand-rolled gin engine + cookie closure at `transactions_test.go:60-78` are GONE.
  - All previously passing tests still pass against `testutil.NewServer`.
  - No `gin.New()` / `RegisterRoutes` mini-subset in this file.
  - `rg 'c\.Cookie\("finances_session"\)' backend/internal/api/handlers/transactions_test.go` returns zero matches.
  - `cd backend && go test ./internal/api/handlers/ -run Transactions` green for the existing scenarios.
- **Commit message**: `test(transactions): refactor existing tests to use shared testutil helper`

### 4. Add `health_test.go`

- **Files**: `backend/internal/api/handlers/health_test.go` (new).
- **TDD cycle**:
  1. **Red**: write `TestHealth_HTTP` asserting `GET /health` returns 200 and `{"status":"ok"}`. Test will fail (file doesn't exist).
  2. **Green**: minimal test calling `testutil.NewServer(t, testutil.WithRoutes(true))` → `DoJSON(t, r, "GET", "/health", "", nil)` → assert 200 + JSON.
  3. **Refactor**: if there's a second scenario (e.g., `/api/health` not registered, returns 404), add a flat assertion — no need for table here.
- **Acceptance**:
  - `GET /health` → 200 + `{"status":"ok"}`.
  - `cd backend && go test ./internal/api/handlers/ -run Health` green.
- **Commit message**: `test(handlers): add health_test.go covering GET /health`

### 5. Add `middleware_test.go` gap fill

- **Files**: `backend/internal/api/middleware_test.go` (modified).
- **TDD cycle**:
  1. **Red**: add three test functions whose bodies fail: `TestRequireAuth_HTTP` (4 sub-cases via table: valid cookie, missing cookie, expired JWT, malformed cookie), `TestCORS_HTTP` (4 sub-cases via table: missing Origin, allowed origin echoed with `Access-Control-Allow-Credentials: true`, disallowed origin not echoed, preflight OPTIONS returns proper `Access-Control-Allow-Methods`/`Access-Control-Allow-Headers`).
  2. **Green**: each sub-case uses `testutil.NewServer` (or a dedicated `testutil.NewServer(t, testutil.WithCORSOrigin("http://localhost:5173"))` for CORS tests) and `DoJSON`. For the expired/malformed JWT cases, build the cookie value manually using `auth.SignToken` with `JWTSecret="expired-test"` and a `time.Time` in the past (or a bogus string), then attach it via a custom request — confirm `testutil.DoJSON` allows a raw cookie string OR add a `testutil.DoJSONWithCookie` variant.
  3. **Refactor**: extract a `corsTable` and `authTable` of named cases; assert headers by name (`w.Header().Get("Access-Control-Allow-Origin")`), not by full header dump.
- **Acceptance**:
  - `TestRequireAuth_HTTP` table: valid → 200; missing → 401 `{error:"unauthorized"}`; expired → 401; malformed → 401.
  - `TestCORS_HTTP` table: no Origin → ACAO absent; allowed → ACAO=`http://localhost:5173` + `Access-Control-Allow-Credentials: true`; disallowed → ACAO absent; OPTIONS preflight with `Access-Control-Request-Method: GET` → ACAO echoed + `Access-Control-Allow-Methods` non-empty + `Access-Control-Allow-Credentials: true`.
  - `cd backend && go test ./internal/api/middleware_test.go` green.
- **Commit message**: `test(middleware): add RequireAuth + CORS coverage (happy/missing/invalid + preflight)`

**P1 verification gate**: `cd backend && go test ./... -count=1` green; `rg 'c\.Cookie\("finances_session"\)' backend/internal/api/handlers/` returns zero.

---

## P2 — Accounts + Categories (depends on P1)

### 6. Add `accounts_test.go`

- **Files**: `backend/internal/api/handlers/accounts_test.go` (new).
- **TDD cycle**:
  1. **Red**: write one `TestAccounts_<Func>_HTTP` per handler method (List, ByID, Create, Update, Archive, Delete, Reorder, Balances) — eight functions total. Each calls `testutil.NewServer(t)` + `testutil.Login` + `testutil.SeededAccountID` and asserts the 200-path response shape and one explicit failure path. All fail to compile until `testutil` is in place — confirm P1 is merged first.
  2. **Green**: implement the assertions one by one. For `Balances`, write a transaction via `testutil.NewServer` POST flow (or, if too involved, add `testutil.SeedTransaction` fixture in this task and use it).
  3. **Refactor**: convert any function with 3+ scenarios to table-driven. Keep single-case scenarios flat.
- **Acceptance (per testutil scenario table)**:
  - `TestAccounts_List_HTTP`: empty seed → 200 `[]`; one seeded account → 200 with 1 element; `?includeArchived=true` returns archived too; `?includeArchived=false` (default) excludes archived; no cookie → 401.
  - `TestAccounts_ByID_HTTP`: valid id → 200 + `models.Account`; unknown id → 404 `{error:"account not found"}`; no cookie → 401.
  - `TestAccounts_Create_HTTP`: valid body → 201 + `models.Account` with non-empty id; malformed JSON → 400; no cookie → 401.
  - `TestAccounts_Update_HTTP`: valid id + body → 200 + updated fields; unknown id → 404; malformed JSON → 400; no cookie → 401.
  - `TestAccounts_Archive_HTTP`: valid id → 200 + account with `archived=true`; unknown id → 404; no cookie → 401.
  - `TestAccounts_Delete_HTTP`: valid id → 200 `{"deleted":N}`; unknown id → 404; no cookie → 401.
  - `TestAccounts_Reorder_HTTP`: valid `{"order":[…]}` → 200 `{"ok":true}`; empty order → 200 (or whatever the store returns); malformed JSON → 400; no cookie → 401.
  - `TestAccounts_Balances_HTTP`: empty seed → 200 with zero balance; account with no tx → `initial` only; account with one income tx → `initial + income`; account with one expense tx → `initial - expense`; no cookie → 401.
- **Commit message**: `test(handlers): add accounts_test.go covering all 8 handler funcs (table-driven)`

### 7. Add `categories_test.go`

- **Files**: `backend/internal/api/handlers/categories_test.go` (new).
- **TDD cycle**:
  1. **Red**: write one `TestCategories_<Func>_HTTP` per handler method (List, Tree, ByID, Create, Update, Archive, Delete) — seven functions total. All fail to compile until `testutil` is in place.
  2. **Green**: implement assertions. `Tree` needs a seeded parent + child category — confirm `WithSeeded(true)` provides both, else add a `testutil.SeedCategory(parentID, name)` helper.
  3. **Refactor**: table-driven for any multi-scenario function.
- **Acceptance**:
  - `TestCategories_List_HTTP`: empty seed → 200 `[]`; one seeded → 200 with 1 element; archived excluded; no cookie → 401.
  - `TestCategories_Tree_HTTP`: no `?kind` → 200 with hierarchical nodes; `?kind=expense` → filters correctly; no cookie → 401.
  - `TestCategories_ByID_HTTP`: valid id → 200; unknown id → 404 `{error:"category not found"}`; no cookie → 401.
  - `TestCategories_Create_HTTP`: valid body → 201; parent set correctly when `parentId` provided; malformed JSON → 400; no cookie → 401.
  - `TestCategories_Update_HTTP`: valid id → 200 with renamed fields; unknown id → 404; malformed JSON → 400; no cookie → 401.
  - `TestCategories_Archive_HTTP`: valid id → 200 + `archived=true`; unknown id → 404; no cookie → 401.
  - `TestCategories_Delete_HTTP`: valid id → 200 `{"deleted":N}`; unknown id → 404; no cookie → 401.
- **Commit message**: `test(handlers): add categories_test.go covering all 7 handler funcs (table-driven)`

**P2 verification gate**: `cd backend && go test ./internal/api/handlers/ -run 'Accounts|Categories' -count=1` green.

---

## P3 — Budgets + Dashboard (depends on P1)

### 8. Add `budgets_test.go`

- **Files**: `backend/internal/api/handlers/budgets_test.go` (new).
- **TDD cycle**:
  1. **Red**: write one `TestBudgets_<Func>_HTTP` per handler method (Upsert, List, Get, Update, Delete, Status — confirm the exact five funcs in `budgets.go` before writing). Fail to compile until P1 is merged.
  2. **Green**: implement assertions. Upsert must hit the `category_id + month` unique constraint path twice and assert idempotency.
  3. **Refactor**: table-driven for any multi-scenario function.
- **Acceptance (per scenario table)**:
  - `TestBudgets_Upsert_HTTP`: first POST → 201; second POST same `category_id + month` → 200 with same id (idempotent); negative amount → 400; invalid month format (`"2026-13"`) → 400; no cookie → 401.
  - `TestBudgets_List_HTTP`: empty seed → 200 `[]`; one seeded → 200 with 1 element; `?month=YYYY-MM` filters correctly; no cookie → 401.
  - `TestBudgets_Get_HTTP`: valid id → 200; unknown id → 404; no cookie → 401.
  - `TestBudgets_Delete_HTTP`: valid id → 200 `{"deleted":N}`; unknown id → 404; no cookie → 401.
  - `TestBudgets_Status_HTTP`: with seeded budget + matching transactions → 200 with `spent`, `remaining`, `progress`; no cookie → 401.
- **Commit message**: `test(handlers): add budgets_test.go covering all 5 handler funcs (table-driven)`

### 9. Add `dashboard_test.go`

- **Files**: `backend/internal/api/handlers/dashboard_test.go` (new).
- **TDD cycle**:
  1. **Red**: write `TestDashboard_Summary_HTTP` with empty seed → 200 with zeros; fails to compile until P1 merged.
  2. **Green**: seed 1 income + 1 expense via `testutil.NewServer` POSTs (or add `testutil.SeedTransaction(accountID, categoryID, kind, cents)` fixture) and assert `net_savings` matches `income - expense`. Add `?from=YYYY-MM-DD&to=YYYY-MM-DD` filter case.
  3. **Refactor**: table-driven for empty/seeded/filtered cases.
- **Acceptance**:
  - `TestDashboard_Summary_HTTP`: empty seed → 200 with zeroed aggregation object; seeded 1 income + 1 expense in same month → `net_savings` equals `income - expense`; date range filter `?from=…&to=…` honors bounds; no cookie → 401.
- **Commit message**: `test(handlers): add dashboard_test.go covering Summary aggregation`

**P3 verification gate**: `cd backend && go test ./internal/api/handlers/ -run 'Budgets|Dashboard' -count=1` green.

---

## P4 — Transactions gap fill (depends on P1)

### 10. Extend `transactions_test.go` — 9 untested funcs

- **Files**: `backend/internal/api/handlers/transactions_test.go` (modified — already refactored in task #3; this task adds the missing cases).
- **TDD cycle**:
  1. **Red**: for each untested handler in `transactions.go` (List, ByID, Create, Update, Delete, HasAny, Recent, SummaryByMonth, SummaryByCategory — confirm the exact nine from the existing file before writing), write `TestTransactions_<Func>_HTTP` calling `testutil.NewServer` + `Login` + `SeededAccountID` + `SeededCategoryID` and assert at least one happy + one failure path. All fail to compile until P1 merged.
  2. **Green**: implement assertions. For `HasAny` (likely a cheap existence probe) seed one tx and assert true; for `SummaryByMonth` and `SummaryByCategory` seed 2-3 txs in different months/categories and assert aggregations.
  3. **Refactor**: where multiple scenarios cluster (especially around `BulkCreate` re-import idempotency and `BulkDelete` empty-ids 400 vs valid 200), keep the existing canonical table-driven shape from spec §7.
- **Acceptance (per scenario table)**:
  - `TestTransactions_List_HTTP`: empty seed → 200 `[]`; one seeded → 200 with 1 element; `?accountId=…` filters correctly; `?from=&to=` filters by date; no cookie → 401.
  - `TestTransactions_ByID_HTTP`: valid id → 200; unknown id → 404; no cookie → 401.
  - `TestTransactions_Create_HTTP`: valid body → 201; malformed JSON → 400; no cookie → 401.
  - `TestTransactions_Update_HTTP`: valid id → 200; unknown id → 404; malformed JSON → 400; no cookie → 401.
  - `TestTransactions_Delete_HTTP`: valid id → 200 `{"deleted":N}`; unknown id → 404; no cookie → 401.
  - `TestTransactions_HasAny_HTTP`: empty seed → 200 `false`; one seeded → 200 `true`; no cookie → 401.
  - `TestTransactions_Recent_HTTP`: seeded → 200 with N elements ordered by date desc; `?limit=K` truncates; no cookie → 401.
  - `TestTransactions_SummaryByMonth_HTTP`: empty → 200 `[]`; seeded txs across months → 200 with month buckets; no cookie → 401.
  - `TestTransactions_SummaryByCategory_HTTP`: empty → 200 `[]`; seeded txs across categories → 200 with category buckets summing correctly; no cookie → 401.
  - Existing `TestBulkCreate_HTTP` / `TestBulkDelete_HTTP` continue to pass unchanged.
- **Commit message**: `test(transactions): add coverage for 9 untested CRUD/aggregation funcs (table-driven)`

**P4 verification gate**: `cd backend && go test ./internal/api/handlers/ -run Transactions -count=1` green; `cd backend && go test ./...` green end-to-end.

---

## Final cross-slice verification

After P1–P4 all merge:

1. `cd backend && go test ./... -count=1` green.
2. `rg 'c\.Cookie\("finances_session"\)' backend/internal/api/handlers/` returns ZERO matches (closure uniqueness verified).
3. `rg 'strings\.Split.*Set-Cookie' backend/internal/api/handlers/` returns ZERO matches (cookie-parse fix verified).
4. `rg 'gin\.New\(\)' backend/internal/api/handlers/` returns ONLY the `testutil` package's internal use; no per-test mini engines.
5. Every handler file under `backend/internal/api/handlers/*.go` has a sibling `<file>_test.go`.