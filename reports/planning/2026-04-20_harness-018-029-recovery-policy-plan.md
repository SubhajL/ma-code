# Planning Log — harness-018-029-recovery-policy

- Date: 2026-04-20
- Scope: Implement a bounded HARNESS-018 + HARNESS-029 recovery-policy slice with machine-readable failure classes, provider-failure handling rules, and an executable classification/retry-eligibility/escalation surface.
- Status: ready
- Related coding log: `logs/coding/2026-04-20_harness-018-029-recovery-policy.md`

## Discovery Path
- Auggie-first attempt:
  - `auggie_discover`
  - result: timeout
  - fallback: local discovery with `read`, `rg`, and targeted file inspection
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md` (`HARNESS-018`, `HARNESS-029`, `HARNESS-030`, `HARNESS-031`)
  - `.pi/agent/docs/validation_recovery_architecture.md`
  - `.pi/agent/extensions/harness-routing.ts`
  - `.pi/agent/extensions/team-activation.ts`
  - `.pi/agent/prompts/roles/recovery_worker.md`
  - `.pi/agent/prompts/templates/handoff-for-recovery.md`
  - existing validator patterns under `scripts/validate-*.sh`
- Cross-model planning fallback:
  - `second_model_plan` unavailable because Anthropic credits are too low
  - main/current model plan kept

## Goal
- Implement one bounded recovery-policy capability slice that makes failure classification and provider-failure retry logic machine-readable and executable.

## Non-Goals
- no queue runner
- no rollback runtime or destructive rollback automation
- no mutation of task/runtime state as part of recovery decisions
- no full HARNESS-030 retry executor
- no HARNESS-031 rollback executor
- no live provider-backed validation requirement by default

## Assumptions
- the right bounded surface is one new policy JSON plus one executable extension tool and one dedicated validator
- provider failure handling should become a first-class failure class in the machine-readable policy because HARNESS-018 needs explicit treatment beyond the current prose-only taxonomy
- recovery output should remain advisory/decision-friendly, not perform the retry itself
- routing defaults in `.pi/agent/models.json` are the right source for concrete stronger-model/provider-switch candidates

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits were unavailable

## Plan Draft A
- Add machine-readable policy at `.pi/agent/recovery/recovery-policy.json`
- Add executable extension `.pi/agent/extensions/recovery-policy.ts` with a tool such as `resolve_recovery_policy`
- Use helper logic to:
  - classify failure from bounded input signals
  - decide retry eligibility
  - determine whether escalation is required
  - compute stronger-model/provider-switch candidates from routing config
- Add a dedicated validator script with helper-level checks and optional live probe
- Update docs/README/operator workflow/static checks/CI
- Pros:
  - cleanly bounded
  - matches existing repo capability-slice pattern
  - gives HARNESS-030/031 a concrete contract base
- Cons:
  - introduces a new policy surface and extension at once

## Plan Draft B
- Skip the executable tool
- Add only a machine-readable policy plus validator script that tests the policy and a few helper functions in a plain TS module
- Leave role prompts/docs to consume the policy manually later
- Pros:
  - smaller runtime surface now
- Cons:
  - weaker practical base for HARNESS-030/031
  - no live callable recovery-policy decision path

## Unified Plan
- Use Draft A
- Rationale:
  - HARNESS-018 + HARNESS-029 should become executable enough to guide later retry/rollback work, not remain doc-only
  - a read-only decision tool is still bounded and avoids widening into retry execution
- Implementation outline:
  1. Add a dedicated recovery-policy validator as RED
  2. Add machine-readable recovery policy JSON with:
     - failure classes
     - retry limits
     - provider-failure rules
     - escalation conditions
  3. Add an executable recovery-policy extension that:
     - classifies failures
     - computes retry eligibility
     - determines escalation need
     - surfaces stronger-model/provider-switch candidates from routing config
  4. Update docs/discoverability/static checks/CI
  5. Run validator to GREEN, then cheap gates and skeptical review

## Files to Modify
- `.pi/agent/extensions/recovery-policy.ts`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `scripts/check-repo-static.sh`
- `.github/workflows/ci.yml`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-04-20_harness-018-029-recovery-policy.md`
- `reports/planning/2026-04-20_harness-018-029-recovery-policy-plan.md`

## New Files
- `.pi/agent/recovery/recovery-policy.json`
- `scripts/validate-recovery-policy.sh`
- `reports/validation/2026-04-20_recovery-policy-validation-script.md`
- `reports/validation/2026-04-20_recovery-policy-validation-script.json`

## TDD Sequence
- 1. Add `scripts/validate-recovery-policy.sh` with expected behavior for the bounded recovery slice
- 2. Run it before the policy/extension exist or before behavior is implemented and confirm RED for the right reason
- 3. Add the smallest policy JSON and extension helpers needed to satisfy one failing check at a time
- 4. Update docs and discoverability once the behavior is stable
- 5. Re-run the validator until GREEN
- 6. Run fast local gates and skeptical review

## Test Coverage
- provider failure can be classified separately from generic model/tool failure
- retry eligibility honors retry limits and escalation conditions
- same-provider stronger-model candidate is found when available
- provider-switch candidate is found when same provider is exhausted or unavailable
- ambiguity and approval-gated cases escalate immediately
- validation or repo-state failures do not blindly allow retries
- extension compiles and tool registration is wired

## Acceptance Criteria
- machine-readable failure classes exist in repo policy
- provider-failure handling rules are machine-readable and deterministic
- an executable recovery-policy tool exists for classification + retry eligibility + escalation decision
- a dedicated validator exists and passes locally
- static checks and CI know about the recovery-policy validator
- docs clearly state this is a bounded slice that precedes HARNESS-030/031 execution logic

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| recovery policy | `.pi/agent/recovery/recovery-policy.json` | loaded by `.pi/agent/extensions/recovery-policy.ts` | helper-level validator reads and parses the policy successfully |
| executable recovery surface | `resolve_recovery_policy` tool | `.pi/agent/extensions/recovery-policy.ts` | validator compile check and optional live probe confirm tool wiring |
| operator discoverability | recovery docs / README / operator workflow | `.pi/agent/docs/*`, `README.md`, `scripts/check-repo-static.sh`, `.github/workflows/ci.yml` | readback and validator confirm references are present |

## Validation
- primary validator:
  - `./scripts/validate-recovery-policy.sh`
- supporting gates:
  - `./scripts/check-repo-static.sh`
  - `git diff --check`
  - `bash -n scripts/*.sh`
- save artifacts under:
  - `reports/validation/2026-04-20_recovery-policy-validation-script.md`
  - `reports/validation/2026-04-20_recovery-policy-validation-script.json`
- flake target:
  - 3 consecutive passing runs of the recovery-policy validator scope

## Risks
- classification inputs could widen if this slice tries to absorb full retry-execution or rollback semantics
- adding provider failure as a first-class machine-readable class may require careful doc wording to remain compatible with earlier prose
- live probe may be limited by provider availability and should remain optional

## Pi Log Update
- planning log: `reports/planning/2026-04-20_harness-018-029-recovery-policy-plan.md`
- coding log: `logs/coding/2026-04-20_harness-018-029-recovery-policy.md`
