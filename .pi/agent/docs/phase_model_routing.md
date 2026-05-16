# Phase Model Routing

Phase-aware model routing profiles extend the existing `resolve_harness_route` surface.

## Purpose
- Keep role-based routing explicit and testable.
- Let product pipeline phases request different model/reasoning lanes without creating a second routing helper.
- Verified requested model IDs can become active defaults only after they are recorded in `.pi/agent/models.json` `phase_routing_profiles` and covered by routing tests.
- Unverified requested model IDs cannot become active defaults.

## Phase lanes
Supported `phaseLane` values:
- `screen_design`: Stitch prompts, mock screen artifacts, and screen/design reasoning.
- `frontend_implementation`: Frontend implementation planning and UI coding for approved product slices.
- `backend_implementation`: Backend/API/data implementation for approved product slices.

## Runtime behavior
- `phaseLane` is an optional input to `resolve_harness_route` and task-packet generation.
- If a phase profile is `verified`, its `verifiedModelId` is selected.
- If a phase profile is not verified, the resolver uses `fallbackModelId` and records the fallback reason.
- Explicit `modelOverride` still takes precedence when allowed by routing policy.
- The routing helper only returns model-selection metadata; it does not create task packets, does not create queue jobs, and does not create worker sessions.

## Current defaults
- Global non-g-coding defaults use `openai-codex/gpt-5.5` with `high` thinking.
- `screen_design` uses verified `openai-codex/gpt-5.5` with `high` thinking.
- `frontend_implementation` uses verified `openai-codex/gpt-5.3-codex-spark` with `high` thinking.
- `backend_implementation` uses verified `openai-codex/gpt-5.3-codex-spark` with `high` thinking.
- Build worker defaults (`frontend_worker`, `backend_worker`, `infra_worker`) use `openai-codex/gpt-5.3-codex-spark` with `high` thinking for g-coding/implementation work.
- Reviewer, validator, lead, research, docs, and recovery defaults use `openai-codex/gpt-5.5` with `high` thinking unless an explicit allowed override is requested.

## Future use
- FE packet generation may pass `phaseLane: frontend_implementation` when it wants the explicit phase profile rather than role default.
- BE packet generation may pass `phaseLane: backend_implementation` when it wants the explicit phase profile rather than role default.
- Stitch prompt/artifact phases may pass `phaseLane: screen_design`.
- No task packets, queue jobs, worker sessions, handoffs, or dispatch behavior are created by this routing documentation alone.
