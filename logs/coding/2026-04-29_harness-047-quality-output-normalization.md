# Coding Log — harness-047-quality-output-normalization

- Date: 2026-04-29
- Scope: Normalize reviewer and validator prompt/template outputs, align docs, add drift/static checks, and land via PR.
- Status: complete
- Branch: `split/task-1777452525258-harness-047-quality-output-normalization`
- Related planning log: `reports/planning/2026-04-29_harness-047-quality-output-normalization-plan.md`

## Task Group
- Normalize reviewer severity / fix output structure.
- Normalize validator proof / missing-proof / decision structure.
- Align prompt/template/docs and add drift checks.
- Land the bounded change via PR/merge.

## Files Investigated
- `AGENTS.md`
- `packages/pi-g-skills/skills/g-check/SKILL.md`
- `packages/pi-g-skills/skills/g-planning/SKILL.md`
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/validator_worker.md`
- `.pi/agent/prompts/templates/review-diff.md`
- `.pi/agent/prompts/templates/validate-task.md`
- `.pi/agent/validation/prompt-contracts.json`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/operator_role_guide.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`

## Files Changed
- `logs/CURRENT.md`
- `logs/coding/2026-04-29_harness-047-quality-output-normalization.md`
- `reports/planning/2026-04-29_harness-047-quality-output-normalization-plan.md`
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/validator_worker.md`
- `.pi/agent/prompts/templates/review-diff.md`
- `.pi/agent/prompts/templates/validate-task.md`
- `.pi/agent/validation/prompt-contracts.json`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/operator_role_guide.md`
- `scripts/check-repo-static.sh`

## Runtime / Validation Evidence
- Discovery path: `auggie_discover` timed out, so local fallback inspection was used.
- `second_model_plan` was used as a bounded cross-check and suggested a broader checker-script approach, but the main plan kept the change smaller by reusing the existing prompt-contract and repo-static validators.
- Current reviewer/validator prompts and templates already defined top-level sections and final decision lines, but did not yet normalize severity summary, fix-item shape, proof status, missing-proof category, or decision basis explicitly enough.
- RED-style gap proof before implementation: `rg -n "Severity Summary: CRITICAL=<n> HIGH=<n> MEDIUM=<n> LOW=<n>|Proof Status: sufficient \\| partial \\| missing \\| contradictory" .pi/agent/prompts/roles .pi/agent/prompts/templates .pi/agent/docs scripts/check-repo-static.sh` returned no matches.
- GREEN proof after implementation: the same `rg -n ...` command now finds the normalized lines in reviewer/validator prompts, templates, docs, and repo-static assertions.
- Validation passed: `bash scripts/validate-prompt-contracts.sh` -> `prompt-contract-validation: PASS (29 prompt files checked)`.
- Validation passed: `bash scripts/check-repo-static.sh` -> `prompt-contract-validation: PASS (29 prompt files checked)` then `repo-static-checks-ok`.
- Validation passed: `git diff --check` -> no output.

## Key Findings
- The smallest credible HARNESS-047 slice is prompt/template/docs/static-validation only.
- The existing `prompt-contracts.json` + `scripts/validate-prompt-contracts.sh` path is already the right place to catch prompt/template contract drift.
- `scripts/check-repo-static.sh` is the right bounded place to catch doc-level drift for the normalized structures.

## Decisions Made
- Keep scope out of runtime orchestration consumption for now.
- Use exact required lines to normalize the structures and make drift checks deterministic.
- Add a g-check-style review before landing.

## Known Risks
- Static drift checks still prove contract shape/presence, not the semantic quality of every future reviewer/validator response.
- Over-specifying the output could make prompts brittle if the structure is larger than necessary.

## Current Outcome
- Reviewer and validator prompts/templates now include explicit normalized structure lines for severity summary, fix-item shape, proof status, missing-proof categories, and decision basis.
- Prompt-contract validation now enforces those normalized lines.
- Repo-static checks now catch doc/prompt/template drift for the normalized structure.

## Next Action
- Run a g-check-style review on the working tree, then stage, commit, and land via PR.

## Implementation Summary (2026-04-29 16:05:00 +0700)

### Goal
- Normalize reviewer and validator output contracts enough that downstream orchestration can depend less on prose interpretation while keeping the slice bounded to prompts/templates/docs/static checks.

### What changed
- Updated reviewer surfaces:
  - `.pi/agent/prompts/roles/reviewer_worker.md`
  - `.pi/agent/prompts/templates/review-diff.md`
- Updated validator surfaces:
  - `.pi/agent/prompts/roles/validator_worker.md`
  - `.pi/agent/prompts/templates/validate-task.md`
- Enforced normalized lines in:
  - `.pi/agent/validation/prompt-contracts.json`
- Documented the normalized structure in:
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/docs/validation_recovery_architecture.md`
  - `.pi/agent/docs/operator_role_guide.md`
- Added bounded drift checks in:
  - `scripts/check-repo-static.sh`
- Updated paired logs:
  - `logs/CURRENT.md`
  - coding/planning logs for this feature group

### TDD evidence
- RED:
  - `rg -n "Severity Summary: CRITICAL=<n> HIGH=<n> MEDIUM=<n> LOW=<n>|Proof Status: sufficient \\| partial \\| missing \\| contradictory" .pi/agent/prompts/roles .pi/agent/prompts/templates .pi/agent/docs scripts/check-repo-static.sh`
  - result: no matches, proving the normalized structure was absent
- GREEN:
  - same `rg -n ...` command now returns matches in the intended surfaces
  - `bash scripts/validate-prompt-contracts.sh`
  - `bash scripts/check-repo-static.sh`
  - `git diff --check`

### Wiring verification evidence
- `scripts/validate-prompt-contracts.sh` now fails if the normalized reviewer/validator lines disappear from the role or template surfaces.
- `scripts/check-repo-static.sh` now fails if the normalized lines disappear from the prompt/template/doc alignment surfaces under:
  - reviewer prompt
  - validator prompt
  - review template
  - validation template
  - validation/recovery architecture doc
  - operator role guide

### Behavior / risk notes
- This is a contract-normalization slice only; it does not yet add runtime consumption of the normalized fields.
- The drift checks prove presence/shape, not semantic quality of every future reviewer or validator response.

## Review (2026-04-29 16:10:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777452525258-harness-047-quality-output-normalization`
- Branch: `split/task-1777452525258-harness-047-quality-output-normalization`
- Scope: `working-tree`
- Commands Run:
  - `git diff --stat`
  - `git diff -- .pi/agent/prompts/roles/reviewer_worker.md .pi/agent/prompts/roles/validator_worker.md .pi/agent/prompts/templates/review-diff.md .pi/agent/prompts/templates/validate-task.md .pi/agent/validation/prompt-contracts.json .pi/agent/docs/validation_architecture.md .pi/agent/docs/validation_recovery_architecture.md .pi/agent/docs/operator_role_guide.md scripts/check-repo-static.sh`
  - `bash scripts/validate-prompt-contracts.sh`
  - `bash scripts/check-repo-static.sh`
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
- assumed HARNESS-047 only requires normalized prompt/template/docs/static contracts, not runtime consumption of the normalized fields yet

### Recommended Tests / Validation
- `bash scripts/validate-prompt-contracts.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

### Rollout Notes
- low-risk prompt/docs/static-validation landing
- follow-on orchestration/runtime consumption work can now depend on clearer reviewer/validator contract lines without changing runtime behavior in this slice

### Review Verdict
- no_required_fixes
