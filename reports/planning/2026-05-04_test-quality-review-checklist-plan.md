# Planning Log — test-quality-review-checklist

- Date: 2026-05-04
- Scope: Add a lightweight test-quality review checklist across the behavior-first TDD doc, validation checklist, reviewer prompt, validator prompt, and static drift checks.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_test-quality-review-checklist.md`

## Goal
- Add a lightweight explicit checklist that helps reviewers and validators challenge weak tests without broad prompt redesign.
- Cover public-interface-visible behavior, private-helper-only tests, owned-collaborator mocks, named boundary mocks, and GREEN-only refactor discipline.

## Scope
- `.pi/agent/docs/tdd_behavior_first_workflow.md`
- `.pi/agent/skills/validation-checklist/SKILL.md`
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/validator_worker.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `reports/planning/2026-05-04_test-quality-review-checklist-plan.md`
- `logs/coding/2026-05-04_test-quality-review-checklist.md`

## Acceptance Criteria
- The TDD doc contains a compact explicit lightweight test-quality review checklist with the five requested checks.
- Validation-checklist, reviewer prompt, and validator prompt reinforce the checklist without large prompt bloat.
- Static checks fail before the new checklist language is present and pass after implementation.
- Local validation passes and the slice lands through bounded branch/worktree, merge to main, and local main sync.

## TDD Sequence
- Add RED static assertions in `scripts/check-repo-static.sh` first.
- Run the static checker and confirm it fails because the new checklist wording is missing.
- Implement the smallest wording changes in the doc/skill/prompts that satisfy the checklist contract.
- Refactor wording minimally if needed.
- Rerun static and prompt validators, then review/merge/sync.

## Validation Plan
- `bash scripts/check-repo-static.sh`
- `bash scripts/validate-prompt-contracts.sh`
- `bash scripts/validate-prompt-semantics.sh`
- `git diff --check`
- manual `g-check`-style review before merge
