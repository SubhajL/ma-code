# Planning Log — harness-022-handoffs

- Date: 2026-04-19
- Scope: Implement a bounded HARNESS-022 executable handoff-format v1 for the repo-local Pi harness.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_harness-022-handoffs.md`

## Discovery Path
- Auggie attempt timed out; used local discovery fallback.
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `logs/CURRENT.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md`
  - `.pi/agent/docs/team_orchestration_architecture.md`
  - `.pi/agent/prompts/templates/handoff-for-review.md`
  - `.pi/agent/prompts/templates/handoff-for-validation.md`
  - `.pi/agent/prompts/roles/build_lead.md`
  - `.pi/agent/prompts/roles/quality_lead.md`
  - `.pi/agent/prompts/roles/recovery_worker.md`
  - `.pi/agent/extensions/task-packets.ts`
  - existing validator patterns under `scripts/validate-*.sh`
- Cross-model planning fallback: Anthropic credits unavailable; main model plan kept.

## Goal
- Implement deterministic structured handoff generation so multi-step workflows can pass bounded, role-specific handoffs without free-form chaos.

## Non-Goals
- no queue-runner or live worker dispatch engine
- no long-running autonomy runtime
- no redesign of task-state persistence
- no broad prompt-system rewrite
- no HARNESS-023 worktree-isolation automation

## Assumptions
- a bounded v1 can expose handoff generation as a deterministic tool callable by orchestrator/build-lead/quality/recovery layers
- HARNESS-021 task packets should remain the base contract; handoffs should preserve and reference packet scope/evidence expectations rather than replace them
- stable handoff schema + policy + generator + validator is sufficient to close HARNESS-022 for this slice

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Add `.pi/agent/handoffs/handoff-policy.json` with:
  - supported handoff types
  - allowed role-pair constraints
  - required section headers per handoff type
  - default preservation rules for packet scope/evidence/escalation fields
- Add `.pi/agent/state/schemas/handoff.schema.json` with stable machine-readable handoff shape.
- Add `.pi/agent/extensions/handoffs.ts`:
  - load handoff policy and existing team/task-packet dependencies
  - validate source packet shape and role-pair correctness
  - generate deterministic handoff IDs
  - preserve packet scope/acceptance/evidence expectations
  - render role-specific handoff markdown with exact stable headers
  - export pure helpers for validator use
  - register `generate_handoff`
- Add `scripts/validate-handoffs.sh`:
  - helper-level handoff generation checks for all required handoff types
  - schema/policy sanity checks
  - TypeScript compile check
  - optional bounded live tool probe
- Update prompt templates and role docs to prefer executable handoff generation when available
- Wire validator into CI/static checks

## Plan Draft B
- Only add prompt templates for missing handoff types and keep handoffs as markdown-only outputs
- skip runtime generator and schema/policy files
- rely on docs/manual discipline

## Unified Plan
- Use Draft A because HARNESS-022 explicitly asks for handoff formats and acceptance says multi-step workflows should stay structured; a runtime generator plus schema/policy is stronger than prompt-only templates.
- Keep the runtime surface small: one handoff generator, one policy file, one schema file, one dedicated validator.
- Reuse HARNESS-021 task packets as the preserved source contract and existing routing/activation policy rather than inventing a parallel system.

## Files to Modify
- `.github/workflows/ci.yml`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/prompts/roles/build_lead.md`
- `.pi/agent/prompts/roles/quality_lead.md`
- `.pi/agent/prompts/roles/recovery_worker.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/prompts/templates/handoff-for-review.md`
- `.pi/agent/prompts/templates/handoff-for-validation.md`
- `README.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_harness-022-handoffs.md`
- `reports/planning/2026-04-19_harness-022-handoffs-plan.md`

## New Files
- `.pi/agent/handoffs/handoff-policy.json`
- `.pi/agent/state/schemas/handoff.schema.json`
- `.pi/agent/extensions/handoffs.ts`
- `.pi/agent/prompts/templates/handoff-for-worker.md`
- `.pi/agent/prompts/templates/handoff-for-quality.md`
- `.pi/agent/prompts/templates/handoff-for-recovery.md`
- `scripts/validate-handoffs.sh`
- `reports/validation/2026-04-19_handoffs-validation-script.md`
- `reports/validation/2026-04-19_handoffs-validation-script.json`

## TDD Sequence
- 1. RED: run `./scripts/validate-handoffs.sh` before it exists and confirm missing-file failure.
- 2. Add the smallest handoff generator extension plus exported pure helpers.
- 3. Add handoff policy and schema.
- 4. Add the dedicated validator with helper-level checks and compile check.
- 5. Run the validator and fix the smallest failing issue.
- 6. Update templates/prompts/docs/CI once runtime behavior is stable.
- 7. Run the changed test scope 3 consecutive times.
- 8. Run skeptical self-review and append the `g-check` artifact.

## Test Coverage
- build lead → worker handoff preserves packet scope and assignment details
- worker → quality lead handoff requires changed/unchanged/evidence/validation/gaps/blockers fields
- quality lead → reviewer handoff requires review scope, files, risks, and reviewer questions
- quality lead → validator handoff requires validation scope, expected proof, open questions, and preserved acceptance criteria
- recovery → orchestrator or lead handoff requires failure type, likely causes, options, recommended action, and stop threshold
- invalid role-pair handoffs are rejected
- invalid or missing source packet shape is rejected
- schema/policy sanity checks pass
- TypeScript compile check for extension and dependencies
- optional bounded live tool registration probe

## Acceptance Criteria
- handoff generation lives in one clear runtime surface
- all required HARNESS-022 handoff types are supported deterministically
- handoffs preserve packet scope/evidence expectations instead of dropping them
- multi-step workflows can use stable section headers instead of free-form summaries
- dedicated validator exists and passes for helper-level checks
- prompt/docs point operators toward executable handoff generation where appropriate

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| executable handoff generator | `generate_handoff` tool | `.pi/agent/extensions/handoffs.ts` | helper validator passes; optional live tool probe succeeds or is explicitly skipped |
| handoff policy | policy JSON | `.pi/agent/handoffs/handoff-policy.json` | validator reads supported handoff types and role-pair rules |
| handoff schema | JSON schema | `.pi/agent/state/schemas/handoff.schema.json` | validator checks generated handoff shape and schema sanity |
| packet preservation | task packet input contract | `.pi/agent/extensions/task-packets.ts` | helper validator confirms preserved scope/acceptance/evidence fields survive into handoffs |

## Validation
- primary: `./scripts/validate-handoffs.sh`
- repeat 3 consecutive local passes for the changed validation scope
- supporting local gates:
  - `./scripts/check-repo-static.sh`
  - `./scripts/check-foundation-extension-compile.sh`
  - `./scripts/validate-skill-routing.sh --skip-live`
  - `./scripts/validate-harness-routing.sh`
  - `./scripts/validate-team-activation.sh`
  - `./scripts/validate-task-packets.sh`
- optional bounded live probe only if needed for wiring proof

## Risks
- handoff content could sprawl if later queue/dispatch behavior leaks into this slice
- schema complexity could grow if too many handoff-specific fields are added prematurely
- live proof may be limited by provider availability, so helper-level proof should remain primary
- future dispatch/runtime layers may want stronger linkage between handoffs and runtime task state, but that should be additive

## Pi Log Update
- planning log: `reports/planning/2026-04-19_harness-022-handoffs-plan.md`
- coding log: `logs/coding/2026-04-19_harness-022-handoffs.md`

## Completion Note
- Implemented as planned in a bounded v1:
  - machine-readable handoff policy
  - machine-readable handoff schema
  - executable handoff generator
  - dedicated validator
  - prompt/doc/CI wiring
- Validation evidence is recorded in:
  - `logs/coding/2026-04-19_harness-022-handoffs.md`
  - `reports/validation/2026-04-19_handoffs-validation-script.md`
  - `reports/validation/2026-04-19_handoffs-validation-script.json`
