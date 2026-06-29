# Archive Report: fix-api-production-bugs

**Status**: archived — ready to merge
**Date**: 2026-06-29
**Branch**: `fix/api-production-bugs` (base: `main`)
**HEAD**: `fbe81fc`
**Recommendation**: **MERGE** — PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 1 SUGGESTION)

---

## Summary

This change flips 4 of the 5 production bugs that the `improve-api-testing` change (`openspec/changes/improve-api-testing/verify-report.md` WARNING-4) pinned with failing-by-design tests, and explicitly retracts the 5th (`Categories.Delete`) as **out-of-scope-by-decision** — the existing `Archive` endpoint covers soft-delete, and the FK `NO ACTION` semantics on `transactions.category_id` / `budgets.category_id` make hard delete unsafe by default. Four real production-code fixes landed under strict TDD (each commit is RED → GREEN → REFACTOR inside one commit, never red at the boundary): `s5` adds `models.BoolInt.UnmarshalJSON` and refactors `accounts_test.go` / `categories_test.go` to strong typed list decoders; `s2` adds a `^(\d{4})-(0[1-9]|1[0-2])$` regex check in `Budgets.Upsert`; `s1` introduces an `authOptional` sub-group with `AuthMiddleware` (not `RequireAuth`) so `/auth/status` correctly returns `authenticated:true` with a valid cookie; `s4` lands a thin `Budgets.Get` handler + `GET /api/budgets/:id` route reusing the existing `Store.Budgets.ByID`. The change also produced two correctness-fix chores (`abc86f8` schema.d.ts regen forced by the pre-push hook, `fbe81fc` gofmt on `models.go` for pre-existing Go-1.26 comment-alignment drift) — both necessary, neither refactor slop.

The 12-criterion acceptance contract (`specs/README.md`) was the executable gate: `sdd-verify` walked it row-by-row and reported **10 PASS, 1 PARTIAL, 1 COMPLIANT · OUT-OF-SCOPE-BY-DECISION**. All build/test/vet/gofmt gates pass. The pre-push hook (`apps/web/src/api/schema.d.ts` freshness) accepts the branch after `abc86f8`. The 5 production bugs the previous change surfaced are now resolved or explicitly retracted, so `improve-api-testing` WARNING-4 has no remaining open follow-ups from this family.

---

## Key numbers

| Metric | Before (improve-api-testing baseline) | After | Delta |
|---|---|---|---|
| `internal/api` coverage | 93.2% | **93.4%** | +0.2 pp |
| `internal/api/handlers` coverage | 80.6% | **82.9%** | +2.3 pp |
| `internal/models` coverage | 0% (no test file) | **84.2%** | +84.2 pp (new) |
| `AuthStatus` handler coverage | 44.4% | **100.0%** | +55.6 pp |
| Spec criteria COMPLIANT | — | **10 / 12** | — |
| Spec criteria COMPLIANT · OUT-OF-SCOPE | — | **1 / 12** (#11, s3) | — |
| Spec criteria PARTIAL | — | **1 / 12** (#10, design-scope vs literal grep) | — |
| `BoolInt` round-trip subtests | 2 (Marshal only) | **7** (Marshal 2 + Unmarshal 5) | +5 |
| Handler-test subtests added | — | **+10** (1 flipped s2, +4 table-driven s2, 1 flipped s1, +1 IssuedAt s1, +3 Get s4) | — |
| Commits | — | **7** (5 spec-driven + 2 chores; apply-progress old→new: `b119927` → `fbe81fc`) | — |
| Diff scope | — | **9 files**, +590 / −311 (901 changed lines) | — |
| `go test ./... -count=1` | — | PASS — 0 failures, 0 skips | — |
| Verify verdict | — | **MERGE — PASS WITH WARNINGS** (0 CRITICAL, 2 WARNING, 1 SUGGESTION) | — |
| Strict TDD compliance | — | **5 / 5** checks PASS (RED → GREEN → REFACTOR per commit) | — |

The +590 / −311 footprint is driven largely by `schema.d.ts` (318 changed lines, mechanical swagger2openapi output — see WARNING-2) and `models.go` (150 changed lines, mostly realignment from `gofmt`). The 4 spec-driven production fixes themselves stay close to the `tasks.md` forecast (~150 LOC added); the chores carried the rest.

Delivery: single PR, 7 atomic commits. Chained PRs not recommended (forecast 38% of 400-line budget per `tasks.md:14-23`). Pre-push hook accepts the branch post-`abc86f8`.

---

## Artifact Completeness

All 8 SDD artifacts for this change are persisted. The directory `openspec/changes/fix-api-production-bugs/` carries the 7 filesystem files plus the new archive-report; `apply-progress` lives in Engram only (no standalone file — see engram #451 in this change's session).

| # | Artifact | Filesystem path | Engram topic | Engram obs id | Status |
|---|---|---|---|---|---|
| 1 | Explore | `openspec/changes/fix-api-production-bugs/explore.md` | `sdd/fix-api-production-bugs/explore` | **#446** | Persisted (5 production bugs, 2 user-decision points surfaced, diff forecast ~99–202 LOC) |
| 2 | Proposal | `openspec/changes/fix-api-production-bugs/proposal.md` | `sdd/fix-api-production-bugs/proposal` | **#447** | Persisted (locks s3=c out-of-scope, s4=a implement; 5-commit order s5 → s2 → s1 → s4 → s3; capabilities modified: `auth`, `budgets`, `models`; none new) |
| 3 | Spec | `openspec/changes/fix-api-production-bugs/specs/README.md` | `sdd/fix-api-production-bugs/spec` | **#448** | Persisted (12-criterion acceptance contract as the executable gate; matches `improve-api-testing` shape) |
| 4 | Design | `openspec/changes/fix-api-production-bugs/design.md` | `sdd/fix-api-production-bugs/design` | **#449** | Persisted (per-bug interfaces, file changes, commit order; `authOptional` reusable pattern documented) |
| 5 | Tasks | `openspec/changes/fix-api-production-bugs/tasks.md` | `sdd/fix-api-production-bugs/tasks` | **#450** | Persisted (5 tasks aligned to commits; 400-line budget risk Low; chained PRs No) |
| 6 | Apply Progress | (no standalone file — engram only) | `sdd/fix-api-production-bugs/apply-progress` | **#451** | Persisted (6 commits landed in apply phase: s5 → s2 → s1 → s4 → schema-chore → s3; deviations and open questions recorded) |
| 7 | Verify Report | `openspec/changes/fix-api-production-bugs/verify-report.md` | `sdd/fix-api-production-bugs/verify-report` | **#452** | Persisted (MERGE — PASS WITH WARNINGS; 12/12 criteria walked; 5/5 strict TDD checks PASS) |
| 8 | Archive Report | `openspec/changes/fix-api-production-bugs/archive-report.md` (this file) | `sdd/fix-api-production-bugs/archive-report` | (saved with this archive step) | Persisted on completion of `sdd-archive` |

---

## Spec Impact

**No delta specs synced. `openspec/specs/` does not exist in this repo (verified: `Test-Path openspec/specs → False`). Capability maps live upstream. The sync step is a deliberate no-op, consistent with `improve-api-testing`.**

The proposal explicitly states "Capabilities: None new. Modified: `auth`, `budgets`, `models`. `categories` not modified." The `auth` capability now reads `c.Get("authenticated")` against a real JWT cookie for `/auth/status` (was returning false unconditionally); the `budgets` capability adds a `month` regex check on `POST /api/budgets` and a new `GET /api/budgets/:id` endpoint symmetric with `Accounts.ByID` / `Categories.ByID` / `Transactions.ByID`; the `models` capability gains a symmetric `BoolInt.UnmarshalJSON`. None of these add net-new domain areas, so no `## ADDED Requirements` blocks apply.

The 12-criterion behavioral acceptance contract in `specs/README.md` was the executable gate. `sdd-verify` walked it row-by-row and reported 10 PASS, 1 PARTIAL (criterion 10 — see WARNING-1), 1 COMPLIANT · OUT-OF-SCOPE-BY-DECISION (criterion 11 — `Categories.Delete` explicitly retracted per user decision). The strict TDD discipline preserved per-criterion evidence in the Commit-to-Criterion table at `specs/README.md:128-136`.

---

## Outstanding Follow-ups

Two WARNINGs and one SUGGESTION surfaced during verify. **None blocks the merge** — each is tracked for a deliberate future change. WARNING-1 and SUGGESTION-1 are closely related (both target the broader `map[string]any` refactor); WARNING-2 is a doc/toolchain note.

- [ ] **WARNING-1 — Extend the `map[string]any` refactor to `budgets_test.go` and `transactions_test.go`.** Spec criterion 10's literal grep acceptance (`rg 'map\[string\]any' backend/internal/api/handlers/` returns zero hits) is not met: 94 hits remain (`budgets_test.go` 22, `transactions_test.go` 35, plus residual `accounts_test.go` 14 and `categories_test.go` 11). The narrative acceptance — the 2 files explicitly scoped by `design.md` use strong typed list decoders — IS met. The user's brief explicitly scoped the refactor to `accounts/categories`; the broader refactor was never an explicit requirement, so this is a PARTIAL by design, not a regression. See WARNING-1 in `verify-report.md:137-147` for the full breakdown.
- [ ] **WARNING-2 — Document the swagger2openapi toolchain version in `AGENTS.md`.** The currently-installed `swagger2openapi 7.0.8` produces schema keys as `models.X`, while the previously-committed `schema.d.ts` was generated by an older version that emitted `github_com_mgurt_finances_internal_models.X`. The chore commit `abc86f8` stages the regenerated file; `rg 'github_com_mgurt_finances_internal_models' apps/web/src` returns zero hits in TS source, so the rename has zero functional impact. Documenting which toolchain version produced the canonical schema prevents the next contributor from getting surprised by a 318-line diff on a one-line handler addition. See WARNING-2 in `verify-report.md:149-154`.
- [ ] **SUGGESTION-1 — Mechanical follow-up PR.** Bundling WARNING-1's broader `map[string]any` refactor into a single `chore(test): strong-typed list decoders` PR (estimated 100–200 lines of test-only changes, no functional risk) would bring criterion 10 to full COMPLIANT. Safe to land after this change merges.

Additional cross-cutting follow-ups carried from earlier warnings (non-blocking, unchanged by this change):

- [ ] Pre-existing `gofmt` drift on 30+ production files untouched by this change (separate `chore(fmt)` PR per `improve-api-testing` WARNING-2). The 1 touched file (`models.go`) was corrected in `fbe81fc`.
- [ ] CI coverage gate (no GitHub Actions yet per `AGENTS.md`).
- [ ] Table-driven shape normalization cosmetic cleanup (`improve-api-testing` WARNING-1).

---

## Notes For Next Session

- The `authOptional := apiGroup.Group(""); authOptional.Use(AuthMiddleware(srv))` pattern introduced for `/auth/status` is **reusable**: any future endpoint that reads `authenticated`/`issuedAt` without 401ing guests belongs on this sub-group (vs the `protected` group, which has `RequireAuth` and would 401 guests). It's documented in code at `backend/internal/api/routes.go:22-29` with a comment explaining the distinction from `RegisterAuthRoutes` (which is the full-middleware helper for testing). Adopt it before adding similar introspection endpoints.
- The 5-commit strict TDD shape from `proposal.md:85-91` landed as **7 commits** in apply (`b119927 → 354c31f → 063acdc → 601ec1c → abc86f8 → f8c8f97` from apply, plus `fbe81fc` from verify). The 2 extra commits — `abc86f8` schema regen and `fbe81fc` gofmt — were correctness fixes, not refactor slop. `abc86f8` was forced by the pre-push hook (`schema.d.ts` freshness check at `.githooks/pre-push`); `fbe81fc` was added in verify when the apply agent missed that Go 1.26 produces tighter comment alignment than the version that originally formatted `models.go` (37-file repo-wide gofmt drift is out of scope per `improve-api-testing` WARNING-2). Both are documented in their commit messages and in `verify-report.md`.
- The schema.d.ts regen toolchain issue (WARNING-2) is currently invisible — anyone re-running `pnpm gen:api` will produce a clean diff because the canonical file now matches the installed toolchain. **Document the swagger2openapi version in `AGENTS.md` or a `CONTRIBUTING.md` note** so the next contributor doesn't get surprised if a future toolchain upgrade reintroduces the drift.
- All 5 production bugs from `improve-api-testing` verify warning-4 are addressed: s1, s2, s4, s5 are fixed; s3 is explicitly retracted via the out-of-scope-by-decision discipline. The next change that touches any of these areas can build on a known-good baseline.

---

## Bottom

This change closes the loop on the `improve-api-testing` family of follow-ups: 4 real fixes plus 1 explicit non-fix, all under strict TDD, with a 318-line schema regen and a 1-file gofmt chore carried along for correctness. All gates green. Two WARNINGs and one SUGGESTION carry forward as known follow-ups but nothing blocks the merge.

**Recommended next step**: the orchestrator commits the archive report (already written) and presents the final summary to the user, who pushes the branch and opens the PR. HEAD on `fix/api-production-bugs`: `fbe81fc`. Ready for push + PR.
