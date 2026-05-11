# Fix MO run-artifact dirty-worktree blocker

## 2026-05-11T03:42:00Z
- Goal: fix the harness so MO/orchestrator and worker execution do not self-block on generated initiative runtime evidence artifacts such as `docs/initiatives/*/afk-runs/*.json`, then resume greenfield AFK progression.
- Lifecycle readiness: direct-implementation exemption for a bounded harness bug fix; active planning context remains `reports/planning/2026-05-11_hitl-approval-artifact-validation-plan.md`, but this turn is a small runtime-safety follow-up rather than new design work.
- Discovery path: read `AGENTS.md`, `README.md`, `logs/CURRENT.md`; attempted Auggie discovery first but it was unavailable due credit exhaustion, so fell back to direct inspection of `.pi/agent/extensions/orchestrator-run.ts`, `.pi/agent/extensions/worker-execution.ts`, `tests/extension-units/orchestrator-run.test.ts`, and `tests/extension-units/worker-execution.test.ts`.
- Tracer bullet behavior: a worktree containing only generated initiative runtime run artifacts should still be considered safe for MO preflight and worker execution startup.
- Public interface proving it: `defaultOrchestratorRunPreflight(...)` and `runWorkerExecution(...)` behavior under dirty-worktree conditions.
- Boundary dependencies / mocks: use temp git repos and existing unit-test seams; no external provider calls.
- Out of scope: redesigning queue semantics, pipeline status reconciliation, or changing protected runtime JSON rules.

## 2026-05-11T03:52:00Z
- Goal: reproduce the dirty-worktree blocker with focused tests, then implement the smallest shared filter so generated initiative runtime evidence does not self-block MO or worker execution.
- Files changed and why:
  - `tests/extension-units/orchestrator-run.test.ts` adds a preflight test proving generated `docs/initiatives/*/afk-runs/*.json` artifacts should be ignored while ordinary dirty files still block.
  - `tests/extension-units/worker-execution.test.ts` adds a worker execution test proving generated initiative run artifacts should not block worktree startup.
  - `.pi/agent/extensions/git-dirty-runtime-artifacts.ts` adds the shared filter for git porcelain lines that only point at generated initiative runtime artifact directories.
  - `.pi/agent/extensions/orchestrator-run.ts` applies the filter during MO preflight.
  - `.pi/agent/extensions/worker-execution.ts` applies the filter during worktree cleanliness checks.
  - `logs/CURRENT.md` points at this log.
- Tests added or changed:
  - `default preflight ignores generated initiative runtime run artifacts while still blocking other dirty files`
  - `run ignores generated initiative runtime run artifacts when checking worktree cleanliness`
- Exact RED command and key failure reason:
  - `node --import tsx --test tests/extension-units/orchestrator-run.test.ts tests/extension-units/worker-execution.test.ts`
  - Failure reason: orchestrator preflight returned `{ safe: false, blockers: ['dirty repo: ?? docs/initiatives/checkout/afk-runs/'] }` instead of safe, and worker execution stopped `blocked` instead of `review_ready` because the existing dirty-worktree checks treated generated AFK run artifacts as unsafe repo dirt.
- Exact GREEN command:
  - `node --import tsx --test tests/extension-units/orchestrator-run.test.ts tests/extension-units/worker-execution.test.ts`
- GREEN result:
  - targeted scope now passes with 18/18 tests green.
- Other validation commands run:
  - `node --import tsx --test tests/extension-units/orchestrator-run.test.ts tests/extension-units/worker-execution.test.ts` (pass 2)
  - `node --import tsx --test tests/extension-units/orchestrator-run.test.ts tests/extension-units/worker-execution.test.ts` (pass 3)
  - `git diff --check`
- Wiring verification evidence:
  - Both runtime entrypoints that previously blocked (`defaultOrchestratorRunPreflight` and `ensureCleanGitWorktree` inside worker execution) now use the same shared dirty-line filter, so the fix covers the MO queue-level preflight and the downstream worker startup path together.
- Behavior changes and risk notes:
  - Only initiative runtime artifact dirs are ignored: `pipeline-runs`, `afk-runs`, `worker-runs`, and `pr-runs` under `docs/initiatives/<slug>/...`.
  - Other dirty files still block, including unrelated docs/code changes and protected/runtime state paths.
- Follow-ups or known gaps:
  - Need to land this harness fix, sync `main`, and rerun greenfield AFK continuation through MO to confirm progression reaches the next HITL boundary in a real worktree.

## 2026-05-11T04:00:00Z
- Goal: close the compile-lane gap exposed by PR #140 CI before merge.
- Files changed and why:
  - `scripts/check-foundation-extension-compile.sh` now copies and typechecks `git-dirty-runtime-artifacts.ts`, so the foundation compile lane sees the new shared helper used by `orchestrator-run.ts`.
- Tests added or changed: none.
- Exact RED command and key failure reason:
  - GitHub Actions `Foundation Extension Compile` on PR #140 failed with `TS2307: Cannot find module './git-dirty-runtime-artifacts.ts'` because the compile harness copied `orchestrator-run.ts` but not the new shared helper.
- Exact GREEN command:
  - `./scripts/check-foundation-extension-compile.sh`
- GREEN result:
  - `foundation-extension-compile-ok`
- Other validation commands run:
  - `node --import tsx --test tests/extension-units/orchestrator-run.test.ts tests/extension-units/worker-execution.test.ts`
- Wiring verification evidence:
  - The compile harness now stages the helper file alongside the importing runtime extensions, so local compile coverage matches the production CI lane.
- Behavior changes and risk notes:
  - No runtime behavior change beyond restoring compile-lane parity for the new helper import.
- Follow-ups or known gaps:
  - Amend the PR branch with this compile-harness fix, then merge and rerun the real MO continuation.
