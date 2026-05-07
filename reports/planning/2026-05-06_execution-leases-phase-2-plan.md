# Planning Log — execution-leases-phase-2

- Date: 2026-05-06
- Scope: Queue-session lease enforcement across queue runner public entrypoints
- Status: ready
- Related coding log: `logs/coding/2026-05-06_execution-leases-phase-2.md`

## Goal
- Make queue advancement lease-aware without changing operator visibility or queue/task state schemas.
- Enforce one queue-session lease across `run_next_queue_job`, `run_queue_once`, and `run_bounded_queue_session`.

## Scope
- Add lease-aware public wrappers around queue advancement.
- Extract lease-free queue-step core for one-step advancement.
- Keep bounded sessions under one session lease for the whole loop.
- Add tests for conflict, acquire/release, and release-on-failure paths.
- Update temp-runtime validation scripts to include `execution-leases.ts`.

## Files to Create or Edit
- `.pi/agent/extensions/execution-leases.ts`
- `.pi/agent/extensions/queue-runner.ts`
- `tests/extension-units/execution-leases.test.ts`
- `tests/extension-units/queue-runner.test.ts`
- `tests/integration/queue-session.test.ts`
- `scripts/validate-queue-runner.sh`
- `scripts/validate-core-workflows.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-05-06_execution-leases-phase-2.md`

## Why Each File Exists
- `execution-leases.ts`: file-backed lease primitives and shared queue-session lease scope.
- `queue-runner.ts`: runtime public entrypoints and internal queue-step logic.
- Unit/integration tests: prove public behavior and helper semantics.
- Validation scripts: prove isolated runtime compile wiring.
- Logs: preserve Pi-style implementation evidence.

## What Logic Belongs There
- Queue-runner owns queue advancement policy and lease wrapping.
- Execution-leases owns generic lease state normalization/acquire/release/prune behavior.

## What Should Not Go There
- No operator-facing lease rendering.
- No heartbeat or renewal loop.
- No queue/task schema migration.
- No worker-lane worktree orchestration.

## Dependencies
- Existing Phase 1 file-backed lease state at `.pi/agent/state/runtime/leases.json`.
- Existing queue-runner audit log at `logs/harness-actions.jsonl`.

## Acceptance Criteria
- `runBoundedQueueSession(...)` blocks before work with `stopReason: "blocked"` and `stepsRun: 0` on active queue-session conflict.
- `runBoundedQueueSession(...)` holds one lease across the loop and releases it in `finally`.
- `runNextQueueJob(...)` and `runQueueOnce` use the same internal queue-step core under a short lease.
- Conflicts return controlled blocked results without public shape redesign.
- Validator temp runtimes compile with `execution-leases.ts` present.

## Likely Failure Modes
- Leaked lease if bounded session returns or throws after acquiring.
- Nested lease reacquire if bounded session calls the public `runNextQueueJob` wrapper.
- Ambiguous conflict reason or leaked raw lease internals.
- Temp validation scripts missing new import dependency.

## Validation Plan
- RED tracer: `node --import tsx --test tests/integration/queue-session.test.ts`
- Targeted unit/integration GREEN:
  - `node --import tsx --test tests/extension-units/queue-runner.test.ts`
  - `node --import tsx --test tests/integration/queue-session.test.ts`
  - `node --import tsx --test tests/extension-units/execution-leases.test.ts`
- Validator scripts:
  - `./scripts/validate-queue-runner.sh --skip-live`
  - `./scripts/validate-core-workflows.sh`

## Recommended Next Step
- Add failing queue-session conflict test, then implement the minimal lease-aware wrapper/core split.
