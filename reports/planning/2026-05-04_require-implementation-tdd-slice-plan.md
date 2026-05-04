# Planning Log — require-implementation-tdd-slice

- Date: 2026-05-04
- Scope: Make `tddSlice` required for implementation packets only, while preserving non-implementation packet flows and landing through the normal worktree/PR path.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_require-implementation-tdd-slice.md`

## Goal
- Close the remaining TDD gap by requiring `tddSlice` for implementation packets only.
- Keep non-implementation packets valid.
- Preserve or extend queue-runner and validator flows so implementation packets still generate correctly.

## Scope
- `.pi/agent/extensions/task-packets.ts`
- `.pi/agent/state/schemas/task-packet.schema.json`
- `.pi/agent/extensions/queue-runner.ts`
- `tests/extension-units/orchestration-helpers.test.ts`
- `tests/extension-units/queue-runner.test.ts`
- `tests/integration/core-workflows.test.ts`
- `tests/integration/queue-session.test.ts`
- `scripts/validate-task-packets.sh`
- `logs/CURRENT.md`
- `reports/planning/2026-05-04_require-implementation-tdd-slice-plan.md`
- `logs/coding/2026-05-04_require-implementation-tdd-slice.md`

## Acceptance Criteria
- Implementation packets fail generation/validation when `tddSlice` is missing.
- Non-implementation packets remain valid without `tddSlice`.
- Queue-runner generated implementation packets receive required `tddSlice` data or fail in a deliberate, tested way until supplied.
- Task-packet validators and affected tests pass after the change.
- The slice lands through branch/worktree, PR, merge, and local main sync.

## TDD Sequence
- Add/adjust failing tests and validator expectations first for implementation packets without `tddSlice`.
- Run targeted RED validators/tests and confirm the failure reason is the missing implementation `tddSlice` requirement.
- Implement the smallest task-packet and queue-runner changes that satisfy the requirement.
- Refactor minimally if needed.
- Rerun targeted validators/tests, then review and land.

## Validation Plan
- `bash scripts/validate-task-packets.sh`
- targeted `npx --yes tsx --test ...` for affected queue-runner/core-workflow surfaces if practical in the worktree environment
- `git diff --check`
- manual `g-check`-style review before merge
