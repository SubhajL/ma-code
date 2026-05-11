# AFK worker command derivation and finalization fix plan

## Discovery Path
- Loaded `g-planning` requirements and the repo Pi log convention.
- Read the active pointer in the dedicated task worktree:
  - `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix/logs/CURRENT.md`
- Attempted Auggie-first discovery:
  - `auggie_discover` timed out
  - continued with local fallback
- Verified the active task state:
  - `task-1778474916959` remains `in_progress`
  - evidence is still empty
  - validation is still pending
- Verified implementation branch state:
  - worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix`
  - branch: `task/task-1778474916959-afk-worker-command-fix`
  - HEAD: `3716875` (`fix(harness): derive AFK worker execution plans`)
  - current working-tree diff is planning/coding-log updates only
- Verified runtime-verification lane state:
  - worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify`
  - untracked generated artifacts exist under `docs/initiatives/greenfield-scaffold/{afk-runs,worker-runs}`
  - `worker-20260511t051404z.json` still shows `status: running`
  - runtime queue still shows `activeJobId: afk-greenfield-scaffold-issue-006`
  - runtime task state still shows `activeTaskId: task-1778476424522` with status `in_progress`
- Verified the latest formal review result in the coding log:
  - `Review Verdict: changes_required`
  - current blocker is incomplete runtime verification and missing terminal evidence, not a new confirmed product-code defect
- Read `g-create` and `g-submit` summaries to align the landing path with repo-preferred create/submit workflows.

## Goal
- Finish this task from its current partially-complete state through:
  - bounded runtime verification
  - any minimal follow-up code fix only if verification exposes a real code defect
  - final `g-check`
  - task evidence + validation
  - bounded commit/PR creation
  - merge to `origin/main`
  - sync of local `main`
- Keep the process compliant with:
  - task discipline
  - runtime safety
  - evidence-first completion gates
  - repo skill workflow (`g-coding`, `g-check`, `g-create`, `g-submit`)

## Non-Goals
- Do not implement product functionality for issue-006 itself.
- Do not redesign the AFK worker system beyond a minimal fix if runtime verification reveals one.
- Do not create a PR or merge anything before runtime state reaches a terminal result or explicit blocker.
- Do not use the unrelated root worktree or old-task branches for this task.
- Do not bypass review/validation just because commit `3716875` already exists.

## Assumptions
- The primary implementation change is already present in commit `3716875`.
- The remaining gap may be operational/runtime progression rather than missing source code.
- If a new defect is revealed, it should be fixed in the dedicated task worktree with a fresh TDD slice.
- The runtime-verify worktree is an evidence lane and should not be treated as the authoritative landing branch.
- The final landing branch should remain `task/task-1778474916959-afk-worker-command-fix`.
- The latest `g-check` conclusion remains valid until superseded: landing is premature right now.

## Cross-Model Check
- Requested `second_model_plan` for the completion-from-current-state path.
- No second model was available due provider/credit/model-access limits.
- I kept the single-model plan and am making that fallback explicit.

## Plan Draft A
- Treat the current code as likely sufficient and finish the delivery pipeline with no new code unless runtime verification proves otherwise.
- Stage order:
  1. inspect the current worker run and queue/task state
  2. resume the existing worker run with explicit bounds
  3. if the run reaches a terminal state or explicit blocker, capture evidence
  4. rerun `g-check` on the final landing candidate
  5. record task evidence and validation
  6. use `g-create` for the bounded commit state
  7. use `g-submit` for PR creation/update
  8. merge to `origin/main`
  9. sync local `main`
- Pros:
  - smallest surface area
  - fastest path if no new code is needed
  - preserves the existing bounded implementation commit
- Cons:
  - assumes the non-terminal runtime state is just an unfinished run, not a latent defect

## Plan Draft B
- Treat the current non-terminal runtime state as a possible missing follow-up and be ready to reopen coding immediately after the first verification check.
- Stage order:
  1. inspect/explain the existing worker run
  2. resume it once with explicit bounds
  3. if queue/task/worker state remains stuck or inconsistent, stop and open a narrow follow-up coding slice
  4. add one failing targeted test for the newly observed defect
  5. implement the smallest fix in the task worktree
  6. rerun fast gates and runtime verification
  7. rerun `g-check`, then continue to create/submit/merge/sync
- Pros:
  - safer if the current code is still incomplete
  - forces defect-proof evidence before landing
- Cons:
  - slower path if no follow-up code is actually required
  - risks extra churn if the runtime lane only needed a resume step

## Unified Plan
- Overview:
  - The source-code slice appears implemented in `3716875`, but the task is not complete because runtime verification, terminal queue/task evidence, final review, validation, PR creation, and landing are still pending.
  - The next move is not to land; it is to finish the bounded runtime/evidence pipeline.
- Public interfaces affected by the already-landed code slice and any minimal follow-up fix:
  - AFK queue materialization / execution plan derivation
  - worker execution run state and terminal finalization
  - runtime queue/task visibility
  - CLI/operator flow through `harness-worker-execute` and `harness-orchestrate`
- Stage 1 — Re-establish runtime truth in the runtime-verify lane:
  - Inspect the current run:
    - `npm --silent run harness:worker-execute -- status --initiative greenfield-scaffold --run-id worker-20260511t051404z --json`
    - `npm --silent run harness:worker-execute -- explain-run --initiative greenfield-scaffold --run-id worker-20260511t051404z --json`
  - Resume the current bounded worker run:
    - `npm --silent run harness:worker-execute -- resume --initiative greenfield-scaffold --run-id worker-20260511t051404z --max-steps 8 --max-runtime-seconds 900 --json`
  - Re-inspect:
    - `docs/initiatives/greenfield-scaffold/worker-runs/*.json`
    - `.pi/agent/state/runtime/queue.json`
    - `.pi/agent/state/runtime/tasks.json`
- Stage 2 — Branch on runtime result:
  - If the run reaches a terminal state or explicit blocker and queue/task finalization is correct:
    - keep source code unchanged
    - capture evidence in the coding log and task state
  - If the run remains stuck, non-terminal, or inconsistent:
    - open a minimal `g-coding` follow-up in the task worktree
    - add one targeted failing test for the exact observed defect
    - implement the smallest fix
    - rerun fast gates and runtime verification
- Stage 3 — Final review/evidence gate:
  - Rerun `g-check` on the actual landing candidate after runtime verification is terminal.
  - Ensure the coding log contains:
    - RED/GREEN evidence for any follow-up fix if one was needed
    - runtime verification evidence
    - final `Review Verdict: no_required_fixes`
- Stage 4 — Task validation gate:
  - Record task evidence via runtime task tools.
  - Move validation from pending to pass only after review/evidence gates are satisfied.
  - Do not mark done until evidence includes changed files, validation, what changed, and remaining risks/gaps.
- Stage 5 — Commit / PR creation:
  - Use `g-create` to package the final ready working tree.
  - Use `g-submit` to create/update the PR from `task/task-1778474916959-afk-worker-command-fix`.
  - Ensure the PR description reflects:
    - implementation commit `3716875`
    - any follow-up fix commit if created
    - runtime verification proof
    - final review verdict
- Stage 6 — Merge to `origin/main` and sync local `main`:
  - Merge only after review/validation/CI expectations are satisfied.
  - After merge:
    - `git fetch origin`
    - `git checkout main`
    - `git pull --ff-only origin main`
  - Verify local `main` contains the merged commit(s).
- Rollback / backout expectation:
  - If runtime verification reveals a new blocker that cannot be resolved in a minimal bounded slice, stop before PR creation and keep the task visible as blocked rather than forcing landing.

## Files to Modify
- No additional product-code files are expected if Stage 1 runtime verification succeeds.
- If Stage 2 reveals a real defect, expected follow-up surfaces are:
  - `.pi/agent/extensions/worker-execution.ts`
  - `.pi/agent/extensions/queue-runner.ts`
  - `.pi/agent/extensions/afk-orchestration.ts`
  - `.pi/agent/extensions/afk-worker-execution-plan.ts`
  - `tests/extension-units/worker-execution.test.ts`
  - `tests/extension-units/queue-runner.test.ts`
  - `tests/extension-units/afk-orchestration.test.ts`
  - `scripts/check-foundation-extension-compile.sh` only if compile harness wiring needs another adjustment
- Evidence/logging/task surfaces that will definitely change before landing:
  - `logs/coding/2026-05-11_afk-worker-command-fix.md`
  - `reports/planning/2026-05-11_afk-worker-command-fix-plan.md`
  - task state via runtime task tools

## New Files
- Likely none.
- If a fresh runtime verification run is needed, new generated evidence files under the runtime-verify worktree are expected, but they are evidence artifacts rather than planned landing-branch source additions.

## TDD Sequence
- First tracer-bullet behavior for any follow-up fix:
  - resuming the existing issue-006 worker run should either reach a terminal state or surface a specific, testable defect rather than remaining indefinitely `running` with queue/task state stuck active.
- Public interface that proves it:
  - `harness-worker-execute` resume/status/explain behavior
  - worker-run artifact terminal state
  - queue/task runtime JSON finalization
- Boundary dependencies and mock/fake plan:
  - use targeted unit tests for queue/worker/orchestration behavior
  - use the runtime-verify worktree only for bounded end-to-end verification
  - no provider-backed broad discovery
- Behaviors intentionally left out of scope:
  - issue-006 product feature implementation
  - broad redesign of worker autonomy/log ownership/skill orchestration unless directly required by a reproduced defect
- Exact TDD order if a follow-up code fix is required:
  1. add or tighten the smallest relevant test reproducing the newly observed stuck/non-terminal behavior
  2. run it and confirm it fails for the right reason
  3. implement the smallest change that can pass
  4. refactor minimally if needed
  5. rerun the relevant fast gates again
  6. rerun bounded runtime verification
  7. rerun `g-check` on the final landing candidate

## Test Coverage
- Already recorded coverage from the existing code slice:
  - `tests/extension-units/afk-orchestration.test.ts`
  - `tests/extension-units/worker-execution.test.ts`
  - `tests/extension-units/queue-runner.test.ts`
  - `./scripts/check-foundation-extension-compile.sh`
  - `git diff --check`
- Additional coverage only if a follow-up code fix is needed:
  - one targeted test for the exact stuck/non-terminal or finalization defect revealed by runtime verification
- Non-test runtime coverage still required before landing:
  - successful or explicitly blocked bounded runtime verification for issue-006
  - final task evidence
  - final `g-check` verdict

## Acceptance Criteria
- The existing issue-006 worker run is resumed or superseded with bounded runtime verification and reaches a terminal state or explicit blocker.
- Queue/task state no longer remains silently stuck in active/in-progress form once the run reaches its boundary.
- If runtime verification reveals a code defect, it is fixed in a minimal bounded slice with fresh RED/GREEN evidence.
- The final landing candidate has a `g-check` result of `no_required_fixes`.
- `task-1778474916959` contains recorded evidence and a passing validation decision before completion.
- A PR is created from `task/task-1778474916959-afk-worker-command-fix`, merged to `origin/main`, and local `main` is synced only after the gates above pass.

## Wiring Checks
| Component | Runtime entry point | Registration location | Schema/table | Verification |
| --- | --- | --- | --- | --- |
| AFK execution-plan derivation | `runAfkOrchestration(...)` / queue materialization | `.pi/agent/extensions/afk-orchestration.ts`, `.pi/agent/extensions/afk-worker-execution-plan.ts`, `.pi/agent/extensions/queue-runner.ts` | runtime queue JSON | inspect queue job `implementationCommand` / `validationCommands` and corresponding unit tests |
| Worker run progression | `runWorkerExecution(...)` / `harness-worker-execute` | `.pi/agent/extensions/worker-execution.ts`, `scripts/harness-worker-execute.ts` | `worker-runs/*.json` | verify current run leaves `running` and updates `steps`, `status`, `stopReason`, and `nextOperatorAction` appropriately |
| Queue/task finalization | worker terminal path | `.pi/agent/extensions/worker-execution.ts`, `.pi/agent/extensions/queue-runner.ts` | `.pi/agent/state/runtime/{queue,tasks}.json` | confirm `activeJobId` / `activeTaskId` clear or transition correctly when the worker run reaches its boundary |
| Final review/landing path | review + create + submit workflow | coding log + `g-check`, `g-create`, `g-submit` workflows | Pi logs + GitHub PR | verify final coding log contains runtime proof and `Review Verdict: no_required_fixes`, then confirm PR exists and merge completes |

## Validation
- Runtime verification commands to run first in `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify`:
  - `npm --silent run harness:worker-execute -- status --initiative greenfield-scaffold --run-id worker-20260511t051404z --json`
  - `npm --silent run harness:worker-execute -- explain-run --initiative greenfield-scaffold --run-id worker-20260511t051404z --json`
  - `npm --silent run harness:worker-execute -- resume --initiative greenfield-scaffold --run-id worker-20260511t051404z --max-steps 8 --max-runtime-seconds 900 --json`
- If the existing run is stale or unusable, fallback bounded verification command:
  - `npm --silent run harness:orchestrate -- run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-006 --max-steps 8 --max-runtime-seconds 900 --json`
- After any follow-up source fix, rerun the smallest relevant fast gates:
  - `node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts tests/extension-units/queue-runner.test.ts`
  - `./scripts/check-foundation-extension-compile.sh`
  - `git diff --check`
- Review / landing checks:
  - run `g-check`
  - use `g-create`
  - use `g-submit`
  - verify merge to `origin/main`
  - verify local sync with `git checkout main && git pull --ff-only origin main`

## Risks
- The current runtime lane may simply be unfinished, but it may also be stuck; the plan must distinguish those before landing.
- The worker run artifact still shows `running`, so completion cannot currently be claimed.
- The runtime worker worktree currently points `logs/CURRENT.md` at unrelated older logs; if resumed work starts writing skill evidence there, evidence ownership may become muddy and may require a bounded follow-up correction.
- The runtime-verify worktree contains generated untracked evidence artifacts; those should not be mistaken for the authoritative landing branch state.
- A new downstream blocker may appear once issue-006 moves past the old missing-command problem.
- Landing before final `g-check`, task evidence, and validation would violate completion gates.

## Pi Log Update
- Active planning log:
  - `reports/planning/2026-05-11_afk-worker-command-fix-plan.md`
- Active coding log:
  - `logs/coding/2026-05-11_afk-worker-command-fix.md`
- Active pointer:
  - `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix/logs/CURRENT.md`
- This planning refresh records that:
  - implementation commit `3716875` already exists
  - the task is still blocked on runtime verification / final evidence, not yet ready for landing
  - the remaining path to PR creation, `origin/main`, and local `main` landing is now explicitly sequenced

## 2026-05-11T16:58:38+0700 - optimal gap-fix planning refresh
- Goal:
  - decide whether the current AFK worker path is optimized after fresh runtime verification and define the best bounded architectural fix.
- Discovery used:
  - attempted `auggie_discover` with a 2s bound; it timed out
  - continued with direct inspection of `afk-worker-execution-plan.ts`, `afk-orchestration.ts`, `queue-runner.ts`, `worker-execution.ts`, `same-runtime-bridge.ts`, `issue-006.summary.json`, and the fresh runtime evidence from `worker-20260511t091229z`
  - used `second_model_plan`; it converged on moving AFK worker execution off nested CLI and onto a same-runtime child-session path
- Current truth:
  - the simplified single nested `/skill:g-coding` command is an improvement, but it is not the optimized end state
  - fresh-lane proof shows issue-006 still fails after a 900s bounded run even with the simplified command
  - queue/task finalization is now healthy; the remaining gap is the implementation execution mechanism itself
- Recommended architecture:
  - introduce a structured worker execution plan for AFK jobs instead of relying only on `implementationCommand` shell strings
  - execute AFK implementation work through a same-runtime child-session helper that reuses shared auth/model state and coding tools, rather than spawning nested `pi /skill:...` CLI commands
  - keep legacy `implementationCommand` fallback only for older queued jobs during migration
- First TDD slice for implementation:
  - tracer behavior: a fresh AFK queue job for issue-006 is executed through a same-runtime worker execution plan instead of `bash -lc 'pi ...'`
  - proving public surface: `queue.jobs[].workerExecutionPlan`, `runWorkerExecution(...).steps.coding`, and preserved `worker-runs/*.json`
  - boundary plan: stub the same-runtime execution helper in unit tests; do not use live provider calls in the first slice
  - out of scope for first slice: removing all legacy command-string fallback for already-materialized jobs
- Acceptance for the next implementation slice:
  - new AFK queue jobs materialize a structured same-runtime execution plan for implementation work
  - worker execution prefers the structured same-runtime path and only falls back to `implementationCommand` when necessary for backward compatibility
  - targeted unit tests cover plan materialization, worker execution dispatch, failure propagation, and finalization
  - fresh runtime verification for issue-006 proves the new path either succeeds or fails with richer structured evidence than a bare shell exit

## 2026-05-11T17:09:02+0700 - execution-through-landing planning refresh
- Intent handled conservatively:
  - the human asked to implement through PR creation and landing, but this turn is explicitly routed to `g-planning`
  - no code was implemented in this turn; this entry records the execution-ready plan and the required skill sequence for the next turns
- Goal:
  - finish `task-1778474916959` from implementation of the same-runtime AFK worker path through review, validation, PR creation, `origin/main` landing, and local `main` sync
- Recommended execution sequence:
  - `g-coding`:
    - add structured `workerExecutionPlan` support
    - add same-runtime worker execution helper
    - keep `implementationCommand` fallback for old jobs
    - complete targeted RED/GREEN tests and one fresh issue-006 runtime proof
  - `g-check`:
    - skeptical working-tree review after the implementation slice is validation-clean
  - `g-create`:
    - create bounded commit set from the reviewed working tree
    - prefer Graphite (`gt`) because it is installed; use git fallback only if Graphite blocks
  - validator / live proof:
    - run one provider-backed validator or equivalent bounded live proof only where local evidence is insufficient
  - `g-submit`:
    - create/update PR using `gt` or `gh`
    - land only after review/validation/CI gates are satisfied
  - local sync:
    - fast-forward or re-sync local `main` only after `origin/main` reflects the landed change
- Landing gates before PR/merge:
  - structured same-runtime AFK path implemented and tested
  - fresh issue-006 runtime verification no longer depends on nested CLI skill execution
  - `g-check` verdict is `no_required_fixes`
  - required fast gates pass
  - one bounded live validation run is recorded if live proof is still needed
  - PR-ready evidence is present in the task and Pi logs
- First execution slice TDD contract:
  - tracer behavior: fresh AFK queue jobs for issue-006 materialize and execute `workerExecutionPlan.strategy = same_runtime_prompt`
  - public proof: `queue.jobs[].workerExecutionPlan`, `worker-runs/*.json`, `.pi/agent/state/runtime/queue.json`
  - boundary plan: stub same-runtime execution in unit tests first; keep old command fallback intact
  - out of scope: removing legacy fallback for old queue jobs in the first slice
- Main risks called out for landing:
  - same-runtime child-session lifecycle bugs
  - prompt contract too weak if child skills are removed without enough direct instruction
  - accidental scope growth into a broader queue/runtime redesign
  - repeated expensive live reruns without new information

## 2026-05-12 Continuation Alignment Plan

- Discovery path: Auggie attempted with a 2s bound and timed out; continued with local task-state, git/worktree, log, and targeted source inspection.
- Goal: finish `task-1778474916959` by keeping the AFK/MO worker execution fix focused on structured `workerExecutionPlan` / `same_runtime_prompt` dispatch and clean queue/task finalization.
- Active worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify-fresh9` on branch `task/task-1778474916959-runtime-verify-fresh9`.
- Non-goal: do not fix downstream greenfield `issue-006` design-token validation in this task; treat it as the next blocker once worker plumbing is proven.
- First TDD slice: verify a fresh AFK queue job materializes `workerExecutionPlan.strategy = same_runtime_prompt`, worker execution prefers that structured plan over legacy `implementationCommand`, and missing plan/command blocks explicitly.
- Validation slice: rerun `node --import tsx --test tests/extension-units/worker-same-runtime-execution.test.ts tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts`; use no more than one bounded live MO/worker proof if local evidence is insufficient.
- Acceptance checks: worker jobs do not fail solely from absent implementation commands; failed validation paths finalize queue/task active state; issue-006 validation failure is recorded as downstream rather than worker-bootstrap failure.
