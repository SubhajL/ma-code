# Planning Log — harness-021-task-packets

- Date: 2026-04-19
- Scope: Implement a bounded HARNESS-021 task-packet generation v1 for the repo-local Pi harness.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_harness-021-task-packets.md`

## Discovery Path
- Auggie attempt timed out; used local discovery fallback.
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `logs/CURRENT.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md`
  - `.pi/agent/docs/team_orchestration_architecture.md`
  - `.pi/agent/prompts/roles/build_lead.md`
  - `.pi/agent/prompts/templates/dispatch-build.md`
  - `.pi/agent/docs/task_schema_semantics.md`
  - `.pi/agent/extensions/harness-routing.ts`
  - `.pi/agent/extensions/team-activation.ts`
  - existing validator patterns under `scripts/validate-*.sh`
- Cross-model planning fallback: Anthropic credits unavailable; main model plan kept.

## Goal
- Implement deterministic task-packet generation so workers can receive bounded, executable packets without hidden assumptions.

## Non-Goals
- no HARNESS-022 handoff formats beyond the packet surface itself
- no queue-runner or long-running autonomy runtime
- no live multi-worker dispatch engine
- no changes to raw runtime task-state mutation workflow
- no broad prompt-system redesign

## Assumptions
- a bounded v1 can expose packet generation as a deterministic tool callable by orchestrator/build-lead layers
- packet structure should be machine-readable first, with a rendered packet string as an optional convenience
- existing team activation and routing logic should be reused instead of inventing separate team/role/model rules
- stable schema + policy + validator is enough to close HARNESS-021 for this slice

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Add `.pi/agent/state/schemas/task-packet.schema.json` with stable packet shape.
- Add `.pi/agent/packets/packet-policy.json` with:
  - default disallowed paths
  - default evidence expectations
  - default escalation instructions
  - role/team/domain mapping guidance
- Add `.pi/agent/extensions/task-packets.ts`:
  - load team definitions, routing policy, and packet policy
  - validate assigned role belongs to assigned team
  - generate packet IDs deterministically
  - attach optional model override / resolved route info when needed
  - export pure helpers for validator use
  - register `generate_task_packet`
- Add `scripts/validate-task-packets.sh`:
  - helper-level packet generation checks
  - schema validation checks
  - TypeScript compile check
  - optional bounded live tool probe
- Update build-lead/orchestrator guidance and docs for discoverability
- Wire validator into CI/static checks

## Plan Draft B
- Only add a markdown template generator and prompt/template updates
- skip schema/policy files
- rely on docs and manual packet construction

## Unified Plan
- Use Draft A because HARNESS-021 explicitly needs stable and reusable packet structure, which is better represented in schema + policy + runtime logic than prompt prose alone.
- Keep the runtime surface small: one packet generator, one packet schema, one packet policy file, one dedicated validator.
- Reuse existing HARNESS-020 team definitions and HARNESS-017 routing logic so packet generation does not fork orchestration policy.

## Files to Modify
- `.github/workflows/ci.yml`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/prompts/roles/build_lead.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/prompts/templates/dispatch-build.md`
- `README.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_harness-021-task-packets.md`
- `reports/planning/2026-04-19_harness-021-task-packets-plan.md`

## New Files
- `.pi/agent/packets/packet-policy.json`
- `.pi/agent/state/schemas/task-packet.schema.json`
- `.pi/agent/extensions/task-packets.ts`
- `scripts/validate-task-packets.sh`
- `reports/validation/2026-04-19_task-packets-validation-script.md`
- `reports/validation/2026-04-19_task-packets-validation-script.json`

## TDD Sequence
- 1. RED: run `./scripts/validate-task-packets.sh` before it exists and confirm missing-file failure.
- 2. Add the smallest packet generator extension plus exported pure helpers.
- 3. Add packet schema and packet policy.
- 4. Add the dedicated validator with helper-level checks and compile check.
- 5. Run the validator and fix the smallest failing issue.
- 6. Update docs/prompts/CI wiring once runtime behavior is stable.
- 7. Run the changed test scope 3 consecutive times.
- 8. Run skeptical self-review and append the `g-check` artifact.

## Test Coverage
- valid build packet generation with role/team/domain alignment
- valid planning packet generation with discovery/cross-model fields
- default protected/disallowed path injection
- optional model override inclusion when routing result differs or override is explicit
- rejection of role/team mismatch packets
- rejection of empty acceptance/evidence/escalation fields where policy requires them
- schema validity for generated packets
- TypeScript compile check for the extension
- optional live tool registration probe

## Acceptance Criteria
- packet generation lives in one clear runtime surface
- packet structure is machine-readable, stable, and reusable
- generated packets include scope, allowed files/domains, acceptance, evidence, escalation, and optional model override
- workers can execute from packets without guesswork for supported cases
- team/role alignment is deterministic and enforced
- dedicated validator exists and passes for helper-level checks

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| executable packet generator | `generate_task_packet` tool | `.pi/agent/extensions/task-packets.ts` | helper validator passes; optional live tool probe succeeds or is explicitly skipped |
| packet schema | JSON schema | `.pi/agent/state/schemas/task-packet.schema.json` | validator checks generated packets against schema |
| packet policy | policy JSON | `.pi/agent/packets/packet-policy.json` | validator reads defaults and expected protected-path / evidence behavior |
| team/routing integration | existing team + routing config | `.pi/agent/teams/*.yaml`, `.pi/agent/models.json` | validator confirms role/team alignment and optional model override behavior |

## Validation
- primary: `./scripts/validate-task-packets.sh`
- repeat 3 consecutive local passes for the changed validation scope
- supporting local gates:
  - `./scripts/check-repo-static.sh`
  - `./scripts/check-foundation-extension-compile.sh`
  - `./scripts/validate-skill-routing.sh --skip-live`
  - `./scripts/validate-harness-routing.sh`
  - `./scripts/validate-team-activation.sh`
- optional bounded live probe only if needed for wiring proof

## Risks
- packet inputs could sprawl if HARNESS-022 handoff concerns leak into HARNESS-021
- routing integration could become too clever if packet generation tries to solve all future dispatch concerns
- live proof may be limited by provider availability, so helper/schema proof should remain primary
- future task packet linkage into runtime task state should be additive, not a breaking schema change

## Pi Log Update
- planning log: `reports/planning/2026-04-19_harness-021-task-packets-plan.md`
- coding log: `logs/coding/2026-04-19_harness-021-task-packets.md`

## Completion Note
- Implemented as planned in a bounded v1:
  - machine-readable packet policy
  - machine-readable packet schema
  - executable packet generator
  - dedicated validator
  - doc/prompt/CI wiring
- Validation evidence is recorded in:
  - `logs/coding/2026-04-19_harness-021-task-packets.md`
  - `reports/validation/2026-04-19_task-packets-validation-script.md`
  - `reports/validation/2026-04-19_task-packets-validation-script.json`
