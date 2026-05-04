# Graphify Final-Validation Rule

## Work Summary (2026-05-04 local) - setup and discovery

### Goal
- Implement Slice 5: Graphify-backed acceptance cannot pass unless latest relevant graph was queried or freshness/cadence was checked, and important claims were verified with direct source inspection.

### Discovery Path
- Read `AGENTS.md`, `README.md`, `packages/pi-g-skills/docs/pi-log-convention.md`, and `logs/CURRENT.md`.
- Used `auggie_discover` first for relevant static checks and prompt/doc insertion points; Auggie returned an out-of-credits message, so continued with local fallback.
- Local fallback: `rg` across validator/reviewer prompts, Graphify final runbook, operator workflow, and `scripts/check-repo-static.sh`; targeted reads of those files.

### TDD Plan
- RED: add static assertions in `scripts/check-repo-static.sh` for exact final-validation rule language, then run `bash scripts/check-repo-static.sh` and confirm failure because docs/prompts do not yet contain the required language.
- GREEN: add the required language to validator/reviewer prompts, Graphify final runbook, and operator workflow, then rerun static validation.
- Quality gates: run `bash scripts/check-repo-static.sh`, `bash scripts/validate-graphify-discovery.sh`, `bash scripts/validate-prompt-contracts.sh`, and `git diff --check`.

### Current Risks / Notes
- This is a prompt/docs/static-guard slice; no runtime component wiring is expected beyond static-check coverage.
- Existing Graphify guidance already mentions freshness and direct inspection, but the requested acceptance-blocking rule is not explicit enough yet.

## Work Summary (2026-05-04 local) - RED static guard

### Goal
- Add the smallest static guard that encodes the requested Graphify-backed final-validation rule before changing prompts/docs.

### Files Changed and Why
- `scripts/check-repo-static.sh`: added exact-string assertions for validator/reviewer prompts, Graphify final runbook, and operator workflow.

### RED Evidence
- `bash scripts/check-repo-static.sh` failed as expected with `AssertionError: validator_worker.md missing Graphify final-validation rule text: Graphify-backed acceptance cannot pass unless the latest relevant graph was queried or freshness/cadence was checked, and important claims were verified with direct source inspection.`

### GREEN Evidence
- pending

### Wiring Verification
- Static guard now targets all requested files: `validator_worker.md`, `reviewer_worker.md`, `graphify_final_runbook.md`, and `operator_workflow.md`.

### Risk Notes
- none

## Work Summary (2026-05-04 local) - GREEN prompts/docs

### Goal
- Add exact final-validation rule language to all requested Graphify-backed claim surfaces and prove the static guard passes.

### Files Changed and Why
- `.pi/agent/prompts/roles/validator_worker.md`: added acceptance-blocking Graphify validation rule for validators.
- `.pi/agent/prompts/roles/reviewer_worker.md`: added the same acceptance-blocking rule for reviewers.
- `.pi/agent/docs/graphify_final_runbook.md`: documented the rule in the query-and-verify acceptance section.
- `.pi/agent/docs/operator_workflow.md`: documented the rule in the cross-phase discovery workflow.
- `scripts/check-repo-static.sh`: enforces exact rule language and the two required condition fragments in all four requested docs/prompts.
- `logs/CURRENT.md` and this coding log: moved evidence pointer to this slice.

### RED Evidence
- `bash scripts/check-repo-static.sh` failed before prompt/doc updates with `AssertionError: validator_worker.md missing Graphify final-validation rule text: Graphify-backed acceptance cannot pass unless the latest relevant graph was queried or freshness/cadence was checked, and important claims were verified with direct source inspection.`

### GREEN Evidence
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- Flake check: 3 consecutive `bash scripts/check-repo-static.sh` runs passed (the first GREEN run plus two repeated runs).

### Other Validation Commands
- `bash scripts/validate-graphify-discovery.sh` passed with `graphify-discovery-validation: PASS`; generated validation report files were removed from the source diff.
- `bash scripts/validate-prompt-contracts.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)`.
- `git diff --check` passed with no output.

### Wiring Verification
- `scripts/check-repo-static.sh` now reads the validator/reviewer prompts and Graphify docs, then asserts the exact final-validation rule text in each requested file.
- No new runtime component, route, package script, or environment wiring was added.

### Behavior Changes and Risk Notes
- Reviewers and validators are now explicitly instructed that Graphify-backed acceptance cannot pass without latest relevant graph query/freshness-cadence proof and direct source inspection of important claims.
- Operator/runbook docs mirror that rule.
- Known gap: this is static text enforcement, not a new runtime validator state machine.

## QCHECK (2026-05-04 local) - skeptical self-review

### Reviewed
- Working-tree diff for the requested five files plus Pi log pointer/log evidence.
- Direct source inspection: `git diff --name-status`, `git diff --stat`, targeted `git diff -- ...`, and `rg -n "Graphify-backed acceptance cannot pass unless|latest relevant graph was queried|important claims were verified" ...`.

### Findings
- Underimplementation: no issue found; prompts, runbook, operator workflow, and static guard all include the required rule.
- Missing tests: no issue found; static guard RED/GREEN proves the requested text contract, and prompt/Graphify validators pass.
- Wiring gaps: no runtime wiring needed; `scripts/check-repo-static.sh` is the existing static gate and now enforces all requested surfaces.
- Risky defaults: no new defaults introduced.

### Fixes Made After QCHECK
- Updated `logs/CURRENT.md` notes to point to this Graphify final-validation slice instead of the previous runtime-bookkeeping slice.

## Review (2026-05-04 local) - working-tree diff

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777859882334-graphify-final-validation-rule`
- Branch: `split/task-1777859882334-graphify-final-validation-rule`
- Scope: working-tree diff
- Commands Run: `git diff --name-status`; `git diff --stat`; targeted `git diff -- .pi/agent/prompts/roles/validator_worker.md .pi/agent/prompts/roles/reviewer_worker.md .pi/agent/docs/graphify_final_runbook.md .pi/agent/docs/operator_workflow.md scripts/check-repo-static.sh logs/CURRENT.md`; `bash scripts/check-repo-static.sh`; `git diff --check`; `rg -n "Graphify-backed acceptance cannot pass unless|latest relevant graph was queried|important claims were verified" ...`

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
- Assumption: a static text-contract guard is the intended enforcement mechanism for this slice, matching the requested RED/GREEN behavior.
- Assumption: no live Graphify run is needed because this change governs future Graphify-backed claims and was verified by direct source inspection plus local validators.

### Recommended Tests / Validation
- Already run: `bash scripts/check-repo-static.sh` with RED then GREEN; 3 consecutive GREEN static runs; `bash scripts/validate-graphify-discovery.sh`; `bash scripts/validate-prompt-contracts.sh`; `git diff --check`.

### Rollout Notes
- After merge, local `main` should be fast-forward synced from the root using the safe main-sync helper or equivalent fast-forward-only flow.

Review Verdict: no_required_fixes
