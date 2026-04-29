# Planning Log — local-main-dirty-files-landing

- Date: 2026-04-29
- Scope: Land the approved intentional dirty local-main files onto remote `main` while excluding accidental nested artifact noise.
- Status: ready
- Related coding log: `logs/coding/2026-04-29_local-main-dirty-files-landing.md`

## Goal
- Move the approved local-main dirt onto a non-main branch/worktree and land it through the normal PR/merge flow.

## Scope
- Include:
  - `.pi/agent/state/runtime/tasks.json`
  - `logs/harness-actions.jsonl`
  - `reports/validation/2026-04-29_extension-unit-tests-validation-script.{md,json}`
  - `reports/validation/2026-04-29_handoffs-validation-script.{md,json}`
  - `reports/validation/2026-04-29_task-packets-validation-script.{md,json}`
- Exclude accidental nested artifacts created by blocked write attempts under:
  - `logs/.pi/`
  - `logs/coding/.pi/`
  - `logs/coding/logs/`
  - `logs/logs/`
  - `reports/planning/.pi/`
  - `reports/planning/logs/`

## Files to Create or Edit
- `logs/CURRENT.md`
- `logs/coding/2026-04-29_local-main-dirty-files-landing.md`
- `reports/planning/2026-04-29_local-main-dirty-files-landing-plan.md`
- `.pi/agent/state/runtime/tasks.json`
- `logs/harness-actions.jsonl`
- `reports/validation/2026-04-29_extension-unit-tests-validation-script.json`
- `reports/validation/2026-04-29_extension-unit-tests-validation-script.md`
- `reports/validation/2026-04-29_handoffs-validation-script.json`
- `reports/validation/2026-04-29_handoffs-validation-script.md`
- `reports/validation/2026-04-29_task-packets-validation-script.json`
- `reports/validation/2026-04-29_task-packets-validation-script.md`

## Why Each File Exists
- planning/coding logs + `logs/CURRENT.md`: bounded evidence for this landing task.
- `tasks.json`: tracked runtime task-state snapshot.
- `logs/harness-actions.jsonl`: tracked audit trail.
- validation reports: generated evidence the user explicitly wants landed.

## What Logic Belongs There
- No source-code changes.
- Only the approved runtime/audit/report files plus task logs.

## What Should Not Go There
- No accidental nested `.pi`/`logs` artifact trees.
- No unrelated worktree dirt from other branches.

## Dependencies
- Active task: `task-1777442748746`
- User approval received to land intentional local-main changes only.

## Acceptance Criteria
- Approved dirty local-main files are copied into a non-main branch/worktree.
- Excluded accidental nested artifacts are not staged or merged.
- PR is opened, merged, and local `main` is synced.
- Evidence records the exact landed vs excluded set.

## Likely Failure Modes
- Sync failure on root `main` because untracked validation files would be overwritten by merge.
- Root local dirt persisting if tracked runtime/audit files do not match merged content exactly.
- Accidentally staging the nested artifact noise.

## Validation Plan
- `git status --short --branch`
- `git diff --check`
- `git diff --cached --stat`
- PR checks
- `git rev-parse HEAD` and `git rev-parse origin/main` after merge/sync

## Recommended Next Step
- Commit the approved file set from the dedicated worktree, open the PR, then clean only the excluded root-local untracked artifacts needed to allow local-main sync after merge.
