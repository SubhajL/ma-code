# Planning Log: Phase 7 Phase Model Routing

## Source
- User-provided Phase 7 plan: choose Draft A, extending existing routing with backward-compatible optional `phaseLane`.

## Accepted Scope
- Add `phase_routing_profiles` to `.pi/agent/models.json`.
- Add optional `phaseLane` support to `resolve_harness_route`.
- Preserve role-only routing behavior.
- Represent requested `opus-4.7` and `gpt-5.5` as unverified targets that use verified fallback models until verified.
- Add tests, validator/static/docs wiring, and PR/merge evidence.

## Non-goals
- Do not create task packets, queue jobs, worker sessions, or dispatch behavior.
- Do not activate unverified requested models.
- Do not change future FE/BE packet generation in this phase.

## Validation Plan
- `node --import tsx --test tests/extension-units/harness-routing.test.ts`
- `./scripts/validate-harness-routing.sh --report /tmp/phase7-routing.md --summary-json /tmp/phase7-routing.json`
- `./scripts/check-foundation-extension-compile.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
