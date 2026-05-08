# Product Slice Lifecycle

Phase 2 adds a pure product vertical-slice lifecycle for planning and DAG validation before Stitch, frontend, backend, or quality work begins.

## Purpose

- Represent `docs/initiatives/<slug>/slice-plan.json` in a machine-readable format.
- Preserve strict per-slice phase order from Stitch prompt through quality.
- Block same-slice parallel phase starts.
- Block backend implementation before frontend validation.
- Keep product planning lifecycle separate from implementation evidence lifecycle.

## Runtime boundary

This surface is planning/DAG only:

- It validates a product slice plan.
- It exposes the required product phase order.
- It returns deterministic transition decisions.
- It does not write queue state.
- It does not create tasks.
- It does not call Stitch.
- It does not dispatch frontend, backend, quality, or validator workers.
- Phase 3 prompt-only Stitch prompt generation is documented separately in `.pi/agent/docs/stitch_prompt_generation.md` and consumes this lifecycle plan without changing the phase order.

## Files

- Helper: `.pi/agent/extensions/product-slice-lifecycle.ts`
- Schema: `.pi/agent/state/schemas/product-slice-plan.schema.json`
- Template: `docs/initiatives/TEMPLATE/slice-plan.json`
- Unit tests: `tests/extension-units/product-slice-lifecycle.test.ts`
- Validator: `scripts/validate-product-slice-lifecycle.sh`

## Required phase order

Every slice and plan policy must use this exact order:

1. `stitch_prompt`
2. `stitch_generation`
3. `screen_approval`
4. `slice_contract`
5. `fe_implementation`
6. `fe_validation`
7. `be_implementation`
8. `be_validation`
9. `quality`

## Transition rule

A transition is allowed only when:

- the requested phase is the immediate next phase after `currentPhase`,
- the current phase evidence is complete (`approved` or `done` with evidence),
- the plan and slice are not blocked,
- no same-slice phase is already in flight,
- the requested phase is known.

Skipped phases return `blocked_out_of_order`. Backend implementation before frontend validation returns `blocked_out_of_order` with `requiredPreviousPhase: "fe_validation"`.

## Decision shape

```json
{
  "allowed": false,
  "reason": "blocked_out_of_order",
  "currentPhase": "fe_implementation",
  "requestedPhase": "be_implementation",
  "requiredPreviousPhase": "fe_validation",
  "blockers": []
}
```

## Distinction from implementation slice lifecycle

- Product slice lifecycle is about product phase order before and across Stitch/FE/BE planning gates.
- Implementation slice lifecycle is about coding evidence, review, PR submission, merge, and local-main sync.
- Do not merge these concepts in Phase 2; validators and operators should keep the product-slice planning/DAG lifecycle separate from `.pi/agent/extensions/slice-lifecycle.ts`.
