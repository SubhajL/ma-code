# Phase Model Routing

Phase 7 adds phase-aware model routing profiles to the existing `resolve_harness_route` surface.

## Purpose
- Keep role-based routing backward compatible.
- Let product pipeline phases request different model/reasoning lanes without creating a second routing helper.
- Represent desired future model targets, such as `opus-4.7` and `gpt-5.5`, without activating them until exact provider/model IDs are verified.

## Phase lanes
Supported `phaseLane` values:
- `screen_design`: Stitch prompts, mock screen artifacts, and screen/design reasoning.
- `frontend_implementation`: frontend implementation work for approved product slices.
- `backend_implementation`: backend implementation work for product slices with API/data contract expectations.

## Resolution order
1. Explicit `modelOverride` when existing routing policy allows it.
2. Verified phase-lane profile when `phaseLane` is present and the requested model has `verificationStatus: verified` plus `verifiedModelId`.
3. Phase fallback model when the requested target is `unverified` or `unavailable`.
4. Existing role-based routing behavior when no `phaseLane` is supplied.

## Safety rules
- Existing calls without `phaseLane` behave as role-only routing did before Phase 7.
- Unverified requested model IDs cannot become active defaults.
- Each `phase_routing_profiles` phase profile must include `targetModelRequest`, `verificationStatus`, `verifiedModelId`, `fallbackModelId`, `thinking`, `allowedThinking`, and `activation`.
- `verifiedModelId` must stay `null` until the requested model is verified through provider/model registry evidence.
- Unknown phase lanes are rejected safely by the resolver/tool schema.
- Phase 7 does not create task packets. It does not create queue jobs. It does not create worker sessions, handoffs, or dispatch behavior.

## Current defaults
- `screen_design` requests `opus-4.7` but uses verified fallback `anthropic/claude-opus-4-5` until verified.
- `frontend_implementation` requests `opus-4.7` but uses verified fallback `anthropic/claude-opus-4-5` until verified.
- `backend_implementation` requests `gpt-5.5` but uses verified fallback `github-copilot/gpt-5.4` until verified.

## Future use
- Phase 8 FE packet generation should pass `phaseLane: frontend_implementation`.
- Phase 9 BE packet generation should pass `phaseLane: backend_implementation`.
- Stitch prompt/artifact phases should pass `phaseLane: screen_design`.
