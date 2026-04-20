# Coding Log — harness-037-extension-unit-tests

- Date: 2026-04-20
- Scope: Implement bounded HARNESS-037 extension unit tests for safety/task-discipline runtime controls and practical orchestration helpers.
- Status: in_progress
- Branch: `feat/harness-037-extension-unit-tests`
- Related planning log: `reports/planning/2026-04-20_harness-037-extension-unit-tests-plan.md`

## Task Group
- add extension unit tests for `safe-bash.ts`
- add extension unit tests for `till-done.ts`
- add practical helper-level tests for routing/team/packet/handoff extensions
- add dedicated validator script and wire it into repo checks

## Files Investigated
- `AGENTS.md`
- `README.md`
- `pi_harness_implementation_backlog_REPO_LOCAL.md`
- `.pi/agent/extensions/safe-bash.ts`
- `.pi/agent/extensions/till-done.ts`
- `.pi/agent/extensions/harness-routing.ts`
- `.pi/agent/extensions/team-activation.ts`
- `.pi/agent/extensions/task-packets.ts`
- `.pi/agent/extensions/handoffs.ts`
- `scripts/check-foundation-extension-compile.sh`
- existing `scripts/validate-*.sh` patterns

## Files Changed
- none yet

## Runtime / Validation Evidence
- none yet

## Key Findings
- helper-level pure functions already exist for routing/team/packet/handoff extensions
- `safe-bash.ts` and `till-done.ts` need runtime-behavior tests via fake extension registration rather than only pure helper assertions
- the repo does not currently have a permanent root Node test workspace, so a temp-workspace validator script fits the existing pattern best

## Decisions Made
- keep HARNESS-037 bounded to extension unit tests, not full workflow integration tests
- prefer a validator-style script plus committed tests over introducing a broad root `package.json` test setup

## Known Risks
- fake `ExtensionAPI` scaffolding must be realistic enough to test runtime behavior meaningfully
- need to avoid widening into HARNESS-038 integration coverage

## Current Outcome
- planning completed
- implementation in progress

## Next Action
- prepare skeptical self-review and merge flow after local validation evidence is recorded

## Work Summary (2026-04-20 16:52:18 +0700)

### Goal
- Add bounded HARNESS-037 unit tests for extension behavior before queue/recovery runtime expands.

### What changed
- Added validator-style unit-test runner:
  - `scripts/validate-extension-unit-tests.sh`
- Added committed extension unit tests:
  - `tests/extension-units/safe-bash.test.ts`
  - `tests/extension-units/till-done.test.ts`
  - `tests/extension-units/orchestration-helpers.test.ts`
  - `tests/extension-units/test-utils.ts`
- Wired the new validator into:
  - `scripts/check-repo-static.sh`
  - `.github/workflows/ci.yml`
  - `.pi/agent/docs/operator_workflow.md`
  - `.pi/agent/docs/file_map.md`
  - `README.md`
- Updated active log pointer:
  - `logs/CURRENT.md`

### Tests added or changed
- safe-bash unit tests cover:
  - protected write blocked
  - hard-dangerous bash command blocked
  - warn-level non-interactive block
  - safe non-mutating allow path
- till-done unit tests cover:
  - mutation blocked without active runnable task
  - implementation task done blocked without validation
  - docs task lighter review validation path
  - mutation allow path while active task exists
- orchestration helper tests cover:
  - routing resolution
  - team activation
  - task packet generation
  - handoff generation and preservation

### RED command and key failure reason
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests && ./scripts/validate-extension-unit-tests.sh --report reports/validation/2026-04-20_extension-unit-tests-validation-script.md --summary-json reports/validation/2026-04-20_extension-unit-tests-validation-script.json`
- initial RED failure reason:
  - validator failed because `tests/extension-units/*.ts` did not exist yet
- second RED failure reason after tests were added:
  - orchestration helper unit test expected a longer planning/build/quality sequence than the actual activation policy returns for ambiguous mixed work

### GREEN command
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests && ./scripts/validate-extension-unit-tests.sh --report reports/validation/2026-04-20_extension-unit-tests-validation-script.md --summary-json reports/validation/2026-04-20_extension-unit-tests-validation-script.json`
- result:
  - `Extension unit-test validation PASS`

### Other validation commands run
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests && ./scripts/validate-extension-unit-tests.sh > /tmp/extension-unit-pass-2.log && tail -n 3 /tmp/extension-unit-pass-2.log`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests && ./scripts/validate-extension-unit-tests.sh > /tmp/extension-unit-pass-3.log && tail -n 3 /tmp/extension-unit-pass-3.log`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests && ./scripts/check-repo-static.sh`
- `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests && git diff --check`

### Wiring verification evidence
- validator entry point exists at `scripts/validate-extension-unit-tests.sh`
- CI now has a dedicated `Extension Unit Tests` job that runs the validator
- static checks now require:
  - `scripts/validate-extension-unit-tests.sh`
  - `tests/extension-units/safe-bash.test.ts`
  - `tests/extension-units/till-done.test.ts`
  - `tests/extension-units/orchestration-helpers.test.ts`
  - `tests/extension-units/test-utils.ts`
- operator workflow and README now point users to `./scripts/validate-extension-unit-tests.sh`

### Behavior changes and risk notes
- no extension runtime behavior changed; this slice adds regression coverage and validation wiring only
- current unit-test suite is intentionally bounded and does not attempt HARNESS-038 end-to-end flow coverage

### Follow-ups or known gaps
- HARNESS-038 still needs true end-to-end integration coverage across multi-step harness flows
- if extension count keeps growing, a future dedicated root test workspace may become worthwhile, but it is not required for this bounded slice

## Review (2026-04-20 16:53:07 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests`
- Branch: `feat/harness-037-extension-unit-tests`
- Scope: `working-tree`
- Commands Run:
  - `git diff --name-only`
  - `git diff --stat`
  - `git diff -- .github/workflows/ci.yml scripts/check-repo-static.sh scripts/validate-extension-unit-tests.sh tests/extension-units .pi/agent/docs/operator_workflow.md .pi/agent/docs/file_map.md README.md`
  - `./scripts/validate-extension-unit-tests.sh --report /tmp/extension-review.md --summary-json /tmp/extension-review.json`
  - `cat /tmp/extension-review.json`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- the validator script installs a temporary npm workspace on each run instead of using a persistent local test workspace
  - Why it matters: repeated local runs are a little slower than a permanent root Node test setup
  - Fix direction: if the extension suite expands substantially, consider a later dedicated repo test workspace
  - Validation still needed: none for the bounded HARNESS-037 slice

### Open Questions / Assumptions
- assumed a temp-workspace validator is preferable to introducing a broad root package manager surface at this stage
- assumed helper-level tests for routing/team/packet/handoff satisfy the “where practical” request without claiming HARNESS-038 integration coverage

### Recommended Tests / Validation
- use `./scripts/validate-extension-unit-tests.sh` as the primary regression surface when touching `safe-bash.ts`, `till-done.ts`, or shared helper logic in orchestration extensions
- add separate HARNESS-038 integration validators later rather than overloading the unit-test suite

### Rollout Notes
- this slice raises confidence in extension behavior before queue/recovery runtime work, but does not change runtime semantics by itself
- CI now enforces the extension unit-test suite on PRs and main pushes

### Review Verdict
- no_required_fixes
