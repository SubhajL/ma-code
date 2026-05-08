# Product Pipeline E2E Pilot

Phase 14 adds a dedicated fixture-backed product pipeline E2E pilot for `checkout-mini`.

## Entry points

```bash
./scripts/validate-product-pipeline-e2e.sh
./scripts/validate-product-pipeline-e2e.sh --report /tmp/e2e.md --summary-json /tmp/e2e.json
node --import tsx --test tests/integration/product-pipeline-e2e.test.ts
```

## Scope

- The pilot validates the product pipeline from intake through quality readiness using temp repos and fake boundaries.
- It writes Markdown and JSON validation reports under `reports/validation/` by default.
- It proves success and blocked paths, including vague intake, missing screen approval, stale screen approval hashes, failed FE validation, failed BE validation, missing Phase 10 proof, and HITL `waiting_for_human` stops.
- It proves idempotency by re-running the fake success path without duplicate artifacts.

## Safety boundaries

- No daemon/watch mode is introduced.
- No live provider or live Stitch call is required by default.
- No task, queue, worker-session, or protected runtime JSON state is created.
- No product implementation code is generated outside temp fixture repos.

## Report contract

The JSON report includes `version`, `initiativeId`, `status`, `boundedFullAutoReadiness`, phase-by-phase status, `hitlGatesProven`, `blockedPathsProven`, `idempotency`, `observability`, `safety`, and `goNoGo`.

`boundedFullAutoReadiness: ready` means autonomous AFK progression is safe only through clear fake-boundary steps and still stops at HITL gates. It does not mean zero-human-control execution.
