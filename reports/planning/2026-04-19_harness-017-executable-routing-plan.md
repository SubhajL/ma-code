# Planning Log — harness-017-executable-routing

- Date: 2026-04-19
- Scope: Implement a bounded HARNESS-017 executable-routing v1 for the repo-local Pi harness.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_harness-017-executable-routing.md`

## Discovery Path
- Auggie attempt timed out; used local discovery fallback.
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `logs/CURRENT.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md`
  - `.pi/agent/models.json`
  - `.pi/agent/routing/worker_routing_matrix.md`
  - `.pi/agent/routing/routing_notes.md`
  - `.pi/agent/docs/team_orchestration_architecture.md`
  - `.pi/agent/prompts/roles/orchestrator.md`
  - existing extension patterns and `scripts/validate-skill-routing.sh`
- Cross-model planning fallback: Anthropic credits unavailable; main model plan only.

## Goal
- Convert the current routing matrix into executable model-routing logic with deterministic resolution, machine-readable policy, and validator proof.

## Non-Goals
- no HARNESS-020 team activation logic
- no HARNESS-021 task packet generation
- no provider-failure retry engine from HARNESS-018
- no queue-runner integration
- no broad orchestrator redesign

## Assumptions
- HARNESS-017 is primarily about executable provider/model selection by role, not team activation
- a routing tool callable by the orchestrator/future orchestration layers is sufficient for a bounded v1
- one cheap helper-level validator plus optional live proof is enough for this slice

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Extend `.pi/agent/models.json` with machine-readable routing policy:
  - critical roles
  - override reasons
  - budget modes
  - do-not-downgrade constraints
  - optional lower-cost budget overrides for non-critical roles
- Add `.pi/agent/extensions/harness-routing.ts`:
  - register a `resolve_harness_route` tool
  - load routing config from `.pi/agent/models.json`
  - resolve default route, allowed override, budget-sensitive downgrade, and fallback order deterministically
  - export pure helper functions for validator use
- Add `scripts/validate-harness-routing.sh`:
  - helper-level deterministic route checks
  - TypeScript compile check for the extension
  - optional one-live-probe mode rather than default expensive runtime calls
- Update minimal docs for discoverability and operator workflow

## Plan Draft B
- Keep rules hardcoded in the extension and avoid config changes
- Add only a live manual probe and compile check
- Document the behavior later

## Unified Plan
- Use Draft A because HARNESS-017 explicitly asks for machine-readable rules and non-ad-hoc routing.
- Keep the runtime surface small: one routing tool, one config source, one dedicated validator.
- Default validation should stay cheap/local; live proof should be optional and bounded.

## Files to Modify
- `.pi/agent/models.json`
- `.pi/agent/routing/routing_notes.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_harness-017-executable-routing.md`
- `reports/planning/2026-04-19_harness-017-executable-routing-plan.md`

## New Files
- `.pi/agent/extensions/harness-routing.ts`
- `scripts/validate-harness-routing.sh`
- `reports/validation/2026-04-19_harness-routing-validation-script.md`
- `reports/validation/2026-04-19_harness-routing-validation-script.json`

## TDD Sequence
- 1. RED: run `./scripts/validate-harness-routing.sh` before it exists and confirm missing-file failure.
- 2. Add the smallest routing extension plus exported pure helpers.
- 3. Add the machine-readable policy to `.pi/agent/models.json`.
- 4. Add the dedicated validator script with helper-level checks and compile check.
- 5. Run the validator and fix the smallest failing issue.
- 6. Optionally run one bounded live probe if needed for wiring proof.
- 7. Run skeptical self-review and record a `g-check`-style review artifact.

## Test Coverage
- helper-level route resolution for default roles
- do-not-downgrade behavior for critical roles under budget pressure
- allowed budget downgrade for non-critical roles
- allowed stronger override for harder tasks or explicit human override
- fallback-order filtering when failed models are supplied
- TypeScript compile check for the extension
- optional live tool registration probe

## Acceptance Criteria
- executable routing lives in one clear runtime surface
- model selection is predictable for supported routing cases
- critical roles are not casually downgraded by budget-pressure rules
- override, fallback, and budget rules are machine-readable
- routing is no longer purely ad hoc docs
- dedicated validator exists and passes for helper-level checks

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| executable route resolver | `resolve_harness_route` tool | `.pi/agent/extensions/harness-routing.ts` | helper validator passes; optional live tool probe succeeds or is explicitly skipped |
| machine-readable routing policy | routing config JSON | `.pi/agent/models.json` | validator reads config and resolves expected routes |
| operator discoverability | validation/operator docs | `.pi/agent/docs/*.md` | readback mentions the new validator and routing surface |

## Validation
- primary: `./scripts/validate-harness-routing.sh`
- readback of `.pi/agent/models.json`, `.pi/agent/extensions/harness-routing.ts`, and docs
- optional bounded live probe only if needed for wiring proof

## Risks
- model-strength/downgrade semantics are approximate without a full provider failure policy yet
- live proof may be limited by provider availability, so helper-level proof should remain the primary signal
- future HARNESS-018 may refine fallback/retry behavior and require policy extension

## Completion Note
- Completed for the current bounded HARNESS-017 v1 slice.
- Primary validation artifact: `reports/validation/2026-04-19_harness-routing-validation-script.json`
- Result: `status: PASS`, `failedChecks: 0`
- Additional wiring proof: one bounded live `resolve_harness_route` probe returned `openai-codex/gpt-5.4-mini` for backend budget-pressure routing.

## Pi Log Update
- planning log: `reports/planning/2026-04-19_harness-017-executable-routing-plan.md`
- coding log: `logs/coding/2026-04-19_harness-017-executable-routing.md`
