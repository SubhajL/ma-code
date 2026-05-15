# Greenfield Scaffold

## Purpose
- Describe the current greenfield scaffold baseline that was materialized through the bounded Phase A slices.
- Give operators one place to review the scaffold surface, validation entrypoints, readiness gate, and rollback notes.

## Current scaffold surface
- Frontend placeholder shell lives under `apps/web`.
- Backend placeholder shell lives under `services/api`.
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
