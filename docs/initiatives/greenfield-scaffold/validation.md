# Greenfield scaffold validation commands

## Goal
- Provide one bounded operator entrypoint for the greenfield scaffold validation surface.
- Keep the dry-run mode cheap so AFK worker preflight can prove the contract exists before deeper implementation work.

## Commands
- Dry-run contract check:
  - `./scripts/validate-greenfield-scaffold.sh --dry-run`
- Full validation bundle:
  - `./scripts/validate-greenfield-scaffold.sh`

## Included validations
- `npm run test:integration -- observability`
- `npm run test:e2e -- greenfield-smoke`
- `npm run validate:greenfield-docs`

## Notes
- `--dry-run` verifies that the expected validation entrypoints exist without executing the full suite.
- The full bundle is intended for later slices once the observability, smoke, and docs validation surfaces are all present.
