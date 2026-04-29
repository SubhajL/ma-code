# Planning Log — harness-047-quality-output-normalization

- Date: 2026-04-29
- Scope: Normalize reviewer and validator prompt/template outputs so quality lanes rely less on prose interpretation, then wire the normalized structure into docs and static drift checks.
- Status: ready
- Related coding log: `logs/coding/2026-04-29_harness-047-quality-output-normalization.md`

## Goal
- Make reviewer and validator output contracts more explicit for downstream orchestration by normalizing reviewer severity/fix structure and validator proof/missing-proof structure.

## Scope
- Update reviewer and validator role prompts.
- Update review/validation request templates.
- Update prompt-contract inventory so the normalized lines are enforced.
- Update validation/recovery docs to describe the normalized structure.
- Update repo-static checks so missing normalized structure is caught as drift.

## Files to Create or Edit
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

## Why Each File Exists
- role prompts/templates: the actual reviewer/validator output contract surfaces.
- prompt-contract inventory: executable drift enforcement for the normalized lines.
- validation/recovery/operator docs: human-readable contract alignment.
- repo-static checks: bounded presence/basic-wiring assertions beyond the prompt-contract runner.
- paired logs: implementation evidence.

## What Logic Belongs There
- normalized reviewer structure lines:
  - severity summary
  - required-fix item shape
  - optional-improvement item shape
- normalized validator structure lines:
  - proof status
  - missing-proof category
  - decision basis
- docs should explain the structure, not redesign runtime orchestration.

## What Should Not Go There
- no runtime orchestration code changes.
- no handoff schema/runtime contract changes.
- no new live-provider validation loops.

## Dependencies
- Active task: `task-1777452525258`
- Clean dedicated worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777452525258-harness-047-quality-output-normalization`
- Existing prompt-contract validator and repo-static check wiring.

## Acceptance Criteria
- Reviewer and validator prompts/templates explicitly define normalized output structure for the requested fields.
- Docs describe the normalized structure consistently.
- Drift/static checks fail if the normalized structure is removed from the key prompt/template/doc surfaces.
- Change lands via PR and local main syncs to the merged commit.

## Likely Failure Modes
- updating prompts/templates without enforcing drift checks.
- adding vague normalized language that is still hard to verify statically.
- widening scope into runtime consumption/orchestration behavior.
- leaving reviewer and validator structures inconsistent with each other.

## Validation Plan
- RED-ish discovery proof: grep for missing normalized lines before implementation.
- `bash scripts/validate-prompt-contracts.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- g-check-style working-tree review
- PR checks

## Recommended Next Step
- Add the normalized contract lines to prompts/templates first, then enforce them in `prompt-contracts.json`, then update docs and repo-static drift checks, then run validation and land through PR.
