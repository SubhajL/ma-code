# Planning Log — harness-020-team-activation

- Date: 2026-04-19
- Scope: Implement a bounded HARNESS-020 team-activation v1 for the repo-local Pi harness.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_harness-020-team-activation.md`

## Discovery Path
- Auggie attempt timed out; used local discovery fallback.
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `logs/CURRENT.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md`
  - `.pi/agent/docs/team_orchestration_architecture.md`
  - `.pi/agent/extensions/harness-routing.ts`
  - `.pi/agent/models.json`
  - `.pi/agent/teams/*.yaml`
  - `scripts/validate-harness-routing.sh`
  - `.pi/agent/prompts/roles/orchestrator.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `.pi/agent/docs/validation_architecture.md`
- Cross-model planning fallback: Anthropic credits unavailable; main model plan kept.

## Goal
- Implement deterministic team activation rules so the orchestrator can select planning, build, quality, and recovery teams without improvising.

## Non-Goals
- no HARNESS-021 task packet generation
- no queue-runner or long-running autonomy runtime
- no worktree isolation automation beyond current policy/docs
- no broad orchestrator prompt redesign
- no live multi-agent dispatch engine

## Assumptions
- a bounded v1 can expose team-activation as a deterministic tool callable by the orchestrator and later orchestration layers
- machine-readable policy is preferable to burying rules only in prose docs
- existing team YAML files remain the canonical team membership definitions; activation policy should complement them, not replace them
- cheap/local helper-level validation should remain the default proof path

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Add `.pi/agent/teams/activation-policy.json` with machine-readable rules for:
  - planning triggers
  - build triggers
  - quality triggers
  - recovery triggers
  - skip/sequence rules
  - overlap rules
  - quality wait behavior
- Add `.pi/agent/extensions/team-activation.ts`:
  - load team YAMLs and activation-policy JSON
  - export pure helpers for parsing and deterministic resolution
  - register a `resolve_team_activation` tool
  - return selected teams, ordered sequence, skip reasons, overlap allowances, and quality wait decision
- Add `scripts/validate-team-activation.sh`:
  - helper-level resolution checks for representative cases
  - TypeScript compile check for the extension
  - optional bounded live tool probe
- Update minimal docs and orchestrator guidance for discoverability and runtime use
- Update repo-static baseline if the new validator should be treated as required harness infrastructure

## Plan Draft B
- Hardcode activation rules directly in the extension
- avoid a new policy file
- rely on docs + compile check + one live probe

## Unified Plan
- Use Draft A because HARNESS-020 asks for deterministic team usage and explicit overlap rules, which are better represented in machine-readable policy.
- Keep the runtime surface small: one activation tool, one policy file, one dedicated validator.
- Reuse existing team YAMLs for team membership; only activation criteria become new machine-readable policy.
- Keep validation cheap/local by default and live proof optional.

## Files to Modify
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_harness-020-team-activation.md`
- `reports/planning/2026-04-19_harness-020-team-activation-plan.md`

## New Files
- `.pi/agent/teams/activation-policy.json`
- `.pi/agent/extensions/team-activation.ts`
- `scripts/validate-team-activation.sh`
- `reports/validation/2026-04-19_team-activation-validation-script.md`
- `reports/validation/2026-04-19_team-activation-validation-script.json`

## TDD Sequence
- 1. RED: run `./scripts/validate-team-activation.sh` before it exists and confirm missing-file failure.
- 2. Add the smallest activation extension plus exported pure helpers.
- 3. Add the machine-readable activation policy.
- 4. Add the validator script with helper-level checks and compile check.
- 5. Run the validator and fix the smallest failing issue.
- 6. Update docs/orchestrator guidance once runtime behavior is stable.
- 7. Run the changed test scope 3 consecutive times.
- 8. Append skeptical self-review / `g-check` artifact to the coding log.

## Test Coverage
- planning-first activation for ambiguity / missing acceptance criteria
- build-first activation for bounded implementation-ready work
- quality activation after code/config mutation
- lighter quality handling for docs-only / research-only work
- recovery activation after repeated blockage or contradictory validation
- overlap rules for planning/build, build/build, quality/build, recovery/others
- quality wait behavior when multiple builders are active
- TypeScript compile check for the extension
- optional live tool registration probe

## Acceptance Criteria
- activation logic lives in one clear runtime surface
- team selection is deterministic for supported cases
- sequence/skip/overlap decisions are machine-readable and reviewable
- quality wait behavior is explicit
- orchestrator can call an executable activation resolver instead of relying only on prose
- dedicated validator exists and passes for helper-level checks

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| executable team activation resolver | `resolve_team_activation` tool | `.pi/agent/extensions/team-activation.ts` | helper validator passes; optional live tool probe succeeds or is explicitly skipped |
| machine-readable activation policy | activation config JSON | `.pi/agent/teams/activation-policy.json` | validator reads policy and resolves expected team selections |
| team membership inputs | team YAML definitions | `.pi/agent/teams/*.yaml` | parser loads existing teams and validator confirms expected lead/worker metadata |
| operator discoverability | docs + orchestrator prompt | `.pi/agent/docs/*.md`, `.pi/agent/prompts/roles/orchestrator.md` | readback mentions new validator and activation surface |

## Validation
- primary: `./scripts/validate-team-activation.sh`
- repeat 3 consecutive local passes for the changed scope
- readback of `.pi/agent/extensions/team-activation.ts`, `.pi/agent/teams/activation-policy.json`, and updated docs
- optional bounded live probe only if needed for wiring proof

## Risks
- activation inputs can sprawl if this slice tries to absorb task-packet semantics from HARNESS-021
- docs and policy may drift if both are updated without tight linkage
- live proof may be limited by provider availability, so helper-level proof should remain the primary signal
- future orchestration/runtime work may require richer activation inputs than this bounded v1

## Pi Log Update
- planning log: `reports/planning/2026-04-19_harness-020-team-activation-plan.md`
- coding log: `logs/coding/2026-04-19_harness-020-team-activation.md`

## Completion Note
- Implemented as planned in a bounded v1:
  - machine-readable activation policy
  - executable activation resolver
  - dedicated validator
  - doc/prompt/CI wiring
- Validation evidence is recorded in:
  - `logs/coding/2026-04-19_harness-020-team-activation.md`
  - `reports/validation/2026-04-19_team-activation-validation-script.md`
  - `reports/validation/2026-04-19_team-activation-validation-script.json`
