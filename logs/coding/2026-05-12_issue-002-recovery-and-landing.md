# Coding Log — issue-002 recovery and landing

- Date: 2026-05-12
- Scope: Recover and land `mixed-domain-harness-optimization` issue-002 from the preserved worker worktree.
- Status: planned
- Branch: `task/task-1778558911426-mixed-domain-harness-optimization`
- Related planning log: `reports/planning/2026-05-12_issue-002-recovery-and-landing-plan.md`

## Planned Task Group
- Recover the preserved issue-002 worker changes from `worker-20260512t050154z-issue-002`.
- Re-establish explicit RED/GREEN evidence for the bounded changed scope.
- Run skeptical self-review / `g-check` equivalent before PR creation.
- Create, merge, and sync the bounded issue-002 landing artifact.

## 2026-05-12T05:54:55Z
- Goal: salvage the preserved issue-002 validation-contract preflight changes onto the active root branch and prove the bounded changed scope locally.
- Files changed and why:
  - `.pi/agent/extensions/afk-orchestration.ts` — added validation-command preflight helpers so missing npm wrapper scripts are detected before worker execution proceeds.
  - `.pi/agent/extensions/worker-execution.ts` — blocks Phase C before coding/validation continues when the declared validation contract is already invalid.
  - `tests/extension-units/afk-orchestration.test.ts` — added regression coverage for the missing `npm run test:integration -- health-handshake` wrapper case.
  - `tests/extension-units/worker-execution.test.ts` — added regression coverage asserting the worker blocks with a validation-contract reason and marks queue state blocked when the wrapper script is missing.
  - `logs/coding/2026-05-12_issue-002-recovery-and-landing.md` — appended this recovery evidence.
- Tests added or changed:
  - `tests/extension-units/afk-orchestration.test.ts`
  - `tests/extension-units/worker-execution.test.ts`
- Exact RED command and key failure reason:
  - `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
  - Failure reason: the transplanted regression imported `preflightValidationCommands`, but `.pi/agent/extensions/afk-orchestration.ts` did not yet export it on the active branch.
- Exact GREEN command:
  - `for i in 1 2 3; do echo RUN:$i; node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts || exit 1; done`
- Other validation commands run:
  - `node --import tsx --test tests/extension-units/worker-execution.test.ts`
  - `git diff --check`
- Wiring verification evidence:
  - `worker-execution.ts` now calls `preflightValidationCommands(...)` immediately after deriving `run.steps.validation.commands`, so the worker blocks before bounded coding/validation continues when a declared proof command is impossible to run.
  - The AFK orchestration helper checks repo `package.json` scripts and reports a precise missing-script reason (`missing npm script "test:integration"`) for the mixed-domain health-handshake case.
  - The worker-execution regression confirms the blocked validation-contract reason propagates into both the worker run and queue job state.
- Behavior changes and risk notes:
  - Issue-002 now enforces validation-contract preflight instead of failing later in a more opaque worker run.
  - This is a bounded salvage from the preserved worker frontier; later mixed-domain initiative issues remain out of scope.
  - Planning/coding log files for the recovery task are still uncommitted and should be included or intentionally excluded before PR creation.
- Follow-ups or known gaps:
  - Run skeptical review / `g-check` over the bounded diff before commit/PR.
  - Create the bounded commit/PR artifact and land it to `origin/main`, then sync local `main`.

## g-check Review — 2026-05-12T05:57:30Z

## Findings
- none

## Required Fixes
- none

## Optional Improvements
- Consider a future follow-up that preflights non-`npm run` validation command wrappers more deeply than executable/script presence if issue-002 expands beyond the current regression scope.

## Open Questions / Assumptions
- Assumed the bounded issue-002 landing scope is limited to validation-contract preflight behavior and its direct worker blocking path, not broader same-runtime recovery redesign.

## Recommended Tests / Validation
- `for i in 1 2 3; do echo RUN:$i; node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts || exit 1; done`
- `git diff --check`

## Rollout Notes
- Landing this slice should convert the current issue-002 failure mode from opaque same-runtime coding failure into an explicit validation-contract block before coding proceeds.
- Downstream initiative slices should remain blocked until issue-002 is merged and the initiative lane is refreshed from `origin/main`.

Review Verdict: no_required_fixes
