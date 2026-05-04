# Graphify Mandatory Policy

## Work Summary (2026-05-04 local) - setup and discovery

### Goal
- Implement Phase 3: add policy-gated mandatory Graphify validation values while keeping default behavior scoped and optional for non-Graphify work.

### Discovery Path
- Read `AGENTS.md`, `README.md`, and `logs/CURRENT.md`.
- Used `auggie_discover` first; it returned out-of-credits and recommended local fallback.
- Local fallback used targeted reads of `graphify-validation-decision.ts`, `graphify-validation-decision.test.ts`, `till-done.ts`, and `till-done.test.ts`.

### TDD Plan
- RED: add policy tests proving `required_for_architecture_review` should block architecture-review Graphify claims without proof but currently does not.
- GREEN: add policy values and scoped policy logic to the pure helper, then expose policy/claim-scope through `task_update action=validate`.
- Validate that `optional_default` remains non-blocking for non-scoped claims and mandatory policies block only their scoped claim types.

### Current Risks / Notes
- Must preserve Phase 2 enforcement for acceptance explicitly labeled `Graphify-backed`.
- Must not make Graphify globally mandatory for all validation tasks.
- Must not mutate protected live runtime JSON directly.

## Work Summary (2026-05-04 local) - RED policy tests

### Goal
- Add policy tests before implementation.

### Files Changed and Why
- `tests/extension-units/graphify-validation-decision.test.ts`: added policy tests for `optional_default`, `required_for_architecture_review`, scoped non-blocking, and `disabled`.
- `tests/extension-units/till-done.test.ts`: added runtime policy test showing `required_for_architecture_review` should block only architecture-review scope.
- `logs/CURRENT.md` and this coding log: moved active evidence pointer to this slice.

### RED Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase3-red-ext.md --summary-json /tmp/phase3-red-ext.json` failed as expected:
  - Graphify decision tests failed because `result.policy` was undefined and `required_for_architecture_review` returned `optional_skipped` instead of `blocked`.
  - till-done runtime test failed because architecture-review mandatory policy incorrectly returned `Validation passed for <taskId>`.

### GREEN Evidence
- pending

### Wiring Verification
- pending implementation.

### Risk Notes
- none

## Work Summary (2026-05-04 local) - GREEN policy implementation

### Goal
- Implement scoped Graphify mandatory policy while keeping default behavior optional and preserving Phase 2 Graphify-backed acceptance enforcement.

### Files Changed and Why
- `.pi/agent/extensions/graphify-validation-decision.ts`: added `GRAPHIFY_VALIDATION_POLICIES`, `GraphifyValidationPolicy`, `GraphifyClaimScope`, policy-aware required logic, and policy/scope fields in decision output.
- `.pi/agent/extensions/till-done.ts`: added schema support for `graphifyValidation.policy` and `graphifyValidation.claimScope`, and passes policy/scope into the helper.
- `tests/extension-units/graphify-validation-decision.test.ts`: added pure policy tests.
- `tests/extension-units/till-done.test.ts`: added runtime policy test proving architecture-review mandatory policy blocks only architecture scope.
- `logs/CURRENT.md` and this coding log: captured active slice evidence.

### Tests Added or Changed
- Added policy tests for:
  - `optional_default`
  - `required_for_architecture_review`
  - scoped non-blocking for non-architecture claims
  - `disabled`
- Added runtime test for `required_for_architecture_review` scoped blocking.

### RED Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase3-red-ext.md --summary-json /tmp/phase3-red-ext.json` failed before implementation because mandatory policy did not block missing Graphify proof.

### GREEN Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase3-green-ext.md --summary-json /tmp/phase3-green-ext.json` passed with `Extension unit-test validation PASS`.
- Flake check: 3 consecutive extension-unit validator runs passed: `/tmp/phase3-green-ext.*`, `/tmp/phase3-flake1-ext.*`, and `/tmp/phase3-flake2-ext.*`.

### Other Validation Commands
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-graphify-discovery.sh --report /tmp/phase3-graphify.md --summary-json /tmp/phase3-graphify.json` passed with `graphify-discovery-validation: PASS`.
- `bash scripts/validate-core-workflows.sh --report /tmp/phase3-core.md --summary-json /tmp/phase3-core.json` passed with `core-workflows-validation: PASS`.
- `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/phase3-queue.md --summary-json /tmp/phase3-queue.json` passed with `Queue-runner validation PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- `task_update action=validate` accepts policy values via `graphifyValidation.policy` and scoped claim types via `graphifyValidation.claimScope`.
- The pure helper returns `policy` and `claimScope` in decision details for auditability.
- Mandatory policies are scoped by helper logic rather than enforced globally.

### Behavior Changes and Risk Notes
- `optional_default` remains the default policy.
- `required_for_graphify_backed_claims` requires Graphify proof only for Graphify-backed/architecture scopes.
- `required_for_architecture_review` requires Graphify proof only for architecture-review scope.
- `disabled` keeps Graphify validation non-blocking.
- Existing explicit `Graphify-backed` acceptance remains required unless explicitly disabled by policy.

## Work Summary (2026-05-04 local) - static guard and final gates

### Goal
- Add static guard coverage for the new policy constants and rerun final gates.

### Files Changed and Why
- `scripts/check-repo-static.sh`: now reads `.pi/agent/extensions/graphify-validation-decision.ts` and asserts the policy values/types remain present.
- `tests/extension-units/graphify-validation-decision.test.ts`: tightened the policy exposure test to assert all policy values via `GRAPHIFY_VALIDATION_POLICIES`.

### RED Evidence
- Same RED applies: extension-unit validator failed before policy implementation because mandatory policy did not block missing proof.

### GREEN Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase3-final-ext.md --summary-json /tmp/phase3-final-ext.json` passed with `Extension unit-test validation PASS`.

### Other Validation Commands
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-graphify-discovery.sh --report /tmp/phase3-final-graphify.md --summary-json /tmp/phase3-final-graphify.json` passed with `graphify-discovery-validation: PASS`.
- `bash scripts/validate-core-workflows.sh --report /tmp/phase3-final-core.md --summary-json /tmp/phase3-final-core.json` passed with `core-workflows-validation: PASS`.
- `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/phase3-final-queue.md --summary-json /tmp/phase3-final-queue.json` passed with `Queue-runner validation PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- Static checker now guards policy values/types in the pure helper.

### Behavior Changes and Risk Notes
- none

## QCHECK (2026-05-04 local) - skeptical self-review

### Reviewed
- Working-tree diff for Graphify decision helper, till-done schema/runtime, unit tests, static checks, and Pi logs.
- Validation outputs from extension-unit, foundation compile, Graphify discovery, core workflows, queue-runner, static checks, and diff check.

### Findings
- Underimplementation: no issue found; all four policy values exist and policy-required behavior is scoped.
- Missing tests: no issue found; pure helper and runtime tests cover mandatory architecture policy and non-scoped non-blocking behavior.
- Wiring gaps: no issue found; till-done schema accepts policy/scope and validators compile/load the helper from prior phases.
- Risky defaults: no issue found; `optional_default` remains default and `disabled` remains non-blocking.

### Fixes Made After QCHECK
- Added static guard for policy values/types.
- Tightened policy exposure unit test to assert all supported policy values.

## Review (2026-05-04 local) - working-tree diff

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777868052376-graphify-mandatory-policy`
- Branch: `split/task-1777868052376-graphify-mandatory-policy`
- Scope: working-tree diff
- Commands Run: `git diff --name-status`; `git diff --stat`; targeted `git diff -- .pi/agent/extensions/graphify-validation-decision.ts .pi/agent/extensions/till-done.ts tests/extension-units/graphify-validation-decision.test.ts tests/extension-units/till-done.test.ts logs/CURRENT.md`; `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase3-final-ext.md --summary-json /tmp/phase3-final-ext.json`; `bash scripts/check-foundation-extension-compile.sh`; `bash scripts/validate-graphify-discovery.sh --report /tmp/phase3-final-graphify.md --summary-json /tmp/phase3-final-graphify.json`; `bash scripts/validate-core-workflows.sh --report /tmp/phase3-final-core.md --summary-json /tmp/phase3-final-core.json`; `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/phase3-final-queue.md --summary-json /tmp/phase3-final-queue.json`; `bash scripts/check-repo-static.sh`; `git diff --check`

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
- Assumption: `disabled` is intended as an explicit non-blocking mode, including when Graphify validation data is supplied.
- Assumption: Phase 3 does not require persisted task JSON schema changes beyond existing validation evidence/details.

### Recommended Tests / Validation
- Already run: extension-unit validator with 3 consecutive passes, foundation compile, Graphify discovery validator, core workflows validator, queue-runner validator, repo static checks, and diff whitespace check.

### Rollout Notes
- Operators can pass `graphifyValidation.policy` and `graphifyValidation.claimScope` through `task_update action=validate` to enforce scoped mandatory Graphify proof.

Review Verdict: no_required_fixes
