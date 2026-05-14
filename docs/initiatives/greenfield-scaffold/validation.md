# Greenfield scaffold validation commands

## Goal
- Provide bounded developer validation entrypoints for the current greenfield scaffold surface.
- Keep the validation order deterministic: unit first, then integration, then smoke.
- Keep Phase A guardrails explicit by failing early if issue-016 no longer reports `queueReadiness: not_ready`.

## Commands
- Unit bundle:
  - `npm run validate:greenfield-scaffold:unit`
- Integration bundle:
  - `npm run validate:greenfield-scaffold:integration`
- Smoke bundle:
  - `npm run validate:greenfield-scaffold:smoke`
- Dry-run contract check:
  - `./scripts/validate-greenfield-scaffold.sh --dry-run`
- Full validation bundle:
  - `./scripts/validate-greenfield-scaffold.sh`

## Bounded order
1. `npm run validate:greenfield-scaffold:unit`
2. `npm run validate:greenfield-scaffold:integration`
3. `npm run validate:greenfield-scaffold:smoke`

## Included validations
### Unit bundle
- `npm run test:api -- schema migrations contracts seeds`
- `npm run test:web -- design-tokens components api-client`

### Integration bundle
- `npm run test:integration -- health-handshake auth-boundary observability`

### Smoke bundle
- `npm run test:e2e -- greenfield-smoke`

## Notes
- `--dry-run` verifies that the expected validation entrypoints exist and that `docs/initiatives/greenfield-scaffold/slices/issue-016.summary.json` still reports `queueReadiness: not_ready`.
- This slice stays Phase A only; it does not create queue-ready jobs or bypass later HITL/readiness work.
- `validate:greenfield-docs` remains a separate docs-only check and is intentionally outside this bounded scaffold validator.
