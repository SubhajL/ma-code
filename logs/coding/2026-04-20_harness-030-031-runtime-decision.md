# Coding Log — harness-030-031-runtime-decision

- Date: 2026-04-20
- Scope: Implement a bounded HARNESS-030 + HARNESS-031 runtime decision surface with explicit retry/rollback/stop recommendations before HARNESS-032 queue execution.
- Status: in_progress
- Branch: `feat/harness-030-031-runtime-decision`
- Related planning log: `reports/planning/2026-04-20_harness-030-031-runtime-decision-plan.md`

## Task Group
- add bounded runtime recovery-decision extension
- extend recovery policy with retry/rollback/stop rules needed for runtime decisions
- add dedicated validator and unit tests
- update docs/discoverability/CI wiring

## Files Investigated
- `AGENTS.md`
- `README.md`
- `logs/CURRENT.md`
- `pi_harness_implementation_backlog_REPO_LOCAL.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/task_schema_semantics.md`
- `.pi/agent/extensions/recovery-policy.ts`
- `.pi/agent/extensions/till-done.ts`
- `.pi/agent/extensions/handoffs.ts`
- `.pi/agent/prompts/roles/recovery_worker.md`
- `scripts/validate-recovery-policy.sh`
- `tests/extension-units/orchestration-helpers.test.ts`

## Files Changed
- none yet

## Runtime / Validation Evidence
- none yet

## Key Findings
- existing HARNESS-018/029 work stops at advisory classification/retry eligibility and explicitly deferred runtime decisioning
- task-state `retryCount` and `validation` fields already exist and can be reused as bounded runtime evidence
- handoffs and recovery prompts already speak in terms of retry / rollback / stop, so one dedicated runtime decision tool is the smallest executable missing layer

## Decisions Made
- keep HARNESS-030 + HARNESS-031 bounded to recommendation logic, not execution
- add a separate `recovery-runtime.ts` layer rather than overloading `recovery-policy.ts`
- add a dedicated runtime-decision validator instead of folding everything into `validate-recovery-policy.sh`

## Known Risks
- current task state only tracks total retry count, so action-specific retry counts may need optional caller input
- rollback recommendations must remain advisory to stay inside approval boundaries

## Current Outcome
- planning completed
- implementation not started yet

## Next Action
- prepare skeptical self-review and merge flow after local validation evidence is recorded

## Work Summary (2026-04-20 19:10:00 +0700)

### Goal
- Implement a bounded HARNESS-030 + HARNESS-031 runtime decision surface so recovery can return explicit retry / rollback / stop recommendations before HARNESS-032 queue execution.

### What changed
- Added bounded runtime decision extension and tool:
  - `.pi/agent/extensions/recovery-runtime.ts`
  - tool: `resolve_recovery_runtime_decision`
- Extended machine-readable recovery policy with runtime-decision fields:
  - `.pi/agent/recovery/recovery-policy.json`
  - `.pi/agent/extensions/recovery-policy.ts`
- Added recovery runtime test / validator coverage:
  - `tests/extension-units/recovery-runtime.test.ts`
  - `scripts/validate-recovery-runtime.sh`
  - `reports/validation/2026-04-20_recovery-runtime-validation-script.md`
  - `reports/validation/2026-04-20_recovery-runtime-validation-script.json`
- Updated validation/runtime wiring and discoverability:
  - `scripts/validate-extension-unit-tests.sh`
  - `scripts/check-repo-static.sh`
  - `.github/workflows/ci.yml`
  - `README.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/docs/validation_recovery_architecture.md`
  - `.pi/agent/docs/file_map.md`
  - `.pi/agent/prompts/roles/recovery_worker.md`
  - `logs/CURRENT.md`

### Tests added or changed
- Added extension-unit coverage for:
  - first validation failure => retry same lane
  - repeated validation failure => rollback recommendation
  - stricter validator-worker retry rules
  - provider-specific retry limits forcing provider switch
  - approval-required condition => stop recommendation
  - taskId-based runtime evidence reuse
- Added dedicated recovery-runtime validator checks for:
  - helper-level deterministic runtime decisions
  - TypeScript compile of `recovery-runtime.ts`
  - optional live tool probe for `resolve_recovery_runtime_decision`

### RED command and key failure reason
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-recovery-runtime.sh --report reports/validation/2026-04-20_recovery-runtime-validation-script.md --summary-json reports/validation/2026-04-20_recovery-runtime-validation-script.json`
- initial RED failure reason:
  - `.pi/agent/extensions/recovery-runtime.ts` did not exist yet
- second RED failure reason after the first implementation pass:
  - validator helper fixture paths were wrong and `recovery-policy.ts` needed explicit parsing for the new `rollback_policy.scope_by_reason` object

### GREEN command
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-recovery-runtime.sh --report reports/validation/2026-04-20_recovery-runtime-validation-script.md --summary-json reports/validation/2026-04-20_recovery-runtime-validation-script.json`
- result:
  - `Recovery-runtime validation PASS`

### Other validation commands run
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-recovery-runtime.sh --report /tmp/recovery-runtime-pass-2.md --summary-json /tmp/recovery-runtime-pass-2.json > /tmp/recovery-runtime-pass-2.log && tail -n 3 /tmp/recovery-runtime-pass-2.log && ./scripts/validate-recovery-runtime.sh --report /tmp/recovery-runtime-pass-3.md --summary-json /tmp/recovery-runtime-pass-3.json > /tmp/recovery-runtime-pass-3.log && tail -n 3 /tmp/recovery-runtime-pass-3.log`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-recovery-policy.sh --report /tmp/recovery-policy-final.md --summary-json /tmp/recovery-policy-final.json`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/validate-extension-unit-tests.sh --report /tmp/extension-unit-final.md --summary-json /tmp/extension-unit-final.json`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && ./scripts/check-repo-static.sh`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision && git diff --check`

### Wiring verification evidence
- `resolve_recovery_runtime_decision` is registered in `.pi/agent/extensions/recovery-runtime.ts`
- the tool loads `.pi/agent/recovery/recovery-policy.json` through `loadRecoveryPolicy(...)` and task evidence from `.pi/agent/state/runtime/tasks.json` when `taskId` is supplied
- extension-unit coverage now copies both `recovery-policy.ts` and `recovery-runtime.ts`, plus recovery policy JSON, so helper tests run in the temp runtime
- CI `Routing Validators` now runs `Run recovery-runtime validator`
- operator workflow, README, validation architecture, and recovery-worker prompt now point to the new runtime decision surface

### Behavior changes and risk notes
- recovery no longer stops at advisory retry eligibility; it can now return explicit retry, rollback, stop, or escalate recommendations in one machine-readable result
- rollback remains recommendation-only and does not execute destructive repo mutations
- provider-specific retry counts are still caller-supplied because current task state only stores total `retryCount`
- live tool probe stays optional and skipped by default to respect validation-cost guardrails

### Follow-ups or known gaps
- HARNESS-032 still needs queue execution to consume this runtime decision surface automatically
- rollback execution / approval plumbing still stops at bounded recommendation rather than performing git operations
- per-action retry telemetry is still thinner than total `retryCount`, so later queue/runtime work may want richer counters

## Review (2026-04-20 19:14:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/harness-030-031-runtime-decision`
- Branch: `feat/harness-030-031-runtime-decision`
- Scope: `working-tree`
- Commands Run:
  - `git diff --name-only`
  - `git diff --stat`
  - `git diff -- .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/recovery/recovery-policy.json tests/extension-units/recovery-runtime.test.ts scripts/validate-recovery-runtime.sh scripts/validate-extension-unit-tests.sh scripts/check-repo-static.sh .github/workflows/ci.yml README.md .pi/agent/docs/operator_workflow.md .pi/agent/docs/validation_architecture.md .pi/agent/docs/validation_recovery_architecture.md .pi/agent/docs/file_map.md .pi/agent/prompts/roles/recovery_worker.md`
  - `./scripts/validate-extension-unit-tests.sh --report /tmp/extension-unit-final.md --summary-json /tmp/extension-unit-final.json`
  - `./scripts/validate-recovery-policy.sh --report /tmp/recovery-policy-final.md --summary-json /tmp/recovery-policy-final.json`
  - `./scripts/validate-recovery-runtime.sh --report /tmp/recovery-runtime-final.md --summary-json /tmp/recovery-runtime-final.json`
  - `./scripts/check-repo-static.sh`
  - `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- assumed role-specific limits can live in the shared recovery policy JSON without creating a separate runtime policy file
- assumed stopping autonomy on approval-required / ambiguity / unreliable-tool cases is the right pre-queue interpretation of “prevent blind loops”

### Recommended Tests / Validation
- keep `./scripts/validate-recovery-runtime.sh` as the primary regression surface for retry / rollback / stop runtime decisions
- keep `./scripts/validate-recovery-policy.sh` in the loop when changing shared recovery classification or provider-failure rules
- keep `./scripts/validate-extension-unit-tests.sh` for helper-level regression coverage around recovery runtime helpers

### Rollout Notes
- this slice is recommendation-only, so queue/runtime layers can adopt it without immediately crossing destructive rollback boundaries
- later HARNESS-032/031 work should consume this machine-readable decision surface rather than re-deriving retry or stop behavior ad hoc

### Review Verdict
- no_required_fixes
