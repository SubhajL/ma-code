# Planning Log — harness-027-028-validation-gates

- Date: 2026-04-20
- Scope: Implement bounded HARNESS-027/028 validation checklist logic and proof-based completion gates for the repo-local Pi harness.
- Status: ready
- Related coding log: `logs/coding/2026-04-20_harness-027-028-validation-gates.md`

## Discovery Path
- Auggie attempt returned credit exhaustion and recommended local fallback.
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md`
  - `.pi/agent/docs/validation_recovery_architecture.md`
  - `.pi/agent/docs/task_schema_semantics.md`
  - `.pi/agent/docs/runtime_validation_runbook.md`
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/extensions/till-done.ts`
  - `.pi/agent/state/schemas/tasks.schema.json`
  - `scripts/validate-phase-a-b.sh`
  - `.pi/agent/skills/validation-checklist/SKILL.md`
- Cross-model planning fallback: `second_model_plan` unavailable because Anthropic credits are too low; main/current model plan kept.

## Goal
- Implement deterministic validation checklist logic and runtime completion gates so task completion depends on explicit validation proof rather than only review + evidence presence.

## Non-Goals
- no queue runner or long-running recovery/orchestration runtime
- no new dedicated Phase H validator script unless the foundation validator proves insufficient
- no provider/model routing changes
- no UI/TUI workflow work
- no protected-path bypass or raw runtime JSON editing workflow changes

## Assumptions
- the bounded current-slice implementation should attach HARNESS-027/028 to the existing `task_update` runtime in `.pi/agent/extensions/till-done.ts`
- extending `scripts/validate-phase-a-b.sh` is the right regression surface because these are task-discipline/completion-gate semantics, not a separate runtime domain
- a machine-readable completion-gate policy is useful for predictable task-class expectations and lighter docs/research exceptions
- a manual override path may exist, but it must record explicit approval metadata and stay visible in task state/evidence

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Add a machine-readable completion-gate policy file, e.g. `.pi/agent/validation/completion-gate-policy.json`, defining:
  - task classes
  - validation tiers (`lightweight`, `standard`, `strict`)
  - required checklist categories by class
  - allowed validation sources by class
  - docs/research lighter-validation exception rules
  - override requirements
- Extend `.pi/agent/extensions/till-done.ts`:
  - add `taskClass` and `validation` state to tasks
  - add `validate` action with explicit `pass` / `fail` / `blocked` results
  - add `override` action with approval reference + reason
  - reject `done` unless validation gate is satisfied for the task class
  - route validator `fail` to task `failed`
  - route validator `blocked` to task `blocked`
  - keep current evidence/review/dependency checks before validation gating so earlier semantics remain intact
- Extend task schema + semantics docs to match the new runtime contract.
- Extend `scripts/validate-phase-a-b.sh` with bounded checks for:
  - docs/research lighter validation path
  - implementation task requiring validator pass before done
  - strict task requiring validator source and allowing override only with approval metadata
  - validation fail/block rejection flow
- Update runbook/operator/validation docs and validation-checklist skill for discoverability.

## Plan Draft B
- Skip a separate JSON policy file and hardcode task-class rules directly in `till-done.ts`.
- Add only one new `validate` action and reuse `fail`/`block` for rejection flow.
- Treat manual override as a note + evidence convention rather than explicit runtime action.
- Update validator/docs minimally.

## Unified Plan
- Use Draft A, but keep the runtime surface bounded to one existing extension (`till-done.ts`) and one validator surface (`validate-phase-a-b.sh`).
- Prefer a small machine-readable completion-gate policy file over hardcoded branching so task-class expectations remain predictable and reviewable.
- Add explicit `validate` and `override` actions because HARNESS-027/028 require pass/fail/block outputs, manual override path, and proof-based completion gates.
- Keep docs/research as lighter-validation classes rather than bypass classes: they still require visible validation proof, but with reduced checklist expectations and a lighter allowed source.
- Preserve current foundation semantics by ordering checks so existing review/evidence/dependency rules still fail for their own reasons before validation-gate logic is consulted.

## Files to Modify
- `.pi/agent/extensions/till-done.ts`
- `.pi/agent/state/schemas/tasks.schema.json`
- `.pi/agent/docs/task_schema_semantics.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/harness_phase_capability_map.md`
- `.pi/agent/skills/validation-checklist/SKILL.md`
- `README.md`
- `scripts/check-repo-static.sh`
- `scripts/validate-phase-a-b.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-04-20_harness-027-028-validation-gates.md`
- `reports/planning/2026-04-20_harness-027-028-validation-gates-plan.md`

## New Files
- `.pi/agent/validation/completion-gate-policy.json`
- `reports/validation/2026-04-20_harness-027-028-validation-gates-validation-script.md`
- `reports/validation/2026-04-20_harness-027-028-validation-gates-validation-script.json`

## TDD Sequence
- 1. RED: extend `scripts/validate-phase-a-b.sh` with the new completion-gate expectations and run it to capture failures against the current runtime.
- 2. Add the smallest runtime scaffolding in `till-done.ts` for task classes, validation state, and validation/override actions.
- 3. Add the machine-readable completion-gate policy file and connect the runtime to it.
- 4. Update task schema/docs so the contract matches the implemented runtime exactly.
- 5. Re-run `./scripts/validate-phase-a-b.sh`, fix the smallest failing issue, and repeat until green.
- 6. Run the changed validator scope 3 consecutive times for flake checking.
- 7. Update operator/runbook/discoverability docs.
- 8. Run skeptical self-review and append the `g-check` artifact.

## Test Coverage
- implementation/default task cannot transition `review -> done` before validator pass
- docs/research task can pass with lighter checklist/source expectations
- validator `fail` result moves task to `failed` with recorded note/evidence
- validator `blocked` result moves task to `blocked` with recorded blocker note
- manual override requires approval metadata and enables done only afterward
- `done` still rejects empty evidence, missing review state, and unresolved dependencies before validation gate is considered
- tasks schema includes new task-class and validation metadata fields
- compile check still passes for `till-done.ts`

## Acceptance Criteria
- validation checklist behavior is predictable and machine-readable for the current task classes
- pass/fail/block outputs are recorded explicitly in runtime task state
- completion requires validation proof appropriate to task class, not just optimistic evidence
- docs/research tasks have lighter validation expectations without becoming evidence-free bypasses
- manual override path exists, is explicit, and records approval metadata
- validator failure/block paths route tasks into visible rejection states (`failed` / `blocked`)
- `./scripts/validate-phase-a-b.sh` proves the new completion-gate behavior

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| completion-gate runtime | `task_update` tool | `.pi/agent/extensions/till-done.ts` via `.pi/settings.json` extensions | `validate-phase-a-b.sh` completion-gate checks pass |
| machine-readable gate policy | completion-gate policy JSON | `.pi/agent/validation/completion-gate-policy.json` | validator/readback confirms expected task classes, tiers, and override rules |
| task schema alignment | task runtime state schema | `.pi/agent/state/schemas/tasks.schema.json` | validator/static check reads schema and runtime state examples remain aligned |
| manual debugging path | operator runbook | `.pi/agent/docs/runtime_validation_runbook.md` | readback includes validation/override/done gate steps |

## Validation
- primary validator: `./scripts/validate-phase-a-b.sh`
- flake check: 3 consecutive passing runs of the changed validator scope (the full script, since this is a foundation runtime gate)
- supporting gates:
  - `./scripts/check-repo-static.sh`
  - `./scripts/check-foundation-extension-compile.sh`
  - YAML parse of `.github/**/*.yml`
- save validation artifacts under:
  - `reports/validation/2026-04-20_harness-027-028-validation-gates-validation-script.md`
  - `reports/validation/2026-04-20_harness-027-028-validation-gates-validation-script.json`

## Risks
- task-state schema growth could become too large if future queue/recovery details leak into this slice
- validator prompt wording may need careful adjustment so failures reflect the intended gate rather than an earlier unrelated error
- manual override is a visibility/control mechanism, not automatic proof of correct human approval
- stricter completion gates may require future prompt/template updates in worker roles if task_update usage becomes more common

## Pi Log Update
- planning log: `reports/planning/2026-04-20_harness-027-028-validation-gates-plan.md`
- coding log: `logs/coding/2026-04-20_harness-027-028-validation-gates.md`
