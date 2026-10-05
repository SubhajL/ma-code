# H6 FK-Preserving Queue/Task Persistence

Date: 2026-10-04
Task: `task-1791105452366`
Branch: `fix/h6-fk-persistence`
Worktree: `/Users/subhajlimanond/dev/ma-code-h6-fk-persistence`

## Context

Implement PR 3 from merged `main` after PRs #253 and #254. Preserve the original dirty worktree while correcting queue/task row persistence.

## Discovery

- Queue snapshots omit `linked_task_id`.
- Task snapshots delete/reinsert parent rows and trigger `ON DELETE SET NULL` during ordinary updates.
- Existing migration/schema already support the intended FK; the defect is in normal writers.
- Coordinated state applies tasks before queue in one transaction.
- Auggie timed out; direct source/schema/test inspection was used.
- Second-model synthesis supports per-row upsert/delete, with repository-local paths corrected during direct verification.

## Plan

See `reports/planning/2026-10-04_h6-fk-persistence-plan.md`.

## Work Log

- Created and started `task-1791105452366` with explicit merge and local-main landing acceptance.
- Created isolated worktree `/Users/subhajlimanond/dev/ma-code-h6-fk-persistence` from `main` at `69650b7dfade917defed1071177d85a1c870c697`.
- Original worktree remains dirty on `fix/pi-extension-conflicts`; no reset, stash, stage, or cleanup was performed.

## TDD Evidence

Pending.

## Validation

Pending.

## Review

Pending formal `g-check`.

## TDD Evidence

### RED

- Added `state-foreign-key-persistence.test.ts` against one migrated in-memory SQLite database.
- Clean-main failures:
  - linked queue payload persisted while raw `linked_task_id` was `NULL` (`null !== "t1"`);
  - a queue link to a missing task did not raise an FK error.
- Added a queue-first legacy migration tracer after the first GREEN. It failed because queue JSON was migrated with a null typed FK before tasks JSON was imported.

### GREEN

- Queue snapshots now pre-validate IDs, upsert rows with `linked_task_id`, update on conflict, and delete only absent queue rows.
- Task snapshots now pre-validate IDs, upsert without `INSERT OR REPLACE`, and delete only intentionally absent tasks.
- Intentional task deletion clears affected queue payload `linkedTaskId` in the same transaction before `ON DELETE SET NULL` clears the typed column.
- Queue-first JSON migration now imports tasks first and writes the queue FK atomically.
- A queue-runner fixture that wrote a linked child job before its parent task was corrected to seed the parent row first; this is required by the newly enforced existing FK contract.

## Validation

- In-memory FK tests: 2/2 pass.
- Queue-first linked JSON migration tracer: pass.
- Focused queue/FK suite: 13/13 pass for three consecutive runs.
- State/migration suite: 59/59 pass.
- Full extension-unit suite: 681/681 pass.
- Core workflows: 10/10 pass.
- TypeScript typecheck through temporary isolated-worktree dependency mappings: pass.
- Wiring grep confirms conflict-update row persistence, typed FK writes, intentional per-row deletes, payload clearing, and tasks-before-queue backfill.
- `git diff --check`: pass.

## Wiring Verification

- `writeQueueState`, `mutateQueueState`, JSON backfill, and coordinated state all reach the corrected queue writer.
- `writeTasksState`, `mutateTasksState`, task tools, and coordinated state all reach the corrected task writer.
- Coordinated writes retain tasks-before-queue ordering, so newly created linked pairs satisfy the FK within one transaction.
- Existing migrations and schema remain unchanged; no down migration or protected runtime-state edit was made.

## Skeptical Self-Review

- `INSERT OR REPLACE` was removed from FK-bearing task rows and queue metadata/task metadata updates use conflict-update semantics.
- All snapshot IDs are validated before DML; later failures remain transactionally rolled back.
- Queue row order remains stable for normal append/update/remove operations because existing rowids survive upsert. Arbitrary reordering was never a supported mutation and no ordering schema was added.
- Existing pre-H6 rows with payload-only links are repaired on the next queue write; this PR does not add a new retrospective migration.
- Required fixes found: none.

## g-check Handoff

Review the bounded row-persistence diff for accidental FK cascades, invalid transaction ordering, compatibility migration regressions, payload/typed divergence, and test fixture false positives.

## Review (2026-10-04) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-h6-fk-persistence`
- Branch: `fix/h6-fk-persistence`
- Scope: H6 working-tree review set; generated root runtime state and temporary dependency mappings excluded.
- Commands Run:
  - `git status --short`, `git diff --name-only`, `git diff --stat`, targeted source/test diffs
  - intended RED tests for typed FK, missing parent, and queue-first migration
  - focused queue/FK flake loop (three runs)
  - state/migration suite (59/59)
  - full extension units (681/681)
  - core workflows (10/10)
  - TypeScript typecheck
  - wiring grep, `find .../pi.db`, and `git diff --check`

### Findings
CRITICAL
- none.

HIGH
- none.

MEDIUM
- none.

LOW
- none.

### Open Questions / Assumptions
- Queue snapshots preserve normal append/update/remove order through stable rowids; arbitrary reorder remains outside the existing queue API contract.
- Existing pre-H6 payload-only links are repaired on the next queue write. No retrospective data migration was requested or added.
- A coordinated deletion must clear a still-linked job in its in-memory queue snapshot; otherwise the subsequent queue upsert correctly fails FK validation and rolls the transaction back.

### Recommended Tests / Validation
- Keep the in-memory typed-FK lifecycle, missing-parent rollback, and queue-first JSON migration regressions.
- Keep state/migration, full extension, core workflow, typecheck, and diff checks as PR gates.
- No provider-backed validation is needed for deterministic SQLite persistence.

### Rollout Notes
- No schema migration or operator action is required; migration `001` already owns the nullable FK.
- Existing JSON imports remain supported and now order linked task import before queue import.
- Rollback is source/test-only; do not remove the migrated column.

Review Verdict: no_required_fixes

## Creation (g-create, 2026-10-04)

- Graphite tracked `fix/h6-fk-persistence` on `main` and created `HEAD` with message `fix(state): preserve queue task foreign keys`.
- Eight explicit H6 files were committed; generated runtime state was excluded.
- Hooks were not bypassed.

## Submission (g-submit, 2026-10-05)

- PR: https://github.com/SubhajL/ma-code/pull/255
- Graphite submission created the open, non-draft `main` ← `fix/h6-fk-persistence` PR.
- GitHub run `37290596216` failed all three jobs before any steps ran (`steps: []`, about two seconds), matching the recorded external CI startup failure on prior PRs.
- Local deterministic gates and `g-check` passed; next action is the explicitly requested admin merge after this log update.
