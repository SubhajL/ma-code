# Coding Log — harness-017-executable-routing

- Date: 2026-04-19
- Scope: Implement a bounded HARNESS-017 executable-routing v1 for the repo-local Pi harness.
- Status: complete
- Branch: unknown (no `.git` directory visible under `/Users/subhajlimanond/dev/ma-code` in this environment)
- Related planning log: `reports/planning/2026-04-19_harness-017-executable-routing-plan.md`

## Task Group
- add executable routing runtime logic
- add machine-readable routing policy
- add dedicated validator for HARNESS-017
- document the bounded routing surface

## Files Investigated
- `AGENTS.md`
- `README.md`
- `logs/CURRENT.md`
- `pi_harness_implementation_backlog_REPO_LOCAL.md`
- `.pi/agent/models.json`
- `.pi/agent/routing/worker_routing_matrix.md`
- `.pi/agent/routing/routing_notes.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/extensions/*.ts`
- `scripts/validate-skill-routing.sh`

## Files Changed
- `.pi/agent/extensions/harness-routing.ts`
- `.pi/agent/models.json`
- `.pi/agent/routing/routing_notes.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `scripts/validate-harness-routing.sh`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_harness-017-executable-routing-plan.md`
- `logs/coding/2026-04-19_harness-017-executable-routing.md`
- `reports/validation/2026-04-19_harness-routing-validation-script.md`
- `reports/validation/2026-04-19_harness-routing-validation-script.json`

## Runtime / Validation Evidence
- RED:
  - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-harness-routing.sh`
  - result before implementation:
    - `/bin/bash: ./scripts/validate-harness-routing.sh: No such file or directory`
  - key failure reason:
    - dedicated HARNESS-017 validator did not exist yet
- GREEN:
  - local validator:
    - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-harness-routing.sh`
    - result: `Harness-routing validation PASS`
  - local flake check:
    - two additional consecutive passes of `./scripts/validate-harness-routing.sh`
    - both returned `Harness-routing validation PASS`
  - generated reports:
    - `reports/validation/2026-04-19_harness-routing-validation-script.md`
    - `reports/validation/2026-04-19_harness-routing-validation-script.json`
  - bounded live wiring proof:
    - `cd /Users/subhajlimanond/dev/ma-code && pi --provider openai-codex --model gpt-5.4 --no-session --no-extensions -e ./.pi/agent/extensions/harness-routing.ts --mode json "Use resolve_harness_route for role backend_worker with reason budget_pressure and budgetMode conserve, then report the exact selected model ID in one sentence."`
    - tool call observed: `resolve_harness_route`
    - exact selected model ID observed: `openai-codex/gpt-5.4-mini`

## Key Findings
- the repo already had a canonical routing map, but it was still doc/config only
- HARNESS-017 can be closed with one small executable route-resolver surface without widening into team activation or task packets
- machine-readable policy belongs in `.pi/agent/models.json`, while resolution logic belongs in an extension and deterministic validator
- default validation should stay cheap/local, with live proof used only once when wiring evidence is needed

## Decisions Made
- implement a dedicated `resolve_harness_route` tool instead of hardwiring logic into prompts
- keep executable policy machine-readable in `.pi/agent/models.json`
- keep the validator separate at `scripts/validate-harness-routing.sh`
- make live validation optional in the validator and use one bounded manual live probe for this implementation

## Known Risks
- downgrade semantics are a v1 policy approximation until HARNESS-018 provider-failure handling exists
- the default validator leaves live probing as `SKIP` unless explicitly enabled, so helper-level proof remains the primary regression signal
- future HARNESS-020/021 work may require richer route inputs than role/reason/budget mode alone

## Current Outcome
- planning completed
- implementation completed
- validation completed

## Next Action
- none

## Implementation Summary (2026-04-19 13:50:39 +0700)

### Goal
- Convert the current routing matrix into executable, deterministic provider/model routing for the repo-local harness.

### What changed
- Added `.pi/agent/extensions/harness-routing.ts`.
- Extended `.pi/agent/models.json` with machine-readable routing policy:
  - critical roles
  - override reasons
  - budget modes
  - per-role fallback order
  - per-role budget overrides
- Added `scripts/validate-harness-routing.sh`.
- Updated routing/orchestration/validation docs for discoverability and operator use.
- Generated validation outputs under `reports/validation/`.

### TDD evidence
- RED:
  - missing-script failure from `./scripts/validate-harness-routing.sh`
- GREEN:
  - `./scripts/validate-harness-routing.sh` returned `Harness-routing validation PASS`
  - the same local validator scope passed 3 consecutive times total
  - live tool probe observed `resolve_harness_route` returning `openai-codex/gpt-5.4-mini`

### Wiring verification evidence
- Runtime wiring:
  - `resolve_harness_route` is registered by `.pi/agent/extensions/harness-routing.ts`
- Policy wiring:
  - `.pi/agent/models.json` now contains the executable routing policy the extension reads
- Validator wiring:
  - `scripts/validate-harness-routing.sh` compiles the extension and runs deterministic helper-level checks against the copied config
- Live wiring:
  - one bounded `pi --no-extensions -e ./.pi/agent/extensions/harness-routing.ts` probe observed the tool call and exact selected model
- Doc wiring:
  - `.pi/agent/docs/validation_architecture.md`, `.pi/agent/docs/operator_workflow.md`, `.pi/agent/docs/file_map.md`, `.pi/agent/docs/team_orchestration_architecture.md`, and `.pi/agent/routing/routing_notes.md` now point to the executable routing surface

### Behavior / risk notes
- critical roles are blocked from casual budget-pressure downgrades
- non-critical worker lanes can take explicit budget overrides when policy allows
- harder tasks can prefer stronger fallback lanes
- failed-model filtering now yields deterministic fallback choice
- future HARNESS-018 may refine retry/fallback semantics further

## Review (2026-04-19 13:50:39 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: unknown (no `.git` directory visible here)
- Scope: `working-tree`
- Commands Run:
  - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-harness-routing.sh`
  - repeated local validator reruns for flake checking
  - the bounded live wiring probe command above
  - `cd /Users/subhajlimanond/dev/ma-code && rg -n "resolve_harness_route|validate-harness-routing|routing_policy|fallback_order|budget_overrides|Current executable routing surface" .pi/agent/extensions/harness-routing.ts .pi/agent/models.json .pi/agent/routing/routing_notes.md .pi/agent/docs/team_orchestration_architecture.md .pi/agent/docs/validation_architecture.md .pi/agent/docs/operator_workflow.md .pi/agent/docs/file_map.md scripts/validate-harness-routing.sh`
  - readback of `reports/validation/2026-04-19_harness-routing-validation-script.md`
  - readback of `reports/validation/2026-04-19_harness-routing-validation-script.json`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- the default validator leaves live tool proof skipped unless explicitly requested, so an operator could rely only on helper-level proof if they do not read the report closely
  - Why it matters: wiring proof is slightly weaker by default than when one live probe is also run
  - Fix direction: keep the current cheap default, but use `--include-live` when a bounded live proof is worth the spend
  - Validation still needed: none for this bounded task because the manual live probe already passed

### Open Questions / Assumptions
- Assumed HARNESS-017 should stay bounded to role/model routing logic and not absorb HARNESS-020 team activation
- Assumed `gpt-5.4-mini` is an acceptable lower-cost worker lane for frontend/backend budget-pressure routing in this repo-local policy

### Recommended Tests / Validation
- re-run `./scripts/validate-harness-routing.sh` when changing `.pi/agent/models.json` routing policy or `.pi/agent/extensions/harness-routing.ts`
- use `./scripts/validate-harness-routing.sh --include-live` when one bounded live proof is worth the cost
- add broader retry/provider-failure tests when HARNESS-018 is implemented

### Rollout Notes
- this closes a bounded HARNESS-017 v1 only
- team activation, task packets, and provider-failure retry policy remain later tasks

### Review Verdict
- no_required_fixes
