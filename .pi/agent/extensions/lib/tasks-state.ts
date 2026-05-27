import { readFile, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { closeRuntimeDb, openRuntimeDb, type RuntimeDb } from "./sqlite-state.ts";
import { assertNotInsideCoordinatedScope, isInsideCoordinatedScope } from "./transaction-coordination.ts";

export const TASKS_FILE = ".pi/agent/state/runtime/tasks.json";
export const TASKS_STATE_VERSION = 1 as const;
const ACTIVE_TASK_SINGLETON = 1;

export interface TasksStateShape<T> {
  version: 1;
  activeTaskId: string | null;
  tasks: T[];
}

interface TaskRow {
  id: string;
  payload_json: string;
  status: string;
  updated_at: number;
}

interface ActiveTaskRow {
  task_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function deriveStatus(task: unknown): string {
  if (isRecord(task) && typeof task.status === "string") return task.status;
  return "unknown";
}

function deriveUpdatedAt(task: unknown): number {
  if (isRecord(task)) {
    const timestamps = task.timestamps;
    if (isRecord(timestamps) && typeof timestamps.updatedAt === "string") {
      const parsed = Date.parse(timestamps.updatedAt);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return Date.now();
}

function readActiveTaskIdSql(db: RuntimeDb): string | null {
  const row = db.handle
    .prepare(`SELECT task_id FROM active_task WHERE singleton = ?`)
    .get(ACTIVE_TASK_SINGLETON) as unknown as ActiveTaskRow | undefined;
  return row?.task_id ?? null;
}

function readTaskRowsSql(db: RuntimeDb): TaskRow[] {
  return db.handle
    .prepare(`SELECT id, payload_json, status, updated_at FROM tasks ORDER BY rowid ASC`)
    .all() as unknown as TaskRow[];
}

function rowsToState<T>(rows: TaskRow[], activeTaskId: string | null): TasksStateShape<T> {
  return {
    version: TASKS_STATE_VERSION,
    activeTaskId,
    tasks: rows.map((row) => JSON.parse(row.payload_json) as T),
  };
}

/**
 * Read the canonical tasks snapshot from an already-open RuntimeDb handle.
 * Caller must own the connection (and any surrounding transaction).
 * Intended for `withAtomicQueueAndTasksMutation`; single-entity callers
 * should keep using `readTasksState` / `mutateTasksState`.
 */
export function readTasksStateFromDb<T>(db: RuntimeDb): TasksStateShape<T> {
  return rowsToState<T>(readTaskRowsSql(db), readActiveTaskIdSql(db));
}

function writeStateSqlUnsafe<T>(db: RuntimeDb, state: TasksStateShape<T>): void {
  db.handle.exec(`DELETE FROM tasks`);
  const insert = db.handle.prepare(
    `INSERT INTO tasks (id, payload_json, status, updated_at) VALUES (?, ?, ?, ?)`,
  );
  for (const task of state.tasks) {
    const id = isRecord(task) && typeof task.id === "string" ? task.id : null;
    if (!id) {
      throw new Error(`tasks-state: task is missing required string id field: ${JSON.stringify(task)}`);
    }
    insert.run(id, JSON.stringify(task), deriveStatus(task), deriveUpdatedAt(task));
  }
  db.handle
    .prepare(`INSERT OR REPLACE INTO active_task (singleton, task_id) VALUES (?, ?)`)
    .run(ACTIVE_TASK_SINGLETON, state.activeTaskId);
}

/**
 * Apply a tasks snapshot to an already-open RuntimeDb handle.
 * Caller must own the connection AND have a BEGIN ... COMMIT transaction
 * already open. Intended for `withAtomicQueueAndTasksMutation`.
 */
export function applyTasksStateToDb<T>(db: RuntimeDb, state: TasksStateShape<T>): void {
  writeStateSqlUnsafe(db, state);
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Migrate any pre-existing tasks JSON file into SQLite. Idempotent: if the
 * JSON file is absent or malformed, this is a no-op. After a successful
 * import the JSON file is renamed with a `.migrated-<ts>` suffix so the
 * import does not repeat. Exported for use by
 * `withAtomicQueueAndTasksMutation`, which needs to run the backfill
 * BEFORE opening its own transaction (the backfill opens its own short
 * BEGIN..COMMIT internally and would otherwise nest).
 */
export async function backfillTasksFromJsonIfPresent(db: RuntimeDb, cwd: string): Promise<void> {
  return backfillFromJsonIfPresent(db, cwd);
}

async function backfillFromJsonIfPresent(db: RuntimeDb, cwd: string): Promise<void> {
  // Skip backfill if we are already inside a coordinated scope: the
  // coordinated helper runs the backfill once at the start, before opening
  // its transaction, and a second backfill inside the scope would issue a
  // BEGIN IMMEDIATE on a fresh connection that races the outer write lock.
  if (isInsideCoordinatedScope()) return;
  const jsonFile = resolve(cwd, TASKS_FILE);
  if (!(await pathExists(jsonFile))) return;

  let raw: string;
  try {
    raw = await readFile(jsonFile, "utf8");
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON: leave the file untouched so the operator can inspect it.
    return;
  }

  if (!isRecord(parsed)) return;
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const activeTaskId =
    typeof parsed.activeTaskId === "string" || parsed.activeTaskId === null
      ? (parsed.activeTaskId as string | null)
      : null;

  db.handle.exec("BEGIN IMMEDIATE");
  try {
    const insert = db.handle.prepare(
      `INSERT OR IGNORE INTO tasks (id, payload_json, status, updated_at) VALUES (?, ?, ?, ?)`,
    );
    for (const task of tasks) {
      const id = isRecord(task) && typeof task.id === "string" ? task.id : null;
      if (!id) continue;
      insert.run(id, JSON.stringify(task), deriveStatus(task), deriveUpdatedAt(task));
    }
    // Only set active_task pointer if not already set (idempotent across re-runs).
    const existingActive = readActiveTaskIdSql(db);
    if (existingActive == null && activeTaskId != null) {
      db.handle
        .prepare(`INSERT OR REPLACE INTO active_task (singleton, task_id) VALUES (?, ?)`)
        .run(ACTIVE_TASK_SINGLETON, activeTaskId);
    } else if (existingActive == null && activeTaskId == null) {
      db.handle
        .prepare(`INSERT OR REPLACE INTO active_task (singleton, task_id) VALUES (?, ?)`)
        .run(ACTIVE_TASK_SINGLETON, null);
    }
    db.handle.exec("COMMIT");
  } catch (error) {
    db.handle.exec("ROLLBACK");
    throw error;
  }

  const migratedPath = `${jsonFile}.migrated-${Date.now()}`;
  await rename(jsonFile, migratedPath).catch(() => undefined);
}

async function withRuntimeDb<R>(cwd: string, fn: (db: RuntimeDb) => R | Promise<R>): Promise<R> {
  const db = openRuntimeDb(cwd);
  try {
    await backfillFromJsonIfPresent(db, cwd);
    return await fn(db);
  } finally {
    closeRuntimeDb(db);
  }
}

export async function ensureTasksState(cwd: string): Promise<void> {
  await withRuntimeDb(cwd, (db) => {
    // Schema is created by openRuntimeDb; ensure the active_task singleton row exists with a null pointer.
    db.handle
      .prepare(`INSERT OR IGNORE INTO active_task (singleton, task_id) VALUES (?, ?)`)
      .run(ACTIVE_TASK_SINGLETON, null);
  });
}

export async function readTasksState<T>(cwd: string): Promise<TasksStateShape<T>> {
  return withRuntimeDb(cwd, (db) => {
    const activeTaskId = readActiveTaskIdSql(db);
    const rows = readTaskRowsSql(db);
    return rowsToState<T>(rows, activeTaskId);
  });
}

export async function writeTasksState<T>(cwd: string, state: TasksStateShape<T>): Promise<void> {
  assertNotInsideCoordinatedScope("writeTasksState");
  return withRuntimeDb(cwd, (db) => {
    db.handle.exec("BEGIN IMMEDIATE");
    try {
      writeStateSqlUnsafe(db, state);
      db.handle.exec("COMMIT");
    } catch (error) {
      db.handle.exec("ROLLBACK");
      throw error;
    }
  });
}

export async function mutateTasksState<T, R>(
  cwd: string,
  fn: (state: TasksStateShape<T>) => R | Promise<R>,
): Promise<R> {
  assertNotInsideCoordinatedScope("mutateTasksState");
  return withRuntimeDb(cwd, async (db) => {
    db.handle.exec("BEGIN IMMEDIATE");
    try {
      const state = rowsToState<T>(readTaskRowsSql(db), readActiveTaskIdSql(db));
      const result = await fn(state);
      writeStateSqlUnsafe(db, state);
      db.handle.exec("COMMIT");
      return result;
    } catch (error) {
      db.handle.exec("ROLLBACK");
      throw error;
    }
  });
}
