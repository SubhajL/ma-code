import { readFile, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { closeRuntimeDb, openRuntimeDb, type RuntimeDb } from "./sqlite-state.ts";
import { assertNotInsideCoordinatedScope, isInsideCoordinatedScope } from "./transaction-coordination.ts";

export const QUEUE_FILE = ".pi/agent/state/runtime/queue.json";
export const QUEUE_STATE_VERSION = 1 as const;
const QUEUE_META_SINGLETON = 1;

export interface QueueStateShape<T> {
  version: 1;
  paused: boolean;
  activeJobId: string | null;
  jobs: T[];
}

interface QueueJobRow {
  id: string;
  payload_json: string;
  status: string;
  enqueued_at: number;
  updated_at: number;
}

interface QueueMetaRow {
  paused: number;
  active_job_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function deriveStatus(job: unknown): string {
  if (isRecord(job) && typeof job.status === "string") return job.status;
  return "unknown";
}

function deriveTimestampField(job: unknown, field: string, fallback: number): number {
  if (isRecord(job) && typeof job[field] === "string") {
    const parsed = Date.parse(job[field] as string);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readQueueMetaSql(db: RuntimeDb): { paused: boolean; activeJobId: string | null } {
  const row = db.handle
    .prepare(`SELECT paused, active_job_id FROM queue_meta WHERE singleton = ?`)
    .get(QUEUE_META_SINGLETON) as unknown as QueueMetaRow | undefined;
  return {
    paused: row ? row.paused !== 0 : false,
    activeJobId: row?.active_job_id ?? null,
  };
}

function readJobRowsSql(db: RuntimeDb): QueueJobRow[] {
  return db.handle
    .prepare(`SELECT id, payload_json, status, enqueued_at, updated_at FROM queue_jobs ORDER BY rowid ASC`)
    .all() as unknown as QueueJobRow[];
}

function rowsToState<T>(rows: QueueJobRow[], meta: { paused: boolean; activeJobId: string | null }): QueueStateShape<T> {
  return {
    version: QUEUE_STATE_VERSION,
    paused: meta.paused,
    activeJobId: meta.activeJobId,
    jobs: rows.map((row) => JSON.parse(row.payload_json) as T),
  };
}

/**
 * Read the canonical queue snapshot from an already-open RuntimeDb handle.
 * Caller must own the connection (and any surrounding transaction).
 * Intended for `withAtomicQueueAndTasksMutation`; single-entity callers
 * should keep using `readQueueState` / `mutateQueueState`.
 */
export function readQueueStateFromDb<T>(db: RuntimeDb): QueueStateShape<T> {
  return rowsToState<T>(readJobRowsSql(db), readQueueMetaSql(db));
}

function writeStateSqlUnsafe<T>(db: RuntimeDb, state: QueueStateShape<T>): void {
  db.handle.exec(`DELETE FROM queue_jobs`);
  const now = Date.now();
  const insert = db.handle.prepare(
    `INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const job of state.jobs) {
    const id = isRecord(job) && typeof job.id === "string" ? job.id : null;
    if (!id) {
      throw new Error(`queue-state: job is missing required string id field: ${JSON.stringify(job)}`);
    }
    const enqueuedAt = deriveTimestampField(job, "enqueuedAt", now);
    const updatedAt = deriveTimestampField(job, "updatedAt", now);
    insert.run(id, JSON.stringify(job), deriveStatus(job), enqueuedAt, updatedAt);
  }
  db.handle
    .prepare(`INSERT OR REPLACE INTO queue_meta (singleton, paused, active_job_id) VALUES (?, ?, ?)`)
    .run(QUEUE_META_SINGLETON, state.paused ? 1 : 0, state.activeJobId);
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
 * Apply a queue snapshot to an already-open RuntimeDb handle.
 * Caller must own the connection AND have a BEGIN ... COMMIT transaction
 * already open. Intended for `withAtomicQueueAndTasksMutation`.
 */
export function applyQueueStateToDb<T>(db: RuntimeDb, state: QueueStateShape<T>): void {
  writeStateSqlUnsafe(db, state);
}

/**
 * Migrate any pre-existing queue JSON file into SQLite. Same semantics as
 * the tasks-state counterpart: idempotent, no-op when absent/malformed,
 * renames the JSON file with `.migrated-<ts>` on success. Exported for use
 * by `withAtomicQueueAndTasksMutation`, which runs the backfill BEFORE
 * opening its own transaction.
 */
export async function backfillQueueFromJsonIfPresent(db: RuntimeDb, cwd: string): Promise<void> {
  return backfillFromJsonIfPresent(db, cwd);
}

async function backfillFromJsonIfPresent(db: RuntimeDb, cwd: string): Promise<void> {
  // Skip backfill if we are already inside a coordinated scope (see the
  // matching guard in tasks-state.ts for the full reasoning).
  if (isInsideCoordinatedScope()) return;
  const jsonFile = resolve(cwd, QUEUE_FILE);
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
    return;
  }

  if (!isRecord(parsed)) return;
  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  const paused = typeof parsed.paused === "boolean" ? parsed.paused : false;
  const activeJobId =
    typeof parsed.activeJobId === "string" || parsed.activeJobId === null
      ? (parsed.activeJobId as string | null)
      : null;

  db.handle.exec("BEGIN IMMEDIATE");
  try {
    const now = Date.now();
    const insert = db.handle.prepare(
      `INSERT OR IGNORE INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const job of jobs) {
      const id = isRecord(job) && typeof job.id === "string" ? job.id : null;
      if (!id) continue;
      const enqueuedAt = deriveTimestampField(job, "enqueuedAt", now);
      const updatedAt = deriveTimestampField(job, "updatedAt", now);
      insert.run(id, JSON.stringify(job), deriveStatus(job), enqueuedAt, updatedAt);
    }
    const existingMeta = readQueueMetaSql(db);
    // Seed queue_meta from JSON only when SQLite hasn't been initialized yet.
    if (existingMeta.activeJobId == null && !existingMeta.paused) {
      db.handle
        .prepare(`INSERT OR REPLACE INTO queue_meta (singleton, paused, active_job_id) VALUES (?, ?, ?)`)
        .run(QUEUE_META_SINGLETON, paused ? 1 : 0, activeJobId);
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

export async function ensureQueueState(cwd: string): Promise<void> {
  await withRuntimeDb(cwd, (db) => {
    db.handle
      .prepare(`INSERT OR IGNORE INTO queue_meta (singleton, paused, active_job_id) VALUES (?, ?, ?)`)
      .run(QUEUE_META_SINGLETON, 0, null);
  });
}

export async function readQueueState<T>(cwd: string): Promise<QueueStateShape<T>> {
  return withRuntimeDb(cwd, (db) => {
    const meta = readQueueMetaSql(db);
    const rows = readJobRowsSql(db);
    return rowsToState<T>(rows, meta);
  });
}

export async function writeQueueState<T>(cwd: string, state: QueueStateShape<T>): Promise<void> {
  assertNotInsideCoordinatedScope("writeQueueState");
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

export async function mutateQueueState<T, R>(
  cwd: string,
  fn: (state: QueueStateShape<T>) => R | Promise<R>,
): Promise<R> {
  assertNotInsideCoordinatedScope("mutateQueueState");
  return withRuntimeDb(cwd, async (db) => {
    db.handle.exec("BEGIN IMMEDIATE");
    try {
      const state = rowsToState<T>(readJobRowsSql(db), readQueueMetaSql(db));
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
