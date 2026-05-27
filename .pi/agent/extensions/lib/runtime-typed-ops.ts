import type { RuntimeDb } from "./sqlite-state.ts";

/**
 * Typed columnar read of `active_task.task_id`. Returns `null` if the
 * singleton row is absent or its `task_id` is NULL.
 *
 * Differs from the JSON-era helpers (`readTasksStateFromDb`) by
 * touching only the column we care about: callers that need just the
 * active pointer no longer pay to deserialise the full tasks-state
 * payload.
 */
export function getActiveTaskId(db: RuntimeDb): string | null {
  const row = db.handle
    .prepare(`SELECT task_id FROM active_task WHERE singleton = 1`)
    .get() as { task_id: string | null } | undefined;
  if (!row) return null;
  return row.task_id ?? null;
}

/**
 * Typed columnar write of `active_task.task_id`. Pass `null` to clear
 * the active pointer; pass a task id to point at it. The FK added by
 * migration `002_add_active_task_fk` enforces that any non-null
 * `taskId` exists in `tasks(id)`; passing an unknown id throws
 * `SQLITE_CONSTRAINT_FOREIGNKEY` (`FOREIGN KEY constraint failed`).
 *
 * Uses `INSERT ... ON CONFLICT` so the first call after migration
 * seeds the singleton row, and subsequent calls update it.
 */
export function setActiveTaskId(db: RuntimeDb, taskId: string | null): void {
  db.handle
    .prepare(
      `INSERT INTO active_task (singleton, task_id) VALUES (1, ?)
         ON CONFLICT(singleton) DO UPDATE SET task_id = excluded.task_id`,
    )
    .run(taskId);
}
