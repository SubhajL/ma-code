# Greenfield Scaffold

> **Note:** `apps/web/` and `services/api/` are **harness pilot fixtures**, not
> a product foundation. See
> [ADR-0004](../../adr/0004-apps-web-and-services-api-are-harness-fixtures.md)
> for the binding decision. Treat the "scaffold surface" language below as
> describing the *shape* of the fixtures, not as authorization to grow them
> into runnable products without a superseding ADR.

## Purpose
- Describe the current greenfield scaffold baseline that was materialized through the bounded Phase A slices.
- Give operators one place to review the scaffold surface, validation entrypoints, readiness gate, and rollback notes.

## Current scaffold surface
- Frontend placeholder shell lives under `apps/web` (harness pilot fixture; see [ADR-0004](../../adr/0004-apps-web-and-services-api-are-harness-fixtures.md)).
- Backend placeholder shell lives under `services/api` (harness pilot fixture; see [ADR-0004](../../adr/0004-apps-web-and-services-api-are-harness-fixtures.md)).
- Current bounded slices cover foundation, navigation, contracts, persistence placeholders, integration proof, smoke proof, validation bundle wiring, and final readiness documentation.
- Greenfield initiative status is complete for the approved scaffold baseline. The historical Phase A `queueReadiness: not_ready` values remain in materialized issue artifacts as guardrails against accidental autonomous worker execution; completion is recorded through `issues.json`, `pipeline.json`, `slice-plan.json`, the issue-017 approval artifact, and the validation commands below.

## How to validate the scaffold
- Dry-run contract:
  - `./scripts/validate-greenfield-scaffold.sh --dry-run`
- Full scaffold validation bundle:
  - `./scripts/validate-greenfield-scaffold.sh`
- Docs package validation:
  - `npm run validate:greenfield-docs`

## Rollout boundary
- This initiative is still documenting and proving the scaffold baseline.
- The current docs do not authorize automatic queue execution, production release, or removal of later HITL gates.
- Any future rollout beyond the scaffold baseline should revisit `readiness-checklist.md` before changing queue readiness.

## Related documents
- Foundation baseline: `foundation-contract.md`
- Navigation baseline: `navigation.md`
- Validation bundle: `validation.md`
- Readiness gate: `readiness-checklist.md`
- Backout guidance: `backout.md`

## Phase B queue-readiness contract
- Phase B is documented in `phase-b-queue-readiness.md`.
- Phase B produces queue-ready candidate evidence only; it does not enable autonomous worker execution or mutate runtime state.
