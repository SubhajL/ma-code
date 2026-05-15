# Greenfield Scaffold

## Purpose
- Describe the current greenfield scaffold baseline that was materialized through the bounded Phase A slices.
- Give operators one place to review the scaffold surface, validation entrypoints, readiness gate, and rollback notes.

## Current scaffold surface
- Frontend placeholder shell lives under `apps/web`.
- Backend placeholder shell lives under `services/api`.
- Current bounded slices cover foundation, navigation, contracts, persistence placeholders, integration proof, smoke proof, and validation bundle wiring.
- Queue readiness remains `not_ready`; the scaffold is intentionally documented before any future queue-ready conversion.

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
