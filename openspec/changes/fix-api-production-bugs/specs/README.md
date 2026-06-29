# Spec — fix-api-production-bugs

## Status: draft

## Background

This change is a follow-up to the merged `improve-api-testing` change (PR #23, verify report `openspec/changes/improve-api-testing/verify-report.md` WARNING-4, archived Engram #444). The verify report surfaced 5 production bugs and pinned each one with a failing-by-design test. This change flips 4 of those pinned assertions alongside minimal production-code fixes and explicitly retracts the 5th (Categories.Delete) as out-of-scope-by-decision. Strict TDD mode is active: every criterion below maps to a concrete test that sdd-verify can run row-by-row.

## Capability sync note

`openspec/specs/` does not exist in this repo (verified: the previous `improve-api-testing` archive report states this). Capability maps live upstream. Spec deltas in the `## ADDED Requirements` / `## MODIFIED Requirements` shape are NOT applicable here — that matching the precedent contract for this repo (see `openspec/changes/improve-api-testing/specs/README.md`), the acceptance contract below is a numbered behavioral list.

## Acceptance Criteria

### 1 — GET /api/auth/status returns authenticated:true (with valid cookie)
- **Bug**: s1 — `/api/auth/status` was not covered by `AuthMiddleware`, so `c.Get("authenticated")` always read false.
- **Given**: a valid `finances_session` cookie issued by `POST /api/auth/login` (correct password)
- **When**: `GET /api/auth/status` is called
- **Then**: 200 + body `{"authenticated": true, "issuedAt": "<non-empty RFC3339>"}`
- **Evidence**: `backend/internal/api/handlers/auth_test.go:132-148` — pinned assertion at line 144 flipped from `false` to `true`; new subtest asserts `resp.IssuedAt != ""`.
- **Production code**: `backend/internal/api/routes.go:22-29` — `/auth/status` moved onto an `AuthMiddleware`-only sub-group (`authOptional`).
- **Status**: _____ (sdd-verify)

### 2 — GET /api/auth/status returns authenticated:false (without a cookie) — regression guard
- **Bug**: s1 — the no-cookie path must still work after middleware regrouping.
- **Given**: no `finances_session` cookie
- **When**: `GET /api/auth/status` is called
- **Then**: 200 + body `{"authenticated": false}` (no `issuedAt` field, or empty string)
- **Evidence**: existing `TestAuthStatus_HTTP` "without a cookie" subtest at `backend/internal/api/handlers/auth_test.go:120-131`.
- **Status**: _____ (sdd-verify)

### 3 — POST /api/budgets rejects month="2026-13" with 400
- **Bug**: s2 — `Budgets.Upsert` accepted any string in the `month` field; only the later `Status()` call would crash on `time.Parse("2006-01", month)`.
- **Given**: a valid request body with `month: "2026-13"` (out-of-range month)
- **When**: `POST /api/budgets` is called
- **Then**: 400 + body `{"error": "month must be YYYY-MM"}`
- **Evidence**: `backend/internal/api/handlers/budgets_test.go:78-94` — pinned assertion flipped from `want: 200` to `want: 400` and body matched.
- **Production code**: `backend/internal/api/handlers/budgets.go:53-66` — inline regex check `^(\d{4})-(0[1-9]|1[0-2])$` added after `ShouldBindJSON`.
- **Status**: _____ (sdd-verify)

### 4 — POST /api/budgets rejects table-driven invalid month formats
- **Bug**: s2 — table-driven extension of the regex check.
- **Given**: a valid request body with `month` set to any of `"2026-00"`, `"26-06"`, `"2026/06"`, `""`
- **When**: `POST /api/budgets` is called
- **Then**: every case returns 400 + `{"error": "month must be YYYY-MM"}`
- **Evidence**: new table-driven subtest appended to `backend/internal/api/handlers/budgets_test.go` covering the 4 invalid variants.
- **Status**: _____ (sdd-verify)

### 5 — GET /api/budgets/:id returns 200 + the budget for an existing id
- **Bug**: s4 — `Budgets.Get(budgetID)` handler + `GET /api/budgets/:id` route missing. Decision: option (a) — implement; `Store.Budgets.ByID` already exists at `backend/internal/db/budgets.go:93-104` and is reused.
- **Given**: an authenticated admin session and a budget row in the DB
- **When**: `GET /api/budgets/{budgetID}` is called with that id
- **Then**: 200 + body `models.Budget` (full row, JSON shape symmetric with `Accounts.ByID`, `Categories.ByID`, `Transactions.ByID`)
- **Evidence**: `backend/internal/api/handlers/budgets_test.go` — new `TestBudgets_Get_HTTP` subtest ("valid id returns 200 + budget").
- **Production code**: `backend/internal/api/handlers/budgets.go` — new `Get` method (thin wrapper around `Store.Budgets.ByID`); `backend/internal/api/routes.go` — new `protected.GET("/budgets/:id", budgetsHandler.Get)` route.
- **Status**: _____ (sdd-verify)

### 6 — GET /api/budgets/:id returns 404 for an unknown id
- **Bug**: s4 — 404 path coverage.
- **Given**: an authenticated admin session and a budget id that does not exist
- **When**: `GET /api/budgets/{budgetID}` is called with that id
- **Then**: 404 + body `{"error": "budget not found"}`
- **Evidence**: `backend/internal/api/handlers/budgets_test.go` — new `TestBudgets_Get_HTTP` subtest ("unknown id returns 404").
- **Status**: _____ (sdd-verify)

### 7 — GET /api/budgets/:id returns 401 without a cookie
- **Bug**: s4 — auth chain coverage; proves the new route is mounted inside the `protected` group.
- **Given**: no `finances_session` cookie
- **When**: `GET /api/budgets/{anyid}` is called
- **Then**: 401 + body `{"error": "unauthorized"}`
- **Evidence**: `backend/internal/api/handlers/budgets_test.go` — new `TestBudgets_Get_HTTP` subtest ("no cookie returns 401").
- **Status**: _____ (sdd-verify)

### 8 — models.BoolInt round-trips through JSON for {true, false, 1, 0}
- **Bug**: s5 — `BoolInt` had `MarshalJSON` but no `UnmarshalJSON`; round-trip was impossible.
- **Given**: a value `models.BoolInt(1)` or `models.BoolInt(0)`
- **When**: `json.Marshal(b)` then `json.Unmarshal(data, &b2)` is performed
- **Then**: 4 subtests pass — `Marshal(BoolInt(1))→[]byte("true")`, `Unmarshal([]byte("false"))→BoolInt(0)`, `Unmarshal([]byte("0"))→BoolInt(0)`, `Unmarshal([]byte("1"))→BoolInt(1)`.
- **Evidence**: `backend/internal/models/models_test.go` — 4 round-trip subtests. New file (does not exist pre-change).
- **Production code**: `backend/internal/models/models.go:7-12` — new pointer-receiver `func (b *BoolInt) UnmarshalJSON(data []byte) error`.
- **Status**: _____ (sdd-verify)

### 9 — models.BoolInt rejects unknown JSON tokens
- **Bug**: s5 — rejection path.
- **Given**: a JSON token like `"yes"` or `null`
- **When**: `json.Unmarshal([]byte("\"yes\""), &b)` is called
- **Then**: an error is returned; `b` is unchanged (stays zero-value).
- **Evidence**: `backend/internal/models/models_test.go` — rejection subtest.
- **Status**: _____ (sdd-verify)

### 10 — Handler list-response tests use strong typed slices (not map[string]any)
- **Bug**: s5 follow-up — prove the round-trip end-to-end; remove the `map[string]any` workaround that masked the missing `UnmarshalJSON`.
- **Given**: every `*_test.go` under `backend/internal/api/handlers/` that decodes a list response
- **When**: the codebase is grep-checked after the refactor
- **Then**: `rg 'map\[string\]any' backend/internal/api/handlers/` returns zero hits. `backend/internal/api/handlers/accounts_test.go:255-280` decodes via `[]models.Account` and reads fields by name (e.g. `acc.Archived`, `acc.Name`). Analogous change applies to `categories_test.go` if any `map[string]any` list decoding exists there.
- **Evidence**: `rg` returns no matches; the refactored assertions still pass under the full suite.
- **Status**: _____ (sdd-verify)

### 11 — DELETE /api/categories/:id is intentionally NOT implemented (out-of-scope-by-decision)
- **Bug**: s3 — `Categories.Delete` handler + `DELETE /api/categories/:id` route missing.
- **Decision**: out-of-scope-by-decision (option c). The change does NOT add a hard-delete path. Rationale:
  - `PATCH /api/categories/:id/archive` already covers the soft-delete use case.
  - `backend/internal/db/migrations/0001_init.sql:40` and `:60` declare `category_id TEXT REFERENCES categories(id)` with NO `ON DELETE` clause → SQLite default is `NO ACTION`. A hard delete with referenced rows in `transactions` or `budgets` would fail with `FOREIGN KEY constraint failed` and silently corrupt audit history if it could succeed.
  - The existing test gap comment at `backend/internal/api/handlers/categories_test.go:341-347` is updated to cite this rationale and mark the criterion **out-of-scope-by-decision**.
- **Given**: anyone searching for a hard-delete affordance on categories
- **When**: the codebase is grep-checked
- **Then**: `rg 'func \(h \*CategoriesHandler\) Delete' backend/internal/api/handlers/categories.go` returns zero matches. The only mutating endpoints on categories remain `Archive`, `Reorder`, `Update`, `Create`.
- **Status**: _____ (sdd-verify) — expected `COMPLIANT · OUT-OF-SCOPE`

### 12 — Build, test, vet, gofmt, and pre-push gates are green (meta-criterion)
- **Scope**: the entire change, after all 4 production fixes land per the commit order in `proposal.md` lines 85-91.
- **Given**: the branch `fix/api-production-bugs` carries commits 1-5
- **When**: from `backend/`, `go build ./...`, `go test ./... -count=1`, `go vet ./...`, and `gofmt -l .` are each run
- **Then**: every command exits 0 and `gofmt -l` prints zero files (within this change's diff scope).
- **And**: the pre-push hook (`apps/web/src/api/schema.d.ts` freshness) accepts the push — either `schema.d.ts` is unchanged (s4's new `Get` handler has the same `@Router` annotation shape as every other `ByID` route; verify at apply time via `pnpm gen:api && git diff apps/web/src/api/schema.d.ts` returning empty) OR the regenerated file is staged in the same commit as the s4 change.
- **Evidence**: `cd backend && go test ./... -count=1` log; `gofmt -l .` output (empty for diff scope); pre-push hook green check.
- **Status**: _____ (sdd-verify)

## Out of Scope (by decision)

- **Categories.Delete (s3, option c)** — see criterion 11. The previous spec's expectation of a hard-delete endpoint is explicitly retracted. `Archive` covers the soft-delete use case; `transactions.category_id` and `budgets.category_id` FK `NO ACTION` semantics make hard delete unsafe by default.
- **Pre-existing gofmt drift on 37 production files** — tracked as a separate `chore(fmt)` follow-up per `improve-api-testing` WARNING-2.
- **CI coverage gate** — no GitHub Actions per `AGENTS.md`; no new infra introduced here.
- **Table-driven shape normalization across handler tests** — cosmetic only; `improve-api-testing` WARNING-1.
- **RegisterAuthRoutes in `routes.go:86-92`** — already correct; no change.

## Commit-to-Criterion Cross-Reference

| Commit (per `proposal.md:85-91`) | Criteria satisfied |
|---|---|
| 1. `fix(models): add BoolInt.UnmarshalJSON + strong-typed tests refactor` | 8, 9, 10 |
| 2. `fix(budgets): validate month format YYYY-MM in Upsert` | 3, 4 |
| 3. `fix(auth): wrap /api/auth/status with AuthMiddleware` | 1, 2 |
| 4. `feat(budgets): add Get(budgetID) handler + GET /api/budgets/:id` | 5, 6, 7 |
| 5. `docs(spec): mark Categories.Delete as out-of-scope-by-decision` | 11 |
| (per-commit gate, repeated) | 12 |
