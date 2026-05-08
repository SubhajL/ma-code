# Planning Log — slice-dependency-decision-phase-10

- Date: 2026-05-07
- Scope: Phase 10 pure slice dependency decision helper
- Status: implemented

## Goal
- Add a pure analyzer for future cross-slice parallelism proof.
- Keep queue-runner and scheduling behavior unchanged in Phase 10.

## Decision
- Choose Plan Draft A: isolated helper at `.pi/agent/extensions/slice-dependency-decision.ts`.
- Reject Plan Draft B for Phase 10 because queue-runner coupling would be premature scheduler work.

## Acceptance Criteria
- Same-slice comparison blocks.
- Missing slice artifact blocks.
- Missing `filesToModify` or `allowedPaths` proof blocks.
- Shared `filesToModify` blocks.
- Overlapping mutating `allowedPaths` blocks; read-only/non-mutating overlaps are allowed.
- Shared contract path/hash blocks.
- Shared schema, migration, config, fixture, or test paths block.
- Unknown lease/worktree conflict state blocks when scheduler-readiness proof is requested.
- Fully disjoint separate slices return `parallelAllowed: true` and `recommendedExecution: parallel_candidate`.
- Helper performs no queue, lease, task, worker-session, or filesystem mutation.

## TDD Slice
- First tracer behavior: two different slices with the same `filesToModify` path return `parallelAllowed: false`.
- Public interface: `decideSliceParallelism(input)`.
- Boundary dependencies: slice summaries and artifact references only; no queue/lease mutation.
- Out of scope: queue-runner dispatch and scheduler integration.

## Validation Plan
- `node --import tsx --test tests/extension-units/slice-dependency-decision.test.ts`
- `node --import tsx --test tests/integration/slice-dependency-decision.test.ts`
- `./scripts/validate-slice-dependencies.sh`
- `./scripts/check-foundation-extension-compile.sh`
- `./scripts/check-repo-static.sh`
- `./scripts/validate-task-packets.sh`
- `./scripts/validate-domain-governance.sh`
- `./scripts/validate-queue-runner.sh --skip-live`
- `git diff --check`

## Migration Path
- Phase 10: helper, schema, read-only CLI, validator, docs, and tests.
- Phase 11: scheduler may consume this helper before cross-slice parallel dispatch and must add lease/worktree proof.
