import {
  closeRuntimeDb,
  openRuntimeDb,
  type RuntimeDb,
} from "./sqlite-state.ts";
import {
  applyTasksStateToDb,
  backfillTasksFromJsonIfPresent,
  readTasksStateFromDb,
  type TasksStateShape,
} from "./tasks-state.ts";
import {
  applyQueueStateToDb,
  backfillQueueFromJsonIfPresent,
  readQueueStateFromDb,
  type QueueStateShape,
} from "./queue-state.ts";
import {
  beginCoordinatedScope,
  endCoordinatedScope,
} from "./transaction-coordination.ts";

export interface CoordinatedStateSnapshot<TTask, TJob> {
  tasksState: TasksStateShape<TTask>;
  queueState: QueueStateShape<TJob>;
}

/**
 * Atomic mutation of BOTH the tasks and queue runtime stores in one SQLite
 * transaction.
 *
 * The callback receives a `{ tasksState, queueState }` snapshot. Mutate
 * those objects in-place (or replace their `tasks` / `jobs` arrays, the
 * `activeTaskId` / `activeJobId` pointers, etc.). When the callback resolves
 * the helper writes BOTH snapshots back inside a single `BEGIN IMMEDIATE
 * ... COMMIT`. If the callback throws (or its returned promise rejects),
 * the transaction is rolled back and neither store advances on disk.
 *
 * Crash-consistency contract:
 *  - On any throw inside the callback: ROLLBACK; both stores remain at
 *    their pre-call values.
 *  - On successful resolution: COMMIT; both stores reach their post-call
 *    values simultaneously (no observable intermediate state where one is
 *    updated and the other is not).
 *
 * Re-entry guard:
 *  - This function refuses to nest inside another coordinated scope.
 *  - The single-entity helpers `mutateTasksState` / `writeTasksState` /
 *    `mutateQueueState` / `writeQueueState` refuse to run while a
 *    coordinated scope is active. Mutate the snapshot you were given
 *    instead.
 *
 * This is the only sanctioned path for new coupled queue+task mutations.
 * See `docs/adr/0003-atomic-queue-task-mutations.md`.
 */
export async function withAtomicQueueAndTasksMutation<TTask, TJob, R>(
  cwd: string,
  fn: (snapshot: CoordinatedStateSnapshot<TTask, TJob>) => R | Promise<R>,
): Promise<R> {
  // openRuntimeDb runs BEFORE beginCoordinatedScope so that a failure to
  // open (mkdirSync EACCES, sqlite native-binding failure, etc.) cannot
  // leave the process-wide re-entry flag set and brick all future
  // queue/task writes.
  const db: RuntimeDb = openRuntimeDb(cwd);
  try {
    // Backfills must run OUTSIDE the coordinated transaction: each opens its
    // own short BEGIN..COMMIT internally, and SQLite does not support
    // nested transactions on a single connection. They also run BEFORE
    // beginCoordinatedScope so the read-side backfill skip (in
    // tasks-state.ts / queue-state.ts) does not suppress the legitimate
    // first-run import.
    await backfillTasksFromJsonIfPresent(db, cwd);
    await backfillQueueFromJsonIfPresent(db, cwd);

    beginCoordinatedScope();
    let beganTransaction = false;
    try {
      db.handle.exec("BEGIN IMMEDIATE");
      beganTransaction = true;
      const tasksState = readTasksStateFromDb<TTask>(db);
      const queueState = readQueueStateFromDb<TJob>(db);
      const result = await fn({ tasksState, queueState });
      applyTasksStateToDb<TTask>(db, tasksState);
      applyQueueStateToDb<TJob>(db, queueState);
      db.handle.exec("COMMIT");
      beganTransaction = false;
      return result;
    } catch (error) {
      if (beganTransaction) {
        try {
          db.handle.exec("ROLLBACK");
        } catch {
          // Best-effort rollback. If ROLLBACK itself fails (e.g., the
          // transaction was already aborted by SQLite), swallow that error
          // so the original cause surfaces to the caller.
        }
      }
      throw error;
    } finally {
      // endCoordinatedScope must run unconditionally, BEFORE closeRuntimeDb,
      // so that a close-time failure cannot leave the re-entry flag set and
      // brick the process.
      endCoordinatedScope();
    }
  } finally {
    try {
      closeRuntimeDb(db);
    } catch {
      // Best-effort close. A close failure must not mask the original
      // error from inside the coordinated scope.
    }
  }
}
