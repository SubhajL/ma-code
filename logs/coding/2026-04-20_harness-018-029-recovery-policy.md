# Coding Log — harness-018-029-recovery-policy

- Date: 2026-04-20
- Scope: Implement a bounded HARNESS-018 + HARNESS-029 recovery-policy slice with machine-readable failure classes, provider-failure handling rules, and an executable classification/retry-eligibility/escalation surface.
- Status: in_progress
- Branch: `feat/harness-018-029-recovery-policy`
- Related planning log: `reports/planning/2026-04-20_harness-018-029-recovery-policy-plan.md`

## Task Group
- add machine-readable recovery policy
- add executable recovery-policy extension
- add dedicated recovery-policy validator
- update docs/discoverability/CI wiring

## Files Investigated
- `AGENTS.md`
- `README.md`
- `pi_harness_implementation_backlog_REPO_LOCAL.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/extensions/harness-routing.ts`
- `.pi/agent/extensions/team-activation.ts`
- `.pi/agent/prompts/roles/recovery_worker.md`
- `.pi/agent/prompts/templates/handoff-for-recovery.md`
- existing `scripts/validate-*.sh` patterns

## Files Changed
- none yet

## Runtime / Validation Evidence
- none yet

## Key Findings
- recovery semantics are currently architecture-doc level only
- routing config already contains enough provider/model fallback information to compute stronger-model and switch-provider candidates
- a read-only decision tool is sufficient for this bounded slice and avoids widening into retry execution

## Decisions Made
- keep HARNESS-018 + HARNESS-029 bounded to classification, retry eligibility, and escalation decision
- implement one policy JSON + one extension + one dedicated validator
- defer rollback execution and queue-aware retry execution to later HARNESS-030/031 work

## Known Risks
- classification inputs can sprawl if the slice absorbs too much future recovery logic
- provider-failure treatment must stay compatible with existing docs and prompts

## Current Outcome
- planning completed
- implementation in progress

## Next Action
- prepare skeptical self-review and merge flow after local validation evidence is recorded

## Work Summary (2026-04-20 18:33:13 +0700)

### Goal
- Implement a bounded recovery-policy slice that makes failure classification and provider-failure retry logic executable before HARNESS-030/031.

### What changed
- Added machine-readable recovery policy:
  - `.pi/agent/recovery/recovery-policy.json`
- Added executable recovery-policy tool and helpers:
  - `.pi/agent/extensions/recovery-policy.ts`
  - tool: `resolve_recovery_policy`
- Added dedicated validator:
  - `scripts/validate-recovery-policy.sh`
- Updated discoverability and CI wiring:
  - `scripts/check-repo-static.sh`
  - `.github/workflows/ci.yml`
  - `.pi/agent/docs/operator_workflow.md`
  - `.pi/agent/docs/file_map.md`
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/docs/validation_recovery_architecture.md`
  - `.pi/agent/prompts/roles/recovery_worker.md`
  - `README.md`
  - `logs/CURRENT.md`

### Tests added or changed
- Added recovery-policy validator checks for:
  - helper-level classification and retry eligibility resolution
  - extension compile success
  - optional live tool probe (skipped by default)
- Helper-level cases cover:
  - same-provider stronger-model retry for research provider failure
  - provider switch for backend provider outage
  - immediate escalation for ambiguity
  - same-lane retry for bounded validation failure
  - escalation when retry budget is exhausted

### RED command and key failure reason
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy && ./scripts/validate-recovery-policy.sh --report reports/validation/2026-04-20_recovery-policy-validation-script.md --summary-json reports/validation/2026-04-20_recovery-policy-validation-script.json`
- initial RED failure reason:
  - recovery-policy extension and policy files did not exist yet
- second RED failure reason after initial implementation:
  - TypeScript compile step rejected the local `.ts` import path until the validator compile command allowed TypeScript extension imports

### GREEN command
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy && ./scripts/validate-recovery-policy.sh --report reports/validation/2026-04-20_recovery-policy-validation-script.md --summary-json reports/validation/2026-04-20_recovery-policy-validation-script.json`
- result:
  - `Recovery-policy validation PASS`

### Other validation commands run
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy && ./scripts/validate-recovery-policy.sh --report /tmp/recovery-pass-2.md --summary-json /tmp/recovery-pass-2.json > /tmp/recovery-pass-2.log && tail -n 3 /tmp/recovery-pass-2.log`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy && ./scripts/validate-recovery-policy.sh --report /tmp/recovery-pass-3.md --summary-json /tmp/recovery-pass-3.json > /tmp/recovery-pass-3.log && tail -n 3 /tmp/recovery-pass-3.log`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy && ./scripts/check-repo-static.sh`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy && git diff --check`

### Wiring verification evidence
- `resolve_recovery_policy` is registered in `.pi/agent/extensions/recovery-policy.ts`
- `.pi/agent/recovery/recovery-policy.json` is loaded by the extension and required by static repo checks
- CI `Routing Validators` now runs `Run recovery-policy validator`
- operator workflow and README both point recovery-policy changes to `./scripts/validate-recovery-policy.sh`
- recovery worker prompt now prefers executable recovery-policy assessment when available

### Behavior changes and risk notes
- this slice adds recovery assessment only; it does not execute retries or rollback
- provider failure is now treated explicitly in the machine-readable recovery policy instead of being left implicit in prose
- live tool probe remains optional and skipped by default to respect validation-cost guardrails

### Follow-ups or known gaps
- HARNESS-030 still needs retry execution/runtime behavior
- HARNESS-031 still needs rollback execution and approval plumbing
- recovery decisions are advisory until later runtime layers consume them automatically

## Review (2026-04-20 18:33:13 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy`
- Branch: `feat/harness-018-029-recovery-policy`
- Scope: `working-tree`
- Commands Run:
  - `git diff --name-only`
  - `git diff --stat`
  - `git diff -- .pi/agent/extensions/recovery-policy.ts .pi/agent/recovery/recovery-policy.json scripts/validate-recovery-policy.sh scripts/check-repo-static.sh .github/workflows/ci.yml .pi/agent/docs/validation_recovery_architecture.md .pi/agent/docs/validation_architecture.md .pi/agent/docs/operator_workflow.md .pi/agent/docs/file_map.md README.md .pi/agent/prompts/roles/recovery_worker.md`
  - `./scripts/validate-recovery-policy.sh --report /tmp/recovery-review.md --summary-json /tmp/recovery-review.json`
  - `cat /tmp/recovery-review.json`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- the CI job name remains `Routing Validators` even though it now also includes a recovery-policy validator
  - Why it matters: the job label is broader than its original scope and may become increasingly misleading as more validators accumulate
  - Fix direction: consider renaming the bundle later if more non-routing validators are added
  - Validation still needed: none for this bounded slice

### Open Questions / Assumptions
- assumed provider failure should become an explicit machine-readable failure class for this bounded slice because HARNESS-018 otherwise remains prose-only
- assumed rollback recommendation/execution should remain outside this slice so HARNESS-031 still owns destructive unwind behavior

### Recommended Tests / Validation
- use `./scripts/validate-recovery-policy.sh` as the primary regression surface when changing recovery policy, provider-failure rules, or the executable recovery assessment tool
- add a separate HARNESS-030 validator later for retry execution rather than overloading the bounded recovery-policy validator

### Rollout Notes
- this slice gives later retry/rollback work a concrete machine-readable base without changing runtime task state directly
- recovery assessment is now executable and deterministic, but still advisory rather than autonomous execution

### Review Verdict
- no_required_fixes
