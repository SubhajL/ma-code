# H6 FK-Preserving Queue/Task Persistence Plan

Date: 2026-10-04
Task: `task-1791105452366`
Branch: `fix/h6-fk-persistence`

## Goal

Make ordinary task and queue persistence maintain the real `queue_jobs.linked_task_id` foreign key without destructive snapshot rewrites, while retaining JSON migration compatibility and `payload_json`.

## Discovery

- `.pi/agent/extensions/lib/queue-state.ts::writeStateSqlUnsafe` deletes every queue row, reinserts without `linked_task_id`, and therefore leaves the typed relationship null.
- `.pi/agent/extensions/lib/tasks-state.ts::writeStateSqlUnsafe` deletes every task before reinserting the snapshot. Migration `001_add_queue_jobs_linked_task_id` declares `ON DELETE SET NULL`, so an ordinary task update destroys otherwise valid queue links.
- Both direct mutations and `.pi/agent/extensions/lib/coordinated-state.ts` call the same unsafe snapshot writers inside transactions; coordinated persistence already applies tasks before queue.
- Reads intentionally retain `payload_json` as the compatibility representation.
- JSON backfill is a first-use migration path and remains in scope only for regression compatibility.
- Auggie timed out, so claims were verified directly in source, schema, migrations, and state tests.
- A second-model pass agreed on typed queue writes plus task/queue per-row upsert/delete. Its suggested package paths did not match this repository and were discarded.

## Design

### Shared row-sync semantics

For each snapshot writer:

1. Validate every entity has a unique non-empty string `id` before changing rows.
2. Upsert desired rows with `INSERT ... ON CONFLICT(id) DO UPDATE`; never use `INSERT OR REPLACE`, because replacement is delete-plus-insert and can fire FKs.
3. Delete only database rows whose IDs are absent from the desired snapshot.
4. Keep all operations under the caller's existing `BEGIN IMMEDIATE` transaction.

### Queue rows

- Derive `linked_task_id` from `job.linkedTaskId` when it is a non-empty string; otherwise persist null.
- Write `linked_task_id` and `payload_json` in the same upsert.
- Let SQLite reject a non-null reference to a missing task.
- Preserve status/timestamps and queue metadata behavior.

### Task rows

- Upsert desired tasks before deleting removed tasks.
- Updating an existing task no longer emits a DELETE, so queue FKs survive evidence/status writes.
- For an intentionally deleted task, clear `linkedTaskId` in affected queue `payload_json` in the same transaction before deleting the parent; `ON DELETE SET NULL` clears the typed column.
- Preserve active-task FK behavior and task payload/status/timestamp behavior.

## TDD Tracer

Add an in-memory migrated SQLite test that:

1. applies task `t1` and queue job `j1` with `linkedTaskId: "t1"`;
2. proves raw `queue_jobs.linked_task_id` is `t1` and payload JSON agrees;
3. applies an ordinary task evidence/status update and proves the link survives;
4. applies an ordinary queue update and proves typed/payload links remain aligned;
5. intentionally removes `t1` and proves typed and payload links both become null.

Clean-main RED is expected at initial queue persistence (`linked_task_id` is null) and at the ordinary task update (delete/reinsert triggers `ON DELETE SET NULL`).

## Expected Files

- `.pi/agent/extensions/lib/queue-state.ts`
- `.pi/agent/extensions/lib/tasks-state.ts`
- focused tests under `tests/extension-units/`
- `reports/planning/2026-10-04_h6-fk-persistence-plan.md`
- `logs/coding/2026-10-04_h6-fk-persistence.md`
- `logs/CURRENT.md`

No schema migration change is expected because migration `001` already defines the nullable FK.

## Acceptance Criteria

1. `linkedTaskId: "t1"` atomically produces `queue_jobs.linked_task_id = "t1"` with matching payload JSON.
2. Task evidence/status updates preserve the typed queue link.
3. Queue mutations and coordinated queue/task persistence preserve typed/payload consistency.
4. Only removal of the referenced task clears the FK; its compatibility payload is cleared in the same transaction.
5. Missing-parent queue links fail through SQLite FK enforcement without partial state.
6. Duplicate/malformed snapshot IDs fail before row mutation.
7. JSON backfill behavior and existing public function signatures remain compatible.
8. Focused tests pass three consecutive runs; relevant state, migration, queue/task workflow, core integration, typecheck, and diff checks pass.
9. Formal `g-check` reports no required fixes before PR creation.
10. The bounded PR is admin-merged as requested and local `main` equals `origin/main` before PR 4 begins.

## Validation

- New in-memory FK persistence tests, RED then GREEN.
- Existing queue-state, tasks-state, coordinated-state, sqlite-state, and runtime-migrations tests.
- Queue runner/task tool focused tests where practical.
- Full extension-unit suite and core workflows.
- TypeScript typecheck using temporary isolated-worktree dependency mappings only.
- Three-run focused flake check, wiring grep, and `git diff --check`.

## Risks and Rollback

- **Delete ordering:** task removal must not leave payload/typed relationships contradictory. Test raw rows after deletion.
- **Replace semantics:** `INSERT OR REPLACE` is prohibited for FK-bearing parent/child rows; use conflict-update clauses.
- **Invalid snapshots:** pre-validate all IDs before executing DML to preserve prior fail/rollback behavior.
- **Concurrent writers:** existing `BEGIN IMMEDIATE`, busy timeout, and coordinated transaction boundaries remain authoritative.
- **Rollback:** revert the row-sync implementation/tests; no schema or data migration rollback is required.
