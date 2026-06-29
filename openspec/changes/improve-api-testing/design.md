# Design: improve-api-testing

## Technical Approach

Replace the two duplicated cookie-auth closures and the hand-rolled mini `gin.Engine`s with a single shared test helper that mounts the **real** `api.RegisterRoutes` against an in-memory SQLite database. Tests become table-driven, parameterized by scenario, and exercise the full CORS→AuthMiddleware→RequireAuth→handler→store→SQL chain end-to-end. The helper lives in a new sibling package (`internal/api/testutil`) to escape the import cycle that `internal/api/handlers` → `internal/api` would create. No production code is touched.

## Architecture Decisions

| Decision | Choice | Alternative | Why |
|---|---|---|---|
| Helper location | New package `internal/api/testutil` | `internal/api/handlers/testutil.go` (per spec sketch) | The latter imports `internal/api` for `RegisterRoutes`, creating a cycle that `transactions_test.go:23` already had to dodge. A sibling package is the only path that lets us mount the real route table. |
| DB setup | Inline `db.Open`+`RunMigrations`+`Seed` in `testutil` | Export `db.NewTestStore(t)` | The existing `db.testDB` is in `_test.go` (unexported, package-private). Exporting it is a non-functional refactor; inlining is zero-touch and matches what `transactions_test.go:30-41` already does. |
| Server construction | `apitypes.NewServer(database, Config{...})` | Struct literal `&apitypes.Server{...}` | Spec §10 mandates `NewServer`. Already exists in production code, no prerequisite. |
| Auth middleware | Real `api.AuthMiddleware` via `api.RegisterRoutes` | Re-declared closure (status quo) | Mounts production code verbatim → eliminates drift. |
| Cookie parsing | `w.Result().Cookies()` + `Name == cookieName` | `strings.Split(Set-Cookie, ";")` | Survives cookie attributes containing `=`; spec §2. |
| Options API | Variadic `Option func(*config)` + `applyDefaults()` | Positional flags, env vars only | Idiomatic Go (see `httptest.Server`, `cors.New`); lets tests opt in to seeded/corsOrigin overrides without breaking the default path. |
| Fixture discovery | `testutil.SeededAccountID(t, srv)` etc. | Inline `GET /api/accounts` boilerplate in every test | Stops every test re-listing accounts. Returns the seeded ID directly from `srv.Store`. |
| Test framework | Stdlib `testing` only | testify, ginkgo | Spec §"no new test framework". |
| Route registration | `api.RegisterRoutes` (full table) | Hand-rolled subset | Adding a new protected route is automatically testable. Spec §11. |
| `t.Setenv` for `DATABASE_URL` | Yes | `os.Setenv`+defer-Unsetenv (status quo) | Auto-cleanup; no leaked env across subtests. |

## Data Flow

```
test body
   │
   ▼
DoJSON(t, r, "POST", "/api/accounts", cookie, body)
   │  (httptest.NewRequest + Cookie header)
   ▼
gin.Engine ── api.CORSMiddleware ── api.AuthMiddleware ── api.RequireAuth ── AccountsHandler.Create
                                                                                    │
                                                                                    ▼
                                                                       srv.Store.Accounts.Create
                                                                                    │
                                                                                    ▼
                                                                          SQLite (in-memory)
                                                                                    │
                                                                                    ▼
                                                              httptest.ResponseRecorder
                                                                                    │
                                                                                    ▼
                                                          w.Result().Cookies() → cookieName lookup
```

Single constructor → single route mount → single response recorder. The real `api.RegisterRoutes` is the only call site; tests cannot accidentally bypass it.

## testutil.go (real Go, lives at `backend/internal/api/testutil/testutil.go`)

```go
// Package testutil provides shared HTTP test scaffolding.
//
// Lives in its own package so it can import internal/api (api.RegisterRoutes,
// api.CORSMiddleware, api.AuthMiddleware) without creating a cycle with
// internal/api/handlers.
package testutil

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/api"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/auth"
	"github.com/mgurt/finances/internal/db"
)

const (
	cookieName       = "finances_session"
	testPassword     = "password"
	testPasswordHash = "$2a$10$0/uPukIQ0ewWCbc/qrCk3OuY9fYa..NrOU3UwgtUPw0M1OBTHrENq"
	defaultJWTSecret = "test-secret"
)

// config holds knobs the variadic Option helpers mutate.
type config struct {
	publicOnly bool   // when true, RegisterAuthRoutes only (rarely needed)
	withSeed   bool   // run db.Seed() (default true)
	corsOrigin string // override CORS_ORIGIN; empty = middleware default
	jwtSecret  string // override signing secret; empty = defaultJWTSecret
}

// Option mutates a config.
type Option func(*config)

func WithRoutes(full bool) Option    { return func(c *config) { c.publicOnly = !full } }
func WithSeeded(seeded bool) Option  { return func(c *config) { c.withSeed = seeded } }
func WithCORSOrigin(o string) Option { return func(c *config) { c.corsOrigin = o } }
func WithJWTSecret(s string) Option  { return func(c *config) { c.jwtSecret = s } }

func (c *config) applyDefaults() {
	if c.jwtSecret == "" {
		c.jwtSecret = defaultJWTSecret
	}
}

// NewServer builds a fresh in-memory API server.
//
// Wires: t.Setenv DATABASE_URL=":memory:" → db.Open+RunMigrations+(Seed)
//        → apitypes.NewServer(...) → gin.Engine → api.RegisterRoutes
//        → Login() → returns (engine, apitypes.Server, finances_session value).
func NewServer(t *testing.T, opts ...Option) (*gin.Engine, *apitypes.Server, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	cfg := config{withSeed: true}
	for _, opt := range opts {
		opt(&cfg)
	}
	cfg.applyDefaults()

	t.Setenv("DATABASE_URL", ":memory:")
	t.Setenv("NODE_ENV", "") // cookies are non-Secure in tests
	if cfg.corsOrigin != "" {
		t.Setenv("CORS_ORIGIN", cfg.corsOrigin)
	}

	database, err := db.Open()
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	if err := db.RunMigrations(database); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	if cfg.withSeed {
		if err := db.Seed(database); err != nil {
			t.Fatalf("Seed: %v", err)
		}
	}

	srv := apitypes.NewServer(database, apitypes.Config{
		PasswordHash: testPasswordHash,
		JWTSecret:    cfg.jwtSecret,
		RateLimiter:  auth.NewRateLimiter(),
	})

	r := gin.New()
	if cfg.publicOnly {
		api.RegisterAuthRoutes(r, srv)
	} else {
		api.RegisterRoutes(r, srv)
	}

	cookie := Login(t, r, testPassword)
	return r, srv, cookie
}

// Login POSTs to /api/auth/login and returns the finances_session cookie value,
// parsed via (*http.Response).Cookies() — never by splitting the Set-Cookie header.
func Login(t *testing.T, r *gin.Engine, password string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"password": password})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == cookieName {
			return c.Value
		}
	}
	t.Fatalf("login response missing %s cookie", cookieName)
	return ""
}

// CookieValue looks up a cookie by name on a recorded response.
func CookieValue(t *testing.T, w *httptest.ResponseRecorder, name string) string {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == name {
			return c.Value
		}
	}
	t.Fatalf("cookie %q not found", name)
	return ""
}

// DoJSON builds a request with the JSON body + finances_session cookie attached.
func DoJSON(t *testing.T, r *gin.Engine, method, path, cookie string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		buf = bytes.NewReader(raw)
	} else {
		buf = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, buf)
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.Header.Set("Cookie", cookieName+"="+cookie)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// SeededAccountID returns the ID of the first seeded account.
func SeededAccountID(t *testing.T, srv *apitypes.Server) string {
	t.Helper()
	accs, err := srv.Store.Accounts.List(false)
	if err != nil || len(accs) == 0 {
		t.Fatalf("seeded accounts: err=%v len=%d", err, len(accs))
	}
	return accs[0].ID
}

// SeededCategoryID returns the ID of the first seeded category.
func SeededCategoryID(t *testing.T, srv *apitypes.Server) string {
	t.Helper()
	cats, err := srv.Store.Categories.List(false)
	if err != nil || len(cats) == 0 {
		t.Fatalf("seeded categories: err=%v len=%d", err, len(cats))
	}
	return cats[0].ID
}
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/internal/api/testutil/testutil.go` | Create | Shared helper (~150 LOC). New package `testutil`. |
| `backend/internal/api/handlers/auth_test.go` | Modify | Drop `testAuthServer` closure; rewrite to table-driven using `testutil`. ~140 LOC. |
| `backend/internal/api/handlers/transactions_test.go` | Modify | Drop `testTransactionsServer` + cookie-split helper; rewrite to use `testutil`. Existing scenarios preserved. ~300 LOC. |
| `backend/internal/api/middleware_test.go` | Modify | Replace `signTestToken` helper with `testutil.Login`; add CORS preflight cases. ~150 LOC. |
| `backend/internal/api/handlers/health_test.go` | Create | `TestHealth_HTTP` happy path + unauth path. ~40 LOC. |
| `backend/internal/api/handlers/accounts_test.go` | Create | 8 funcs × happy+error = 16 cases. ~400 LOC. |
| `backend/internal/api/handlers/categories_test.go` | Create | 7 funcs. ~390 LOC. |
| `backend/internal/api/handlers/budgets_test.go` | Create | 5 funcs. ~250 LOC. |
| `backend/internal/api/handlers/dashboard_test.go` | Create | Summary. ~80 LOC. |

No production file is modified.

## Per-Handler Test Plan

Each `Test<Func>_HTTP` is table-driven; one entry per scenario. Happy + explicit error path per acceptance criterion §3.

| File | Test funcs | Scenarios (one line each) |
|---|---|---|
| `health_test.go` | `TestHealth_HTTP` | 200 returns `{status:"ok", version, uptime, ts}` · 200 reachable without cookie |
| `auth_test.go` | `TestLogin_HTTP`, `TestLogout_HTTP`, `TestAuthStatus_HTTP` | correct → 200 + cookie · wrong → 401 + ErrorResponse · missing password → 400 · 6th attempt → 429 · logout → 200 + Max-Age=0 · status no cookie → authenticated:false · status with cookie → authenticated:true |
| `accounts_test.go` | `TestAccounts_List_HTTP`, `TestAccounts_ByID_HTTP`, `TestAccounts_Create_HTTP`, `TestAccounts_Update_HTTP`, `TestAccounts_Archive_HTTP`, `TestAccounts_Delete_HTTP`, `TestAccounts_Reorder_HTTP`, `TestAccounts_Balances_HTTP` | list returns seeded account · byID 200 / 404 · create 201 / 400 bad JSON · update 200 / 400 / 404 · archive 200 archived:true / 404 · delete 200 `{deleted:N}` / 404 · reorder 200 / 400 · balances returns array with initial_balance |
| `categories_test.go` | `TestCategories_List_HTTP`, `TestCategories_Tree_HTTP`, `TestCategories_ByID_HTTP`, `TestCategories_Create_HTTP`, `TestCategories_Update_HTTP`, `TestCategories_Archive_HTTP`, `TestCategories_Reorder_HTTP` | list 200 · tree 200 array (root nodes) · byID 200/404 · create 201/400 · update 200/400/404 · archive 200/404 · reorder 200/400 |
| `transactions_test.go` (extend) | +`TestTransactions_List_HTTP`, `TestTransactions_ByID_HTTP`, `TestTransactions_Create_HTTP`, `TestTransactions_Update_HTTP`, `TestTransactions_Delete_HTTP`, `TestTransactions_HasAny_HTTP`, `TestTransactions_Recent_HTTP`, `TestTransactions_SummaryByMonth_HTTP`, `TestTransactions_SummaryByCategory_HTTP` | list with filters 200 · byID 200/404 · create 201/400 · update 200/400/404 · delete 200/404 · hasAny `{hasAny:true}` after seed · recent 200 + len ≤ limit · summary-by-month 200 array · summary-by-category 200 + 400 when from/to missing. Keep existing `TestBulkDelete_HTTP` + `TestBulkCreate_HTTP`. |
| `budgets_test.go` | `TestBudgets_List_HTTP`, `TestBudgets_Upsert_HTTP`, `TestBudgets_Update_HTTP`, `TestBudgets_Delete_HTTP`, `TestBudgets_Status_HTTP` | list 200 · upsert 200 same month re-upserts · update 200/400/404 · delete 200/404 · status 200 array / 400 missing month |
| `dashboard_test.go` | `TestDashboard_Summary_HTTP` | 200 non-empty object · 400 when from/to missing · 401 no cookie |

## Slice Order (Chained PRs)

| Slice | LOC | Files | Depends on | Independently green? |
|---|---|---|---|---|
| **P1** Foundation | ~600 | `testutil.go`, `health_test.go` (new), `middleware_test.go` (gap fill), `auth_test.go` refactor, `transactions_test.go` refactor | — | Yes — `go test ./backend/...` passes after P1 lands. |
| **P2** Accounts + Categories | ~790 | `accounts_test.go` (new), `categories_test.go` (new) | P1 | Yes — new files, no edit to existing. |
| **P3** Budgets + Dashboard | ~380 | `budgets_test.go` (new), `dashboard_test.go` (new) | P1 | Yes — new files. Can parallel P2. |
| **P4** Transactions gap-fill | ~320 | `transactions_test.go` (extend with 9 funcs) | P1 | Yes — append-only. Can parallel P2/P3. |

Dependency graph:

```
P1 ──┬── P2 ──┐
     │        ├── (all merge into main)
     ├── P3 ──┤
     │        │
     └── P4 ──┘
```

P2/P3/P4 are siblings — any merge order after P1 works.

## Risk Mitigation

1. **Auth-closure drift eliminated.** Today both `auth_test.go:32-50` and `transactions_test.go:60-78` re-declare an 18-line cookie-auth closure that mirrors `middleware.go:36` but is NOT it. Production diverges → tests pass against dead code. After P1: testutil mounts `api.RegisterRoutes` which uses the real `api.AuthMiddleware` and `api.RequireAuth`. Closure cannot drift because it no longer exists. `sdd-verify` adds a grep guard: `rg 'c\.Cookie\("finances_session"\)' backend/internal/api/handlers/` must return zero matches.
2. **Fragile cookie parsing fixed.** `strings.Split(cookieHeader, ";")` breaks on cookie attributes containing `=` (per RFC 6265 these exist). New helper uses `(*http.Response).Cookies()` which Go's stdlib parses correctly; lookup by `Name == cookieName`. Spec §2 locks this in.
3. **Route-table coverage automatic.** `api.RegisterRoutes(r, srv)` is the single mount point. Adding a new protected route in `routes.go` makes it immediately reachable from any `testutil.NewServer` test — no helper to update. This is exactly what spec §11 demands.
4. **No production drift.** testutil lives outside `internal/api/handlers` and never imports it (only `internal/api` for `RegisterRoutes`). Zero changes to production code.

## Open Questions

1. **Package path for testutil** — Spec sketch placed it at `internal/api/handlers/testutil.go`, but that path can't import `internal/api` (cycle, called out in `transactions_test.go:23`). Design proposes `internal/api/testutil/testutil.go` as a sibling package. Confirm before `sdd-tasks` slices this up.

## Out of Scope (recap)

No production code changes. No new dependencies. No test-framework swap (stdlib `testing` only). No coverage in `db/`, `auth/`, `apitypes/`, `models/`. No CI / GitHub Actions wiring. No pre-commit hook changes. No changes to `dev-start.cmd`, README, or stale directories.