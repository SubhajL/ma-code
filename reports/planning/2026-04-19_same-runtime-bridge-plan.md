# Planning Log — same-runtime-bridge

- Date: 2026-04-19
- Scope: Implement a bounded same-runtime probe bridge for the repo-local Pi harness.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_same-runtime-bridge.md`

## Discovery Path
- Auggie attempt timed out; used local discovery fallback.
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `logs/CURRENT.md`
  - Pi docs:
    - `docs/extensions.md`
    - `docs/custom-provider.md`
    - `docs/providers.md`
    - `docs/sdk.md`
  - Pi SDK/types:
    - `dist/core/sdk.d.ts`
    - `dist/core/model-registry.d.ts`
    - `dist/core/auth-storage.d.ts`
    - `dist/core/extensions/types.d.ts`
  - Pi examples:
    - `examples/extensions/custom-provider-gitlab-duo/index.ts`
    - `examples/extensions/handoff.ts`
    - `examples/sdk/09-api-keys-and-oauth.ts`
- Cross-model planning fallback: Anthropic credits unavailable; main model plan kept.

## Goal
- Implement a same-runtime bridge so live probes can reuse the parent Pi runtime’s selected model and shared auth/model registry instead of shelling out to standalone `pi`.

## Non-Goals
- no attempt to reuse the hidden auth/session token of an outer runtime we do not control
- no queue-runner or multi-worker dispatch engine
- no broad custom-provider marketplace
- no attempt to solve all future worker orchestration in this slice

## Assumptions
- the bounded useful target is “same account/model path as the parent harness runtime we control”
- reusing `ctx.modelRegistry`, `ctx.model`, and `ctx.modelRegistry.authStorage` via SDK child sessions is sufficient for this goal
- a bridge tool is the correct first slice; a provider alias can remain future work if needed

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Add `.pi/agent/extensions/same-runtime-bridge.ts`:
  - register `run_same_runtime_probe`
  - spawn child SDK sessions via `createAgentSession()`
  - reuse parent `ctx.modelRegistry` and `ctx.modelRegistry.authStorage`
  - default to parent selected model
  - support optional explicit provider/model override within the shared registry
  - return probe text plus runtime metadata:
    - provider
    - model
    - thinking level
    - auth source class
- Add `scripts/validate-same-runtime-bridge.sh`:
  - helper-level auth source classification checks
  - helper-level model selection inheritance checks
  - TypeScript compile check
  - optional bounded live probe through `run_same_runtime_probe`
- Add a focused architecture doc describing what “same runtime” does and does not mean
- Wire validator into static checks and CI

## Plan Draft B
- only add a direct-completion helper using `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)`
- skip child session support
- skip SDK session creation
- rely on docs for future multi-agent reuse

## Unified Plan
- Use Draft A because the user explicitly wants something reusable for the future multi-agent harness, and child SDK sessions are the correct foundation for that.
- Keep the surface bounded to probes/sub-agents, not full dispatch.
- Defer any provider alias until after the bridge is working and validated.

## Files to Modify
- `.github/workflows/ci.yml`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/validation_architecture.md`
- `README.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_same-runtime-bridge.md`
- `reports/planning/2026-04-19_same-runtime-bridge-plan.md`

## New Files
- `.pi/agent/extensions/same-runtime-bridge.ts`
- `.pi/agent/docs/same_runtime_bridge_architecture.md`
- `scripts/validate-same-runtime-bridge.sh`
- `reports/validation/2026-04-19_same-runtime-bridge-validation-script.md`
- `reports/validation/2026-04-19_same-runtime-bridge-validation-script.json`

## TDD Sequence
- 1. RED: run `./scripts/validate-same-runtime-bridge.sh` before it exists and confirm missing-file failure.
- 2. Add the smallest bridge extension plus exported pure helpers.
- 3. Add the dedicated validator with helper-level checks and compile check.
- 4. Run the validator and fix the smallest failing issue.
- 5. Add docs/static-check/CI wiring once runtime behavior is stable.
- 6. Run the changed validation scope 3 consecutive times.
- 7. Run one bounded live probe if environment permits.
- 8. Run skeptical self-review and append the `g-check` artifact.

## Test Coverage
- parent model inheritance when no override is supplied
- explicit provider/model override when present in shared registry
- auth source classification for:
  - auth-storage oauth
  - auth-storage api key
  - configured external/runtime/fallback class
  - missing auth
- proof that the bridge uses shared registry/auth objects rather than standalone `pi`
- TypeScript compile check for extension
- optional bounded live probe returning parent-runtime metadata

## Acceptance Criteria
- live probes can run via shared runtime/session objects instead of standalone `pi`
- default probe model matches the parent selected model
- returned metadata includes provider/model and auth source class
- dedicated validator exists and passes for helper-level checks
- docs clearly state the boundary: same controlled runtime, not guaranteed same hidden outer chat token
- CI/static checks cover the new bridge validator

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| same-runtime probe bridge | `run_same_runtime_probe` tool | `.pi/agent/extensions/same-runtime-bridge.ts` | helper validator passes; optional live tool probe succeeds or is explicitly skipped |
| shared auth/model reuse | SDK child session setup | `.pi/agent/extensions/same-runtime-bridge.ts` | helper validator proves parent model/registry are reused |
| operator discoverability | docs + validator architecture | `.pi/agent/docs/*.md`, `README.md` | readback mentions the bridge and validator |

## Validation
- primary: `./scripts/validate-same-runtime-bridge.sh`
- repeat 3 consecutive local passes for the changed validation scope
- supporting local gates:
  - `./scripts/check-repo-static.sh`
  - `./scripts/check-foundation-extension-compile.sh`
  - `./scripts/validate-skill-routing.sh --skip-live`
  - `./scripts/validate-harness-routing.sh`
  - `./scripts/validate-team-activation.sh`
  - `./scripts/validate-task-packets.sh`
  - `./scripts/validate-handoffs.sh`
- optional bounded live probe only if environment permits

## Risks
- exact hidden outer-session token reuse may still be impossible if the parent runtime does not expose it
- SDK child sessions could become recursive if project extensions are loaded carelessly in the child probe
- live proof may be limited by provider availability or usage limits, so helper-level proof remains primary

## Pi Log Update
- planning log: `reports/planning/2026-04-19_same-runtime-bridge-plan.md`
- coding log: `logs/coding/2026-04-19_same-runtime-bridge.md`

## Completion Note
- Implemented as planned in a bounded v1:
  - same-runtime probe bridge extension
  - dedicated validator
  - architecture/operator/validation docs
  - static-check/CI wiring
- Validation evidence is recorded in:
  - `logs/coding/2026-04-19_same-runtime-bridge.md`
  - `reports/validation/2026-04-20_same-runtime-bridge-validation-script.md`
  - `reports/validation/2026-04-20_same-runtime-bridge-validation-script.json`
