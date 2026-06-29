# Archive Report: improve-api-testing

**Status**: archived — ready to merge
**Date**: 2026-06-29
**Branch**: `test/api-coverage` (base: `main`)
**Recommendation**: **MERGE** — change is complete, all artifacts persisted, verify passed with 0 CRITICAL issues.

---

## Summary

This was a test-infrastructure-only change for the `finances` backend HTTP layer. A shared `internal/api/testutil` sibling package replaced the 18-line cookie-auth closure that was duplicated across two test files and the hand-rolled per-file `gin.Engine` setups. The full `api.RegisterRoutes` table is mounted by every test, cookie parsing uses `http.Response.Cookies()`, and every handler method across `accounts.go` (8), `categories.go` (7), `budgets.go` (5), `transactions.go` (11), `auth.go` (3), `dashboard.go` (1), `health.go` (1) — 36 methods total — now has happy + explicit-failure coverage.

**Key numbers**

| Metric | Before | After | Delta |
|---|---|---|---|
| `internal/api` coverage | 7.5% | **93.2%** | +85.7 pp |
| `internal/api/handlers` coverage | 11.8% | **80.6%** | +68.8 pp |
| `internal/api/testutil` coverage | — | 76.5% | new package |
| Handlers tested (of 36) | 5 / 36 (14%) | 36 / 36 (100%) | every method covered |
| `c.Cookie("finances_session")` in handler tests | 2 (duplicated) | 0 | closure de-duplicated |
| `strings.Split.*Set-Cookie` in tests | yes (fragile) | 0 | parse-via-stdlib |
| Diff | — | +2,759 / −445 across 12 files (3,204 changed lines) | — |
| Commits | — | 11 (apply-progress #442, oldest `f85cd70` → HEAD `14e0788`) | — |
| `go test ./...` | — | passes, 0 skipped outside `testing.Short()` | — |
| Verify verdict | — | **MERGE — PASS WITH WARNINGS** (0 CRITICAL, 5 WARNING, 5 SUGGESTION) | — |

Delivery: **single-PR with `size:exception`** (the 800-line chained-PR forecast was overridden by user; ~3,204 changed lines landed as one PR on `test/api-coverage`).

---

## Artifact Completeness

All 7 SDD artifacts for this change are persisted.

| # | Artifact | Filesystem path | Engram topic | Engram obs id | Status |
|---|---|---|---|---|---|
| 1 | Proposal | `openspec/changes/improve-api-testing/proposal.md` | `sdd/improve-api-testing/proposal` | **#438** | Persisted (preflight: declares 0 new + 0 modified capabilities) |
| 2 | Spec | `openspec/changes/improve-api-testing/specs/README.md` | `sdd/improve-api-testing/spec` | **#439** | Persisted (test-infra only — no delta specs, 12 acceptance criteria as the executable contract) |
| 3 | Design | `openspec/changes/improve-api-testing/design.md` | `sdd/improve-api-testing/design` | **#440** | Persisted (sibling package `internal/api/testutil` selected to escape handlers→api import cycle) |
| 4 | Tasks | `openspec/changes/improve-api-testing/tasks.md` | `sdd/improve-api-testing/tasks` | **#441** | Persisted (10 tasks across P1 foundation → P2/P3/P4 sibling slices, single-PR mode executed) |
| 5 | Apply Progress | (no standalone file — closed inside apply report) | `sdd/improve-api-testing/apply-progress` | **#442** | Persisted (all 10 tasks landed, 11 commits `f85cd70` → `14e0788`) |
| 6 | Verify Report | `openspec/changes/improve-api-testing/verify-report.md` | `sdd/improve-api-testing/verify-report` | **#443** | Persisted (MERGE — PASS WITH WARNINGS; 11/12 criteria COMPLIANT, 1 PARTIAL table-driven shape) |
| 7 | Archive Report | `openspec/changes/improve-api-testing/archive-report.md` (this file) | `sdd/improve-api-testing/archive-report` | (saved with this archive step) | Persisted on completion of `sdd-archive` |

---

## Spec Impact

**No delta specs synced. This change introduced no new capabilities and modified no existing ones — it is test-infrastructure only.**

The proposal explicitly states "Capabilities: None new, None modified." The spec lives at `openspec/changes/improve-api-testing/specs/README.md` as a behavioral acceptance contract (12 numbered criteria) rather than as `## ADDED Requirements` or `## MODIFIED Requirements` blocks. There is no `openspec/specs/` directory in the repo — the canonical capability specs (`accounts`, `budgets`, `categories`, `transactions`, etc.) live upstream and were intentionally untouched. Nothing was added or modified in them. **Sync step is a deliberate no-op.**

The 12-criterion acceptance contract from the spec was the executable gate: `sdd-verify` walked it row-by-row and reported 11 PASS + 1 PARTIAL.

---

## Outstanding Follow-ups

Five WARNING items surfaced during verify. None blocks merge — they were deliberately not bundled into a test-infra change. Each is a real production bug **pinned by tests** in this PR so future changes can fix them safely.

- [ ] **Fix `/api/auth/status` AuthMiddleware wrapping** — file `backend/internal/api/routes.go:91` (root-level public registration bypasses the protected `authGroup` block at line 29). `/api/auth/status` is reachable without auth and always returns `authenticated:false`. Pinned at `backend/internal/api/handlers/auth_test.go:117-148`.
- [ ] **Validate `month` field in `BudgetsHandler.Upsert`** — `2026-13` is currently accepted and stored; only the `Status()` call validates via `time.Parse`. Pinned at `backend/internal/api/handlers/budgets_test.go:78-94` (validates input rejection fails today → test will need update once fixed).
- [ ] **Add `Delete` to `CategoriesHandler`, or remove from spec.** `routes.go` registers no `DELETE /api/categories/:id`. The handler has no `Delete` method. Spec listed `TestCategories_Delete_HTTP`; test was omitted at `backend/internal/api/handlers/categories_test.go:341-347` with a documented gap comment. Decide: implement the endpoint, or strip it from the spec.
- [ ] **Add `GET /api/budgets/:id`, or remove from spec.** `routes.go` only has `PUT /api/budgets/:id` (handler `Update`). Spec listed `TestBudgets_Get_HTTP`; it was renamed to `TestBudgets_Update_HTTP` against the actual route. Decide: add the read endpoint, or remove the criterion from the spec.
- [ ] **Add `UnmarshalJSON` to `models.BoolInt`** — `backend/internal/models/models.go` currently has `MarshalJSON` (line 10) but no inverse. Tests work around this by decoding list responses into `map[string]any`. Adding `UnmarshalJSON` symmetrizes round-tripping.

Additional follow-ups recorded by `apply-progress #442` (also non-blocking):

- Pre-existing `gofmt` drift in ~37 production files (out of scope, separate PR).
- CI integration that gates merges on `go test -cover` (no GitHub Actions yet).

---

## Notes For Next Session

- The `testutil` package is the new authoritative testing surface for the API layer. Any new handler should be added to `routes.go` first, then tested through `testutil.NewServer` — adding routes auto-makes them testable (spec §11).
- The 5 production-bug follow-ups above are good candidates for a single separate change. They are pinned by tests today and will light up immediately when the fix lands.
- The `testutil` package lives at `backend/internal/api/testutil/` (sibling of `internal/api/handlers`) to escape the handlers→api import cycle. Don't move it back under `handlers/`.
- HEAD on `test/api-coverage`: `14e0788`. Ready for push + PR.

