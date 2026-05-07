# Planning Log — execution-leases-phase-5

- Date: 2026-05-07
- Scope: Unified operator wrapper as a thin front-door delegator
- Status: in_progress
- Branch: `split/harness-065-operator-control-plane`
- Related coding log: `logs/coding/2026-05-07_execution-leases-phase-5.md`

## Goal
- Implement Phase 5 as an additive operator ergonomics slice that introduces `scripts/harness-operator.ts` as the preferred front door while preserving all legacy commands.

## Discovery Path
- Loaded `g-coding` because the user explicitly asked for implementation; the auto-routed `g-refactor` framing is useful for seam/delegation vocabulary but this slice is implementation-first.
- Tried `auggie_discover` first; discovery failed due exhausted credits, so local direct inspection was used.
- Inspected: `package.json`, `scripts/validate-core-workflows.sh`, `scripts/harness-operator-status.ts`, `scripts/harness-operator-leases.ts`, `scripts/harness-queue-session.ts`, `scripts/harness-worktree.ts`, `scripts/harness-worker-session.ts`, `tests/integration/operator-surface.test.ts`, and `.pi/agent/docs/operator_control_model.md`.

## Chosen Shape
- Thin subprocess delegation wrapper.
- New front door only:
  - `scripts/harness-operator.ts`
- Delegation targets:
  - `harness-operator-status.ts`
  - `harness-operator-leases.ts`
  - `harness-queue-session.ts`
  - `harness-worktree.ts`
  - `harness-worker-session.ts`
- Keep legacy commands unchanged.

## First Tracer Bullet
- `harness-operator status` delegates to `scripts/harness-operator-status.ts` and returns recognizable status output.

## Interface / Seam Notes
- Module: unified operator wrapper
- Interface: `scripts/harness-operator.ts <subcommand> [...args]`
- Seam: subprocess delegation instead of shared in-process imports
- Depth/leverage: unify operator ergonomics without changing runtime behavior
- Locality: Phase 5 should stay within CLI/tests/docs/validator wiring

## TDD Sequence
1. Add `tests/integration/operator-control-plane.test.ts` with a failing `status` tracer.
2. Run it and capture RED for missing wrapper.
3. Implement smallest wrapper for `help` + `status`.
4. Add queue-session delegation coverage and preserve passthrough behavior.
5. Extend for `leases`, `worktree`, and `worker-session`.
6. Add unknown-subcommand and exit-code preservation checks.
7. Add package alias and validator wiring.
8. Update docs to mark `harness:operator` as preferred while keeping legacy commands valid.
9. Run focused tests, regression tests, and `validate-core-workflows.sh`.
10. Integrate worktree to local `main` via `harness-integrate`, then sync root local repo state.

## Validation Plan
- Primary new test:
  - `node --import tsx --test tests/integration/operator-control-plane.test.ts`
- Regression checks:
  - `node --import tsx --test tests/integration/operator-surface.test.ts`
  - `node --import tsx --test tests/integration/queue-session.test.ts`
  - `node --import tsx --test tests/integration/worktree-helper.test.ts`
  - existing lease/worker-session integration surfaces as needed
- Validator:
  - `./scripts/validate-core-workflows.sh`
- Diff hygiene:
  - `git diff --check`

## Risks
- Wrapper mangles passthrough args or exit codes.
- Wrapper docs overstate deprecation/removal of legacy commands.
- Validator wiring mentions `harness:operator` incompletely.

## Backout
- Remove wrapper script, integration test, alias, and preferred-front-door doc wording.
- Leave all underlying operator scripts untouched.
