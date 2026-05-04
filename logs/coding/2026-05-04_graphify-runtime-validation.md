# Graphify Runtime Validation Integration

## Work Summary (2026-05-04 local) - setup and discovery

### Goal
- Implement Phase 2: wire the pure Graphify validation decision helper into runtime task validation/completion flow.
- Confirm existing broad-purpose enforcement for Graphify adapter preflight/scan remains covered.

### Discovery Path
- Read `AGENTS.md`, `README.md`, and `logs/CURRENT.md`.
- Used `auggie_discover` first; it returned out-of-credits and recommended local fallback.
- Local fallback used targeted reads and `rg` for `graphify-adapter.ts`, `graphify-adapter.test.ts`, `till-done.ts`, `till-done.test.ts`, and task schema references.
- Discovery confirmed broad-purpose enforcement is already present in `graphify-adapter.ts` and covered by `graphify-adapter.test.ts` for missing purpose, invalid `exact_verification`, and valid broad purposes.

### TDD Plan
- RED: add a `till-done` unit test proving a task with Graphify-backed acceptance cannot validate as pass without graph/freshness proof and source-verification proof.
- GREEN: import and call the pure `decideGraphifyValidation` helper from `till-done.ts` during `validate` pass handling; add a `graphifyValidation` validation parameter for explicit proof.
- Behavior left out of scope: changing task schemas or storing a dedicated runtime state-machine object in live task JSON.

### Current Risks / Notes
- Must not directly edit protected live runtime JSON; use tool/schema/runtime code only.
- Should not make Graphify globally mandatory; enforcement should apply only when Graphify-backed acceptance is detected or explicit Graphify validation input is supplied.

## Work Summary (2026-05-04 local) - RED runtime validation tests

### Goal
- Add runtime validation tests before changing `till-done.ts`.

### Files Changed and Why
- `tests/extension-units/till-done.test.ts`: added tests proving Graphify-backed acceptance cannot validate as pass without Graphify proof and can validate as pass when freshness/query plus source-verification proof is supplied.
- `logs/CURRENT.md` and this coding log: moved active evidence pointer to this slice.

### Tests Added or Changed
- Added `Graphify-backed acceptance cannot validate pass without graph freshness/query and source verification proof`.
- Added `Graphify-backed acceptance validates pass with freshness or query proof and source verification`.

### RED Evidence
- Direct `npx --yes tsx --test tests/extension-units/till-done.test.ts` was not a valid RED because root dependencies are not installed in this worktree; it failed with missing `@mariozechner/pi-coding-agent` before reaching behavior.
- Valid RED: `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase2-red-ext.md --summary-json /tmp/phase2-red-ext.json` failed in the isolated runtime with till-done behavior failures:
  - Missing-proof case incorrectly returned `Validation passed for <taskId>` instead of blocking with `Graphify-backed acceptance cannot pass`.
  - Proof-present case had no `details.graphifyValidation` state because runtime integration did not exist yet.

### GREEN Evidence
- pending

### Wiring Verification
- pending implementation.

### Risk Notes
- none

## Work Summary (2026-05-04 local) - GREEN runtime integration

### Goal
- Wire the pure Graphify validation decision helper into `task_update action=validate` while preserving existing task/evidence semantics.

### Files Changed and Why
- `.pi/agent/extensions/till-done.ts`: added optional `graphifyValidation` validation input, Graphify-backed acceptance detection, decision-helper invocation, validation-pass blocking on missing required Graphify proof, and evidence recording through `task.evidence`.
- `tests/extension-units/till-done.test.ts`: added runtime validation tests for missing-proof block and proof-present pass.
- `logs/CURRENT.md` and this coding log: captured evidence for this slice.

### Tests Added or Changed
- Added `Graphify-backed acceptance cannot validate pass without graph freshness/query and source verification proof`.
- Added `Graphify-backed acceptance validates pass with freshness or query proof and source verification`.

### RED Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase2-red-ext.md --summary-json /tmp/phase2-red-ext.json` failed before implementation because missing-proof Graphify-backed acceptance incorrectly returned `Validation passed for <taskId>`, and proof-present validation had no `details.graphifyValidation` state.

### GREEN Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase2-green-ext.md --summary-json /tmp/phase2-green-ext.json` passed with `Extension unit-test validation PASS`.
- Flake check: 3 consecutive extension-unit validator runs passed: `/tmp/phase2-green-ext.*`, `/tmp/phase2-flake1-ext.*`, and `/tmp/phase2-flake2-ext.*`.

### Other Validation Commands
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-graphify-discovery.sh --report /tmp/phase2-graphify.md --summary-json /tmp/phase2-graphify.json` passed with `graphify-discovery-validation: PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- `till-done.ts` imports `decideGraphifyValidation` from `./graphify-validation-decision.ts`.
- `task_update` validate schema accepts optional `graphifyValidation` proof fields.
- Validation pass attempts for Graphify-backed acceptance auto-require Graphify proof even if the caller omits `graphifyValidation`.
- Passing Graphify validation stores `Graphify validation decision: <state>; <reason>` in existing task evidence.

### Behavior Changes and Risk Notes
- Graphify is not globally mandatory; tasks without Graphify-backed acceptance remain unaffected.
- Graphify-backed acceptance is detected from acceptance text containing `Graphify-backed` or `Graphify backed`.
- Known gap: this does not add a dedicated persisted Graphify state field to task JSON; it records through existing validation details and evidence mechanisms as requested.

## Work Summary (2026-05-04 local) - core workflow wiring fix and final gates

### Goal
- Ensure broader core workflow validation can load the new `till-done.ts` import of `graphify-validation-decision.ts`.

### Files Changed and Why
- `scripts/validate-core-workflows.sh`: copies and compiles `.pi/agent/extensions/graphify-validation-decision.ts` in the isolated core workflow runtime because `till-done.ts` now imports it.

### RED Evidence
- `bash scripts/validate-core-workflows.sh --report /tmp/phase2-core.md --summary-json /tmp/phase2-core.json` failed after initial runtime integration because the isolated core workflow runtime did not copy `graphify-validation-decision.ts`; compile and integration checks failed with `Cannot find module './graphify-validation-decision.ts'`.

### GREEN Evidence
- `bash scripts/validate-core-workflows.sh --report /tmp/phase2-core-green.md --summary-json /tmp/phase2-core-green.json` passed with `core-workflows-validation: PASS`.

### Other Validation Commands
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase2-final-ext.md --summary-json /tmp/phase2-final-ext.json` passed with `Extension unit-test validation PASS`.
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-graphify-discovery.sh --report /tmp/phase2-final-graphify.md --summary-json /tmp/phase2-final-graphify.json` passed with `graphify-discovery-validation: PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- Core workflows validator now copies and compiles the helper dependency alongside `till-done.ts`.
- All isolated runtime validators that load `till-done.ts` now have access to the helper.

### Behavior Changes and Risk Notes
- No runtime behavior change beyond fixing validator packaging for the new import.

## Work Summary (2026-05-04 local) - static guard refinement

### Goal
- Add static protection for the core-workflow validator dependency wiring discovered during validation.

### Files Changed and Why
- `scripts/check-repo-static.sh`: now asserts `scripts/validate-core-workflows.sh` references `graphify-validation-decision.ts` so the `till-done.ts` helper import does not regress in isolated core workflow validation.

### RED Evidence
- Same core-workflow RED applies: missing helper copy/compile caused `Cannot find module './graphify-validation-decision.ts'`.

### GREEN Evidence
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- Static checker now guards the core-workflows validator wiring for the new helper import.

### Behavior Changes and Risk Notes
- none

## QCHECK (2026-05-04 local) - skeptical self-review

### Reviewed
- Working-tree diff for runtime validation integration, till-done tests, core validator wiring, static checks, and Pi logs.
- Existing Graphify adapter broad-purpose tests confirmed missing purpose and `exact_verification` blocking are already covered.

### Findings
- Underimplementation: no issue found for Phase 2; Graphify-backed acceptance pass validation is blocked without graph/freshness and source proof.
- Missing tests: initial RED and GREEN tests cover both blocked missing-proof and proof-present pass flows.
- Wiring gaps: found and fixed core-workflow validator missing helper copy/compile.
- Risky defaults: no issue found; detection only applies to Graphify-backed acceptance or explicit `graphifyValidation` input, not all tasks.

### Fixes Made After QCHECK
- Added `graphify-validation-decision.ts` to `scripts/validate-core-workflows.sh` copy/compile paths.
- Added static guard in `scripts/check-repo-static.sh` for that core validator wiring.

## Review (2026-05-04 local) - working-tree diff

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777866776951-graphify-runtime-validation`
- Branch: `split/task-1777866776951-graphify-runtime-validation`
- Scope: working-tree diff
- Commands Run: `git diff --name-status`; `git diff --stat`; targeted `git diff -- .pi/agent/extensions/till-done.ts tests/extension-units/till-done.test.ts logs/CURRENT.md`; `bash scripts/validate-extension-unit-tests.sh --report /tmp/phase2-final-ext.md --summary-json /tmp/phase2-final-ext.json`; `bash scripts/check-foundation-extension-compile.sh`; `bash scripts/validate-graphify-discovery.sh --report /tmp/phase2-final-graphify.md --summary-json /tmp/phase2-final-graphify.json`; `bash scripts/validate-core-workflows.sh --report /tmp/phase2-core-green.md --summary-json /tmp/phase2-core-green.json`; `bash scripts/check-repo-static.sh`; `git diff --check`

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
- Assumption: Graphify-backed acceptance can be identified from acceptance criteria containing `Graphify-backed` / `Graphify backed`; later phases may add explicit schema fields if needed.
- Assumption: storing the Graphify decision line in existing task evidence satisfies Phase 2 without adding a dedicated persisted task JSON field.

### Recommended Tests / Validation
- Already run: extension unit validator with 3 consecutive passes, foundation compile, Graphify discovery validator, core workflows validator, static checks, and diff whitespace check.

### Rollout Notes
- This change affects `task_update action=validate`; operators validating Graphify-backed acceptance now need to pass `graphifyValidation` proof or acceptance will remain blocked.

Review Verdict: no_required_fixes
