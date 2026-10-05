# H3a Truthful Pending Proof Plan

Task: task-1791196563035
Base: aa2cd9dbfdfafb1639370e203c1332738ba975ae (merged H2 PR #256)

## Discovery
Auggie timed out; exact source verifies worker-execution defaults missing review to approval in normal and salvage paths, records validator pass from local commands, and slice/pr lifecycle accepts incomplete proof. No schema/auth/receipt changes needed. Existing worker status enum has no review_pending; retain blocked with review step pending/not_run and a visible pending-proof reason.

## Acceptance / Scope
- Missing configured review verdict is not_run, never approval; no normal or salvage promotion to review_ready without explicit no_required_fixes.
- Local command success does not issue a validator pass. Keep evidence and review transition but require the existing task validator tool separately.
- Empty validation command/results remain pending. Explicit review plus nonempty passing command proof preserves the worker review_ready boundary; PR still waits on canonical task validation.
- Slice task review/done status alone does not validate. Explicit bundle/task pass remains supported; bare RED/GREEN words are not test evidence.
- PR RED/GREEN requires a failing RED result and passing GREEN result, not presence of commands alone. Missing validation proof is pending, explicit failure is fail.
- No cryptographic receipt/identity authority redesign (H3b), no top-level policy or schema change.

## Behavior-First TDD
1. Public runWorkerExecution success with real local commands but no review: RED false review_ready; GREEN pending review and blocked PR readiness.
2. Explicit review plus local commands must not manufacture canonical validator pass; genuine validator success remains available separately.
3. Normal/salvage missing review and empty command proof stay pending; failing/changes_required remain blocked.
4. Public slice/PR lifecycle tests for absent validation, bare RED/GREEN words, incomplete command/results; positive explicit proof controls.
Mock only Git/GitHub dry-run boundaries; execute real local node commands and SQLite fixtures. No live provider probe needed.

## Validation / Landing
Focused tests three consecutive passes; full extension/core workflows, typecheck and diff/wiring checks; formal g-check in active coding log. Explicit staging and Graphite PR. Inspect CI startup failures separately; requested admin merge, local-main landing and isolated worktree cleanup must occur while implementation task remains active, before review/validate/done.

## Risks / Rollback
Callers relying on synthetic review or validator success must now provide explicit review and invoke task validation. Preserve artifact shape and enum compatibility. Roll back source changes only; preserve original dirty checkout and historical databases. H2 worktree remains until final landing.
