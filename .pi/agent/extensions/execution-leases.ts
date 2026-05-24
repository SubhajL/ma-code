import { readFile, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  closeRuntimeDb,
  openRuntimeDb,
  type RuntimeDb,
} from "./lib/sqlite-state.ts";

export const LEASES_FILE = ".pi/agent/state/runtime/leases.json";
export const EXECUTION_LEASE_STATE_VERSION = 1 as const;
export const QUEUE_SESSION_LEASE_SCOPE = "queue-session";
export const LOCAL_MAIN_INTEGRATION_LEASE_SCOPE = "local-main-integration";
export const WORKER_LANE_LEASE_TYPE = "worker_lane";

const ID_METADATA_KEY = "__leaseId";

export type ExecutionLeaseMetadata = Record<string, string | null>;

export interface ExecutionLeaseRecord {
  id: string;
  scope: string;
  owner: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string | null;
  metadata?: ExecutionLeaseMetadata;
}

export interface ExecutionLeaseState {
  version: 1;
  leases: ExecutionLeaseRecord[];
}

export interface AcquireExecutionLeaseInput {
  id: string;
  scope: string;
  owner: string;
  acquiredAt?: string;
  expiresAt: string;
  heartbeatAt?: string | null;
  metadata?: ExecutionLeaseMetadata;
  now?: string;
}

export interface AcquireExecutionLeaseResult {
  acquired: boolean;
  lease: ExecutionLeaseRecord | null;
  conflict: ExecutionLeaseRecord | null;
  state: ExecutionLeaseState;
}

export interface ReleaseExecutionLeaseResult {
  released: boolean;
  releasedLease: ExecutionLeaseRecord | null;
  state: ExecutionLeaseState;
}

export interface ExecutionLeaseSummary {
  activeLeaseCount: number;
  activeScopes: string[];
  leases: Array<Pick<ExecutionLeaseRecord, "id" | "scope" | "owner" | "expiresAt" | "heartbeatAt">>;
}

export interface ClearStaleExecutionLeasesResult {
  removedLeases: ExecutionLeaseRecord[];
  retainedLeases: ExecutionLeaseRecord[];
  state: ExecutionLeaseState;
}

export interface WorkerLaneLeaseInput {
  id: string;
  scopeKey: string;
  owner: string;
  expiresAt: string;
  acquiredAt?: string;
  now?: string;
  jobId?: string | null;
  taskId?: string | null;
  worktreePath: string;
  branchName: string;
}

export interface FindWorkerLaneLeaseInput {
  leaseId?: string;
  scopeKey?: string;
  owner?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function defaultExecutionLeaseState(): ExecutionLeaseState {
  return { version: EXECUTION_LEASE_STATE_VERSION, leases: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLeaseMetadata(raw: unknown): ExecutionLeaseMetadata | undefined {
  if (!isRecord(raw)) return undefined;
  const metadata: ExecutionLeaseMetadata = {};
  for (const key of Object.keys(raw)) {
    if (key === ID_METADATA_KEY) continue;
    const value = raw[key];
    if (typeof value === "string") metadata[key] = value;
    if (value === null) metadata[key] = null;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeLeaseRecord(raw: unknown): ExecutionLeaseRecord | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string") return null;
  if (typeof raw.scope !== "string") return null;
  if (typeof raw.owner !== "string") return null;
  if (typeof raw.acquiredAt !== "string") return null;
  if (typeof raw.expiresAt !== "string") return null;
  if (!(typeof raw.heartbeatAt === "string" || raw.heartbeatAt === null || raw.heartbeatAt === undefined)) return null;

  const heartbeatAt = typeof raw.heartbeatAt === "string" ? raw.heartbeatAt : null;

  return {
    id: raw.id,
    scope: raw.scope,
    owner: raw.owner,
    acquiredAt: raw.acquiredAt,
    expiresAt: raw.expiresAt,
    heartbeatAt,
    metadata: normalizeLeaseMetadata(raw.metadata),
  };
}

export function normalizeExecutionLeaseState(raw: unknown): ExecutionLeaseState {
  if (!isRecord(raw)) return defaultExecutionLeaseState();
  const leases = Array.isArray(raw.leases)
    ? raw.leases
        .map(normalizeLeaseRecord)
        .filter((lease): lease is ExecutionLeaseRecord => lease !== null)
    : [];
  return { version: EXECUTION_LEASE_STATE_VERSION, leases };
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isExpired(lease: ExecutionLeaseRecord, now: string): boolean {
  const expiresMs = timestampMs(lease.expiresAt);
  const nowMs = timestampMs(now);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) return false;
  return expiresMs <= nowMs;
}

export function isExecutionLeaseStale(lease: ExecutionLeaseRecord, now: string = nowIso()): boolean {
  return isExpired(lease, now);
}

export function pruneExpiredExecutionLeases(state: ExecutionLeaseState, now: string = nowIso()): ExecutionLeaseState {
  return {
    version: EXECUTION_LEASE_STATE_VERSION,
    leases: state.leases.filter((lease) => !isExpired(lease, now)),
  };
}

// --- SQLite-backed implementation -------------------------------------------------

interface LeaseRow {
  scope: string;
  owner: string;
  acquired_at: number;
  expires_at: number;
  heartbeat_at: number | null;
  metadata_json: string | null;
}

function rowToRecord(row: LeaseRow): ExecutionLeaseRecord {
  const parsedMeta: unknown = row.metadata_json ? JSON.parse(row.metadata_json) : null;
  const id =
    isRecord(parsedMeta) && typeof parsedMeta[ID_METADATA_KEY] === "string"
      ? String(parsedMeta[ID_METADATA_KEY])
      : "";
  return {
    id,
    scope: row.scope,
    owner: row.owner,
    acquiredAt: new Date(row.acquired_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    heartbeatAt: row.heartbeat_at == null ? null : new Date(row.heartbeat_at).toISOString(),
    metadata: normalizeLeaseMetadata(parsedMeta),
  };
}

function encodeMetadata(id: string, metadata: ExecutionLeaseMetadata | undefined): string {
  const payload: Record<string, string | null> = { ...(metadata ?? {}) };
  payload[ID_METADATA_KEY] = id;
  return JSON.stringify(payload);
}

function readAllLeasesSql(db: RuntimeDb): ExecutionLeaseRecord[] {
  const rows = db.handle
    .prepare(
      `SELECT scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json FROM leases ORDER BY acquired_at ASC, scope ASC`,
    )
    .all() as unknown as LeaseRow[];
  return rows.map(rowToRecord);
}

function findLeaseByScopeSql(db: RuntimeDb, scope: string): ExecutionLeaseRecord | null {
  const row = db.handle
    .prepare(
      `SELECT scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json FROM leases WHERE scope = ?`,
    )
    .get(scope) as unknown as LeaseRow | undefined;
  return row ? rowToRecord(row) : null;
}

function deleteExpiredSql(db: RuntimeDb, nowMs: number): void {
  db.handle.prepare(`DELETE FROM leases WHERE expires_at <= ?`).run(nowMs);
}

function insertLeaseSql(db: RuntimeDb, input: AcquireExecutionLeaseInput, now: string): ExecutionLeaseRecord {
  const acquiredAt = input.acquiredAt ?? now;
  const heartbeatAt = input.heartbeatAt ?? null;
  const acquiredMs = Date.parse(acquiredAt);
  const expiresMs = Date.parse(input.expiresAt);
  const heartbeatMs = heartbeatAt ? Date.parse(heartbeatAt) : null;
  db.handle
    .prepare(
      `INSERT INTO leases (scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.scope,
      input.owner,
      acquiredMs,
      expiresMs,
      heartbeatMs,
      encodeMetadata(input.id, input.metadata),
    );
  return {
    id: input.id,
    scope: input.scope,
    owner: input.owner,
    acquiredAt,
    expiresAt: input.expiresAt,
    heartbeatAt,
    metadata: input.metadata,
  };
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

async function backfillFromJsonIfPresent(db: RuntimeDb, cwd: string): Promise<void> {
  const jsonFile = resolve(cwd, LEASES_FILE);
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

  const state = normalizeExecutionLeaseState(parsed);

  if (state.leases.length > 0) {
    db.handle.exec("BEGIN IMMEDIATE");
    try {
      const insert = db.handle.prepare(
        `INSERT OR IGNORE INTO leases (scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const lease of state.leases) {
        const acquiredMs = Date.parse(lease.acquiredAt);
        const expiresMs = Date.parse(lease.expiresAt);
        const heartbeatMs = lease.heartbeatAt ? Date.parse(lease.heartbeatAt) : null;
        insert.run(
          lease.scope,
          lease.owner,
          acquiredMs,
          expiresMs,
          heartbeatMs,
          encodeMetadata(lease.id, lease.metadata),
        );
      }
      db.handle.exec("COMMIT");
    } catch (error) {
      db.handle.exec("ROLLBACK");
      throw error;
    }
  }

  const migratedPath = `${jsonFile}.migrated-${Date.now()}`;
  await rename(jsonFile, migratedPath).catch(() => undefined);
}

async function withRuntimeDb<T>(cwd: string, fn: (db: RuntimeDb) => T | Promise<T>): Promise<T> {
  const db = openRuntimeDb(cwd);
  try {
    await backfillFromJsonIfPresent(db, cwd);
    return await fn(db);
  } finally {
    closeRuntimeDb(db);
  }
}

export async function readExecutionLeaseState(cwd: string): Promise<ExecutionLeaseState> {
  return withRuntimeDb(cwd, (db) => ({
    version: EXECUTION_LEASE_STATE_VERSION,
    leases: readAllLeasesSql(db),
  }));
}

export async function writeExecutionLeaseState(cwd: string, state: ExecutionLeaseState): Promise<void> {
  return withRuntimeDb(cwd, (db) => {
    db.handle.exec("BEGIN IMMEDIATE");
    try {
      db.handle.exec("DELETE FROM leases");
      const insert = db.handle.prepare(
        `INSERT INTO leases (scope, owner, acquired_at, expires_at, heartbeat_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const lease of normalizeExecutionLeaseState(state).leases) {
        insert.run(
          lease.scope,
          lease.owner,
          Date.parse(lease.acquiredAt),
          Date.parse(lease.expiresAt),
          lease.heartbeatAt ? Date.parse(lease.heartbeatAt) : null,
          encodeMetadata(lease.id, lease.metadata),
        );
      }
      db.handle.exec("COMMIT");
    } catch (error) {
      db.handle.exec("ROLLBACK");
      throw error;
    }
  });
}

export async function acquireExecutionLease(
  cwd: string,
  input: AcquireExecutionLeaseInput,
): Promise<AcquireExecutionLeaseResult> {
  return withRuntimeDb(cwd, (db) => {
    const now = input.now ?? input.acquiredAt ?? nowIso();
    const nowMs = Date.parse(now);

    db.handle.exec("BEGIN IMMEDIATE");
    try {
      deleteExpiredSql(db, nowMs);

      const conflict = findLeaseByScopeSql(db, input.scope);
      if (conflict) {
        db.handle.exec("COMMIT");
        return {
          acquired: false,
          lease: null,
          conflict,
          state: { version: EXECUTION_LEASE_STATE_VERSION, leases: readAllLeasesSql(db) },
        };
      }

      const lease = insertLeaseSql(db, input, now);
      db.handle.exec("COMMIT");
      return {
        acquired: true,
        lease,
        conflict: null,
        state: { version: EXECUTION_LEASE_STATE_VERSION, leases: readAllLeasesSql(db) },
      };
    } catch (error) {
      db.handle.exec("ROLLBACK");
      throw error;
    }
  });
}

export async function releaseExecutionLease(
  cwd: string,
  leaseId: string,
): Promise<ReleaseExecutionLeaseResult> {
  return withRuntimeDb(cwd, (db) => {
    const all = readAllLeasesSql(db);
    const releasedLease = all.find((lease) => lease.id === leaseId) ?? null;
    if (releasedLease) {
      db.handle.prepare(`DELETE FROM leases WHERE scope = ?`).run(releasedLease.scope);
    }
    return {
      released: releasedLease !== null,
      releasedLease,
      state: { version: EXECUTION_LEASE_STATE_VERSION, leases: readAllLeasesSql(db) },
    };
  });
}

export async function clearStaleExecutionLeases(
  cwd: string,
  now: string = nowIso(),
): Promise<ClearStaleExecutionLeasesResult> {
  return withRuntimeDb(cwd, (db) => {
    const all = readAllLeasesSql(db);
    const removedLeases = all.filter((lease) => isExpired(lease, now));
    const retainedLeases = all.filter((lease) => !isExpired(lease, now));
    if (removedLeases.length > 0) {
      deleteExpiredSql(db, Date.parse(now));
    }
    return {
      removedLeases,
      retainedLeases,
      state: { version: EXECUTION_LEASE_STATE_VERSION, leases: retainedLeases },
    };
  });
}

export async function acquireLocalMainIntegrationLease(
  cwd: string,
  input: { id: string; owner: string; expiresAt: string; acquiredAt?: string; now?: string },
): Promise<AcquireExecutionLeaseResult> {
  return acquireExecutionLease(cwd, {
    id: input.id,
    scope: LOCAL_MAIN_INTEGRATION_LEASE_SCOPE,
    owner: input.owner,
    acquiredAt: input.acquiredAt,
    expiresAt: input.expiresAt,
    now: input.now,
  });
}

export async function releaseLocalMainIntegrationLease(
  cwd: string,
  leaseId: string,
): Promise<ReleaseExecutionLeaseResult> {
  return releaseExecutionLease(cwd, leaseId);
}

export function workerLaneLeaseScope(scopeKey: string): string {
  return `${WORKER_LANE_LEASE_TYPE}:${scopeKey}`;
}

export function findWorkerLaneLeaseInState(
  state: ExecutionLeaseState,
  input: FindWorkerLaneLeaseInput,
): ExecutionLeaseRecord | null {
  return (
    state.leases.find((lease) => {
      if (
        lease.metadata?.leaseType !== WORKER_LANE_LEASE_TYPE &&
        !lease.scope.startsWith(`${WORKER_LANE_LEASE_TYPE}:`)
      )
        return false;
      if (input.leaseId && lease.id !== input.leaseId) return false;
      if (input.scopeKey && lease.scope !== workerLaneLeaseScope(input.scopeKey)) return false;
      if (input.owner && lease.owner !== input.owner) return false;
      return true;
    }) ?? null
  );
}

export async function findWorkerLaneLease(
  cwd: string,
  input: FindWorkerLaneLeaseInput,
): Promise<ExecutionLeaseRecord | null> {
  return findWorkerLaneLeaseInState(await readExecutionLeaseState(cwd), input);
}

export async function acquireWorkerLaneLease(
  cwd: string,
  input: WorkerLaneLeaseInput,
): Promise<AcquireExecutionLeaseResult> {
  return acquireExecutionLease(cwd, {
    id: input.id,
    scope: workerLaneLeaseScope(input.scopeKey),
    owner: input.owner,
    acquiredAt: input.acquiredAt,
    expiresAt: input.expiresAt,
    now: input.now,
    metadata: {
      leaseType: WORKER_LANE_LEASE_TYPE,
      scopeKey: input.scopeKey,
      jobId: input.jobId ?? null,
      taskId: input.taskId ?? null,
      worktreePath: input.worktreePath,
      branchName: input.branchName,
    },
  });
}

export async function releaseWorkerLaneLease(
  cwd: string,
  input: FindWorkerLaneLeaseInput,
): Promise<ReleaseExecutionLeaseResult> {
  const lease = await findWorkerLaneLease(cwd, input);
  if (!lease) {
    return {
      released: false,
      releasedLease: null,
      state: await readExecutionLeaseState(cwd),
    };
  }
  return releaseExecutionLease(cwd, lease.id);
}

export function summarizeExecutionLeases(state: ExecutionLeaseState): ExecutionLeaseSummary {
  return {
    activeLeaseCount: state.leases.length,
    activeScopes: [...new Set(state.leases.map((lease) => lease.scope))],
    leases: state.leases.map((lease) => ({
      id: lease.id,
      scope: lease.scope,
      owner: lease.owner,
      expiresAt: lease.expiresAt,
      heartbeatAt: lease.heartbeatAt,
    })),
  };
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function executionLeasesExtension(): void {}
