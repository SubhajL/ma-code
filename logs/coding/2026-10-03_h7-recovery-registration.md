# H7 Deliberate Recovery Composite Registration

Date: 2026-10-03
Task: `task-1791035657315`
Branch: `fix/h7-recovery-registration`
Worktree: `/Users/subhajlimanond/dev/ma-code-h7-recovery-registration`

## Context

Implement the second sequential stabilization PR from clean merged `main`. Preserve the original dirty worktree and resolve the provenance conflict around its uncommitted recovery experiment before making any H7 change.

## Discovery

- Original dirty recovery paths are limited to `.pi/agent/extensions/recovery.ts`, `tests/extension-units/extension-factory-exports.test.ts`, and `tests/extension-units/recovery-runtime.test.ts`.
- That experiment makes the composite a no-op to avoid duplicate auto-load registration and redirects runtime tests to the split module.
- Clean merged `main` keeps the correct direct composite behavior and passes core workflows, but lacks an auto-load duplicate-registration test.
- Auggie timed out; direct source/test inspection was used.
- Second-model planning rejected the no-op composite and recommended idempotent split registration.

## Plan

See `reports/planning/2026-10-03_h7-recovery-registration-plan.md`.

## Work Log

- Created `task-1791035657315` with merge/cleanup acceptance and made it active.
- Admin-merged H1 PR #253 and fast-forwarded local `main` to `7021a1253ae1dd4acdf90e0d0a6bcce5bf89ff2b` before starting H7.
- Reused the isolated worktree only after switching it to merged `main`, created `fix/h7-recovery-registration`, and renamed the worktree path to match the bounded H7 job.
- Inspected, but did not mutate, stage, stash, or clean the original dirty recovery files.

## TDD Evidence

Pending.

## Validation

Pending.

## Review

Pending formal `g-check`.

## TDD Evidence

### RED

- Added a strict registration fake plus two public-entry tests before production changes.
- Targeted command: consolidated modules plus extension-factory auto-load.
- Clean merged `main` result: 2 intended failures.
  - `recovery composite and split factories register once in either order` failed with `duplicate tool registration: resolve_recovery_policy` at `recovery-policy.ts`.
  - `auto-loading every top-level extension registers recovery tools exactly once` failed with the same duplicate when `recovery.ts` called the already-loaded policy split factory.
- The existing direct composite test remained green and proved the dirty-worktree no-op implementation would be invalid.

### GREEN

- Added one module-local `WeakSet<ExtensionAPI>` guard to each split recovery factory.
- Each guard is checked before registration and marked only after `pi.registerTool` succeeds.
- Kept `recovery.ts` calling both split factories and added a short contract comment.
- Targeted suite: 6/6 pass.
- Three consecutive targeted runs: 6/6, 6/6, 6/6.

### Scope Correction / Baseline Visibility

- A first all-tool strict auto-load pass progressed beyond recovery after GREEN and exposed an unrelated existing duplicate: `generate_task_packet` from `task-packets.ts` plus `packets.ts`.
- H7 does not redesign every consolidated module. The final production-equivalent auto-load test still invokes every top-level factory, but rejects duplicates only for the two recovery names and asserts each count is exactly one.
- The packet duplicate remains visible here as a pre-existing follow-up gap rather than being silently fixed or hidden.

## Validation

- `tests/extension-units/consolidated-modules.test.ts` + `extension-factory-exports.test.ts`: 6/6 pass, three consecutive runs.
- `tests/extension-units/recovery-runtime.test.ts`: 6/6 pass.
- Full extension-unit scope: 678/678 pass.
- `tests/integration/core-workflows.test.ts`: 10/10 pass.
- TypeScript `tsc --noEmit` through a temporary isolated-worktree dependency map: pass.
- Wiring grep confirms:
  - `recovery.ts` still calls both split factories;
  - both split guards add only after successful registration;
  - auto-load and both-order tests assert one policy and one runtime registration.
- `git diff --check`: pass.
- No live provider-backed validation was needed; deterministic local evidence covers the behavior.

## Environment Note

- The worktree intentionally has no `node_modules`; validation used the original repository dependency installation through temporary loader/typecheck mapping files.
- Child-process tests initially failed only because loader flags were not inherited. Re-running with inherited `NODE_OPTIONS` produced the authoritative 678/678 pass.
- The current long-lived Pi process was started before H1 landed, so its already-loaded old safe-bash extension created generated runtime stores under several edited-file parents in this temporary worktree. They were not read, migrated, or selectively deleted and are excluded from the PR. The original dirty worktree remains untouched.

## Skeptical Self-Review

- Registration state is per API object and weakly held; it does not mutate or retain the host API.
- Guards do not mask initial registration failures because marking occurs after `registerTool` returns.
- Direct split loading, direct composite loading, composite-first composition, split-first composition, and full top-level auto-load are covered.
- No loader, task-state, schema, provider, or unrelated composite behavior changed.
- Required fixes found: none.

## g-check Handoff

Review the bounded working-tree diff for registration lifecycle errors, test false positives, accidental carrying of the original dirty no-op composite, and review-set contamination. Generated runtime stores and temporary validation files are not PR content.

## Review (g-check, 2026-10-03) - working-tree

### Reviewed

- Repo/worktree: `/Users/subhajlimanond/dev/ma-code-h7-recovery-registration`
- Branch: `fix/h7-recovery-registration`
- Base: merged local `main` / `origin/main` at `7021a1253ae1dd4acdf90e0d0a6bcce5bf89ff2b`.
- Review set: recovery composite/split factories, consolidated/auto-load tests, strict test utility, plan/log pointer and evidence artifacts.
- Explicit exclusions: all generated `.pi/agent/state/runtime/` trees in the temporary worktree.

### Findings

CRITICAL
- none.

HIGH
- none.

MEDIUM
- none.

LOW
- Pre-existing, non-blocking baseline: an all-tool strict factory probe reports `generate_task_packet` twice through `task-packets.ts` and `packets.ts`. H7's test invokes the same full top-level load path but scopes duplicate rejection to the two recovery names. Future packet-composition work should choose and test its own deliberate idempotence contract rather than expanding this PR.

### Skeptical Checks

- The dirty-worktree no-op `recovery.ts` implementation was not carried: the clean composite still invokes policy and runtime factories.
- Guards are per `ExtensionAPI` instance, weakly held, and marked only after successful registration.
- Composite-first and split-first orders use fresh strict fakes and would fail on any duplicate recovery registration.
- Full top-level factory loading asserts exactly one policy and one runtime registration while leaving unrelated baseline duplication observable in the coding log.
- Core workflows still obtain both recovery tools.
- No runtime-state, schema, auth, deployment, loader, or provider changes are in the review set.

### Commands / Evidence

- Intended RED: two duplicate `resolve_recovery_policy` failures at the split/composite seam.
- Targeted GREEN: 6/6, repeated three consecutive times.
- Recovery runtime: 6/6.
- Extension units: 678/678.
- Core workflows: 10/10.
- TypeScript typecheck: pass.
- Wiring grep and `git diff --check`: pass.
- Source/provenance check confirms the original dirty recovery files remain modified only in the original worktree and were not staged here.

### Open Assumptions

- Supported extension loading uses canonical ESM module identity, so the composite's static split imports and top-level dynamic split imports share the same module-local guards. Both production loading orders are exercised.
- ExtensionAPI does not support unregistering these tools and then expecting the same module factory/API pair to recreate them; no such lifecycle exists in the current harness contract.

### Recommended Follow-up

- Track packet-composite duplicate behavior separately if global all-tool duplicate rejection becomes an operator invariant.
- Do not delete or migrate historical/generated nested runtime databases as part of this PR.

Review Verdict: no_required_fixes

## Creation (g-create, 2026-10-03)

- Review set: nine explicit H7 implementation/test/log files.
- Excluded: six generated worktree runtime-store paths and all original dirty-worktree changes.
- Graphite path: branch created from merged `main`, then `gt modify -m "fix(recovery): make composite registration idempotent" --no-interactive`.
- Branch: `fix/h7-recovery-registration`.
- Commit: `HEAD` — `fix(recovery): make composite registration idempotent` (exact final SHA recorded in task/PR evidence after this log append is amended into the commit).
- Hooks/verification were not bypassed; Graphite creation completed successfully.
- Staged-path and cached whitespace checks confirmed that no runtime database entered the commit.

## Submission (g-submit, 2026-10-03)

- Graphite submit: `gt submit --publish --no-interactive`.
- PR: https://github.com/SubhajL/ma-code/pull/254
- Graphite: https://app.graphite.com/github/pr/SubhajL/ma-code/254
- Base/head: `main` ← `fix/h7-recovery-registration`.
- State: created as open, non-draft.
- GitHub check summary:
  - Repo Static Checks: failure before any steps ran;
  - Routing Validators: failure before any steps ran;
  - Typecheck Baseline: failure before any steps ran.
- Run `37129060682` reports all three jobs with empty `steps` arrays after roughly two seconds, matching PR #253's external CI startup/infrastructure failure.
- One compact `gh pr view` request encountered a connection reset; Graphite creation and `gh pr checks`/`gh run view` independently confirmed the PR and run.
- Local gates remain: targeted 6/6 ×3, recovery runtime 6/6, extension units 678/678, core workflows 10/10, typecheck, diff checks, and `g-check` with no required fixes.
- Next action: amend this submission record into the PR commit, resubmit, verify state, then use the explicitly requested admin merge with the external CI-startup failure recorded.
