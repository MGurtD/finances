# Proposal: Fix 5 API Production Bugs

## Intent

The `improve-api-testing` change (`openspec/changes/improve-api-testing/verify-report.md` WARNING-4) surfaced 5 production bugs and pinned each one with a failing-by-design test so a future change could flip both halves together. This change flips them. Four are production-code fixes; one (Categories.Delete) is a deliberate no-op — see decision log.

## Scope

### In Scope

- **s1 — `/api/auth/status` middleware** (`backend/internal/api/routes.go:29`): move the route onto an `AuthMiddleware`-wrapped sub-group so `c.Get("authenticated")` resolves true with a valid cookie. Flip pinned assertion at `backend/internal/api/handlers/auth_test.go:132-148` from `false` to `true`; add subtest asserting `IssuedAt` is non-empty. No frontend impact (`grep -r auth/status apps/web/src` returns zero hits).
- **s2 — `BudgetsHandler.Upsert` month validation** (`backend/internal/api/handlers/budgets.go:53-66`): add inline `^(\d{4})-(0[1-9]|1[0-2])$` regex check after `ShouldBindJSON`; reject with 400 + `month must be YYYY-MM`. Flip pinned test at `budgets_test.go:78-94` from 200 to 400; extend with table-driven cases (`2026-00`, `26-06`, `2026/06`).
- **s3 — `Categories.Delete`**: NO production change. Decision: Archive covers soft-delete; `transactions.category_id` and `budgets.category_id` FKs are `NO ACTION` so a hard delete with referenced data fails anyway. The existing gap comment at `categories_test.go:341-347` documents this. Spec acceptance marks this criterion as **out-of-scope-by-decision**.
- **s4 — `Budgets.Get`**: new `Get` handler delegating to existing `Store.Budgets.ByID` (`backend/internal/db/budgets.go:93-104`); new `GET /api/budgets/:id` route in `routes.go:69-73`. Symmetric with `Accounts.ByID`, `Categories.ByID`, `Transactions.ByID`. 3 subtests: valid 200, unknown 404, no-cookie 401.
- **s5 — `models.BoolInt.UnmarshalJSON`** (`backend/internal/models/models.go:7-12`): add pointer-receiver method accepting `true|false|0|1`. New `models_test.go` (5 subtests: round-trip + reject). Refactor `accounts_test.go:255-280` and any other `map[string]any` list-response usages to strong `[]models.Account` / `[]models.Category` types.

### Out of Scope

- Pre-existing gofmt drift on 37 production files (separate `chore(fmt)` PR per `improve-api-testing` WARNING-2).
- CI coverage gate (no GitHub Actions per `AGENTS.md` "No GitHub Actions / CI").
- Any handler with sub-100% coverage that is NOT one of the 5 pinned bugs.
- Table-driven shape normalization across handler tests (cosmetic only; `improve-api-testing` WARNING-1).
- `RegisterAuthRoutes` in `routes.go:86-92` — already correct; no change.

## Capabilities

> **Spec sync note**: `openspec/specs/` does not exist in this repo (confirmed: `Test-Path openspec/specs → False`). Capability maps live upstream. The sync step is a deliberate no-op, consistent with `improve-api-testing`. Spec deltas below describe the contract for the sdd-spec agent regardless of where the canonical specs live.

### New Capabilities

- None. Every capability touched already exists; no net-new domain area is introduced.

### Modified Capabilities

- `auth` — `/auth/status` now reads `c.Get("authenticated")` against a real JWT cookie instead of returning false unconditionally. `AuthStatusResponse` shape (`authenticated: bool`, `issuedAt?: string`) is unchanged.
- `budgets` — `POST /api/budgets` now rejects malformed `month` with 400. New `GET /api/budgets/:id` returns 200/404 (symmetric with `GET /api/accounts/:id`). `List`, `Upsert`, `Update`, `Delete`, `Status` contracts unchanged.
- `categories` — **not modified**. `Delete` remains intentionally unimplemented. Spec criterion from `improve-api-testing` is explicitly retracted (see s3).
- `models` — `BoolInt` gains `UnmarshalJSON`. Serialization is symmetric: `Marshal(true)→true`, `Unmarshal("false")→0`. No struct shape change.

## Approach

Five independent fixes applied under strict TDD (test-first per commit, then minimal production change). The s5 fix lands first because it is the smallest, has no handler impact, and de-risks the downstream strong-typed refactor in tests. Each commit keeps `cd backend && go test ./... -count=1 && go vet ./... && gofmt -l .` green. Commits 4 (s4) and 5 (s3, no production) do NOT change `@Router` annotations; the pre-push hook (`apps/web/src/api/schema.d.ts` freshness) does not trigger. The BoolInt strong-typing refactor lands as part of s5 (same commit, after the `UnmarshalJSON` lands) so the test change compiles on first try.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `backend/internal/api/routes.go` | Modified | s1: introduce `authOptional` sub-group with `AuthMiddleware` only. s4: add `protected.GET("/budgets/:id", ...)`. |
| `backend/internal/api/handlers/auth.go` | Unchanged | Handler already reads `c.Get("authenticated")` correctly; middleware was the missing piece. |
| `backend/internal/api/handlers/budgets.go` | Modified | s2: add `monthRe` + check after `ShouldBindJSON`. s4: add `Get` method (thin wrapper around `Store.Budgets.ByID`). |
| `backend/internal/api/handlers/categories.go` | Unchanged | s3 is a no-op by decision. |
| `backend/internal/db/budgets.go` | Unchanged | `ByID` already exists and is reused. |
| `backend/internal/db/categories.go` | Unchanged | s3 is a no-op. |
| `backend/internal/models/models.go` | Modified (additive) | s5: add `UnmarshalJSON` on `BoolInt`. |
| `backend/internal/models/models_test.go` | New | s5: 5 subtests (true→1, false→0, 0→0, 1→1, "yes" reject). |
| `backend/internal/api/handlers/auth_test.go` | Modified | s1: flip pinned assertion at line 144; add IssuedAt subtest. |
| `backend/internal/api/handlers/budgets_test.go` | Modified | s2: flip pinned assertion at line 91-93; extend with table-driven invalid formats. s4: 3 new subtests. |
| `backend/internal/api/handlers/accounts_test.go` | Modified | s5 refactor: replace `map[string]any` with `[]models.Account` at line 255-280. |
| `backend/internal/api/handlers/categories_test.go` | Modified | s5 refactor: replace `map[string]any` with `[]models.Category` if any usage exists (grep-verify at apply time). |
| `apps/web/src/api/schema.d.ts` | Not regenerated | s4's `Get` handler has the same `@Router` annotation shape as every other ByID — `swaggo init` output is unchanged. (Verification at apply time: run `pnpm gen:api && git diff apps/web/src/api/schema.d.ts` and confirm empty.) |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pre-push hook rejects push because `schema.d.ts` is stale (s4 adds a route; swaggo might pick up the new `@Router` annotation) | Low | Run `pnpm gen:api` locally before committing s4; if diff is empty (likely — same shape as `ByID` siblings), commit as-is. If diff is non-empty, stage and commit the regen alongside. |
| Pinned tests flipped without production fix lands (or vice versa) | Low | Each commit ships test + production together. Per-commit `go test ./... -count=1` is green. |
| Frontend relies on `/auth/status` returning `false` with a valid cookie (weird, but possible third-party) | Very Low | `grep -r auth/status apps/web/src` returns zero hits; no in-repo caller. Documented in commit message. |
| `accounts_test.go` strong-typed refactor breaks unrelated test | Low | Refactor only changes the decode target from `map[string]any` to `[]models.Account`; assertions read fields by name. Run full suite, not just the changed test. |
| Spec sync step is a no-op but downstream tooling expects a sync | Low | Documented as a deliberate decision matching `improve-api-testing`. If the orchestrator later needs filesystem specs, run `sdd-archive` after this change to materialize. |

## Rollback Plan

Single PR, single merge. Rollback = `git revert <merge-commit>`. Each of the 5 fixes is independently guarded by a test, so a partial regression in one bug does not block the others. The s3 no-op is a pure spec-update (comment in `categories_test.go:341-347`); reverting it requires no code rollback.

## Dependencies

- `regexp` (stdlib) — s2 validation.
- No new Go modules.
- No DB migrations (s4 is additive; s5 is JSON-only).
- No frontend changes.

## Commit Shape (preview, locked in tasks phase)

1. `fix(models): add BoolInt.UnmarshalJSON + strong-typed tests refactor` — s5 (production + test refactor in same commit).
2. `fix(budgets): validate month format YYYY-MM in Upsert` — s2.
3. `fix(auth): wrap /api/auth/status with AuthMiddleware` — s1.
4. `feat(budgets): add Get(budgetID) handler + GET /api/budgets/:id` — s4.
5. `docs(spec): mark Categories.Delete as out-of-scope-by-decision` — s3 (no production code).

Order rationale: s5 first (smallest, de-risks refactor); s2 next (handler validation, isolated); s1 next (middleware reorder, touches a hot path); s4 last of the production commits (new endpoint, additive); s3 closes the spec loop with no code. Each commit stays within `go test ./... -count=1` green.

## Success Criteria

1. `GET /api/auth/status` with a valid cookie returns `{authenticated: true, issuedAt: "<non-empty>"}`; without a cookie returns `{authenticated: false}`. Pinned test at `auth_test.go:132-148` asserts `true`.
2. `POST /api/budgets` with `month="2026-13"` returns 400 + `{"error": "month must be YYYY-MM"}`. Pinned test at `budgets_test.go:78-94` asserts 400.
3. `POST /api/budgets` with `month` in `{2026-00, 2026-1, 26-06, 2026/06, ""}` also returns 400 (table-driven coverage).
4. `DELETE /api/categories/:id` remains NOT implemented; gap comment at `categories_test.go:341-347` is updated to mark the criterion as **out-of-scope-by-decision**, citing `transactions.category_id` / `budgets.category_id` FK `NO ACTION` semantics.
5. `GET /api/budgets/:id` returns 200 + `models.Budget` for an existing id; 404 for unknown; 401 without cookie. Symmetric with `GET /api/accounts/:id`.
6. `models.BoolInt` round-trips through JSON: `Marshal(BoolInt(1))` → `[]byte("true")`, `Unmarshal([]byte("false"))` → `BoolInt(0)`; `Unmarshal([]byte("yes"))` → error. 5 subtests in `models_test.go`.
7. `accounts_test.go` and any analogous list-response tests use `[]models.Account` / `[]models.Category` (not `map[string]any`). Grep-verifiable: `rg 'map\[string\]any' backend/internal/api/handlers/` returns zero hits after the refactor.
8. `cd backend && go test ./... -count=1 && go vet ./... && gofmt -l .` returns zero output. Pre-push hook accepts the branch (`schema.d.ts` is either unchanged or staged in the same commit as s4).