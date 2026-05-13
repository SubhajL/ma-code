# Planning Log — initiative completion and worker-job bridge

- Date: 2026-05-13
- Task: `task-1778640146238`
- Branch: `task/task-1778640146238-initiative-completion-and-workerjob-bridge-plan`
- Scope: Plan the safest path to finish hanging `greenfield-scaffold` and `mixed-domain-harness-optimization` initiatives and add an explicit bounded queue-to-worker_job continuation mode.
- Intake: direct planning request from the user; no implementation performed in this task.

## Current State Summary
- `greenfield-scaffold` on `main` has several remaining AFK slices (`issue-004`, `issue-008`, `issue-011`, `issue-012`, `issue-014`, `issue-015`, `issue-016`) before the next HITL gate at `issue-017`.
- `mixed-domain-harness-optimization` on `main` is stale from `issue-002` onward, while a separate worktree already contains unlanded issue-003/issue-004 recovery progress.
- Repo auto-land policy exists but is explicitly restricted to the `worker_job` lane; queue-level AFK orchestration remains bounded and foreground-only.

## Recommended Direction
1. Recover and land the existing mixed-domain issue-003 branch work so durable `main` state matches validated reality.
2. Build a new explicit bounded continuation wrapper that reuses existing issue-materialization, product-pipeline, AFK queue, worker_job, and PR lifecycle helpers rather than changing queue-level semantics in place.
3. Use that wrapper to drain remaining greenfield AFK slices to `issue-017` HITL and mixed-domain AFK slices through `issue-006` or the next explicit blocker.

## First TDD Slice
- Tracer behavior: a new bounded continuation command selects exactly one next eligible AFK queue job, dispatches it through the existing `worker_job` lane, refreshes initiative state, and stops safely at the next blocker/HITL/max-bound.
- Public interface: likely `harness-orchestrate continue --initiative <slug> --max-slices <n> [--auto-land --approval-ref <ref> --sync-main] --json`.
- Boundary dependencies / fakes: issue-materialization artifacts, product pipeline runs, AFK queue state, worker execution, PR lifecycle, auto-land policy, and repo dirty-state guards.
- Out of scope: daemonized infinite loops, multi-initiative concurrent driving, bypassing approval refs, or direct raw runtime JSON rewrites as the normal path.

## Acceptance Criteria
- The mixed-domain unlanded branch work is turned into bounded landed slices on `main` before new broad automation is relied upon.
- The new continuation wrapper can drive one AFK job at a time through `worker_job`, refresh state, and stop predictably on blocker/HITL/max limits.
- Greenfield can be driven from current `main` to the `issue-017` HITL gate without hand-picking every job ID.
- Mixed-domain can be driven from reconciled `main` through `issue-006` or the next explicit blocker with the same bounded wrapper.
- Validation includes unit/integration coverage and one bounded real initiative dry-run/apply proof path.
