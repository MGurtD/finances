# Design: fix-api-production-bugs

## Technical Approach

Five independent production fixes under strict TDD (failing test → minimal fix → ship together in one commit). Four are real code; one (s3) is a deliberate no-op that updates a gap comment to mark the criterion **out-of-scope-by-decision**. Targets the 5 bugs surfaced by `improve-api-testing` WARNING-4. Commit order s5 → s2 → s1 → s4 → s3 (lowest-blast-radius first).

## Architecture Decisions

| # | Choice | Why |
|---|---|---|
| s1 | New `authOptional := apiGroup.Group("")` with `AuthMiddleware(srv)` only; move `/auth/status` onto it. Alt: put on `protected` (has `RequireAuth`). | `RequireAuth` 401s guests; `/auth/status` must answer 200+`false` for guests. `AuthMiddleware` (`middleware.go:36-58`) sets `authenticated=true`+`issuedAt` — what `handlers/auth.go:101-114` reads. Pinned `auth_test.go:144` flips `false`→`true`. |
| s2 | Package-level `var monthRe = regexp.MustCompile(`^(\d{4})-(0[1-9]|1[0-2])$`)` after `ShouldBindJSON`. 400 + `{"error":"month must be YYYY-MM"}`. Alt: `time.Parse`; `Validate()` method. | Handler is the input boundary. Regex is idiomatic for a structural format; inline check matches codebase style. |
| s3 | No production change. Rewrite gap comment at `categories_test.go:341-347` to out-of-scope-by-decision, citing FK `NO ACTION`. Alt: hard delete + FK unlink + `?confirm=true`. | Hard delete with referenced rows fails with `FOREIGN KEY constraint failed`. `Archive` covers soft-delete. User-locked. |
| s4 | New `Get(c)` delegating to `Store.Budgets.ByID` (`db/budgets.go:93-104`); new `protected.GET("/budgets/:id", …)`. Alt: accept current state. | Symmetric with `Accounts.ByID`, `Categories.ByID`, `Transactions.ByID`. Store method exists (currently dead). User-locked. |
| s5 | Pointer-receiver `UnmarshalJSON`: `json.Unmarshal(data, &v any)` → switch on `bool`/`float64`. Accepts `true`/`false`/`0`/`1`; rejects others. Alt: string-match on `data`. | Symmetric with `MarshalJSON` (writes `true`/`false`); delegates parsing to `encoding/json`. |

## s5 — BoolInt.UnmarshalJSON

```go
func (b *BoolInt) UnmarshalJSON(data []byte) error {
    var v any
    if err := json.Unmarshal(data, &v); err != nil { return err }
    switch x := v.(type) {
    case bool:
        if x { *b = 1 } else { *b = 0 }
    case float64:
        if x == 0 { *b = 0 } else if x == 1 { *b = 1 } else {
            return fmt.Errorf("BoolInt: cannot unmarshal %v into BoolInt (only 0|1)", x)
        }
    default:
        return fmt.Errorf("BoolInt: cannot unmarshal %s into BoolInt", string(data))
    }
    return nil
}
```

## s1 — route regrouping

```go
apiGroup.POST("/auth/login",  authHandler.Login)
apiGroup.POST("/auth/logout", authHandler.Logout)
authOptional := apiGroup.Group("")
authOptional.Use(AuthMiddleware(srv))
authOptional.GET("/auth/status", authHandler.AuthStatus)
```

`authOptional` is a reusable pattern: any future endpoint that reads `authenticated`/`issuedAt` without 401ing guests goes here. Document in code comment.

## File Changes

| File | Action | Why |
|---|---|---|
| `backend/internal/api/routes.go` | Modify | s1: `authOptional` sub-group. s4: `protected.GET("/budgets/:id", …)`. |
| `backend/internal/api/handlers/budgets.go` | Modify | s2: `monthRe` + inline check. s4: new `Get` (~6 LOC, mirrors `AccountsHandler.ByID`). |
| `backend/internal/models/models.go` | Modify (additive) | s5: `UnmarshalJSON` on `BoolInt`. Add `encoding/json`+`fmt`. |
| `backend/internal/models/models_test.go` | Create | s5: 5 subtests (round-trip ×4, reject `"yes"`). |
| `backend/internal/api/handlers/auth_test.go` | Modify | s1: flip `:144-146`; add `IssuedAt != ""` subtest. |
| `backend/internal/api/handlers/budgets_test.go` | Modify | s2: flip `:91-93` 200→400; table-driven `{"2026-00","26-06","2026/06",""}`. s4: `TestBudgets_Get_HTTP` (200, 404, 401). |
| `backend/internal/api/handlers/accounts_test.go` | Modify | s5: replace `map[string]any` list decodes with `[]models.Account`. |
| `backend/internal/api/handlers/categories_test.go` | Modify | s3: rewrite gap comment to out-of-scope-by-decision. |
| `apps/web/src/api/schema.d.ts` | Regenerated | s4 adds `@Router /api/budgets/{id} [get]`; key exists for PUT (`schema.d.ts:755`); regen adds a `get` block, not a new key. Run `pnpm gen:api` before pushing s4. |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (Go) | All 5 bugs | Pinned flips + new subtests in `models_test.go` (s5), `budgets_test.go` (s2+s4), `auth_test.go` (s1). |
| Build / fmt / vet | Whole tree | `cd backend && go build ./... && go vet ./... && gofmt -l .` (empty). |
| Suite | Full | `cd backend && go test ./... -count=1`. |
| Pre-push | Schema freshness | `.githooks/pre-push` regen; s4 commit accepts the diff. |
| Web | Type canary | `pnpm typecheck`. |

Each commit independently green. Strict-TDD discipline preserved in *implementation* order; test + production ship together so the commit boundary is never red.

## Commit Order

1. `fix(models): add BoolInt.UnmarshalJSON + strong-typed tests refactor` — s5. De-risks the s5 refactor (must ship with it or compilation fails).
2. `fix(budgets): validate month format YYYY-MM in Upsert` — s2.
3. `fix(auth): wrap /api/auth/status with AuthMiddleware` — s1.
4. `feat(budgets): add Get(budgetID) handler + GET /api/budgets/:id` — s4 (triggers `schema.d.ts` regen).
5. `docs(test): mark Categories.Delete as out-of-scope-by-decision` — s3 (no code).

## Risks

| Risk | Mitigation |
|---|---|
| Frontend relies on `/auth/status` returning `false` with valid cookie. | `rg auth/status apps/web/src` zero hits. Documented in commit msg. |
| Pinned test flipped without production fix. | Test + production ship together; per-commit `go test ./... -count=1` green. |
| s4 schema regen produces unexpected diff. | Expected: new `get` block in existing `/api/budgets/{id}` key only. Run `pnpm gen:api && git diff` at apply; stop if anything else changes. |
| `authOptional` pattern not adopted by future routes. | Document in code comment + design. |
| Spec sync (no `openspec/specs/`) surprises tooling. | Deliberate no-op, consistent with `improve-api-testing`. |

## Open Questions

None. s3 and s4 user decisions are locked (s3=c, s4=a). `authOptional` is a design improvement surfaced here; no blocking decision needed.