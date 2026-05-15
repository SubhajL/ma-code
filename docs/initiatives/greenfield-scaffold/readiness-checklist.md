# Greenfield Scaffold Readiness Checklist

## Purpose
- Record the final readiness gate for the current greenfield scaffold and the associated human approval artifact.
- Keep the Phase A boundary explicit before any future queue-ready conversion or additional worker execution.

## Readiness checklist
- [x] Foundation scope is still bounded to the scaffold documented in `foundation-contract.md`.
- [x] Navigation expectations are captured in `navigation.md`.
- [x] Validation entrypoints are documented in `validation.md`.
- [x] The docs package now has a durable operator-facing overview in `README.md`.
- [x] Rollback expectations are documented in `backout.md`.
- [x] Phase A queue readiness remains `not_ready`; this checklist does not authorize automatic queue-ready conversion.
- [x] Human approval for issue-017 is recorded in `afk-approvals.json` before issue-018 proceeds.

## Validation to review before future rollout
- `./scripts/validate-greenfield-scaffold.sh --dry-run`
- `./scripts/validate-greenfield-scaffold.sh`
- `npm run validate:greenfield-docs`
- `npm run test:integration -- health-handshake auth-boundary observability`
- `npm run test:e2e -- greenfield-smoke`

## Rollout boundary
- The current scaffold is a Phase A baseline only.
- Queue jobs and worker execution remain gated by future approval and queue-ready work.
- This checklist approves documentation readiness for the scaffold baseline; it does not approve production launch, deployment changes, or expanded runtime scope.

## Approval record
- Issue: `issue-017` — "Approve release/readiness checklist"
- Durable approval artifact: `docs/initiatives/greenfield-scaffold/afk-approvals.json`
- Approval reference: `user-prompt-2026-05-15-continue-until-finish-greenfield`
- Approved by: `human:subhajlimanond`
- Note: the user explicitly instructed the harness to continue until finish after the remaining issue-017 HITL gate was surfaced.
