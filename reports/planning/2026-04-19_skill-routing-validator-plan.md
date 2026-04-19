# Planning Log — skill-routing-validator

- Date: 2026-04-19
- Scope: Add a dedicated validator for the repo-local `g-skill-auto-route` extension.
- Status: ready
- Related coding log: `logs/coding/2026-04-19_skill-routing-validator.md`

## Discovery Path
- Auggie discovery unavailable due exhausted credits; used local fallback.
- Inspected:
  - `logs/CURRENT.md`
  - `logs/README.md`
  - `.pi/agent/extensions/g-skill-auto-route.ts`
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `scripts/validate-phase-a-b.sh`
- Second-model check attempted and explicitly fell back because Anthropic credits were unavailable.

## Goal
- Add a repeatable validator for skill-routing behavior in `.pi/agent/extensions/g-skill-auto-route.ts`.

## Non-Goals
- no queue/orchestration/runtime-state changes
- no changes to `safe-bash.ts` or `till-done.ts`
- no packaging/global install changes
- no UI work

## Assumptions
- exporting pure helper functions from `g-skill-auto-route.ts` is acceptable for validator use
- deterministic helper-level checks are the safest way to validate all required phrases, including `g-check`, without depending entirely on slow live-model behavior
- a smaller dedicated script is preferable to widening `scripts/validate-phase-a-b.sh`

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to the main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Modify `.pi/agent/extensions/g-skill-auto-route.ts` to export pure route helpers:
  - `SkillName`
  - `SkillRoute`
  - `SKILL_PATTERNS`
  - `detectSkillRoute()`
  - `buildSkillCommand()`
- Add `scripts/validate-skill-routing.sh`:
  - RED/green-style report generation under `reports/validation/`
  - deterministic helper-level checks via `tsx` in a temp directory
  - representative live Pi probes for planning, coding, architecture review, and explicit `/skill:g-coding`
- Update minimal docs:
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `.pi/agent/docs/file_map.md`
- Run the validator and save report outputs.

## Plan Draft B
- Add a bash-only validator without exporting helpers.
- Validate by grep/static matcher checks plus live Pi probes only.
- Update only operator docs, not validation architecture docs.

## Unified Plan
- Use Draft A.
- Deterministic helper-level checks give strong proof for all requested routing cases.
- Live Pi probes give end-to-end proof for representative hook behavior without over-relying on slow `g-check` turns.
- Keep the doc updates compact and bounded.

## Files to Modify
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_skill-routing-validator.md`

## New Files
- `scripts/validate-skill-routing.sh`
- `reports/planning/2026-04-19_skill-routing-validator-plan.md`
- `logs/coding/2026-04-19_skill-routing-validator.md`
- `reports/validation/2026-04-19_skill-routing-validation-script.md`
- `reports/validation/2026-04-19_skill-routing-validation-script.json`

## TDD Sequence
- 1. RED: run `./scripts/validate-skill-routing.sh` before it exists and confirm the missing-file failure.
- 2. Export the smallest pure helper surface from `g-skill-auto-route.ts` needed for deterministic validation.
- 3. Implement `scripts/validate-skill-routing.sh` with helper-level checks and live probes.
- 4. Run the validator and confirm all required checks pass.
- 5. Refactor docs minimally so the new validator is discoverable.

## Test Coverage
- helper-level route detection for:
  - planning intent
  - coding intent
  - bounded review intent
  - architecture review intent
  - explicit `/skill:g-*` preservation
  - optional bare `review` non-match guard
- live Pi probes for:
  - planning route
  - coding route
  - architecture review route
  - explicit `/skill:g-coding` pass-through
- validator report markdown/json generation

## Acceptance Criteria
- `scripts/validate-skill-routing.sh` exists and runs successfully.
- It validates the required routing cases.
- It writes markdown and JSON reports under `reports/validation/`.
- Operator docs mention when to run the new validator.
- The active log pointer points at this bounded workstream.

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| route helper exports | TypeScript module import | `.pi/agent/extensions/g-skill-auto-route.ts` | `tsx` import in validator succeeds and route checks pass |
| skill-routing validator | shell script entrypoint | `scripts/validate-skill-routing.sh` | run script and inspect markdown/json outputs |
| live extension routing | Pi `input` + `before_agent_start` hooks | `.pi/agent/extensions/g-skill-auto-route.ts` loaded via `-e` | live Pi probes return skill-shaped outputs |

## Validation
- RED missing-script failure
- validator script run
- report readback
- skeptical review of changed files

## Risks
- live `g-check`-shaped prompts may remain slower than helper-level checks
- validator will rely on `tsx` installation in a temp dir; network/package availability can affect the compile/import path
- future extension ordering interactions still need broader integration tests if the stack grows

## Pi Log Update
- planning log: `reports/planning/2026-04-19_skill-routing-validator-plan.md`
- coding log: `logs/coding/2026-04-19_skill-routing-validator.md`
