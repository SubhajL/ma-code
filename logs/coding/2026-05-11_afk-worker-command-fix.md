# AFK worker command derivation and finalization fix

## 2026-05-11T04:45:00Z
- Goal: implement the AFK worker execution-plan fix so MO worker jobs stop skipping coding due to missing implementationCommand and queue/task state finalizes cleanly on failures.
- Lifecycle readiness: using planning artifact `reports/planning/2026-05-11_afk-worker-command-fix-plan.md` in this worktree.
- Discovery path: read `AGENTS.md`, `README.md`, `logs/CURRENT.md`; Auggie timed out; used direct inspection of `afk-orchestration.ts`, `queue-runner.ts`, `orchestrator-run.ts`, `worker-execution.ts`, related unit tests, and the failed greenfield issue-006 worker artifact.
- Tracer bullet behavior: an AFK worker job should no longer start with coding skipped solely because no explicit implementation command was plumbed through the queue/orchestrator path.
- Public interface proving it: `buildQueueJob(...)`, `runOrchestratorRun(...)`, `runWorkerExecution(...)`, and queue/task state after worker terminal outcomes.
- Boundary dependencies / mocks: temp repo fixtures for worker execution, delegated runner spies for orchestrator-run, queue state fixtures for queue-runner.
- Out of scope: actual design-token feature implementation for issue-006; this slice fixes harness execution plumbing only.

## 2026-05-11T05:05:00Z
- Goal: add executable AFK worker commands at queue materialization time, use them during worker execution, allow Pi log artifacts, and finalize queue/task state cleanly on terminal worker outcomes.
- Files changed and why:
  - `.pi/agent/extensions/afk-worker-execution-plan.ts` adds derived AFK implementation-command generation and operational log path detection.
  - `.pi/agent/extensions/afk-orchestration.ts` now attaches derived `implementationCommand` and `validationCommands` to AFK queue jobs.
  - `.pi/agent/extensions/queue-runner.ts` now carries worker execution command fields on `QueueJob` and clears `activeJobId` / sets `finishedAt` on terminal worker linkage updates.
  - `.pi/agent/extensions/worker-execution.ts` now consumes queue-job command fallbacks, blocks clearly when no execution plan exists, allows Pi log artifacts during changed-file checks, records GREEN command details, and finalizes linked tasks on blocked/failed worker outcomes.
  - `tests/extension-units/afk-orchestration.test.ts` verifies materialized AFK queue jobs now include derived implementation and validation commands.
  - `tests/extension-units/worker-execution.test.ts` verifies queue-job implementation-command fallback, Pi log artifact allowance, explicit missing-plan blocking, and failed validation cleanup of queue/task state.
  - `scripts/check-foundation-extension-compile.sh` now includes the new helper in the compile harness.
  - `logs/CURRENT.md` points at this feature group's plan/coding logs.
- Tests added or changed:
  - AFK queue job execution-plan assertions in `afk-orchestration.test.ts`
  - queue-job command fallback / Pi log artifact allowance in `worker-execution.test.ts`
  - explicit missing-plan blocker in `worker-execution.test.ts`
  - failed validation queue/task cleanup in `worker-execution.test.ts`
- Exact RED command and key failure reason:
  - `node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts`
  - Failures showed the current runtime had no queue-job implementation command, worker execution blocked or skipped coding, and changed-file enforcement treated untracked Pi log directories as outside allowed paths.
  - `./scripts/check-foundation-extension-compile.sh`
  - Initially failed because the new helper file was not copied into the compile harness.
- Exact GREEN command:
  - `node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts tests/extension-units/queue-runner.test.ts`
- GREEN result:
  - full changed test scope passes.
- Other validation commands run:
  - `node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts tests/extension-units/queue-runner.test.ts` (3 consecutive passes)
  - `./scripts/check-foundation-extension-compile.sh`
  - `git diff --check`
- Wiring verification evidence:
  - AFK queue jobs now carry `implementationCommand` / `validationCommands` from `buildQueueJob(...)`.
  - Worker execution now resolves commands from `WorkerExecutionInput` first, then queue job metadata.
  - Queue linkage now clears `activeJobId` when worker outcomes are terminal.
  - Linked task finalization now runs from `blockRun(...)` for blocked/failed worker outcomes.
- Behavior changes and risk notes:
  - Fresh queue materialization should let AFK workers start with a derived `pi` planning/coding command instead of silently skipping coding.
  - Older pre-fix queue jobs without execution-plan fields now fail fast with an explicit blocker instead of a misleading skipped-coding path.
  - Pi operational logs are now allowed as worker side effects, but arbitrary non-allowed paths remain blocked.
- Follow-ups or known gaps:
  - Need a fresh post-change MO verification run to confirm issue-006 no longer fails specifically for missing implementation command and to see the next real frontier/blocker.

## 2026-05-11T12:49:13+0700
- User asked to continue implementation until all unified-plan stages are complete.
- This turn was routed to `g-planning`, so no product-code mutation was performed here.
- Verified current implementation status in the dedicated task worktree `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix`:
  - branch: `task/task-1778474916959-afk-worker-command-fix`
  - status: clean
  - committed implementation present at `3716875` (`fix(harness): derive AFK worker execution plans`)
- Verified runtime-verification status in `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify`:
  - generated AFK run artifact: `docs/initiatives/greenfield-scaffold/afk-runs/afk-20260511t051344z.json`
  - generated worker run artifact: `docs/initiatives/greenfield-scaffold/worker-runs/worker-20260511t051404z.json`
  - queue state still shows active job `afk-greenfield-scaffold-issue-006`
  - linked task `task-1778476424522` remains `in_progress`
- Planning refresh recorded in `reports/planning/2026-05-11_afk-worker-command-fix-plan.md`.
- Remaining delivery stages after the committed code change:
  - complete bounded runtime verification until issue-006 reaches the next real boundary or a clear blocker
  - run `g-check`
  - record validator/task evidence
  - create PR, merge to `origin/main`, and sync local `main` only after completion gates pass

## Review (2026-05-11T12:53:31+0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix`
- Branch: `task/task-1778474916959-afk-worker-command-fix`
- Scope: `working-tree`
- Commands Run:
  - `read logs/CURRENT.md`
  - `git status --porcelain=v1`
  - `git branch --show-current`
  - `git rev-parse --show-toplevel`
  - `git diff --name-only`
  - `git diff --stat`
  - `git diff -- reports/planning/2026-05-11_afk-worker-command-fix-plan.md logs/coding/2026-05-11_afk-worker-command-fix.md`
  - `read /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify/.pi/agent/state/runtime/queue.json`
  - `read /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify/.pi/agent/state/runtime/tasks.json`
  - `read /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify/docs/initiatives/greenfield-scaffold/worker-runs/worker-20260511t051404z.json`
  - `task_update action=show id=task-1778474916959`
  - `git diff --check`

### Findings
CRITICAL
- none

HIGH
- `reports/planning/2026-05-11_afk-worker-command-fix-plan.md:151-160` and `logs/coding/2026-05-11_afk-worker-command-fix.md:60-70` correctly state that runtime verification, review, validation, and landing are still pending, but the supporting runtime evidence is still non-terminal: `docs/initiatives/greenfield-scaffold/worker-runs/worker-20260511t051404z.json:6-9` remains `"status": "running"`, `.pi/agent/state/runtime/queue.json:4` still has `"activeJobId": "afk-greenfield-scaffold-issue-006"`, and `.pi/agent/state/runtime/tasks.json:3,6-9` still shows the linked task active and `in_progress`. If this is treated as “finished” now, the harness would claim completion without terminal runtime proof. Fix by finishing the bounded runtime verification, then updating logs/task evidence only after the worker artifact and queue/task state reach a terminal state or explicit blocker.

MEDIUM
- `task-1778474916959` is still `in_progress` with no recorded evidence and pending validation in runtime task state. Even if commit `3716875` contains the intended code change, completion gates are not met yet. Fix by recording task evidence via task tools, obtaining validation, and only then moving toward PR/merge.

LOW
- The current working-tree diff contains only planning/coding log updates. That is fine for a status refresh, but it means this review can validate reporting consistency only; it cannot replace a final review of the actual terminal runtime result that will justify landing. Rerun `g-check` on the final landing diff or last commit after runtime verification is complete.

### Open Questions / Assumptions
- Assumed `working-tree` was the intended review scope because no narrower target was specified.
- Assumed the goal behind “Please finish this” was to determine whether the task can honestly be treated as complete right now.

### Recommended Tests / Validation
- Continue or rerun the bounded runtime verification in `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify` until `worker-20260511t051404z.json` (or its successor) reaches a terminal state or explicit blocker.
- Re-inspect `.pi/agent/state/runtime/queue.json` and `.pi/agent/state/runtime/tasks.json` and confirm `activeJobId`/`activeTaskId` clear or transition as expected.
- Record task evidence/validation through runtime tools, then rerun `g-check` on the final landing candidate.

### Rollout Notes
- Do not create a PR, merge to `origin/main`, or sync local `main` from this state.
- The current evidence supports “implementation committed, completion pending,” not “ready to land.”

Review Verdict: changes_required

## 2026-05-11T12:59:06+0700
- Goal: refresh the execution plan from the current partial state through runtime verification, final review, PR creation, merge to `origin/main`, and local `main` sync.
- Files changed and why:
  - `reports/planning/2026-05-11_afk-worker-command-fix-plan.md` — replaced the earlier status-refresh plan with an explicit completion sequence covering runtime verification, possible minimal follow-up fix, `g-check`, task validation, `g-create`, `g-submit`, merge, and local-main sync.
  - `logs/coding/2026-05-11_afk-worker-command-fix.md` — appended this planning-refresh evidence entry.
- Tests added or changed:
  - none; this was a planning/logging refresh only.
- Exact RED command and key failure reason:
  - none in this turn; no code was implemented because the turn was routed to `g-planning`.
- Exact GREEN command:
  - none in this turn; the next executable step is bounded runtime verification in the runtime-verify worktree.
- Other validation commands run:
  - `git status --porcelain=v1` in the task and runtime-verify worktrees
  - `task_update action=show id=task-1778474916959`
  - inspection of `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify/.pi/agent/state/runtime/queue.json`
  - inspection of `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify/.pi/agent/state/runtime/tasks.json`
  - inspection of `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify/docs/initiatives/greenfield-scaffold/worker-runs/worker-20260511t051404z.json`
  - `gh pr status`
- Wiring verification evidence:
  - Confirmed the implementation branch still points at commit `3716875` with the AFK execution-plan/finalization fix.
  - Confirmed the runtime lane is still non-terminal: worker artifact remains `running`, queue still has `activeJobId`, and task state still has `activeTaskId` / `in_progress`.
  - Confirmed there is currently no PR associated with `task/task-1778474916959-afk-worker-command-fix`.
- Behavior changes and risk notes:
  - No product/runtime behavior changed in this turn.
  - The main risk remains premature landing without terminal runtime evidence.
  - The refreshed plan now makes the resume/check/fix/review/create/submit/merge/sync path explicit.
- Follow-ups or known gaps:
  - Run bounded runtime verification first; do not create a PR yet.
  - If the resumed worker run still fails to reach a terminal state or explicit blocker, open a narrow `g-coding` follow-up slice in the dedicated task worktree.

## 2026-05-11T13:31:04+0700
- Goal: unblock AFK worker skill execution by aligning repo-local Pi defaults with the actual locally available provider/model IDs so issue-006 can resume.
- Files changed and why:
  - `.pi/settings.json` — switched the repo-local default provider/model from unavailable `openai-codex/gpt-5.x` IDs to available `github-copilot/gpt-5.4` defaults so plain `pi` skill invocations in worker execution stop failing before work begins.
  - `logs/coding/2026-05-11_afk-worker-command-fix.md` — appended this runtime-debugging evidence entry.
- Tests added or changed:
  - none; no stable unit-test seam exists for repo-local `pi` bootstrap model resolution, so I used an exact local CLI tracer command instead.
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && pi --help > /tmp/task1778474916959-pi-help-red.txt 2>&1 || true && grep -n 'No models match pattern "openai-codex/gpt-5\.4\|No models match pattern "openai-codex/gpt-5\.4-mini' /tmp/task1778474916959-pi-help-red.txt`
  - Failure reason: repo-local Pi startup emitted model-resolution warnings for unavailable `openai-codex/gpt-5.5`, `openai-codex/gpt-5.4`, and `openai-codex/gpt-5.4-mini`, matching the worker-run failure mode.
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && pi --help > /tmp/task1778474916959-pi-help-green.txt 2>&1 && ! grep -q 'No models match pattern' /tmp/task1778474916959-pi-help-green.txt && sed -n '1,5p' /tmp/task1778474916959-pi-help-green.txt`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && for i in 1 2 3; do pi --help > /tmp/task1778474916959-pi-help-green-$i.txt 2>&1 && ! grep -q 'No models match pattern' /tmp/task1778474916959-pi-help-green-$i.txt || exit 1; done && echo '3 consecutive warning-free pi --help runs passed'`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify && npm --silent run harness:worker-execute -- run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-006 --max-steps 8 --max-runtime-seconds 900 --json`
- Wiring verification evidence:
  - The failing worker artifact for `issue-006` stopped on a plain `pi` skill command before coding/validation, so the repo-local Pi defaults are on the critical execution path for AFK workers.
  - The updated `.pi/settings.json` removes the unavailable `openai-codex` defaults from that path in the authoritative task worktree.
- Behavior changes and risk notes:
  - Repo-local plain `pi` invocations in the task worktree now start without stale-model warnings.
  - The runtime-verify worktree still needs a clean branch update carrying the same `.pi/settings.json` change before bounded worker reruns can proceed there without a dirty-worktree refusal.
- Follow-ups or known gaps:
  - Propagate the settings fix onto a clean runtime-verification lane, then rerun `issue-006`.
  - Do not claim the AFK frontier is unblocked until the updated runtime lane reaches a terminal state or explicit blocker.

## 2026-05-11T13:52:26+0700
- Goal: align harness routing policy with the actually available local GPT-5.4 provider so `pi /skill:g-planning` and `pi /skill:g-coding` worker commands stop selecting stale `openai-codex` fallbacks.
- Files changed and why:
  - `.pi/agent/models.json` — switched remaining runtime routing provider/fallback references from `openai-codex/gpt-5.4*` to `github-copilot/gpt-5.4*` for active worker/recovery/validation paths and backend implementation fallback.
  - `tests/extension-units/harness-routing.test.ts` — updated route expectations to assert the active fallback/override IDs now resolve to `github-copilot/gpt-5.4*`.
  - `logs/coding/2026-05-11_afk-worker-command-fix.md` — appended this second runtime-debugging evidence entry.
- Tests added or changed:
  - `tests/extension-units/harness-routing.test.ts` expectations updated for the active fallback provider.
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/harness-routing.test.ts`
  - Failure reason: repo routing still resolved `backend_implementation` and budget-pressure role-only paths to `openai-codex/gpt-5.4*`, contradicting the live runtime environment and the updated expected fallback provider.
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/harness-routing.test.ts`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && for i in 1 2 3; do node --import tsx --test tests/extension-units/harness-routing.test.ts >/tmp/task1778474916959-routing-$i.txt 2>&1 || exit 1; done && echo '3 consecutive harness-routing test passes'`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && pi --help > /tmp/task1778474916959-pi-help-post-models.txt 2>&1 && ! grep -q 'No models match pattern' /tmp/task1778474916959-pi-help-post-models.txt && echo 'pi help remains warning-free'`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-runtime-verify && npm --silent run harness:worker-execute -- run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-006 --max-steps 8 --max-runtime-seconds 900 --json`
- Wiring verification evidence:
  - `harness-routing` now resolves the active backend implementation fallback to `github-copilot/gpt-5.4` and role-only budget pressure to `github-copilot/gpt-5.4-mini`.
  - Plain `pi` startup remains warning-free in the authoritative task worktree after the routing-policy update.
  - The rerun still failed, so model bootstrap was only one blocker; another worker-command/runtime issue remains to be isolated.
- Behavior changes and risk notes:
  - Repo-local routing policy now matches the locally available GPT-5.4 provider family instead of stale `openai-codex` IDs.
  - The AFK frontier is still not unblocked because issue-006 failed again after the routing fix.
- Follow-ups or known gaps:
  - Inspect the new worker artifact `worker-20260511t063157z.json` and preserved worker worktree for the next blocker.
  - Do not advance remaining AFK issues automatically until the post-routing failure is explained.

## 2026-05-11T14:18:22+0700
- Goal: make derived AFK worker skill commands use the repo's current Pi default model/thinking selection explicitly, instead of inheriting stale worker-worktree defaults.
- Files changed and why:
  - `.pi/agent/extensions/afk-worker-execution-plan.ts` — added repo-local `.pi/settings.json` lookup and explicit `--model` / `--thinking` flags to generated `pi` planning/coding commands.
  - `.pi/agent/extensions/afk-orchestration.ts` — passed `repoRoot` through when deriving AFK implementation commands.
  - `tests/extension-units/afk-orchestration.test.ts` — added a tracer assertion that materialized AFK implementation commands include the explicit repo-selected model and thinking flags.
  - `logs/coding/2026-05-11_afk-worker-command-fix.md` — appended this debugging/TDD evidence entry.
- Tests added or changed:
  - `tests/extension-units/afk-orchestration.test.ts` now verifies generated implementation commands include `--model "github-copilot/gpt-5.4"` and `--thinking "high"` from repo-local Pi settings.
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
  - Failure reason: the derived `implementationCommand` still used plain `pi "..."` invocations with no explicit model/thinking flags, so it could inherit stale defaults from worker worktrees.
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && for i in 1 2 3; do node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/harness-routing.test.ts >/tmp/task1778474916959-changed-scope-$i.txt 2>&1 || exit 1; done && echo '3 consecutive changed-scope passes' && git diff --check`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && ./scripts/check-foundation-extension-compile.sh`
- Wiring verification evidence:
  - AFK queue materialization is the authoritative source of `implementationCommand`, and it now derives those commands using the current repo's Pi defaults rather than whatever stale defaults exist in an isolated worker worktree.
  - The public queue-job surface now exposes explicit `--model` and `--thinking` flags, which lets downstream worker execution stay aligned with the originating repo selection.
- Behavior changes and risk notes:
  - New AFK queue jobs will carry explicit model selection in their generated `pi` commands.
  - Existing already-materialized failed queue jobs in older runtime lanes still carry stale commands and need a fresh queue materialization / runtime lane to benefit from this fix.
- Follow-ups or known gaps:
  - Materialize a fresh runtime lane from the updated task branch and rerun issue-006.
  - Do not declare the AFK frontier unblocked until the fresh lane either passes issue-006 or exposes a new non-model-specific blocker.

## 2026-05-11T14:40:34+0700
- Goal: stop new worker worktrees from booting off stale `origin/main` so they inherit the current task-branch runtime/config fixes during AFK execution.
- Files changed and why:
  - `.pi/agent/extensions/worker-execution.ts` — changed default worker `baseRef` selection from hardcoded `origin/main` to the current git branch (fallback `HEAD`) of the invoking repo.
  - `tests/extension-units/worker-execution.test.ts` — added a tracer test proving a run without explicit `baseRef` uses the current branch and that the created worker worktree inherits branch-local `.pi/settings.json` content.
  - `logs/coding/2026-05-11_afk-worker-command-fix.md` — appended this TDD evidence entry.
- Tests added or changed:
  - `tests/extension-units/worker-execution.test.ts` now covers the default-baseRef behavior for worker worktrees.
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/worker-execution.test.ts`
  - Failure reason: the new tracer test showed `run.worktree.baseRef` defaulted to `origin/main` instead of the current task branch, so worker worktrees could boot without current task-branch config/runtime fixes.
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/worker-execution.test.ts`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && for i in 1 2 3; do node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts tests/extension-units/harness-routing.test.ts >/tmp/task1778474916959-scope-$i.txt 2>&1 || exit 1; done && ./scripts/check-foundation-extension-compile.sh && git diff --check && echo '3 consecutive expanded-scope passes + compile + diff-check'`
- Wiring verification evidence:
  - Worker worktree creation now defaults from the invoking repo’s current branch, which is the runtime path actually used by `runWorkerExecution(...)` before `git worktree add -b ... <baseRef>` executes.
  - The new test verifies the created worker worktree inherits branch-local `.pi/settings.json`, which is the exact configuration path needed for AFK worker `pi` skill bootstrapping.
- Behavior changes and risk notes:
  - New worker runs launched from an updated task/runtime branch should no longer silently base themselves on stale `origin/main`.
  - Existing preserved worker worktrees/artifacts from older failed runs still reflect the old behavior and should not be treated as current proof.
- Follow-ups or known gaps:
  - Re-run issue-006 from a fresh runtime lane that starts from the updated task branch.
  - If issue-006 still fails after this baseRef fix, the next blocker is no longer stale branch/config inheritance and should be treated as a new concrete defect.

## 2026-05-11T15:00:55+0700
- Goal: prevent nested AFK worker `pi` skill commands from loading repo-local extension files that are not valid Pi factory exports.
- Files changed and why:
  - `.pi/agent/extensions/afk-worker-execution-plan.ts` — added `--no-extensions` to generated nested `pi` skill commands so AFK worker execution does not fail while bootstrapping repo-local utility modules as Pi extensions.
  - `tests/extension-units/afk-orchestration.test.ts` — extended the public queue-job assertion to require `--no-extensions` on derived implementation commands.
  - `logs/coding/2026-05-11_afk-worker-command-fix.md` — appended this blocker-diagnosis/TDD evidence entry.
- Tests added or changed:
  - `tests/extension-units/afk-orchestration.test.ts` now verifies the queue-materialized command includes `--no-extensions` alongside explicit model/thinking flags.
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
  - Failure reason: derived AFK implementation commands still lacked `--no-extensions`, and a bounded manual repro in the preserved worker worktree showed nested `pi` failing with `Extension does not export a valid factory function` for repo utility modules such as `afk-worker-execution-plan.ts` and `git-dirty-runtime-artifacts.ts`.
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && for i in 1 2 3; do node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts tests/extension-units/harness-routing.test.ts >/tmp/task1778474916959-fullscope-$i.txt 2>&1 || exit 1; done && ./scripts/check-foundation-extension-compile.sh && git diff --check && echo '3 consecutive full-scope passes + compile + diff-check'`
  - bounded manual repro command in the preserved worker worktree used to isolate the failure mode before the fix:
    - `timeout 60s bash -lc "$cmd" > /tmp/issue006-manual.txt 2>&1`
- Wiring verification evidence:
  - Queue-materialized AFK implementation commands are the only source used by worker execution for nested `pi` skill invocation, and those commands now explicitly disable repo-local extension loading.
  - This keeps nested `pi` skill sessions focused on skills/prompts/logs instead of trying to bootstrap every repo utility module as a Pi extension.
- Behavior changes and risk notes:
  - New AFK worker nested `pi` commands will run with explicit model/thinking flags and without repo extension auto-loading.
  - This avoids the confirmed extension-factory bootstrap failure, but a fresh runtime lane is still required because already-materialized queue jobs keep the old command string.
- Follow-ups or known gaps:
  - Materialize one more fresh runtime lane from current HEAD and rerun issue-006.
  - If issue-006 still fails after this fix, the next blocker is neither stale model selection nor extension auto-loading and must be treated as a new concrete runtime defect.

## 2026-05-11T15:19:38+0700
- Goal: make nested AFK worker `pi` commands explicitly non-interactive and ephemeral so they do not hang waiting for a session/UI lifecycle instead of completing the requested skill turn.
- Files changed and why:
  - `.pi/agent/extensions/afk-worker-execution-plan.ts` — added `--print` and `--no-session` to generated nested `pi` commands so worker-launched skill runs are bounded one-shot executions.
  - `tests/extension-units/afk-orchestration.test.ts` — strengthened the queue-job command assertion to require `--print` and `--no-session` in addition to explicit model/thinking/extension flags.
  - `logs/coding/2026-05-11_afk-worker-command-fix.md` — appended this blocker-diagnosis/TDD evidence entry.
- Tests added or changed:
  - `tests/extension-units/afk-orchestration.test.ts` now verifies non-interactive flags are present on the generated nested `pi` command.
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
  - Failure reason: derived implementation commands still lacked `--print` / `--no-session`, and a bounded 60s manual repro of the generated command in a preserved worker worktree exited `124` with no output, consistent with an interactive/session hang rather than immediate task execution.
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1778474916959-afk-worker-command-fix && for i in 1 2 3; do node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts tests/extension-units/harness-routing.test.ts >/tmp/task1778474916959-postprint-$i.txt 2>&1 || exit 1; done && ./scripts/check-foundation-extension-compile.sh && git diff --check && echo '3 consecutive post-print full-scope passes + compile + diff-check'`
  - bounded manual repro used to isolate the hang mode before this fix:
    - `timeout 60s bash -lc "$cmd" > /tmp/issue006-manual-noext.txt 2>&1`
- Wiring verification evidence:
  - Queue materialization is the only source of the nested `pi` worker command, and it now emits a bounded one-shot CLI form: `pi --print --no-session --no-extensions --model ... --thinking ... "..."`.
  - This removes interactive/session persistence from the worker execution path while preserving the repo-selected model and prompt payload.
- Behavior changes and risk notes:
  - New AFK worker commands are now explicitly single-turn and ephemeral.
  - Already-materialized queue jobs in older runtime lanes still contain the pre-fix command and cannot prove the fix.
- Follow-ups or known gaps:
  - Materialize a fresh runtime lane from current HEAD and rerun issue-006 with the new command form.
  - If issue-006 still fails after this fix, the next blocker is beyond model/default/extension/session bootstrapping and should be treated as a deeper worker-command defect.
