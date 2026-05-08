# Product Slice Lifecycle Phase 2 Plan

## Goal
- Add a pure product vertical-slice lifecycle helper, schema, docs, and validator for Phase 2 product planning/DAG gates.

## Scope
- Add `.pi/agent/extensions/product-slice-lifecycle.ts`.
- Add `.pi/agent/state/schemas/product-slice-plan.schema.json`.
- Add `tests/extension-units/product-slice-lifecycle.test.ts`.
- Add docs/template surfaces that distinguish product-slice lifecycle from implementation slice lifecycle.
- Add bounded validator/static/compile/package wiring.

## Non-goals
- No queue state writes.
- No task creation/dispatch from the helper.
- No Stitch calls.
- No frontend/backend packet generation.
- No scheduler or cross-slice parallelism implementation.

## TDD Slice
- First tracer behavior: reject a request to start `be_implementation` before `fe_validation` is complete.
- Public interface: `decideProductSlicePhaseTransition(input)` plus pure plan validation helpers.
- Boundary dependencies: JSON-like slice-plan state and schema file only.
- Mock/fake plan: tests construct minimal valid and invalid plan objects.
- Out of scope behaviors: live runtime execution, queue runner integration, Stitch generation, artifact approval workflow.

## Acceptance Criteria
- Valid `slice-plan.json` parses successfully.
- Invalid phase names fail validation.
- Missing required phase order fails validation.
- Immediate next transition is allowed only when current phase evidence is complete.
- Skipped transitions are blocked.
- BE implementation before FE validation is blocked.
- Same-slice parallel phase requests are blocked.
- Stable decision shape is returned.
- Existing implementation slice lifecycle tests still pass.
- Docs explain Phase 2 as planning/DAG only and no queue dispatch is introduced.

## Validation Plan
- `node --import tsx --test tests/extension-units/product-slice-lifecycle.test.ts`
- `node --import tsx --test tests/extension-units/slice-lifecycle.test.ts`
- `./scripts/validate-product-slice-lifecycle.sh`
- `./scripts/validate-slice-lifecycle.sh`
- `./scripts/check-foundation-extension-compile.sh`
- `./scripts/check-repo-static.sh`
- `git diff --check`
