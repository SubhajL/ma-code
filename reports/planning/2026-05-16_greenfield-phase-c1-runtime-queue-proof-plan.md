# Greenfield Phase C.1 Runtime Queue Proof Plan

- Date: 2026-05-16
- Task: `task-1778910852665`
- Coding log: `logs/coding/2026-05-16_greenfield-phase-c1-runtime-queue-proof.md`
- Intake: direct implementation-planning request; no implementation in this task.
- Direct-implementation exemption: not applicable yet; implementation should start from a clean non-main branch/worktree based on `origin/main`.

## Discovery Path
- Skill: `g-planning`.
- Auggie attempted first and timed out; local fallback discovery used.
- `docs/pi-log-convention.md` was not present in the current worktree; `logs/CURRENT.md` exposed the Pi log convention.
- Current worktree branch was non-main but stale/dirty; implementation must not start from this dirty state.
- Important claims verified against `origin/main` with `git show`/`git ls-tree` because current branch did not contain merged Phase C files.

## Goal
- Materialize and run exactly one Greenfield Phase C proof job through approved runtime queue/worker tools.
- Capture a worker-run artifact.
- Stop before PR creation or autoland.
- Use the result to decide whether to generalize beyond one proof job.

## Non-Goals
- No daemon, drain loop, or autonomous global scheduler.
- No PR creation or autoland.
- No direct edits to `.pi/agent/state/runtime/*.json`.
- No broad Greenfield candidate execution.
- No bypass of HITL gates.

## Assumptions
- `origin/main` contains PR #170 / Phase C at the expected synced commit.
- Phase C files exist on `origin/main`: `docs/initiatives/greenfield-scaffold/phase-c-worker-execution-proof.json`, `scripts/validate-greenfield-phase-c.mjs`, and `tests/integration/greenfield-phase-c-worker-proof.test.ts`.
- Existing `scripts/harness-worker-execute.ts` and `.pi/agent/extensions/worker-execution.ts` should remain the execution boundary unless a small seam is required.
- The queue materialization path should use approved runtime APIs/tools; if no safe API exists, add a minimal additive wrapper rather than raw runtime JSON mutation.

## Cross-Model Check
- Used `second_model_plan` because this is medium-risk runtime-safety work.
- Second model preferred the queue-backed plan over direct worker execution and flagged queue submission API discovery plus artifact capture as the main risks.
- Unified decision: implement only the smallest queue-backed proof seam needed; keep direct `harness-worker-execute` as a fallback test seam only if existing queue APIs cannot safely enqueue the proof job.

## Plan Draft A
- Add a queue-backed proof materialization path.
- Read the Phase C proof JSON, transform its single proof job into a runtime queue job through approved queue APIs/tools, execute bounded queue advancement, and capture the worker-run artifact.
- Pros: proves the actual missing runtime/queue wiring.
- Cons: may require a small new queue materialization API or CLI seam.

## Plan Draft B
- Avoid queue materialization and invoke `scripts/harness-worker-execute.ts` directly from the Phase C proof artifact.
- Pros: smaller implementation and lower queue-state risk.
- Cons: does not satisfy the next-step goal of proving the job can flow through runtime queue tools.

## Unified Plan
- Start implementation from a clean non-main branch/worktree based on `origin/main`.
- First inspect queue-runner internals for an existing enqueue/materialize function or tool-facing seam.
- Add a failing integration test that uses an isolated temp runtime state/fixture, not the live `.pi/agent/state/runtime` files.
- Prefer implementing a small function/CLI such as `materializeGreenfieldPhaseCProofJob` / `scripts/harness-greenfield-phase-c-proof-run.ts` only if no existing queue API can safely do this.
- The runner must:
  - read `docs/initiatives/greenfield-scaffold/phase-c-worker-execution-proof.json`;
  - assert exactly one proof job;
  - create/queue one bounded runtime job through approved queue abstractions;
  - call existing bounded queue advancement or worker execution with explicit `--job-id`, `--max-steps`, and `--max-runtime-seconds`;
  - pass through the proof job implementation and validation commands;
  - write a worker-run artifact under an allowed non-runtime artifact path;
  - preserve `stopBeforePr: true` and `allowPrCreate: false`.
- Run fast validation, then stop and report whether generalization is safe.

## Files to Modify
- `tests/integration/greenfield-phase-c-worker-proof.test.ts` or a new adjacent integration test for queue-backed run proof.
- `.pi/agent/extensions/queue-runner.ts` only if an approved enqueue/materialization seam is missing.
- `scripts/harness-worker-execute.ts` only if artifact capture needs a narrowly-scoped option; prefer no change.
- `scripts/validate-greenfield-phase-c.mjs` only if the Phase C validator should verify the new run artifact; otherwise leave unchanged.
- `package.json` only if a new validation script is added.

## New Files
- Candidate: `tests/integration/greenfield-phase-c-runtime-queue-proof.test.ts`.
- Candidate: `scripts/harness-greenfield-phase-c-proof-run.ts` or similarly named additive CLI, if needed.
- Candidate artifact output path during proof: `docs/initiatives/greenfield-scaffold/phase-c-worker-run-artifact.json` or `.pi/agent/artifacts/...`; choose the least invasive allowed path during implementation.

## TDD Sequence
- First tracer-bullet behavior: a single Phase C proof job is materialized into an isolated queue state, advanced once through bounded runtime tooling, produces a worker-run artifact, and stops before PR.
- Public interface that proves it: an integration test invoking either the new proof-run CLI or exported materialization function with explicit max-step/runtime bounds.
- Boundary dependencies and fake/mock plan:
  - use temp directories/fixtures for runtime state;
  - stub the implementation command with a local node command that writes a proof markdown/json artifact;
  - run validation with `npm run validate:greenfield-phase-c` or a fixture equivalent when test runtime cost requires isolation;
  - do not touch live `.pi/agent/state/runtime`.
- Out of scope for the first slice:
  - live provider-backed worker loop;
  - product feature work;
  - multi-job queue drain;
  - PR/autoland;
  - global Greenfield enforcement.
- Required order:
  1. Add/stub the integration test for one queue-backed Phase C proof run.
  2. Run it and confirm it fails for the right reason: missing materialization/run seam or missing artifact capture.
  3. Implement the smallest queue-backed materialization/execution seam.
  4. Refactor minimally only after green.
  5. Rerun the targeted integration test and fast validation gates.

## Test Coverage
- Integration: one isolated runtime queue materialization + bounded run proof.
- Regression: existing Phase C proof validator still passes.
- Boundary checks:
  - missing/duplicate proof jobs fail;
  - missing `--job-id`, max steps, or max runtime remains blocked;
  - `allowPrCreate` stays false without explicit approval;
  - artifact path is inside an allowed path.

## Acceptance Criteria
- A test fails red before implementation for the missing queue-backed proof path.
- The same test passes after implementation.
- `npm run validate:greenfield-phase-c` passes.
- Relevant integration test command passes, e.g. `npm run test:integration -- greenfield-phase-c-runtime-queue-proof` or the repository’s equivalent test selector.
- Worker-run artifact is created and contains job id, source candidate/issue, commands run, validation result, and PR boundary status.
- No live runtime state is mutated by tests; no PR/autoland action occurs.

## Wiring Checks
| Component | Runtime entry point | Registration/location | Schema/state | Verification |
| --- | --- | --- | --- | --- |
| Phase C proof artifact | `docs/initiatives/greenfield-scaffold/phase-c-worker-execution-proof.json` | `scripts/validate-greenfield-phase-c.mjs` | JSON proof contract | Validator and integration test assert exactly one bounded proof job |
| Queue materializer | Existing queue API or new minimal CLI/function | `.pi/agent/extensions/queue-runner.ts` or new `scripts/...` wrapper | Isolated queue state in tests; live runtime only via approved tools | Red/green test confirms queued job source and job id |
| Bounded execution | `scripts/harness-worker-execute.ts` / queue session tool | `.pi/agent/extensions/worker-execution.ts`, `.pi/agent/extensions/queue-runner.ts` | Worker execution run artifact | Test asserts explicit `job-id`, max steps/runtime, implementation and validation commands |
| PR boundary | Existing worker execution options | `harness-worker-execute` defaults and proof job `prBoundary` | `stopBeforePr: true`, `allowPrCreate: false` | Test asserts no PR/autoland path is taken |

## Validation
- `npm run validate:greenfield-phase-c`
- Targeted integration test for the new queue-backed proof path.
- Existing worker execution/queue tests if touched:
  - `npm run test:integration -- worker-execution`
  - `npm run test:integration -- queue-session` or repository-equivalent selectors.
- `git diff --check` before handoff.

## Risks
- Existing queue-runner may not expose a safe enqueue API; adding one must stay minimal and test-scoped.
- Worker-run artifact capture may require plumbing; avoid widening into full observability redesign.
- Current branch/worktree is dirty and stale relative to `origin/main`; implementation must use clean branch/worktree.
- Accidental live runtime mutation is the top failure mode; tests must isolate runtime state and approved tools must handle any real run.
- Overgeneralizing into a daemon/global scheduler would violate scope.

## Pi Log Update
- Planning log path: `reports/planning/2026-05-16_greenfield-phase-c1-runtime-queue-proof-plan.md`.
- Coding log path: `logs/coding/2026-05-16_greenfield-phase-c1-runtime-queue-proof.md`.
- `logs/CURRENT.md` should point at this active planning/coding log pair while Phase C.1 is active.

## 2026-05-16 - YOLO risk issue/materialization request decision
- Task: `task-1778916274274`.
- Request assessed: create five risk issues, materialize them, queue materialization, and use auto worker to plan/implement until merge in YOLO mode.
- Decision: do not run YOLO-until-merge. It conflicts with repo safety rules requiring non-main branches/worktrees, approved runtime tooling, evidence, validation, and human-controlled merge boundaries.
- Safe alternative: create five visible risk issues/task packets, but materialize only one proof job first; execute it with explicit `job-id`, `maxSteps`, `maxRuntimeSeconds`, isolated state where possible, and `stopBeforePr`/`allowPrCreate: false`; review evidence before materializing more jobs or opening/merging PRs.
- Cross-model check: `second_model_plan` agreed that unbounded YOLO should be rejected and that bounded one-job materialization with review/validation gates is the safe path.

## 2026-05-16 - MO and planning-at-queue-materialization clarification
- Task: `task-1778917260414`.
- Question answered: whether gated YOLO is part of MO, whether MO was actually run, and whether planning moved up to queue materialization.
- Decision: gated YOLO is conceptually an MO flow, but the previous attempt did not run the MO CLI/path. It created task records and invoked the bounded queue runner directly; because no queue jobs existed, the run stopped idle.
- Repo evidence: `harness:orchestrate` supports `continue`/`run`; `orchestrator-continue` applies AFK with `queueOnly`, selects a queue job, then runs the worker executor against the selected queue job id. That is the MO path to use when a proper initiative/queue materialization source exists.
- Planning placement: yes, planning has moved upstream from worker execution. Queue materialization should only create runnable jobs from planning-ready evidence: acceptance criteria, TDD slice, allowed paths, validation expectations, routing/role, and lifecycle evidence. Workers should execute from that packet rather than invent the plan from scratch.
- Important distinction: Phase A issue materialization explicitly does not create queue jobs, task packets, worker sessions, or runtime state; it keeps `queueReadiness: not_ready`. Phase B/C-style queue materialization is the missing bridge for these risk tasks.

## 2026-05-16 - Risk 1 to MO repeat implementation plan
- Task: `task-1778917846696`.
- Request: implement Risk 1, run MO against the queue-materialized job, then repeat for remaining four risks in gated YOLO mode.
- Boundary: this turn was routed to `g-planning`, so no code implementation, queue job creation, worker run, PR, autoland, or merge was performed.
- Discovery: Auggie first timed out; local fallback inspected current task state, git state, queue runner, orchestrator continue/run, and active logs. Current worktree is dirty/stale and must not be used for source implementation.
- Implementation decision: use a clean non-main worktree from `origin/main`; first implement a tested task-to-queue materialization seam for `task-1778916876797`; then run MO/worker on that materialized job; only after evidence, repeat one-at-a-time for tasks `task-1778916876818`, `task-1778916876810`, `task-1778916876822`, and `task-1778916876805`.
- First TDD slice: a fixture task with acceptance/TDD/allowed paths/role/validation expectations materializes into exactly one queued job with `linkedTaskId` and source metadata; duplicate materialization is idempotent/rejected; no direct runtime JSON writes are exposed to callers.
- Cross-model check: `second_model_plan` agreed with the seam + MO approach but warned to use a dedicated feature branch/worktree, define planning-ready eligibility, and make duplicate detection explicit.
