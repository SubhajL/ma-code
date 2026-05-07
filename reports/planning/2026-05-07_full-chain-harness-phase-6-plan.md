# Planning Log — full-chain-harness-phase-6

- Date: 2026-05-07
- Scope: Slice lifecycle policy, helper/CLI, validator, and lifecycle evidence normalization
- Status: in_progress
- Branch: `split/task-1778138959443-slice-lifecycle-phase6`

## Goal
- Add an assess-first slice lifecycle model that unifies existing planning, coding, task, git, PR-gate, submit, and sync-main evidence without introducing a new mutable lifecycle state machine.

## Acceptance Criteria
- A formal lifecycle policy exists and is machine-readable.
- A lifecycle assessment helper can determine current stage and missing prerequisites from existing evidence sources.
- A lifecycle CLI can report current state and check readiness for a target stage.
- Skill contracts are updated so lifecycle evidence becomes more normalized and auditable.
- g-create and g-submit preconditions become lifecycle-aware without forcing full intake for every tiny slice.
- No new mutable runtime lifecycle state file is required.
- Merge execution remains outside hard enforcement in this phase, but merge_ready can be assessed.
- Required checks pass:
  - `node --import tsx --test tests/extension-units/slice-lifecycle.test.ts`
  - `node --import tsx --test tests/integration/slice-lifecycle.test.ts`
  - `./scripts/validate-slice-lifecycle.sh`
  - `./scripts/validate-core-workflows.sh`

## TDD Slice
- First tracer behavior: a slice with planning log, coding RED/GREEN evidence, g-check review section, and validated task state is assessed as `create_ready`.
- Public interface: `assessSliceLifecycle({ targetStage: "create_ready" })` and `scripts/harness-slice-lifecycle.ts check --stage create_ready`.
- Boundary dependencies: temp repo fixtures seeded with `logs/CURRENT.md`, planning/coding logs, policy JSON, and `tasks.json`; live GitHub/PR behavior is excluded.
- Out of scope: merge execution, UI, background daemon, queue/session runtime redesign.

## Rollout Plan
1. Add tests for lifecycle helper and CLI.
2. Add policy, helper, and CLI.
3. Add validator and package/docs/core workflow wiring.
4. Normalize skill lifecycle evidence expectations.
5. Run local validators, review, submit, PR-gate, merge, and sync local main.
