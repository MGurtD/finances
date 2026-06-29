# Exploration: fix-api-production-bugs

> **Change**: `fix-api-production-bugs`
> **Branch**: `fix/api-production-bugs` (from `main`)
> **Mode**: openspec · ask-on-risk · 400-line budget · strict TDD
> **Sources of truth verified**: `routes.go`, `handlers/{auth,budgets,categories}.go`, `models/models.go`, `db/{budgets,categories}.go`, `migrations/0001_init.sql`, `handlers/{auth,budgets,categories,accounts}_test.go`, `testutil/testutil.go`, `testutil/testutil_test.go`, `middleware.go`.

This change closes 5 production bugs surfaced by the `improve-api-testing` verify report (#443) and archived #444. Two require a USER decision before the spec phase can be drafted; three are mechanically fixed here.

## Current State (per bug)

### Bug 1 — `/api/auth/status` not wrapped by `AuthMiddleware` (HIGH)

`backend/internal/api/routes.go:22-29`:

```go
apiGroup := r.Group("/api")
{
    // Auth routes (public - no auth middleware)
    authHandler := handlers.NewAuthHandler(srv)
    apiGroup.POST("/auth/login", authHandler.Login)
    apiGroup.POST("/auth/logout", authHandler.Logout)
    apiGroup.GET("/auth/status", authHandler.AuthStatus)   // <-- no middleware
```

`AuthStatus` reads `c.Get("authenticated")` (`handlers/auth.go:101-114`), but that key is only set by `AuthMiddleware` (`middleware.go:36-58`). Result: every call — even with a valid cookie — returns `{"authenticated": false}`. Pinned at `handlers/auth_test.go:132-148` ("with a valid cookie (production bug)").

Note: the sibling `RegisterAuthRoutes` helper (`routes.go:86-92`) already calls `r.Use(AuthMiddleware(srv))`, but the test harness in `testutil.NewServer` uses the full `RegisterRoutes`, so the bug is observable in tests.

### Bug 2 — `BudgetsHandler.Upsert` accepts any `month` string (MED)

`backend/internal/api/handlers/budgets.go:53-66`:

```go
func (h *BudgetsHandler) Upsert(c *gin.Context) {
    var req models.UpsertBudgetReq
    if err := c.ShouldBindJSON(&req); err != nil { ... }
    budget, err := h.Server.Store.Budgets.Upsert(req)  // <-- no format check
```

`binding:"required"` on `Month` only enforces non-empty (`models/models.go:186`). `db/budgets.go:147` `Status()` does `time.Parse("2006-01", month)` and fails later. Pinned at `handlers/budgets_test.go:78-94` ("invalid month format is silently accepted (production bug)").

### Bug 3 — `Categories.Delete` missing (USER DECISION)

`handlers/categories.go` exposes 6 methods (`List`, `Tree`, `ByID`, `Create`, `Update`, `Archive`, `Reorder` — actually 7 with Reorder). No `Delete`. `db/categories.go` has no `Delete` either. `routes.go:46-53` registers no `DELETE /api/categories/:id`. Convention contrast: `Accounts` has `Archive`+`Delete`; `Budgets`/`Transactions` have `Delete` only.

Schema blocker: `migrations/0001_init.sql:40` and `:60` declare `category_id TEXT REFERENCES categories(id)` with no `ON DELETE` clause — SQLite default is `NO ACTION`, so a hard delete fails (`FOREIGN KEY constraint failed`) whenever any transaction or budget references the category. Pinned at `handlers/categories_test.go:341-347` (documented gap).

### Bug 4 — `Budgets.Get(budgetID)` missing (USER DECISION)

`handlers/budgets.go` exposes `Upsert`, `List`, `Update`, `Delete`, `Status`. No `Get`. `db/budgets.go:93-104` already has `BudgetsStore.ByID` — it is dead code (used internally by `Upsert` and `Update` only). `routes.go:69-74` registers no `GET /api/budgets/:id`. Pinned at `handlers/budgets_test.go:11-15` (the spec comment).

### Bug 5 — `models.BoolInt` has `MarshalJSON` but no `UnmarshalJSON` (LOW)

`backend/internal/models/models.go:7-12`:

```go
type BoolInt int
func (b BoolInt) MarshalJSON() ([]byte, error) {
    return boolJSON(b != 0)
}
```

There is no `UnmarshalJSON`. Round-trip impossible — `json.Unmarshal("true", &BoolInt(0))` would error. Workaround: tests use `map[string]any` (e.g. `accounts_test.go:255-280`). Implicit pin; will be made explicit in this change.

## Affected Areas

- `backend/internal/api/routes.go` — bug 1 (refactor middleware grouping) · bugs 3a/4a (new routes)
- `backend/internal/api/handlers/auth.go` — bug 1 (handler untouched, contract stays)
- `backend/internal/api/handlers/budgets.go` — bug 2 (input validation) · bug 4a (new `Get` method)
- `backend/internal/api/handlers/categories.go` — bug 3a (new `Delete` method)
- `backend/internal/db/budgets.go` — bug 4a (`ByID` is reused, no new store method needed)
- `backend/internal/db/categories.go` — bug 3a (new `Delete` method + FK handling)
- `backend/internal/models/models.go` — bug 5 (new `UnmarshalJSON`)
- `backend/internal/api/handlers/auth_test.go` — bug 1 (flip pinned test)
- `backend/internal/api/handlers/budgets_test.go` — bug 2 (flip pinned test) · bug 4a (new test)
- `backend/internal/api/handlers/categories_test.go` — bug 3a (new test, or no change)
- `backend/internal/api/handlers/accounts_test.go` — bug 5 refactor (optional, replace `map[string]any` with `[]models.Account`)
- `backend/internal/models/models_test.go` — bug 5 (new test file)
- `apps/web/src/api/schema.d.ts` — regenerated via `pnpm gen:api` if any handler `@Router` annotation changes (bugs 3a/4a only)

## Proposed Fixes

### Bug 1 — fix auth/status middleware (DEFINITIVE)

In `routes.go`, introduce an `authOptional` sub-group that has `AuthMiddleware` but not `RequireAuth`, and move `/auth/status` onto it:

```go
apiGroup.POST("/auth/login", authHandler.Login)
apiGroup.POST("/auth/logout", authHandler.Logout)
authOptional := apiGroup.Group("")
authOptional.Use(AuthMiddleware(srv))
authOptional.GET("/auth/status", authHandler.AuthStatus)
```

Login and Logout stay on the public group (they don't read `c.Get` anyway). `/auth/status` now runs `AuthMiddleware`, which sets `authenticated=true` and `issuedAt` for a valid cookie — exactly the contract the handler expects. `RegisterAuthRoutes` is already correct and needs no change.

Flip the pinned assertion in `auth_test.go:144-146` from "production bug was fixed? Update this test." to `if !resp.Authenticated { t.Error(...) }`. Add a 3rd subtest asserting `resp.IssuedAt` is non-empty.

### Bug 2 — fix month format validation (DEFINITIVE)

In `handlers/budgets.go`, add a regex check immediately after `ShouldBindJSON`:

```go
import "regexp"
var monthRe = regexp.MustCompile(`^(\d{4})-(0[1-9]|1[0-2])$`)
...
if !monthRe.MatchString(req.Month) {
    c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "month must be YYYY-MM"})
    return
}
```

Inline check is consistent with the rest of the codebase. No new `Validate()` method on the request struct. Flip the pinned test at `budgets_test.go:91-93` to assert `w.Code == http.StatusBadRequest`. Add a 2nd subtest covering `2026-00`, `26-06`, and `2026/06` as invalid formats (table-driven).

### Bug 3 — Categories.Delete (USER DECISION)

**Two options:**

| Option | Description | Production LOC | Test LOC | Notes |
|---|---|---|---|---|
| **(a) Implement hard delete with FK unlink** | New `Store.Categories.Delete` that, in a single tx, sets `transactions.category_id = NULL` and `budgets.category_id = NULL` for affected rows, then `DELETE FROM categories`. New handler. New `DELETE /api/categories/:id` route. | ~25 | ~35 | Destructive. Should require an explicit query param `?confirm=true` to prevent fat-finger deletes. Status code: `200 {"ok": true, "unlinkedTransactions": N, "unlinkedBudgets": M}` so the UI can show a confirmation. |
| **(b) Soft-delete alias (no real difference from Archive)** | Add `Delete` as a wrapper around `Archive`. Adds nothing semantically. | ~10 | ~20 | Useless. **Not recommended.** |
| **(c) Accept current state — no production change** | Document the design intent: categories are soft-deleted via Archive; hard delete is intentionally not exposed. Remove the spec criterion. | 0 | 0 (or rewrite the gap comment) | **Recommended.** Mirrors the existing convention "Categories are an aggregate root with archival semantics; transactions and budgets remain linked to the (now-archived) category row for audit." |

**My recommendation: (c).** The current code is correct; the spec was wrong. A hard delete on a category with transactions would unlink historical financial data — that is a destructive operation that the user should perform via the database directly (and intentionally), not via a UI button.

### Bug 4 — Budgets.Get (USER DECISION)

**Two options:**

| Option | Description | Production LOC | Test LOC | Notes |
|---|---|---|---|---|
| **(a) Implement Get handler + route** | 1-line handler delegating to `Store.Budgets.ByID`. New `GET /api/budgets/:id` route. | ~12 | ~25 | Symmetry with `Accounts.ByID`, `Categories.ByID`, `Transactions.ByID`. `ByID` is already in the store — no new SQL. |
| **(b) Accept current state — no production change** | Document that `List?month=YYYY-MM` covers the read use case. Remove the spec criterion. | 0 | 0 | **Recommended.** The current `List?month=` works fine for the only known caller (the dashboard). |

**My recommendation: (a).** The cost is trivial (the store method already exists) and the symmetry with every other resource (`Accounts.ByID`, `Categories.ByID`, `Transactions.ByID`) makes the API more discoverable. But it is the smallest of the five wins — (b) is defensible.

### Bug 5 — BoolInt.UnmarshalJSON (DEFINITIVE)

In `models/models.go`, add:

```go
func (b *BoolInt) UnmarshalJSON(data []byte) error {
    s := strings.TrimSpace(strings.ToLower(string(data)))
    switch s {
    case "true", "1":
        *b = 1
    case "false", "0":
        *b = 0
    default:
        return fmt.Errorf("BoolInt: cannot unmarshal %s", data)
    }
    return nil
}
```

Accept `true`/`false`/`1`/`0`. Reject `null` (BoolInt is a value, not a pointer) and anything else. New file `backend/internal/models/models_test.go` with 4 subtests: `true→1`, `false→0`, `0→0`, `1→1`, plus a rejection case for `"yes"`.

Optional refactor in the same change (covered by the work-unit-commits shape): replace `[]map[string]any` with `[]models.Account` in `accounts_test.go:255-280` to prove the round-trip works end-to-end.

## Diff Forecast vs. 400-line Budget (D1)

| Bug | Prod LOC | Test LOC | Spec LOC (delta) | Subtotal | Schema regen? |
|---|---|---|---|---|---|
| 1 (auth/status) | +6 / -0 | +5 / -3 | +6 | +14 | No (annotation unchanged) |
| 2 (month format) | +7 / -0 | +8 / -3 | +5 | +17 | No |
| 5 (BoolInt) | +12 / -0 | +35 / -0 | +4 | +51 | No (BoolInt already serialized as bool) |
| 3a (Categories.Delete) | +25 / -0 | +35 / -0 | +8 | +68 | **Yes** |
| 4a (Budgets.Get) | +12 / -0 | +25 / -0 | +5 | +42 | **Yes** |
| 3c (accept current) | 0 | 0 / -1 | +4 | +3 | No |
| 4b (accept current) | 0 | 0 | +4 | +4 | No |
| 5 refactor (strong types) | 0 | +10 / -10 | 0 | +10 (net ≈0) | No |

**Forecast scenarios (D1 budget risk: Low):**

- **All-bugs-implemented (worst case)**: 14 + 17 + 51 + 68 + 42 + 10 = **~202 lines added**. ~70% of budget.
- **Recommended scenario** (3c + 4a + 1 + 2 + 5): 3 + 42 + 14 + 17 + 51 + 10 = **~137 lines added**. ~34% of budget.
- **Minimum** (3c + 4b + 1 + 2 + 5): 3 + 4 + 14 + 17 + 51 + 10 = **~99 lines added**. ~25% of budget.

All scenarios are well within the 400-line budget. **Chained PRs: not recommended.** 400-line budget risk: **Low**. Decision needed before apply: **Yes** (for bugs 3 and 4).

## Test Count Delta

| Bug | Subtests added | Subtests modified | Net |
|---|---|---|---|
| 1 | +1 (IssuedAt populated) | 1 (flip pinned) | +1 |
| 2 | +1 (table: `2026-00`, `26-06`, `2026/06`) | 1 (flip pinned) | +1 |
| 5 | +5 (round-trip + reject) | 0 | +5 |
| 3a (if chosen) | +3 (valid, unknown, 401) | 0 | +3 |
| 4a (if chosen) | +3 (valid, unknown, 401) | 0 | +3 |
| 3c / 4b (if chosen) | 0 | 0 | 0 |

**Net delta**: +7 subtests minimum, +13 if user picks (a) for both 3 and 4.

## Commit Boundaries (strict TDD shape)

User pref: "test que falla -> fix mínimo -> refactor". Pragmatic shape for review: **1 commit per bug**, with the test written first and the fix landing in the same commit (so the commit boundary is green, never red). The strict-TDD discipline is preserved in the *implementation* order — write the failing test, watch it fail, write the minimal fix, watch it pass — even though the final commit contains both.

Proposed commit order (lowest blast radius first):

1. **`fix(models): add BoolInt.UnmarshalJSON`** — bug 5. New test file + production. Independent of everything else; lands first to de-risk the refactor.
2. **`fix(budgets): validate month format YYYY-MM in Upsert`** — bug 2. Flip pinned test + production fix.
3. **`fix(auth): wrap /api/auth/status with AuthMiddleware`** — bug 1. Flip pinned test + production fix.
4. **`feat(budgets): add Get(budgetID) handler`** — bug 4a (if user picks option a).
5. **`feat(categories): add Delete handler with FK unlink`** — bug 3a (if user picks option a).
6. **`refactor(tests): use strong types in accounts_test.go`** — bug 5 follow-up; consumes BoolInt.UnmarshalJSON.

**If user picks 3c + 4b**, drops commits 4 and 5, keeps the rest in the same order. Commit 6 is then a no-op (nothing to refactor).

Every commit keeps `cd backend && go test ./... -count=1 && go vet ./... && gofmt -l .` green, and the pre-push hook (`apps/web/src/api/schema.d.ts` freshness) passes (commits 1, 2, 3, 6 don't touch handlers; commits 4 and 5 each require `pnpm gen:api` before commit).

## Risks

1. **Schema regeneration drift** (medium). Commits 4 and 5 change `@Router` annotations → `swaggo init` must run → `pnpm gen:api` must run → `schema.d.ts` must be staged. The pre-push hook enforces this; failure mode is just a rejected push, not a silent regression. **Mitigation**: run `pnpm gen:api` and `pnpm typecheck` locally before each of those commits.
2. **Flipping pinned tests is the fix, not separate work** (low). `auth_test.go:144-146` and `budgets_test.go:91-93` currently assert the bug. The fix flips them. The risk is accidentally landing a "fix" that doesn't also flip the test, or flipping the test without landing the fix. **Mitigation**: per the chosen commit shape, test + production change in the same commit.
3. **Frontend does not call the affected routes** (low). `/api/auth/status` is not invoked from `apps/web`; `GET /api/budgets/:id` and `DELETE /api/categories/:id` are new and not called. Adding them is purely additive. Schema regen is still required for the type file to stay accurate, but no UI change is needed.
4. **BoolInt refactor is optional** (very low). Skipping the `accounts_test.go` refactor is fine; the production change stands alone. If included, the refactor commit must come after the BoolInt fix lands (otherwise the strong-typed assertion would fail to compile).
5. **AuthMiddleware on `/auth/status` changes external observable behavior** (low). Today, the route is effectively a no-op. After the fix, it returns `{"authenticated": true, "issuedAt": "..."}` with a valid cookie. No known caller relies on the old "always false" behavior, but a hostile search of the codebase for `auth/status` consumers should be done in the spec phase. (None found in the local repo, per `grep` of `apps/web/src`.)

## Decision Points (USER DECISION REQUIRED)

These two bugs must be resolved by the user before the spec phase can draft a complete proposal:

### Decision 1 — Bug 3 (Categories.Delete)

- **(a)** Implement hard delete with FK unlink + `?confirm=true` guard. 53 LOC, 1 new route, schema regen.
- **(b)** Implement soft-delete alias of Archive. 30 LOC. **Not recommended** (no semantic value).
- **(c)** Accept current state. Remove the spec criterion. 3 LOC (doc only). **Recommended.**

### Decision 2 — Bug 4 (Budgets.Get)

- **(a)** Add `Get` handler + `GET /api/budgets/:id` route. 42 LOC, schema regen. Symmetric with all other resources.
- **(b)** Accept current state. Remove the spec criterion. 4 LOC (doc only). **Recommended** for minimal blast radius; **(a)** is a 1-day win for API discoverability.

## Next Phase

**sdd-propose** — but gated on the user's decisions for bugs 3 and 4 above. The orchestrator should present both decisions to the user in a single ask (two short questions, in order) before launching `sdd-propose`. The proposal will then draft `proposal.md` referencing the chosen options and forecasting the implementation tasks.

## Ready for Proposal

**No** — pending user decisions on bugs 3 and 4. The orchestrator should:

1. Show the user this exploration summary (≤6 lines).
2. Ask: "Bug 3 (Categories.Delete) — (a) implement with FK unlink, (b) soft-delete alias, or (c) accept current state? My recommendation: (c)."
3. Ask: "Bug 4 (Budgets.Get) — (a) implement, or (b) accept current state? My recommendation: (a)."
4. Once both are answered, launch `sdd-propose` with the chosen options baked in.
