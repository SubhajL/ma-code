# Greenfield Scaffold Backout

## Purpose
- Document the bounded rollback path for the current greenfield scaffold baseline.
- Keep rollback expectations explicit before the scaffold advances beyond Phase A.

## When to back out
- A newly landed scaffold slice breaks the validation bundle or smoke proof.
- The documented scaffold surface drifts from the shipped placeholder behavior.
- Future rollout work accidentally changes queue readiness or worker behavior without the required HITL approval.

## Backout steps
- Revert the most recent bounded greenfield scaffold PR or commit instead of hand-editing generated state.
- If the problem is limited to docs-only packaging, revert the docs change set and rerun `npm run validate:greenfield-docs`.
- If the problem touches scaffold runtime behavior, revert the relevant bounded slice and rerun `./scripts/validate-greenfield-scaffold.sh`.
- Preserve `docs/initiatives/greenfield-scaffold/afk-approvals.json` and the slice summaries unless the rollback explicitly invalidates the recorded approval context.

## Verify rollback success
- `./scripts/validate-greenfield-scaffold.sh --dry-run`
- `npm run validate:greenfield-docs`
- Confirm `docs/initiatives/greenfield-scaffold/issues.json` still reports `queueReadiness: not_ready` for the scaffold slices.

## Notes
- This is a scaffold rollback guide, not a production incident runbook.
- Queue-ready conversion and post-Phase-A automation remain out of scope until a later approved slice changes that boundary.
