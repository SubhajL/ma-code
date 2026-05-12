# Issue-002 recovery and landing plan

- Date: 2026-05-12
- Scope: Recover `mixed-domain-harness-optimization` issue-002 from preserved worker worktree, validate it, create a PR, land to `origin/main`, and sync local `main`.
- Intake: direct implementation continuation from the active mixed-domain initiative lane; no separate intake artifact required.
- Active coding log: `logs/coding/2026-05-12_issue-002-recovery-and-landing.md`

## Current Frontier
- Root branch is clean on `task/task-1778558911426-mixed-domain-harness-optimization`.
- Clean MO worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778558911426-mixed-domain-harness-optimization-mo-run`.
- Preserved worker worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778558911426-mixed-domain-harness-optimization-mo-run-worktrees/worker-20260512t050154z-issue-002`.
- Worker artifact: `docs/initiatives/mixed-domain-harness-optimization/worker-runs/worker-20260512t050154z.json`.
- Current blocker: same-runtime Phase C coding command exited non-zero after writing partial issue-002 changes.

## Goal
- Land a bounded issue-002 slice only.
- Preserve valid worker-produced changes when possible.
- Complete bounded workflow through PR creation, merge to `origin/main`, and local `main` sync.

## Non-Goals
- Do not continue issue-003+ until issue-002 lands.
- Do not redesign broader mixed-domain orchestration in this slice.
- Do not mutate protected runtime JSON directly.

## Preferred Path
1. Inspect and salvage the preserved issue-002 worker worktree instead of rerunning the whole MO lane blindly.
2. Verify/redrive the smallest missing TDD slice in the preserved worktree.
3. Run targeted changed-scope tests and `git diff --check`.
4. Perform skeptical self-review / `g-check` equivalent.
5. Create a bounded commit/PR from the recovered slice.
6. Merge to `origin/main` and sync local `main`.
7. Resume the mixed-domain initiative only after issue-002 is durably landed.

## First TDD Slice
- Tracer behavior: missing proof-wrapper commands should be detected before worker execution begins for issue-002 style validation contracts.
- Public interface: AFK orchestration / worker execution preflight behavior surfaced through `tests/extension-units/afk-orchestration.test.ts` and any required worker-execution regression.
- Boundary dependencies: repo `package.json` scripts, queue-job validation commands, same-runtime worker execution wrapper.
- Out of scope: downstream issue-003+ slices and broader composite-role design.

## Acceptance Checks
- `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- `node --import tsx --test tests/extension-units/worker-execution.test.ts`
- `git diff --check`
- optional wider changed-scope gate if needed after salvage review

## Landing Checks
- bounded commit created on the recovery branch
- PR created and reviewed
- PR merged to `origin/main`
- local `main` fast-forwarded/synced to merged commit

## Risks
- preserved worker changes may be incomplete even if current local tests pass
- same-runtime failure root cause may recur if salvage requires rerun
- worker-only log/runtime artifacts must not leak into the landing commit
