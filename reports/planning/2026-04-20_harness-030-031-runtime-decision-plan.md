# Planning Log — harness-030-031-runtime-decision

- Date: 2026-04-20
- Scope: Implement a bounded HARNESS-030 + HARNESS-031 runtime decision surface that turns existing recovery assessment into explicit retry/rollback/stop recommendations before HARNESS-032 queue execution.
- Status: ready
- Related coding log: `logs/coding/2026-04-20_harness-030-031-runtime-decision.md`

## Discovery Path
- Used `/skill:g-planning`
- Auggie-first attempt:
  - `auggie_discover`
  - result: timeout
  - fallback: local discovery with `read`, `rg`, and targeted file inspection
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `logs/CURRENT.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md` (`HARNESS-030`, `HARNESS-031`, `HARNESS-032`)
  - `.pi/agent/docs/validation_recovery_architecture.md`
  - `.pi/agent/docs/queue_semantics.md`
  - `.pi/agent/docs/task_schema_semantics.md`
  - `.pi/agent/extensions/recovery-policy.ts`
  - `.pi/agent/extensions/till-done.ts`
  - `.pi/agent/extensions/handoffs.ts`
  - `.pi/agent/prompts/roles/recovery_worker.md`
  - `scripts/validate-recovery-policy.sh`
  - `tests/extension-units/orchestration-helpers.test.ts`

## Goal
- Add one bounded executable runtime decision surface that:
  - reuses existing recovery-policy classification and retry eligibility
  - reuses task-state validation / retry evidence when available
  - returns explicit `retry_same_lane`, `retry_stronger_model`, `switch_provider`, `rollback`, `stop`, or `escalate` recommendations
  - makes rollback scope and approval requirements machine-readable
  - gives HARNESS-032 a non-blind decision input

## Non-Goals
- no HARNESS-032 queue runner or job execution loop
- no destructive rollback executor or git-history mutation
- no automatic task-state mutation after a decision
- no broad schema redesign outside the bounded recovery/runtime slice

## Assumptions
- advisory rollback recommendations satisfy HARNESS-031 for this bounded slice because destructive execution still requires human approval
- loading task-state evidence from `.pi/agent/state/runtime/tasks.json` is sufficient reuse of current runtime evidence before queue automation exists
- `retryCount` can be reused as the conservative total retry signal even though per-action retry history does not yet exist in task state

## Cross-Model Check
- `second_model_plan` fallback occurred because Anthropic credit was unavailable
- kept the main/current model plan explicitly

## Plan Draft A
- Extend `.pi/agent/recovery/recovery-policy.json` with bounded runtime-decision sections:
  - role-specific retry limits
  - provider retry limits
  - rollback triggers / scope / approval rules
  - stop conditions for autonomy-halting recommendations
- Add `.pi/agent/extensions/recovery-runtime.ts`:
  - load task state when `taskId` is provided
  - derive validation/evidence/retry context from task state
  - call existing `resolveRecoveryPolicy(...)`
  - resolve final runtime action among retry/rollback/stop/escalate
  - return machine-readable rollback recommendation details
  - register a tool such as `resolve_recovery_runtime_decision`
- Add dedicated unit coverage and dedicated validator coverage
- Update docs, prompts, CI, and repo-static wiring

## Plan Draft B
- Keep everything inside `.pi/agent/extensions/recovery-policy.ts`
- Add one larger helper that mixes assessment and runtime-decision logic
- Reuse the existing recovery-policy validator with extra checks
- Minimize docs to README + validation architecture + prompt touch-ups only

## Unified Plan
- Prefer Draft A
- Why:
  - smaller conceptual layering: policy assessment stays separate from runtime decisioning
  - easier HARNESS-032 reuse because the queue runner can call one dedicated runtime-decision tool
  - avoids overloading the existing recovery-policy validator; earlier logs explicitly suggested a separate HARNESS-030 validator later
- Implementation shape:
  1. Add RED tests first for a new runtime decision helper/tool
  2. Implement a separate `recovery-runtime.ts` that composes existing recovery-policy logic with task-state evidence + rollback/stop rules
  3. Extend `recovery-policy.json` only as much as needed for role/provider retry limits and rollback/stop policy
  4. Wire docs/CI/static checks after helper behavior is passing

## Files to Modify
- `.pi/agent/recovery/recovery-policy.json`
- `README.md`
- `.github/workflows/ci.yml`
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/prompts/roles/recovery_worker.md`
- `logs/CURRENT.md`

## New Files
- `.pi/agent/extensions/recovery-runtime.ts`
- `scripts/validate-recovery-runtime.sh`
- `tests/extension-units/recovery-runtime.test.ts`
- `reports/validation/2026-04-20_recovery-runtime-validation-script.md`
- `reports/validation/2026-04-20_recovery-runtime-validation-script.json`
- `logs/coding/2026-04-20_harness-030-031-runtime-decision.md`

## TDD Sequence
1. Add unit tests for the pure runtime decision helper:
   - retry remains allowed on first bounded validation failure
   - rollback is recommended after repeated validation failure
   - rollback is recommended for unsafe/conflicted repo state with explicit bounded scope
   - stop is recommended when automation must halt pending approval/ambiguity/tool unreliability
   - task-state-derived retry/validation evidence changes the decision without bespoke queue state
2. Add a dedicated runtime-decision validator script with helper-level expectations and compile checks
3. Run the new unit scope and validator scope; confirm RED for the expected missing helper/tool/policy reasons
4. Implement the smallest helper + policy additions to make the first failing case pass
5. Register the runtime decision tool and add task-state loading / wiring
6. Refactor minimally for readability
7. Run fast gates again, then repeat until all cases pass
8. Run the changed validator scope 3 consecutive times

## Test Coverage
- extension unit tests for pure runtime decision helper behavior
- dedicated runtime-decision validator for:
  - helper-level deterministic cases
  - TypeScript compile of the new extension surface
  - optional bounded live tool probe
- existing recovery-policy validator should still pass to guard backward compatibility of the assessment layer

## Acceptance Criteria
- a callable runtime-decision tool exists that returns one of: `retry_same_lane`, `retry_stronger_model`, `switch_provider`, `rollback`, `stop`, `escalate`
- the runtime-decision surface reuses existing recovery assessment plus task-state validation / retry evidence when available
- role-specific retry limits and provider-specific retry limits are machine-readable and influence the decision
- rollback recommendation includes bounded scope plus approval requirement / reason
- ambiguous / approval-blocked / unreliable situations can produce a non-retrying halt recommendation so HARNESS-032 does not loop blindly
- dedicated validator evidence exists and is wired into local static checks and CI

## Wiring Checks
| Component | Runtime entry point | Registration / data source | Wiring proof |
|---|---|---|---|
| runtime decision helper | pure exported helper in `.pi/agent/extensions/recovery-runtime.ts` | imported by unit tests + validator runtime harness | helper tests and validator helper checks pass |
| runtime decision tool | `resolve_recovery_runtime_decision` tool | registered in `.pi/agent/extensions/recovery-runtime.ts` | compile check and optional live probe succeed |
| recovery decision policy extensions | `.pi/agent/recovery/recovery-policy.json` | loaded by `recovery-policy.ts` and consumed by `recovery-runtime.ts` | helper/validator cases reflect role/provider/rollback policy |
| task evidence reuse | `.pi/agent/state/runtime/tasks.json` | loaded by `recovery-runtime.ts` when `taskId` is supplied | validator case proves derived retry/validation/evidence context |
| CI / local validation | `scripts/validate-recovery-runtime.sh` | `scripts/check-repo-static.sh` and `.github/workflows/ci.yml` | static check + workflow diff show the validator is wired |

## Validation
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && node --test tests/extension-units/recovery-runtime.test.ts`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-recovery-runtime.sh --report reports/validation/2026-04-20_recovery-runtime-validation-script.md --summary-json reports/validation/2026-04-20_recovery-runtime-validation-script.json`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-recovery-policy.sh`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-extension-unit-tests.sh`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/check-repo-static.sh`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && git diff --check`

## Risks
- overfitting the runtime decision surface to future queue concerns could widen scope; keep it recommendation-only
- current task state only stores total retry count, not per-action retry history; role/provider action-specific counts may need explicit inputs until queue telemetry exists
- rollback recommendation semantics must stay advisory so the implementation does not cross the human-approval boundary

## Pi Log Update
- planning log: `reports/planning/2026-04-20_harness-030-031-runtime-decision-plan.md`
- coding log: `logs/coding/2026-04-20_harness-030-031-runtime-decision.md`
