# Graphify Validator Coverage

## Work Summary (2026-05-04 local) - setup and discovery

### Goal
- Implement Slice 6: make the canonical Graphify validator explicitly cover discovery selector Graphify recommendation, purpose requirement, preflight token requirement, freshness/cadence helper, and final-validation prompt language.

### Discovery Path
- Read `AGENTS.md`, `README.md`, and `logs/CURRENT.md`.
- Used `auggie_discover` first; it returned out-of-credits and recommended local fallback.
- Local fallback used `rg` and targeted reads for `scripts/validate-graphify-discovery.sh`, `scripts/check-repo-static.sh`, Graphify adapter tests, discovery-policy tests, and Graphify adapter implementation.

### TDD Plan
- Tracer bullet: static validator coverage contract through `scripts/check-repo-static.sh` proves the canonical Graphify validator names and checks each required coverage point.
- RED: add static assertions for a new explicit Graphify validator coverage contract before implementing it in `scripts/validate-graphify-discovery.sh`; run `bash scripts/check-repo-static.sh` and confirm failure.
- GREEN: add an explicit coverage-contract check to `scripts/validate-graphify-discovery.sh` that inspects the copied unit/integration tests, prompt/docs, and validator details for the five requested coverage areas.
- Quality gates: run `bash scripts/validate-graphify-discovery.sh`, `bash scripts/check-repo-static.sh`, `bash scripts/check-foundation-extension-compile.sh`, and `bash scripts/validate-extension-unit-tests.sh`.

### Current Risks / Notes
- Existing unit/integration tests already cover much of the behavior; this slice should avoid duplicating runtime logic and instead make the canonical validator's coverage explicit and auditable.

## Work Summary (2026-05-04 local) - RED coverage contract

### Goal
- Add a static contract that fails until the canonical Graphify validator explicitly names and verifies the requested coverage areas.

### Files Changed and Why
- `scripts/check-repo-static.sh`: added assertions that `scripts/validate-graphify-discovery.sh` contains the new coverage-contract check and required coverage labels.
- `logs/CURRENT.md` and this coding log: moved active evidence pointer to this slice.

### RED Evidence
- `bash scripts/check-repo-static.sh` failed as expected before implementing the validator coverage contract.
- Key failure: Python `AssertionError` at the new `graphify_validator` assertion block, because `check_6_graphify_validator_coverage_contract` and coverage labels were not yet present in `scripts/validate-graphify-discovery.sh`.

### GREEN Evidence
- pending

### Wiring Verification
- Static guard now targets the canonical Graphify validator script and will fail until it includes the explicit coverage contract.

### Risk Notes
- The first RED failure is intentionally a static contract failure, not a runtime behavior failure.

## Work Summary (2026-05-04 local) - GREEN validator coverage

### Goal
- Implement explicit canonical validator coverage for all requested Slice 6 areas and prove the requested commands pass.

### Files Changed and Why
- `scripts/validate-graphify-discovery.sh`: added `check_6_graphify_validator_coverage_contract`, which inspects the discovery-policy unit test, Graphify adapter unit/integration tests, final-validation prompt/docs language, and validator labels for the required coverage areas.
- `scripts/check-repo-static.sh`: added a static contract requiring the canonical validator to include the coverage check and required coverage labels.
- `logs/CURRENT.md` and this coding log: captured evidence for this slice.

### Tests Added or Changed
- Added a validator self-audit check inside `scripts/validate-graphify-discovery.sh` rather than adding a new standalone test file.
- The check covers:
  - discovery selector Graphify recommendation
  - Graphify adapter purpose requirement
  - Graphify adapter preflight token requirement
  - freshness/cadence helper
  - final-validation prompt language

### RED Evidence
- `bash scripts/check-repo-static.sh` failed before implementing the validator coverage check with Python `AssertionError` at the new `graphify_validator` static assertions.

### GREEN Evidence
- `bash scripts/validate-graphify-discovery.sh --report /tmp/slice6-redgreen.md --summary-json /tmp/slice6-redgreen.json` passed with `graphify-discovery-validation: PASS`.
- Flake check: three consecutive `bash scripts/validate-graphify-discovery.sh` runs passed: `/tmp/slice6-redgreen.*`, `/tmp/slice6-flake1.*`, and `/tmp/slice6-flake2.*`.

### Other Validation Commands
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-extension-unit-tests.sh` passed with `Extension unit-test validation PASS`; generated report artifacts were removed from the source diff.
- `git diff --check` passed with no output.

### Wiring Verification
- `scripts/validate-graphify-discovery.sh` main flow now runs `check_6_graphify_validator_coverage_contract` before the optional installed-CLI smoke check.
- `scripts/check-repo-static.sh` now requires the coverage-check function and labels to remain present in the canonical Graphify validator.
- No new runtime extension, route, env var, or package script wiring was added.

### Behavior Changes and Risk Notes
- The canonical Graphify validator now fails if the required coverage proofs are no longer visible in the expected unit/integration tests, prompts/docs, or validator labels.
- Known gap: this is a validator/script coverage self-audit; it does not add new Graphify adapter runtime behaviors beyond the already-tested implementation.

## Work Summary (2026-05-04 local) - final validation refinement

### Goal
- Tighten the coverage contract so final-validation prompt language is checked in each required prompt/doc file, not only in a concatenated source blob.

### Files Changed and Why
- `scripts/validate-graphify-discovery.sh`: changed the coverage contract to map `validator_worker.md`, `reviewer_worker.md`, `graphify_final_runbook.md`, and `operator_workflow.md` separately and assert each contains the final-validation rule fragments.

### RED Evidence
- Same initial RED applies: `bash scripts/check-repo-static.sh` failed before the validator coverage contract existed.

### GREEN Evidence
- `bash scripts/validate-graphify-discovery.sh --report /tmp/slice6-final.md --summary-json /tmp/slice6-final.json` passed with `graphify-discovery-validation: PASS`.

### Other Validation Commands
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-extension-unit-tests.sh` passed with `Extension unit-test validation PASS`; generated report artifacts were removed from the source diff.
- `git diff --check` passed with no output.

### Wiring Verification
- The main Graphify validator path still runs `check_6_graphify_validator_coverage_contract` before optional smoke.
- The coverage report section prints all five required coverage labels on pass.

### Behavior Changes and Risk Notes
- Final-validation prompt-language coverage is now per-file for all four required surfaces.

## QCHECK (2026-05-04 local) - skeptical self-review

### Reviewed
- Working-tree diff for `scripts/validate-graphify-discovery.sh`, `scripts/check-repo-static.sh`, `logs/CURRENT.md`, and this coding log.
- Validation report excerpt for `## 6. Graphify validator coverage contract`.
- Commands: `git diff --name-status`, `git diff --stat`, targeted `git diff -- ...`, and report excerpt inspection.

### Findings
- Underimplementation: no issue found; each requested coverage area is explicitly labeled and checked in the canonical Graphify validator.
- Missing tests: no issue found; the validator now self-audits existing behavior tests/prompts, and requested validation commands pass.
- Wiring gaps: no issue found; main validator flow calls `check_6_graphify_validator_coverage_contract`, and static checks require that function/labels.
- Risky defaults: no new Graphify runtime defaults or smoke behavior changed; installed-CLI smoke remains opt-in.

### Fixes Made After QCHECK
- Tightened final-validation prompt-language checks to validate each required prompt/doc file separately.

## Review (2026-05-04 local) - working-tree diff

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777861604273-graphify-validator-coverage`
- Branch: `split/task-1777861604273-graphify-validator-coverage`
- Scope: working-tree diff
- Commands Run: `git diff --name-status`; `git diff --stat`; targeted `git diff -- scripts/validate-graphify-discovery.sh scripts/check-repo-static.sh logs/CURRENT.md`; `cat /tmp/slice6-final.md | sed -n '/## 6\\. Graphify validator coverage contract/,/## 7\\./p'`; `bash scripts/validate-graphify-discovery.sh --report /tmp/slice6-final.md --summary-json /tmp/slice6-final.json`; `bash scripts/check-repo-static.sh`; `bash scripts/check-foundation-extension-compile.sh`; `bash scripts/validate-extension-unit-tests.sh`; `git diff --check`

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
- Assumption: making the canonical validator self-audit existing Graphify tests/prompts is preferable to duplicating all Graphify runtime behavior inside the shell validator.
- Assumption: generated validation reports should stay out of the source diff unless explicitly requested.

### Recommended Tests / Validation
- Already run: 3 consecutive `bash scripts/validate-graphify-discovery.sh` passes, `bash scripts/check-repo-static.sh`, `bash scripts/check-foundation-extension-compile.sh`, `bash scripts/validate-extension-unit-tests.sh`, and `git diff --check`.

### Rollout Notes
- After PR merge, sync root local `main` with the safe fast-forward helper and rerun a small post-merge static check.

Review Verdict: no_required_fixes
