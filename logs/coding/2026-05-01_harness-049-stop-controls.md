# Coding Log — harness-049-stop-controls

- Date: 2026-05-01
- Scope: HARNESS-049 bounded deterministic stop/budget control expansion
- Status: in_progress
- Branch: `split/harness-049-stop-controls`
- Related planning log: `reports/planning/2026-05-01_harness-049-stop-controls-plan.md`

## Task Group
- Add one bounded deterministic stop/budget control (`budget.maxUnresolvedBlockers`) with RED-first tests, runtime enforcement, docs/schema updates, and landing evidence.

## Files Investigated
- `AGENTS.md`
- `logs/CURRENT.md`
- `pi_harness_implementation_backlog_REPO_LOCAL.md`
- `.pi/agent/extensions/queue-runner.ts`
- `tests/extension-units/queue-runner.test.ts`
- `scripts/validate-queue-runner.sh`
- `.pi/agent/state/schemas/queue.schema.json`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/bounded_autonomy_architecture.md`
- `.pi/agent/docs/harness_phase_capability_map.md`

## Files Changed
- none yet

## Runtime / Validation Evidence
- Discovery path: `auggie_discover` timed out; local fallback inspection with `rg` and targeted reads used.
- Active task: `task-1777674722410`.
- Isolated worktree created: `/Users/subhajlimanond/dev/ma-code-worktrees/harness-049-stop-controls` on branch `split/harness-049-stop-controls` from `origin/main`.
- Cross-model check used via `second_model_plan` to sanity-check the bounded deterministic-control choice.

## Key Findings
- HARNESS-034 currently enforces `budget.maxRetries`, `budget.maxRuntimeMinutes`, `budget.maxFailedValidations`, and the approval boundary only.
- Unsupported `budget.maxCostUsd`, `budget.maxFilesChanged`, and free-form `stop_conditions` are blocked clearly before start.
- HARNESS-049 backlog explicitly prefers the next safest control that can be enforced deterministically from visible runtime state.
- `budget.maxUnresolvedBlockers` is a bounded fit because blocked jobs/tasks are already visible in runtime state without relying on inferred spend or weak evidence parsing.

## Decisions Made
- Keep this slice bounded to one new control: `budget.maxUnresolvedBlockers`.
- Enforce it before queued start/restart only, using visible blocked jobs/tasks, rather than widening scope to active-run global halts.
- Preserve existing unsupported-control blocking for everything else.

## Known Risks
- The blocked-state counting rule must be explicit and documented to avoid surprises.
- Overly broad counting could halt work aggressively when users intentionally keep blocked items visible.

## Current Outcome
- Planning is complete and RED-first implementation can begin in this worktree.

## Next Action
- Add focused queue-runner unit tests for `budget.maxUnresolvedBlockers`, run RED, then implement the smallest enforcement change.

## Work Summary (2026-05-01 20:37:00 +0700)
- Goal of the change:
  - add the smallest negative-path HARNESS-049 tests for a new deterministic stop/budget control before runtime changes
  - prove the queue runner currently does not enforce `budget.maxUnresolvedBlockers`
- Files changed and why:
  - `tests/extension-units/queue-runner.test.ts`
    - added RED coverage for one queued job that should block when visible unresolved blockers exceed its budget and one next eligible job that should still start when its threshold is high enough
  - `logs/CURRENT.md`
    - moved the active paired log pointer to the bounded HARNESS-049 workstream
  - `reports/planning/2026-05-01_harness-049-stop-controls-plan.md`
    - recorded the bounded implementation plan
  - `logs/coding/2026-05-01_harness-049-stop-controls.md`
    - recorded discovery, scope lock, and RED intent
- Tests added or changed:
  - unit: `queue runner blocks queued jobs whose maxUnresolvedBlockers budget is already exceeded and starts the next eligible job`
- Exact RED command and key failure reason:
  - `bash scripts/validate-queue-runner.sh --skip-live`
  - failed for the right reason:
    - the new queued job was not blocked at all because `budget.maxUnresolvedBlockers` was not implemented yet
    - assertion mismatch: expected `blockedJobIds` to contain `job-budget-blocked`, got `[]`
- Exact GREEN command:
  - none yet; implementation not complete at this point
- Other validation commands run:
  - none beyond the focused RED validator in this step
- Wiring verification evidence:
  - HARNESS-049 is a public queue-job contract change, so the bounded slice must touch queue schema and queue docs in addition to runtime logic
- Behavior changes and risk notes:
  - no runtime behavior changed yet; this step only added failing tests and locked the control choice to `budget.maxUnresolvedBlockers`
- Follow-ups or known gaps:
  - implement runtime counting from visible blocked jobs/tasks
  - define and document whether newly blocked jobs count toward later jobs in the same runner pass

## Work Summary (2026-05-01 20:44:00 +0700)
- Goal of the change:
  - implement deterministic HARNESS-049 enforcement for `budget.maxUnresolvedBlockers`
  - keep the slice bounded to queued start/restart enforcement using visible runtime state only
- Files changed and why:
  - `.pi/agent/extensions/queue-runner.ts`
    - added `budget.maxUnresolvedBlockers` to the runtime type
    - added deterministic visible-blocker counting (`blocked` queue jobs + `blocked` tasks)
    - blocked queued jobs before start when the visible count exceeds the configured budget
  - `.pi/agent/state/schemas/queue.schema.json`
    - added `budget.maxUnresolvedBlockers` to the queue schema
  - `tests/extension-units/queue-runner.test.ts`
    - finalized unit coverage for the negative path plus non-trigger continuation behavior
  - `.pi/agent/docs/queue_semantics.md`
    - documented the new supported budget control and its visible-state counting rule
  - `.pi/agent/docs/bounded_autonomy_architecture.md`
    - updated the supported bounded runner control list
  - `.pi/agent/docs/harness_phase_capability_map.md`
    - updated the capability map to show HARNESS-049 support explicitly
- Tests added or changed:
  - unit: `queue runner blocks queued jobs whose maxUnresolvedBlockers budget is already exceeded and starts the next eligible job`
- Exact RED command and key failure reason:
  - `bash scripts/validate-queue-runner.sh --skip-live`
  - initial RED showed no enforcement for the new budget control
- Exact GREEN command:
  - `bash scripts/validate-queue-runner.sh --skip-live && bash scripts/check-foundation-extension-compile.sh && bash scripts/validate-extension-unit-tests.sh && bash scripts/check-repo-static.sh && git diff --check`
- Other validation commands run:
  - `bash scripts/validate-queue-runner.sh --skip-live` (3 consecutive passes total after the implementation/test-threshold adjustment)
- Wiring verification evidence:
  - queue runtime type, queue schema, queue semantics doc, bounded autonomy doc, and phase capability map all now name `budget.maxUnresolvedBlockers`
  - runtime enforcement occurs in `startNextQueuedJob(...)` before queued start/restart, using `taskState` plus `queueState` directly rather than inferred external signals
- Behavior changes and risk notes:
  - queued jobs can now self-limit when visible unresolved blockers are already present
  - the visible blocker count intentionally includes blocked queue jobs plus blocked tasks, so a job blocked by this control becomes part of the visible blocker count for later jobs in the same pass
  - unsupported `maxCostUsd`, `maxFilesChanged`, and unsupported free-form `stop_conditions` remain blocked explicitly
- Follow-ups or known gaps:
  - this slice does not yet add active-running enforcement for the unresolved-blocker budget
  - the visible blocker count is intentionally simple and deterministic rather than deduplicating blocked queue jobs against blocked linked tasks

## Work Summary (2026-05-01 20:49:00 +0700)
- Goal of the change:
  - finish wording consistency for HARNESS-049 references and capture final review-ready validation state
- Files changed and why:
  - `.pi/agent/extensions/queue-runner.ts`
    - updated unsupported-control wording from HARNESS-034 to HARNESS-049
  - `tests/extension-units/queue-runner.test.ts`
    - updated supported-control wording to HARNESS-049
  - `.pi/agent/docs/queue_semantics.md`
    - aligned remaining HARNESS-034 references with HARNESS-049 support
  - `.pi/agent/docs/harness_phase_capability_map.md`
    - aligned summary wording with HARNESS-049 support
- Tests added or changed:
  - none; wording-only consistency pass after the functional GREEN state
- Exact RED command and key failure reason:
  - not applicable for this wording-only cleanup; RED was already captured in the prior work summary
- Exact GREEN command:
  - `bash scripts/validate-queue-runner.sh --skip-live && bash scripts/check-repo-static.sh && git diff --check`
- Other validation commands run:
  - none
- Wiring verification evidence:
  - runtime wording, docs, and tests now consistently refer to HARNESS-049 as the current supported stop-budget slice
- Behavior changes and risk notes:
  - no runtime behavior change in this cleanup step
- Follow-ups or known gaps:
  - none beyond the previously recorded bounded-scope gaps

## Review (2026-05-01 20:50:00 +0700) - working-tree

### Reviewed
- Repo: /Users/subhajlimanond/dev/ma-code-worktrees/harness-049-stop-controls
- Branch: split/harness-049-stop-controls
- Scope: working-tree
- Commands Run: `git status --short`; `git diff --stat`; targeted `git diff -- .pi/agent/extensions/queue-runner.ts .pi/agent/state/schemas/queue.schema.json tests/extension-units/queue-runner.test.ts .pi/agent/docs/queue_semantics.md .pi/agent/docs/bounded_autonomy_architecture.md .pi/agent/docs/harness_phase_capability_map.md logs/CURRENT.md reports/planning/2026-05-01_harness-049-stop-controls-plan.md logs/coding/2026-05-01_harness-049-stop-controls.md`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- Assumed `budget.maxUnresolvedBlockers` should count visible blocked queue jobs plus visible blocked tasks directly, even if that means a newly blocked job becomes part of the visible count for later jobs in the same pass.
- Assumed start/restart enforcement is the safest bounded slice for HARNESS-049 and that active-running enforcement can remain future work.

### Recommended Tests / Validation
- `bash scripts/validate-queue-runner.sh --skip-live`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/validate-extension-unit-tests.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

### Rollout Notes
- This is a bounded additive control for jobs that opt into `budget.maxUnresolvedBlockers`.
- Unsupported `maxCostUsd`, `maxFilesChanged`, and free-form `stop_conditions` remain explicitly blocked.
- Operators should expect stricter queued-start blocking when blocked items are intentionally kept visible in runtime state.
