# Planning Log — test-quality-followups

- Date: 2026-05-04
- Scope: Clean up the merged PR #86 worktree/branch and extend prompt semantics so the lightweight test-quality review checklist has executable deterministic coverage.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_test-quality-followups.md`

## Goal
- Remove the stale merged PR #86 worktree/branch safely.
- Add local semantic review coverage for the lightweight test-quality checklist using deterministic reviewer/validator fixtures.

## Scope
- `.pi/agent/validation/prompt-semantics.json`
- `scripts/validate-prompt-semantics.sh`
- `logs/CURRENT.md`
- `reports/planning/2026-05-04_test-quality-followups-plan.md`
- `logs/coding/2026-05-04_test-quality-followups.md`
- local cleanup of the old merged worktree `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777905823884-test-quality-review-checklist` and its branch

## Acceptance Criteria
- Reviewer/validator semantic fixtures cover the new lightweight checklist concepts with deterministic required substring checks.
- Local semantic validator passes after the new fixture/validator support is added.
- The old merged PR #86 worktree is removed and its local branch is deleted.
- The follow-up slice lands through PR/merge/main sync with evidence recorded.

## TDD Sequence
- Add failing reviewer/validator checklist fixtures first.
- Run `bash scripts/validate-prompt-semantics.sh` and confirm the new fixtures fail because the validator does not yet enforce the required checklist substrings.
- Implement the smallest validator support for fixture-level required substrings.
- Rerun semantic validation and supporting gates.
- Clean up the old merged worktree/branch and record the evidence.

## Validation Plan
- `bash scripts/validate-prompt-semantics.sh`
- `bash scripts/validate-prompt-contracts.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- `g-check`-style review before merge
