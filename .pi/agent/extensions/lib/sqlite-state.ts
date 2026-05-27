import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const RUNTIME_DB_FILE = ".pi/agent/state/runtime/pi.db";

export const RUNTIME_DB_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS active_task (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  task_id TEXT
);

CREATE TABLE IF NOT EXISTS queue_jobs (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  enqueued_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  paused INTEGER NOT NULL DEFAULT 0,
  active_job_id TEXT
);

CREATE TABLE IF NOT EXISTS leases (
  scope TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  heartbeat_at INTEGER,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_leases_expires_at ON leases(expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  extension TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_log_extension ON audit_log(extension);
`;

export interface RuntimeDb {
  readonly handle: DatabaseSync;
  readonly cwd: string;
  readonly file: string;
}

export interface LeaseRecord {
  scope: string;
  owner: string;
  acquiredAt: number;
  expiresAt: number;
  heartbeatAt: number | null;
  metadata: unknown | null;
}

export interface TryAcquireLeaseInput {
  scope: string;
  owner: string;
  ttlMs: number;
  now: number;
  metadata?: unknown;
}

export interface ReleaseLeaseInput {
  scope: string;
  owner: string;
}

export interface HeartbeatLeaseInput {
  scope: string;
  owner: string;
  ttlMs: number;
  now: number;
}

export interface PurgeExpiredLeasesInput {
  now: number;
}

interface LeaseRow {
  scope: string;
  owner: string;
  acquired_at: number;
  expires_at: number;
  heartbeat_at: number | null;
  metadata_json: string | null;
}

function rowToLease(row: LeaseRow): LeaseRecord {
  return {
    scope: row.scope,
    owner: row.owner,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    heartbeatAt: row.heartbeat_at ?? null,
    metadata: row.metadata_json == null ? null : JSON.parse(row.metadata_json),
  };
}

export function openRuntimeDb(cwd: string): RuntimeDb {
  const file = resolve(cwd, RUNTIME_DB_FILE);
  mkdirSync(dirname(file), { recursive: true });
  const handle = new DatabaseSync(file);
  handle.exec("PRAGMA journal_mode = WAL");
  handle.exec("PRAGMA foreign_keys = ON");
  // SQLite will not serialize concurrent BEGIN IMMEDIATE across connections
  // without a positive busy_timeout: the loser throws SQLITE_BUSY immediately.
  // Five seconds is a generous bound for the harness's bounded operations
  // while still surfacing real deadlocks loudly.
  handle.exec("PRAGMA busy_timeout = 5000");
  handle.exec(RUNTIME_DB_SCHEMA_DDL);
  return { handle, cwd, file };
}

export function closeRuntimeDb(db: RuntimeDb): void {
  db.handle.close();
}

export function tryAcquireLease(db: RuntimeDb, input: TryAcquireLeaseInput): LeaseRecord | null {
  const metadataJson = input.metadata === undefined ? null : JSON.stringify(input.metadata);
  const expiresAt = input.now + input.ttlMs;

  const updateOwn = db.handle.prepare(
    `UPDATE leases
        SET acquired_at = ?, expires_at = ?, heartbeat_at = NULL, metadata_json = ?
      WHERE scope = ? AND owner = ?`,
  );
  const ownResult = updateOwn.run(
    input.now,
    expiresAt,
    metadataJson,
    input.scope,
    input.owner,
  );
  if (Number(ownResult.changes) > 0) {
    return readLease(db, input.scope);
  }

  const stealExpired = db.handle.prepare(
    `UPDATE leases
        SET owner = ?, acquired_at = ?, expires_at = ?, heartbeat_at = NULL, metadata_json = ?
      WHERE scope = ? AND expires_at <= ?`,
  );
  const stealResult = stealExpired.run(
    input.owner,
    input.now,
    expiresAt,
    metadataJson,
    input.scope,
    input.now,
  );
  if (Number(stealResult.changes) > 0) {
    return readLease(db, input.scope);
  }

  try {
    const insert = db.handle.prepare(
      `INSERT INTO leases (scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    );
    insert.run(input.scope, input.owner, input.now, expiresAt, metadataJson);
    return readLease(db, input.scope);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return null;
    }
    throw error;
  }
}

export function releaseLease(db: RuntimeDb, input: ReleaseLeaseInput): boolean {
  const stmt = db.handle.prepare(`DELETE FROM leases WHERE scope = ? AND owner = ?`);
  const result = stmt.run(input.scope, input.owner);
  return Number(result.changes) > 0;
}

export function heartbeatLease(
  db: RuntimeDb,
  input: HeartbeatLeaseInput,
): LeaseRecord | null {
  const stmt = db.handle.prepare(
    `UPDATE leases
        SET expires_at = ?, heartbeat_at = ?
      WHERE scope = ? AND owner = ?`,
  );
  const result = stmt.run(
    input.now + input.ttlMs,
    input.now,
    input.scope,
    input.owner,
  );
  if (Number(result.changes) === 0) return null;
  return readLease(db, input.scope);
}

export function purgeExpiredLeases(db: RuntimeDb, input: PurgeExpiredLeasesInput): number {
  const stmt = db.handle.prepare(`DELETE FROM leases WHERE expires_at <= ?`);
  const result = stmt.run(input.now);
  return Number(result.changes);
}

export function listLeases(db: RuntimeDb): LeaseRecord[] {
  const rows = db.handle
    .prepare(`SELECT scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json FROM leases ORDER BY acquired_at ASC, scope ASC`)
    .all() as unknown as LeaseRow[];
  return rows.map(rowToLease);
}

function readLease(db: RuntimeDb, scope: string): LeaseRecord | null {
  const row = db.handle
    .prepare(`SELECT scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json FROM leases WHERE scope = ?`)
    .get(scope) as unknown as LeaseRow | undefined;
  return row ? rowToLease(row) : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: string }).message ?? "";
  const code = (error as { code?: string }).code ?? "";
  return /UNIQUE constraint failed/i.test(message) || code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT_UNIQUE";
}
