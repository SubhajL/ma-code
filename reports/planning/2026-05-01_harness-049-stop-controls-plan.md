# Planning Log — harness-049-stop-controls

- Date: 2026-05-01
- Scope: Plan HARNESS-049 bounded deterministic stop/budget control expansion.
- Status: ready
- Related coding log: `logs/coding/2026-05-01_harness-049-stop-controls.md`

## Goal
- Add one bounded new deterministic HARNESS-049 stop/budget control with tests-first proof, then land it safely.

## Scope
- Implement one new deterministic control only: `budget.maxUnresolvedBlockers`.
- Enforce it conservatively before starting/restarting queued work using visible runtime state only.
- Keep unsupported controls visibly blocked.
- Update queue schema, docs, and focused validator/test coverage.

## Files to Create or Edit
- `.pi/agent/extensions/queue-runner.ts`
- `.pi/agent/state/schemas/queue.schema.json`
- `tests/extension-units/queue-runner.test.ts`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/bounded_autonomy_architecture.md`
- `.pi/agent/docs/harness_phase_capability_map.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-01_harness-049-stop-controls.md`

## Acceptance Criteria
- Negative-path tests are added first and fail for the right reason before implementation.
- `budget.maxUnresolvedBlockers` is enforced deterministically from visible runtime state before queued start/restart.
- Jobs without the new budget or jobs under the threshold continue normally.
- Unsupported controls remain blocked clearly.
- Queue docs/schema accurately distinguish supported vs unsupported controls.

## Validation Plan
- RED:
  - add focused unit tests for queued jobs that should block when unresolved blockers exceed `budget.maxUnresolvedBlockers`
  - add non-trigger coverage for queued jobs at/under budget
  - run the queue-runner unit scope and confirm the new tests fail for missing enforcement
- GREEN:
  - `bash scripts/check-foundation-extension-compile.sh`
  - `bash scripts/validate-extension-unit-tests.sh`
  - `bash scripts/validate-queue-runner.sh --skip-live`
  - `bash scripts/check-repo-static.sh`
  - `git diff --check`
- Flake check target: 3 consecutive passes for changed test scope where practical.

## Risks
- Counting unresolved blockers must be defined conservatively enough to stay deterministic yet not silently ignore visible blocked state.
- Global blocked tasks/jobs from visible runtime state can intentionally halt new work when this budget is set tightly; docs must make that explicit.
- Scope must stay bounded to queued start/restart enforcement rather than a broader redesign of all stop conditions.
