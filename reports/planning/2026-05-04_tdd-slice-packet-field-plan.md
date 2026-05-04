# Planning Log — tdd-slice-packet-field

- Date: 2026-05-04
- Scope: Add an optional typed `tddSlice` task-packet field only because prompt/policy TDD adoption is already present but not structurally transportable or validator-enforced.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_tdd-slice-packet-field.md`

## Goal
- Add an optional structured `tddSlice` to task packets and preserve it through handoffs.
- Render the field in packet/handoff markdown and cover it in local validators.
- Keep the field optional in this slice and defer any implementation-only requirement follow-up.

## Scope
- `.pi/agent/extensions/task-packets.ts`
- `.pi/agent/state/schemas/task-packet.schema.json`
- `.pi/agent/extensions/handoffs.ts`
- `.pi/agent/state/schemas/handoff.schema.json`
- `tests/extension-units/orchestration-helpers.test.ts`
- `scripts/validate-task-packets.sh`
- `scripts/validate-handoffs.sh`
- `logs/CURRENT.md`
- `reports/planning/2026-05-04_tdd-slice-packet-field-plan.md`
- `logs/coding/2026-05-04_tdd-slice-packet-field.md`

## Acceptance Criteria
- `generate_task_packet` accepts optional `tddSlice` fields: `firstTracerBehavior`, `publicInterface`, `testSurface`, `boundaryDependencies`, `mockPlan`, `outOfScopeBehaviors`.
- Rendered task packets include `## TDD Slice` when the field is provided.
- Structured handoffs preserve packet `tddSlice` and render it when present.
- Task-packet and handoff validator scripts cover the new optional field and pass locally.
- The field remains optional in this slice.

## TDD Sequence
- Add failing orchestration-helper and validator expectations for `tddSlice` preservation/render/schema wiring.
- Run the failing test/script and confirm failure is due to missing field/rendering.
- Implement the smallest packet + handoff + schema changes that pass.
- Refactor minimally by reusing the existing optional-evidence helper pattern.
- Rerun fast local gates, then do skeptical review and merge.

## Risks
- Adding the packet field without preserving it in handoffs would silently drop the contract downstream.
- Making the field required now would widen scope and risk existing packet producers.
- Schema/runtime drift is possible if validators are not updated in the same slice.

## Validation Plan
- `npx --yes tsx --test tests/extension-units/orchestration-helpers.test.ts`
- `bash scripts/validate-task-packets.sh --report /tmp/tdd-slice-task-packets.md --summary-json /tmp/tdd-slice-task-packets.json`
- `bash scripts/validate-handoffs.sh --report /tmp/tdd-slice-handoffs.md --summary-json /tmp/tdd-slice-handoffs.json`
- `git diff --check`
- `g-check`-style working-tree review before commit/merge
