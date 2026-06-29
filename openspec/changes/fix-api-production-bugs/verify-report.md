# Verify Report — fix-api-production-bugs

**Change**: fix-api-production-bugs
**Mode**: Strict TDD (active)
**Branch**: `fix/api-production-bugs` (base: `main`)
**HEAD**: `fbe81fc` (7 commits ahead of `main`)
**Date**: 2026-06-29

## Verification Report

### Verdict

**MERGE — PASS WITH WARNINGS**

- 0 CRITICAL, 2 WARNING, 1 SUGGESTION
- 10/12 spec criteria COMPLIANT, 1 PARTIAL, 1 COMPLIANT · OUT-OF-SCOPE-BY-DECISION
- All gates pass (build, test, vet, gofmt for diff scope)
- Schema regen: clean after `chore(api): regenerate schema.d.ts` (commit `abc86f8`)

### Coverage Delta (change-scope packages)

| Package | Before (improve-api-testing baseline) | After | Delta | Status |
|---|---|---|---|---|
| `internal/api` | 93.2% | **93.4%** | +0.2pp | maintained (above 70% target) |
| `internal/api/handlers` | 80.6% | **82.9%** | +2.3pp | improved |
| `internal/models` | 0% (no test file) | **84.2%** | +84.2pp | new coverage (5 subtests in `models_test.go`) |

Coverage measured via `go test -cover ./...` on the branch HEAD.

### Per-Function Drill-Down (key handlers/functions touched by this change)

| Function | Coverage | Notes |
|---|---|---|
| `AuthStatus` (auth.go:101) | **100.0%** (was 44.4%) | All branches now reachable: no-cookie → false; valid cookie → true + issuedAt. |
| `Budgets.Upsert` (budgets.go:53) | high | Regex check adds 1 branch; 5 invalid-month cases all return 400. |
| `Budgets.Get` (budgets.go new) | high | Thin wrapper over `Store.Budgets.ByID`; 3 subtests (200/404/401). |
| `BoolInt.MarshalJSON` (models.go) | 100% | Pre-existing — kept. |
| `BoolInt.UnmarshalJSON` (models.go new) | 100% | 5 subtests (true→1, false→0, 0→0, 1→1, "yes" reject). |

### Build & Tests Execution

**Build**: PASS
```text
$ go build ./...
(no output)
```

**Tests**: PASS — 0 failures, 0 skips
```text
$ go test -count=1 ./...
ok  	github.com/mgurt/finances/cmd/server              0.744s
ok  	github.com/mgurt/finances/internal/api             1.200s
ok  	github.com/mgurt/finances/internal/api/handlers    5.788s
ok  	github.com/mgurt/finances/internal/api/testutil    1.421s
?   	github.com/mgurt/finances/internal/apitypes        [no test files]
ok  	github.com/mgurt/finances/internal/auth            0.670s
ok  	github.com/mgurt/finances/internal/db              0.426s
?   	github.com/mgurt/finances/internal/docs            [no test files]
ok  	github.com/mgurt/finances/internal/models          0.254s
```

**Vet**: PASS — `go vet ./...` returns no output.

**Gofmt (diff scope)**: PASS
```text
$ gofmt -l \
    internal/api/routes.go \
    internal/api/handlers/budgets.go \
    internal/api/handlers/budgets_test.go \
    internal/api/handlers/auth_test.go \
    internal/api/handlers/accounts_test.go \
    internal/api/handlers/categories_test.go \
    internal/models/models.go \
    internal/models/models_test.go
# no output
```

`gofmt -l .` over the whole tree still lists 30+ pre-existing files (e.g., `cmd/server/main.go`, `internal/api/handlers/accounts.go`, `internal/api/handlers/auth.go`, `internal/db/...`). These are pre-existing drift explicitly out of scope per the proposal's "Out of Scope" section and `improve-api-testing` WARNING-2 (separate `chore(fmt)` PR).

**Pre-push hook** (`schema.d.ts` freshness): PASS — `pnpm gen:api` shows the diff is already committed in `abc86f8 chore(api): regenerate schema.d.ts for Budgets.Get`.

### Spec Compliance Matrix (12 acceptance criteria)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `GET /api/auth/status` returns `authenticated:true` (valid cookie) | **COMPLIANT** | `auth_test.go:132-148` — pinned assertion flipped; `routes.go:22-29` introduces `authOptional` sub-group with `AuthMiddleware` only. `AuthStatus` coverage went from 44.4% → 100.0%. |
| 2 | `GET /api/auth/status` returns `authenticated:false` (no cookie) | **COMPLIANT** | `auth_test.go:120-131` — regression guard still passes; middleware sets `authenticated=false` on missing/invalid cookie (`middleware.go:36-58`). |
| 3 | `POST /api/budgets` rejects `month="2026-13"` with 400 | **COMPLIANT** | `budgets_test.go:78-94` — pinned assertion flipped; `budgets.go:Upsert` adds `monthRe.MatchString` check after `ShouldBindJSON`. |
| 4 | `POST /api/budgets` rejects table-driven invalid month formats | **COMPLIANT** | `budgets_test.go` — new table-driven subtests cover `2026-00`, `2026-1`, `26-06`, `2026/06`, `""`. All return 400. |
| 5 | `GET /api/budgets/:id` returns 200 + budget for existing id | **COMPLIANT** | `budgets_test.go:TestBudgets_Get_HTTP > valid id returns 200`; new `Budgets.Get` handler at `budgets.go` wraps `Store.Budgets.ByID`. |
| 6 | `GET /api/budgets/:id` returns 404 for unknown id | **COMPLIANT** | `budgets_test.go:TestBudgets_Get_HTTP > unknown id returns 404` — same handler. |
| 7 | `GET /api/budgets/:id` returns 401 without cookie | **COMPLIANT** | `budgets_test.go:TestBudgets_Get_HTTP > returns 401 without auth cookie`; route is mounted in `protected` group, so `RequireAuth` 401s. |
| 8 | `models.BoolInt` round-trips through JSON for {true, false, 1, 0} | **COMPLIANT** | `models_test.go:TestBoolInt_UnmarshalJSON` — 4 subtests (`true→1`, `false→0`, `0→0`, `1→1`). Plus the kept 2 subtests for `MarshalJSON`. |
| 9 | `models.BoolInt` rejects unknown JSON tokens | **COMPLIANT** | `models_test.go:TestBoolInt_UnmarshalJSON > rejects_non-bool_/_non-0|1_tokens` — passes; returns error and leaves `*b` unchanged. |
| 10 | Handler list-response tests use strong typed slices | **PARTIAL** | Design.md scoped the refactor to `accounts_test.go` and `categories_test.go`. After the s5 refactor, the response decoders in those two files use `[]models.Account` / `[]models.Category`. However, `rg 'map\[string\]any' backend/internal/api/handlers/` still returns 94 hits across `transactions_test.go`, `budgets_test.go`, and residual decoders in `accounts_test.go` / `categories_test.go`. The literal grep in the spec is not met. The narrative acceptance (the 2 scoped files use strong types, the workaround is removed from the files the design targeted) IS met. See WARNING-1. |
| 11 | `DELETE /api/categories/:id` is intentionally NOT implemented | **COMPLIANT · OUT-OF-SCOPE-BY-DECISION** | `categories_test.go:341-353` — gap comment rewritten to cite FK `NO ACTION` rationale. `rg 'func \(h \*CategoriesHandler\) Delete' backend/internal/api/handlers/categories.go` returns zero matches. The only mutating endpoints on categories remain `Archive`, `Reorder`, `Update`, `Create`. |
| 12 | Build, test, vet, gofmt, pre-push gates green (meta) | **COMPLIANT** | All four gates pass on the final tree (this report's `Build & Tests Execution` section). Pre-push hook: schema.d.ts regenerated in `abc86f8`. The pre-existing 30+ gofmt drift files are explicitly out of scope (separate `chore(fmt)` PR per the proposal's "Out of Scope" section). A `chore(models): gofmt models.go` commit (`fbe81fc`) was added to keep the diff scope clean. |

**Compliance summary**: 10/12 fully COMPLIANT, 1/12 PARTIAL (#10), 1/12 COMPLIANT · OUT-OF-SCOPE-BY-DECISION (#11).

### Commit Map

| # | SHA | Message | Spec criteria | Diff scope |
|---|-----|---------|---------------|-----------|
| 1 | `b119927` | `fix(models): add BoolInt.UnmarshalJSON + strong-typed tests refactor` | 8, 9, 10 (partial) | models.go, models_test.go, accounts_test.go, categories_test.go |
| 2 | `354c31f` | `fix(budgets): validate month format YYYY-MM in Upsert` | 3, 4 | budgets.go, budgets_test.go |
| 3 | `063acdc` | `fix(auth): wrap /api/auth/status with AuthMiddleware` | 1, 2 | routes.go, auth_test.go |
| 4 | `601ec1c` | `feat(budgets): add Get(budgetID) handler + GET /api/budgets/:id` | 5, 6, 7 | budgets.go, routes.go, budgets_test.go |
| 5 | `abc86f8` | `chore(api): regenerate schema.d.ts for Budgets.Get` | (12 helper) | schema.d.ts |
| 6 | `f8c8f97` | `docs(test): mark Categories.Delete as out-of-scope-by-decision` | 11 | categories_test.go (comment only) |
| 7 | `fbe81fc` | `chore(models): gofmt models.go (pre-existing comment-alignment drift)` | 12 (helper) | models.go |

### TDD Compliance (Strict TDD mode)

| Check | Result | Details |
|---|---|---|
| TDD evidence in apply-progress (#451) | YES | All 5 bugs went RED → GREEN → REFACTOR. Per-commit `go test ./internal/<pkg> -count=1` confirmed RED before the production change and GREEN after. |
| Tests written before production code | YES | `models_test.go:TestBoolInt_UnmarshalJSON` was added before `models.go:UnmarshalJSON`. `budgets_test.go` invalid-month cases were added before `budgets.go:monthRe`. `auth_test.go` pinned test was flipped before the `routes.go` regroup. `TestBudgets_Get_HTTP` 3 subtests were added before the `Get` handler and route. |
| Triangulation adequate | YES | s5 has 5 UnmarshalJSON subtests covering 4 accept cases + 1 reject case. s2 has 5 invalid-month cases. s1 has 2 subtests (with cookie, without). s4 has 3 subtests (200, 404, 401). |
| Safety net | YES | All pre-existing tests in `improve-api-testing` continue to pass — no regression in any of the 36 handler methods. |
| Strict TDD never fell back to Standard Mode | YES | No fixes landed without a backing failing test. |

**TDD Compliance**: 5/5 checks passed.

---

## Issues Found

### CRITICAL

**None.**

All 12 spec criteria walked. 0 non-compliant. Production code changes (s1, s2, s4, s5) are minimal, behavior is correct, tests cover both happy and failure paths, all gates pass.

### WARNING

1. **Spec criterion 10 partial — `map[string]any` grep still finds hits in 2 in-scope test files plus 2 out-of-scope files.**
   - The spec criterion 10 acceptance is: `rg 'map\[string\]any' backend/internal/api/handlers/` returns zero hits.
   - Actual state after s5: 94 hits remain, distributed as:
     - `transactions_test.go`: 35 hits — request bodies (legitimate) and response decoders (could be refactored). OUT OF SCOPE per `design.md:59-60`.
     - `budgets_test.go`: 22 hits — request bodies and response decoders. OUT OF SCOPE per `design.md`.
     - `accounts_test.go`: 14 hits — request bodies (legitimate) and 2 response decoders for the reorder endpoint. In-scope file but only 2 of the targeted decoders were refactored; the rest are not list responses (e.g., `var resp map[string]any` for `gin.H{"ok": true}` reorder response).
     - `categories_test.go`: 11 hits — request bodies and 1 reorder response. Same situation.
     - `dashboard_test.go`: 6 hits — request bodies.
   - **Narrative acceptance is met**: the 2 files explicitly scoped by `design.md` (`accounts_test.go`, `categories_test.go`) have been refactored for the list responses they cover. The `s5` commit shows the refactor; the strong-typed assertions pass.
   - **Strict grep acceptance is not met**: the spec text demands a literal `rg` zero-hit. This is a real PARTIAL.
   - **Recommendation**: either (a) accept the PARTIAL with the design-scope rationale (the user's brief explicitly scoped the refactor to `accounts/categories`, and the broader refactor would touch every test file for marginal benefit), or (b) follow up in a separate change to refactor `budgets_test.go` and `transactions_test.go`. The user should choose.

2. **Schema regen produced 318-line diff due to swagger2openapi toolchain version drift, not a real bug.**
   - `apps/web/src/api/schema.d.ts` had keys prefixed with `github_com_mgurt_finances_internal_models.X`. The currently-installed `swagger2openapi 7.0.8` produces `models.X` instead. Root cause: a previous toolchain change left the committed `schema.d.ts` out of sync with the installed toolchain.
   - The chore commit `abc86f8` stages the regenerated file. `rg 'github_com_mgurt_finances_internal_models' apps/web/src` returns zero hits in TS source, so the rename has no functional impact.
   - **Recommendation**: the chore is a necessary correctness fix; not a follow-up. Document the toolchain version in `AGENTS.md` so future contributors know which version produced the canonical schema.

### SUGGESTION

1. **Extend the `map[string]any` refactor** to `budgets_test.go` and `transactions_test.go` in a follow-up change. The work is mechanical (~50 hits to refactor) and would bring criterion 10 to full COMPLIANT. Estimated size: 100-200 lines of test-only changes; safe to land as a `chore(test): strong-typed list decoders` PR after this one.

---

## Recommendation

**MERGE** (PASS WITH WARNINGS).

Justification:
- **0 CRITICAL** issues. All 12 spec criteria walked. 10 fully COMPLIANT, 1 PARTIAL with documented design-scope rationale, 1 COMPLIANT · OUT-OF-SCOPE-BY-DECISION.
- **Coverage improved**: `internal/api/handlers` 80.6% → 82.9%; `internal/models` 0% → 84.2% (new test file with 7 subtests). `internal/api` maintained at 93.4%.
- **All gates pass**: `go build`, `go test ./... -count=1`, `go vet ./...`, `gofmt -l <diff-scope>` all clean. Pre-push hook green (schema.d.ts regenerated in chore).
- **5 production bugs from `improve-api-testing` verify warning-4 are now fixed** (4 production fixes + 1 explicit out-of-scope-by-decision retraction).
- **Strict TDD observed**: every fix went RED → GREEN → REFACTOR. The apply-progress engram #451 documents the per-commit cycle.

The single PARTIAL (criterion 10) is acceptable because:
- The user's original brief explicitly scoped the refactor to `accounts_test.go` and `categories_test.go` ("Después, eliminar el workaround `map[string]any` que usan los tests de accounts/categories").
- The design.md and tasks.md both adopted that scope.
- The literal-grep acceptance in the spec was tighter than the user's brief — a scope drift, not a missed requirement.
- Extending the refactor is safe and cheap; the SUGGESTION lists it as a follow-up.

The pre-existing gofmt drift on 30+ production files is OUT OF SCOPE per the proposal's "Out of Scope" section and the previous `improve-api-testing` change's WARNING-2. The single touched file (`models.go`) was fixed in a separate `chore(models): gofmt` commit (`fbe81fc`).

---

## Final Verdicts

| Aspect | Result |
|---|---|
| Build | PASS |
| Tests (full suite) | PASS |
| Vet | PASS |
| Gofmt (diff scope) | PASS |
| Coverage (target maintained/improved) | PASS |
| Acceptance criteria (12/12) | 10 PASS, 1 PARTIAL, 1 COMPLIANT · OUT-OF-SCOPE |
| TDD compliance | 5/5 PASS |
| Pre-push hook | PASS (schema regen chore landed) |
| Production bugs fixed | 4 (s1, s2, s4, s5) |
| Production bugs explicitly out of scope | 1 (s3, by user decision) |
| **Overall verdict** | **MERGE — PASS WITH WARNINGS** |
