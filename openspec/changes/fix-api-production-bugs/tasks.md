# Tasks: Fix 5 API Production Bugs

> **Change**: `fix-api-production-bugs`
> **Branch**: `fix/api-production-bugs` (from `main`)
> **Mode**: openspec · ask-on-risk · 400-line budget · **strict TDD**
> **Order locked**: s5 → s2 → s1 → s4 → s3 (lowest-blast-radius first)
> **Commit shape** (matches `proposal.md:85-91`): 5 commits, each keeps the test+gate green.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~150 (additions; ~5 deletions from pinned-flip comments) |
| 400-line budget risk | **Low** (≈38% of budget; well under the 800 ask threshold) |
| Chained PRs recommended | **No** — single PR is well under all budgets |
| Suggested split | Single PR; 5 atomic commits land in order |
| Delivery strategy | ask-on-risk (C1); 800-line ceiling not approached |
| Chain strategy | `size:exception` not needed |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Per-commit diff forecast

| # | Commit | Prod LOC | Test LOC | Total | Schema regen? |
|---|--------|---------:|---------:|------:|:-------------:|
| 1 | s5 — `BoolInt.UnmarshalJSON` + tests refactor | +15 | +35 | +50 | No |
| 2 | s2 — `Budgets.Upsert` month regex | +4 | +15 | +19 | No |
| 3 | s1 — `authOptional` sub-group | +3 | +15 | +18 | No |
| 4 | s4 — `Budgets.Get` handler + route | +15 | +35 | +50 | **Yes** (commit regen inline if non-empty) |
| 5 | s3 — gap comment rewrite | 0 | +5 | +5 | No |
| **Σ** | | **+37** | **+105** | **+142** | |

**File tally** — 3 production files modified (`routes.go`, `handlers/budgets.go`, `models/models.go`); 4 test files modified (`auth_test.go`, `budgets_test.go`, `accounts_test.go`, `categories_test.go`, plus `models_test.go` extended — not new). Schema regen expected empty for s4 (same `@Router` shape as every other ByID).

## Conventions (apply to every task)

- **Strict TDD**: RED → GREEN → REFACTOR within each task. Production code never lands without its failing test in the same commit.
- **Per-commit gate**: `cd backend && go test ./<touched-pkg>/... -count=1 && go vet ./... && gofmt -l . <files>` exits 0.
- **Final gate** (after Commit 5): `cd backend && go test ./... -count=1 && go vet ./... && gofmt -l .` exits 0.
- **Pre-push hook**: s4 only — `pnpm gen:api` must run before commit; if `apps/web/src/api/schema.d.ts` diff is non-empty (only a new `get` block in the `/api/budgets/{id}` key is expected), stage it inside the s4 commit.
- **Verification grep**: `rg 'map\[string\]any' backend/internal/api/handlers/` returns zero hits for Account/Category list decodes after Commit 1.
- **No new Go modules**, no DB migrations, no frontend code.

---

## Commit 1 — s5: `models.BoolInt.UnmarshalJSON` + strong-typed tests refactor

### Task T1.1 — s5: add `UnmarshalJSON` + 5 subtests + decoders refactor
**Spec criteria**: 8, 9, 10
**Commit**: 1 (`fix(models): add BoolInt.UnmarshalJSON + strong-typed tests refactor`)
**Strict TDD**: yes

**Files**:
- `backend/internal/models/models.go` — add pointer-receiver `func (b *BoolInt) UnmarshalJSON(data []byte) error` (per `design.md:17-34`); add `encoding/json`+`fmt` imports.
- `backend/internal/models/models_test.go` (already exists, 39 LOC, package `models_test`, with a duplicate package-local `BoolInt` + a `TestBoolInt_MarshalJSON`) — **delete the package-local `BoolInt` duplicate** (it doesn't test production) and replace contents with: `TestBoolInt_MarshalJSON` (existing 2 subtests against `models.BoolInt`) + new `TestBoolInt_UnmarshalJSON` with 5 subtests (`true→1`, `false→0`, `0→0`, `1→1`, `"yes"`→error). Reuse the table-driven shape already in the file.
- `backend/internal/api/handlers/accounts_test.go` — refactor `[]map[string]any` → `[]models.Account` at the Account-list decodes (~`TestAccounts_List_HTTP` lines 25-110 and `TestAccounts_Balances_HTTP` lines 374-435); refactor single Account object decodes → `models.Account`.
- `backend/internal/api/handlers/categories_test.go` — same refactor for Category list/object decodes (lines 18-150).

**Steps**:
1. **RED**: append 5 subtests in `TestBoolInt_UnmarshalJSON` referencing `models.BoolInt{0}`; delete the package-local duplicate `BoolInt` so the file compiles against the production type. Run `cd backend && go test ./internal/models/...` → expect compile failure (`UnmarshalJSON` undefined on `BoolInt`) → after GREEN step expects all 5 subtests green. The `bool-acceptance` subtest (`"yes"`) expects a non-nil error.
2. **GREEN**: add the `UnmarshalJSON` method per `design.md:17-34`. Re-run; expect pass.
3. **REFACTOR**: replace `var resp []map[string]any` with `var resp []models.Account` and assert by field name (`acc.Archived`, `cat.Kind`, etc.). Run full suite, not just the changed file.

**Acceptance**:
- `cd backend && go test ./... -count=1` green.
- `gofmt -l backend/internal/models backend/internal/api/handlers` empty for changed files.
- `rg 'map\[string\]any' backend/internal/api/handlers/{accounts,categories}_test.go` zero matches for Account/Category list/object decodes. (Transaction test file out of scope per design — `categories.go` only.)
- Spec 8, 9, 10 → COMPLIANT.

---

## Commit 2 — s2: `Budgets.Upsert` month format validation

### Task T2.1 — s2: regex check + flip pinned assertion + table-driven extension
**Spec criteria**: 3, 4
**Commit**: 2 (`fix(budgets): validate month format YYYY-MM in Upsert`)
**Strict TDD**: yes

**Files**:
- `backend/internal/api/handlers/budgets.go:1-66` — add `"regexp"` import; declare `var monthRe = regexp.MustCompile(\`^(\d{4})-(0[1-9]|1[0-2])$\`)` at package scope; insert inline check after `ShouldBindJSON` returning 400 + `{"error": "month must be YYYY-MM"}`.
- `backend/internal/api/handlers/budgets_test.go:78-94` — flip pinned subtest from `want: 200` → `want: 400` + body match `{"error":"month must be YYYY-MM"}`; append `t.Run("invalid month formats are 400 (table-driven)", ...)` covering `{"2026-00","26-06","2026/06",""}` (5 sub-cases total — `"2026-13"` stays as its own explicit case).

**Steps**:
1. **RED**: flip the existing subtest assertion (200→400). Run `cd backend && go test ./internal/api/handlers/ -run Budgets_Upsert` → expect failure (handler still 200). Add the table-driven subtest → also red.
2. **GREEN**: add `monthRe` decl + check. Re-run → both pass.
3. **REFACTOR**: leave regex inline (matches codebase style); no `Validate()` extraction.

**Acceptance**:
- `cd backend && go test ./internal/api/handlers/ -run Budgets -count=1` green.
- `gofmt -l backend/internal/api/handlers/budgets.go backend/internal/api/handlers/budgets_test.go` empty.
- Spec 3, 4 → COMPLIANT.

---

## Commit 3 — s1: `authOptional` sub-group for `/auth/status`

### Task T3.1 — s1: route regroup + flip pinned assertion + IssuedAt subtest
**Spec criteria**: 1, 2
**Commit**: 3 (`fix(auth): wrap /api/auth/status with AuthMiddleware`)
**Strict TDD**: yes

**Files**:
- `backend/internal/api/routes.go:22-29` — replace `apiGroup.GET("/auth/status", authHandler.AuthStatus)` with:
  ```go
  // authOptional reads c.Get("authenticated") (set by AuthMiddleware)
  // for endpoints that must answer for guests without 401ing.
  authOptional := apiGroup.Group("")
  authOptional.Use(AuthMiddleware(srv))
  authOptional.GET("/auth/status", authHandler.AuthStatus)
  ```
- `backend/internal/api/handlers/auth_test.go:132-148` — flip pinned subtest assertion: `if resp.Authenticated { t.Error(...) }` → `if !resp.Authenticated { t.Error("authenticated = false, want true (after middleware fix)") }`. Append new subtest `returns IssuedAt non-empty with a valid cookie` asserting `resp.IssuedAt != ""` and parses as RFC3339.

**Steps**:
1. **RED**: flip existing assertion. Run `cd backend && go test ./internal/api/handlers/ -run AuthStatus` → expect failure (middleware missing). Add IssuedAt subtest → also red.
2. **GREEN**: introduce `authOptional`. Re-run → both pass.
3. **REFACTOR**: keep `authOptional` reusable; ensure `RegisterAuthRoutes` (`routes.go:86-92`) is **untouched** (already correct via its own middleware call); verify no regression in `TestLogin_CookieIsUsable`.

**Acceptance**:
- `cd backend && go test ./... -count=1` green.
- `gofmt -l backend/internal/api/routes.go backend/internal/api/handlers/auth_test.go` empty.
- Spec 1, 2 → COMPLIANT (criterion 2 was already regression-guarded — the no-cookie path must still return `authenticated:false`).

---

## Commit 4 — s4: `Budgets.Get(budgetID)` handler + `GET /api/budgets/:id` route

### Task T4.1 — s4: new handler + route + 3 subtests + schema regen
**Spec criteria**: 5, 6, 7
**Commit**: 4 (`feat(budgets): add Get(budgetID) handler + GET /api/budgets/:id`)
**Strict TDD**: yes

**Files**:
- `backend/internal/api/handlers/budgets.go` — add `Get(c)` method (~15 LOC: 9-line swag annotation matching `Accounts.ByID` shape + 4-line body `b, err := h.Server.Store.Budgets.ByID(c.Param("id")); if err != nil { 404 } else { 200 + b }`). Reuse the existing `db/budgets.go:93-104` `Store.Budgets.ByID` — no new SQL.
- `backend/internal/api/routes.go:68-73` — add `protected.GET("/budgets/:id", budgetsHandler.Get)` inside the `protected` group.
- `backend/internal/api/handlers/budgets_test.go` — append `TestBudgets_Get_HTTP` with 3 subtests via `testutil.NewServer` + `s.Login`: valid id → 200 + non-empty `models.Budget` JSON; unknown id → 404 + `{"error":"budget not found"}`; no cookie → 401.

**Steps**:
1. **RED**: write 3 subtests. Without the route wired, `GET /api/budgets/...` returns 404 from Gin. Run `cd backend && go test ./internal/api/handlers/ -run Budgets_Get` → expect 3 failures (or compile error if `Get` doesn't exist yet).
2. **GREEN**: add handler + swag annotation + route. Re-run → all 3 pass.
3. **REFACTOR**: run `pnpm gen:api`; `git diff apps/web/src/api/schema.d.ts`. **Expected diff** (only this): a new `get:` block added to the existing `/api/budgets/{id}` key (same shape as `/api/accounts/{id}` `get:`). If the diff is anything else → stop and re-run `swag init`. Stage any non-empty regen inside this commit.

**Acceptance**:
- `cd backend && go test ./internal/api/handlers/ -run Budgets -count=1` green.
- `cd backend && go test ./... -count=1 && go vet ./... && gofmt -l .` all exit 0.
- `git diff apps/web/src/api/schema.d.ts` is empty OR shows only the new `get:` block.
- Spec 5, 6, 7 → COMPLIANT.

---

## Commit 5 — s3: `Categories.Delete` out-of-scope-by-decision (no production code)

### Task T5.1 — s3: rewrite gap comment + grep verification
**Spec criteria**: 11
**Commit**: 5 (`docs(test): mark Categories.Delete as out-of-scope-by-decision`)
**Strict TDD**: no (no production change)

**Files**:
- `backend/internal/api/handlers/categories_test.go:341-347` — rewrite the gap comment block to mark the criterion **out-of-scope-by-decision**, citing:
  - `PATCH /api/categories/:id/archive` already covers soft-delete.
  - `backend/internal/db/migrations/0001_init.sql:40` and `:60` declare `category_id TEXT REFERENCES categories(id)` with NO `ON DELETE` clause → SQLite default `NO ACTION` → a hard delete with referenced rows would fail with `FOREIGN KEY constraint failed`, silently corrupting audit history if it somehow succeeded.

**Steps**:
1. Rewrite the comment block (no test or production code change).
2. Verification grep: `rg 'func \(h \*CategoriesHandler\) Delete' backend/internal/api/handlers/categories.go` returns zero matches.

**Acceptance**:
- `cd backend && go test ./... -count=1` green (no code changed; gate must remain so).
- `gofmt -l backend/internal/api/handlers/categories_test.go` empty.
- Spec 11 status → **COMPLIANT · OUT-OF-SCOPE-BY-DECISION**.

---

## Final cross-cut gate (after Commit 5)

```
cd backend && go test ./... -count=1 && go vet ./... && gofmt -l .
```

- All 12 spec criteria marked COMPLIANT (criterion 11 = OUT-OF-SCOPE-BY-DECISION).
- Pre-push hook (`apps/web/src/api/schema.d.ts` freshness) accepts the branch.
- Single PR; rollback = `git revert <merge-commit>`. Each commit independently guarded.
