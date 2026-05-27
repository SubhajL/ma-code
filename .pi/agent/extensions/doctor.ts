import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { RUNTIME_DB_FILE } from "./lib/sqlite-state.ts";

interface ProbeDb {
  readonly handle: DatabaseSync;
}

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheckResult {
  name: string;
  status: DoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorReport {
  version: 1;
  cwd: string;
  startedAt: string;
  finishedAt: string;
  overall: DoctorCheckStatus;
  checks: DoctorCheckResult[];
}

const LEASES_FILE = ".pi/agent/state/runtime/leases.json";
const QUEUE_FILE = ".pi/agent/state/runtime/queue.json";
const TASKS_FILE = ".pi/agent/state/runtime/tasks.json";
const SCHEMAS_DIR = ".pi/agent/state/schemas";
const MODELS_FILE = ".pi/agent/models.json";
const AUDIT_LOG = "logs/harness-actions.jsonl";

async function pathExists(absolute: string): Promise<boolean> {
  try {
    await stat(absolute);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readJsonOrNull(absolute: string): Promise<unknown> {
  if (!(await pathExists(absolute))) return null;
  const raw = await readFile(absolute, "utf8");
  return JSON.parse(raw);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function checkRuntimeState(cwd: string): Promise<DoctorCheckResult> {
  const files = [
    { label: "leases", path: LEASES_FILE },
    { label: "queue", path: QUEUE_FILE },
    { label: "tasks", path: TASKS_FILE },
  ];
  const details: Record<string, unknown> = {};
  const problems: string[] = [];

  for (const file of files) {
    const absolute = resolve(cwd, file.path);
    if (!(await pathExists(absolute))) {
      details[file.label] = "absent";
      continue;
    }
    try {
      const parsed = await readJsonOrNull(absolute);
      if (!isObject(parsed)) {
        problems.push(`${file.label}: not an object`);
        details[file.label] = "malformed";
        continue;
      }
      if (parsed.version !== 1) {
        problems.push(`${file.label}: missing or unexpected version (got ${String(parsed.version)})`);
        details[file.label] = "version-mismatch";
        continue;
      }
      details[file.label] = "ok";
    } catch (error) {
      problems.push(`${file.label}: ${(error as Error).message}`);
      details[file.label] = "parse-error";
    }
  }

  if (problems.length > 0) {
    return {
      name: "runtime-state",
      status: "fail",
      message: `Runtime state issues: ${problems.join("; ")}`,
      details,
    };
  }
  return {
    name: "runtime-state",
    status: "pass",
    message: "All runtime state files (leases, queue, tasks) parse and have version 1.",
    details,
  };
}

export async function checkSchemas(cwd: string): Promise<DoctorCheckResult> {
  const dir = resolve(cwd, SCHEMAS_DIR);
  if (!(await pathExists(dir))) {
    return {
      name: "schemas-valid",
      status: "fail",
      message: `Schemas directory missing: ${SCHEMAS_DIR}`,
    };
  }
  const entries = await readdir(dir);
  const schemaFiles = entries.filter((name) => name.endsWith(".schema.json"));
  if (schemaFiles.length === 0) {
    return {
      name: "schemas-valid",
      status: "warn",
      message: `No *.schema.json files found in ${SCHEMAS_DIR}`,
    };
  }
  const problems: string[] = [];
  for (const file of schemaFiles) {
    const absolute = resolve(dir, file);
    try {
      const parsed = await readJsonOrNull(absolute);
      if (!isObject(parsed)) {
        problems.push(`${file}: not an object`);
      }
    } catch (error) {
      problems.push(`${file}: ${(error as Error).message}`);
    }
  }
  if (problems.length > 0) {
    return {
      name: "schemas-valid",
      status: "fail",
      message: `Schema parse errors: ${problems.join("; ")}`,
      details: { schemaCount: schemaFiles.length, problems },
    };
  }
  return {
    name: "schemas-valid",
    status: "pass",
    message: `All ${schemaFiles.length} schema files parse as JSON objects.`,
    details: { schemaCount: schemaFiles.length },
  };
}

export async function checkModelsConfig(cwd: string): Promise<DoctorCheckResult> {
  const absolute = resolve(cwd, MODELS_FILE);
  if (!(await pathExists(absolute))) {
    return {
      name: "models-config",
      status: "fail",
      message: `Models config missing: ${MODELS_FILE}`,
    };
  }
  try {
    const parsed = await readJsonOrNull(absolute);
    if (!isObject(parsed)) {
      return {
        name: "models-config",
        status: "fail",
        message: `${MODELS_FILE} is not a JSON object`,
      };
    }
    if (!isObject(parsed.routing_defaults)) {
      return {
        name: "models-config",
        status: "fail",
        message: `${MODELS_FILE}: missing routing_defaults object`,
      };
    }
    const roleCount = Object.keys(parsed.routing_defaults).length;
    return {
      name: "models-config",
      status: "pass",
      message: `Models config parses with ${roleCount} role routing defaults.`,
      details: { roleCount },
    };
  } catch (error) {
    return {
      name: "models-config",
      status: "fail",
      message: `${MODELS_FILE} parse error: ${(error as Error).message}`,
    };
  }
}

export async function checkAuditLog(cwd: string): Promise<DoctorCheckResult> {
  const absolute = resolve(cwd, AUDIT_LOG);
  if (!(await pathExists(absolute))) {
    return {
      name: "audit-log",
      status: "pass",
      message: `${AUDIT_LOG} not yet created (no harness actions recorded).`,
      details: { lineCount: 0 },
    };
  }
  const raw = await readFile(absolute, "utf8");
  const lines = raw.split("\n").filter((line) => line.length > 0);
  const problems: Array<{ lineNumber: number; reason: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    try {
      JSON.parse(lines[index]);
    } catch (error) {
      problems.push({ lineNumber: index + 1, reason: (error as Error).message });
      if (problems.length >= 5) break;
    }
  }
  if (problems.length > 0) {
    return {
      name: "audit-log",
      status: "fail",
      message: `${AUDIT_LOG} has ${problems.length} unparseable line(s); first: line ${problems[0].lineNumber}.`,
      details: { lineCount: lines.length, problems },
    };
  }
  return {
    name: "audit-log",
    status: "pass",
    message: `${AUDIT_LOG} parses cleanly (${lines.length} lines).`,
    details: { lineCount: lines.length },
  };
}

const REQUIRED_SQLITE_TABLES = [
  "tasks",
  "active_task",
  "queue_jobs",
  "queue_meta",
  "leases",
  "audit_log",
] as const;

async function withSqliteRuntime<R>(
  cwd: string,
  fn: (db: ProbeDb) => R,
): Promise<{ kind: "ok"; value: R } | { kind: "absent" } | { kind: "open-failed"; error: string }> {
  const absolute = resolve(cwd, RUNTIME_DB_FILE);
  if (!(await pathExists(absolute))) return { kind: "absent" };
  let handle: DatabaseSync;
  try {
    handle = new DatabaseSync(absolute);
    handle.exec("PRAGMA query_only = ON");
  } catch (error) {
    return { kind: "open-failed", error: (error as Error).message };
  }
  try {
    return { kind: "ok", value: fn({ handle }) };
  } finally {
    handle.close();
  }
}

function listSqliteTables(db: ProbeDb): Set<string> {
  const rows = db.handle
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as unknown as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function countRows(db: ProbeDb, table: string): number {
  const row = db.handle.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as unknown as { n: number };
  return Number(row.n);
}

function readIntegrityCheck(db: ProbeDb): string {
  const rows = db.handle.prepare(`PRAGMA integrity_check`).all() as unknown as Array<{ integrity_check: string }>;
  if (rows.length === 0) return "no-result";
  if (rows.length === 1 && rows[0].integrity_check === "ok") return "ok";
  return rows.map((row) => row.integrity_check).join("; ");
}

export async function checkSqliteRuntimeDb(cwd: string): Promise<DoctorCheckResult> {
  let probe: Awaited<ReturnType<typeof withSqliteRuntime<{
    tableStatus: Record<string, boolean>;
    missing: string[];
    integrity: string;
    rowCounts: Record<string, number | null>;
  }>>>;
  try {
    probe = await withSqliteRuntime(cwd, (db) => {
      const tables = listSqliteTables(db);
      const tableStatus: Record<string, boolean> = {};
      const missing: string[] = [];
      for (const name of REQUIRED_SQLITE_TABLES) {
        const present = tables.has(name);
        tableStatus[name] = present;
        if (!present) missing.push(name);
      }
      const integrity = readIntegrityCheck(db);
      const rowCounts: Record<string, number | null> = {};
      for (const name of ["tasks", "queue_jobs", "leases", "audit_log"] as const) {
        rowCounts[name] = tables.has(name) ? countRows(db, name) : null;
      }
      return { tableStatus, missing, integrity, rowCounts };
    });
  } catch (error) {
    return {
      name: "sqlite-runtime-db",
      status: "fail",
      message: `Runtime DB probe threw: ${(error as Error).message}`,
    };
  }

  if (probe.kind === "absent") {
    return {
      name: "sqlite-runtime-db",
      status: "fail",
      message: `Runtime DB ${RUNTIME_DB_FILE} is missing; SQLite is the canonical runtime store. Run any harness command (e.g. \`npm run harness:status\`) once to lazily initialize the DB.`,
    };
  }
  if (probe.kind === "open-failed") {
    return {
      name: "sqlite-runtime-db",
      status: "fail",
      message: `Runtime DB ${RUNTIME_DB_FILE} could not be opened: ${probe.error}`,
    };
  }

  const details: Record<string, unknown> = {
    file: RUNTIME_DB_FILE,
    tables: probe.value.tableStatus,
    integrity: probe.value.integrity,
    rowCounts: probe.value.rowCounts,
  };

  if (probe.value.missing.length > 0) {
    return {
      name: "sqlite-runtime-db",
      status: "fail",
      message: `Runtime DB ${RUNTIME_DB_FILE} is missing required tables: ${probe.value.missing.join(", ")}`,
      details,
    };
  }
  if (probe.value.integrity !== "ok") {
    return {
      name: "sqlite-runtime-db",
      status: "fail",
      message: `Runtime DB integrity_check returned: ${probe.value.integrity}`,
      details,
    };
  }
  return {
    name: "sqlite-runtime-db",
    status: "pass",
    message: `Runtime DB ${RUNTIME_DB_FILE} has all expected tables; integrity_check ok.`,
    details,
  };
}

function readActiveTaskId(db: ProbeDb): string | null {
  const row = db.handle
    .prepare(`SELECT task_id FROM active_task WHERE singleton = 1`)
    .get() as unknown as { task_id: string | null } | undefined;
  return row?.task_id ?? null;
}

function readActiveJobId(db: ProbeDb): string | null {
  const row = db.handle
    .prepare(`SELECT active_job_id FROM queue_meta WHERE singleton = 1`)
    .get() as unknown as { active_job_id: string | null } | undefined;
  return row?.active_job_id ?? null;
}

interface QueueJobPayloadReadResult {
  parsed: Array<{ id: string; payload: Record<string, unknown> }>;
  malformedIds: string[];
}

function readQueueJobPayloads(db: ProbeDb): QueueJobPayloadReadResult {
  const rows = db.handle
    .prepare(`SELECT id, payload_json FROM queue_jobs`)
    .all() as unknown as Array<{ id: string; payload_json: string }>;
  const parsed: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const malformedIds: string[] = [];
  for (const row of rows) {
    try {
      const value = JSON.parse(row.payload_json) as unknown;
      if (isObject(value)) {
        parsed.push({ id: row.id, payload: value });
      } else {
        malformedIds.push(row.id);
      }
    } catch {
      malformedIds.push(row.id);
    }
  }
  return { parsed, malformedIds };
}

function readTaskIds(db: ProbeDb): Set<string> {
  const rows = db.handle.prepare(`SELECT id FROM tasks`).all() as unknown as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

interface ConsistencyProbeOk {
  kind: "ok";
  activeTaskId: string | null;
  activeJobId: string | null;
  taskIds: Set<string>;
  jobIds: Set<string>;
  danglingLinkedTaskIds: Array<{ jobId: string; linkedTaskId: string }>;
  malformedPayloadJobIds: string[];
}

interface ConsistencyProbeSchemaBroken {
  kind: "schema-broken";
  missing: string[];
}

export async function checkSqliteConsistency(cwd: string): Promise<DoctorCheckResult> {
  let probe: Awaited<ReturnType<typeof withSqliteRuntime<ConsistencyProbeOk | ConsistencyProbeSchemaBroken>>>;
  try {
    probe = await withSqliteRuntime(cwd, (db): ConsistencyProbeOk | ConsistencyProbeSchemaBroken => {
      const tables = listSqliteTables(db);
      const missing = REQUIRED_SQLITE_TABLES.filter((name) => !tables.has(name));
      if (missing.length > 0) {
        return { kind: "schema-broken", missing };
      }
      const taskIds = readTaskIds(db);
      const jobIds = new Set(
        (db.handle.prepare(`SELECT id FROM queue_jobs`).all() as unknown as Array<{ id: string }>).map(
          (row) => row.id,
        ),
      );
      const activeTaskId = readActiveTaskId(db);
      const activeJobId = readActiveJobId(db);
      const { parsed, malformedIds } = readQueueJobPayloads(db);
      const danglingLinkedTaskIds: Array<{ jobId: string; linkedTaskId: string }> = [];
      for (const entry of parsed) {
        const linked = entry.payload.linkedTaskId;
        if (typeof linked === "string" && !taskIds.has(linked)) {
          danglingLinkedTaskIds.push({ jobId: entry.id, linkedTaskId: linked });
        }
      }
      return {
        kind: "ok",
        activeTaskId,
        activeJobId,
        taskIds,
        jobIds,
        danglingLinkedTaskIds,
        malformedPayloadJobIds: malformedIds,
      };
    });
  } catch (error) {
    return {
      name: "sqlite-consistency",
      status: "fail",
      message: `Runtime DB consistency probe threw: ${(error as Error).message}`,
    };
  }

  if (probe.kind === "absent") {
    return {
      name: "sqlite-consistency",
      status: "fail",
      message: `Runtime DB ${RUNTIME_DB_FILE} is missing; consistency checks require an initialized SQLite store.`,
    };
  }
  if (probe.kind === "open-failed") {
    return {
      name: "sqlite-consistency",
      status: "fail",
      message: `Runtime DB ${RUNTIME_DB_FILE} could not be opened: ${probe.error}`,
    };
  }
  if (probe.value.kind === "schema-broken") {
    return {
      name: "sqlite-consistency",
      status: "fail",
      message: `Runtime DB schema is broken; cannot run consistency checks. Missing tables: ${probe.value.missing.join(", ")}`,
      details: { missing: probe.value.missing },
    };
  }

  const value = probe.value;
  const details: Record<string, unknown> = {
    activeTaskId: value.activeTaskId,
    activeJobId: value.activeJobId,
    danglingLinkedTaskIds: value.danglingLinkedTaskIds,
    malformedPayloadJobIds: value.malformedPayloadJobIds,
  };

  const problems: string[] = [];
  if (value.activeTaskId != null && !value.taskIds.has(value.activeTaskId)) {
    problems.push(`activeTaskId=${value.activeTaskId} has no matching task row`);
  }
  if (value.activeJobId != null && !value.jobIds.has(value.activeJobId)) {
    problems.push(`activeJobId=${value.activeJobId} has no matching queue_jobs row`);
  }
  if (value.danglingLinkedTaskIds.length > 0) {
    const formatted = value.danglingLinkedTaskIds
      .map((entry) => `${entry.jobId}->${entry.linkedTaskId}`)
      .join(", ");
    problems.push(`dangling linkedTaskId references: ${formatted}`);
  }
  if (value.malformedPayloadJobIds.length > 0) {
    problems.push(`queue_jobs rows with malformed/non-object payload_json: ${value.malformedPayloadJobIds.join(", ")}`);
  }

  if (problems.length > 0) {
    return {
      name: "sqlite-consistency",
      status: "fail",
      message: `Runtime DB consistency issues: ${problems.join("; ")}`,
      details,
    };
  }
  return {
    name: "sqlite-consistency",
    status: "pass",
    message: "Active task/job pointers reference real rows; queue jobs' linkedTaskId references and payload_json are all valid.",
    details,
  };
}

type AuditProbe = { kind: "ok"; rowCount: number } | { kind: "missing-table" };

export async function checkSqliteAuditLog(cwd: string): Promise<DoctorCheckResult> {
  let probe: Awaited<ReturnType<typeof withSqliteRuntime<AuditProbe>>>;
  try {
    probe = await withSqliteRuntime(cwd, (db): AuditProbe => {
      const tables = listSqliteTables(db);
      if (!tables.has("audit_log")) return { kind: "missing-table" };
      return { kind: "ok", rowCount: countRows(db, "audit_log") };
    });
  } catch (error) {
    return {
      name: "sqlite-audit-log",
      status: "fail",
      message: `SQLite audit_log probe threw: ${(error as Error).message}`,
    };
  }

  if (probe.kind === "absent") {
    return {
      name: "sqlite-audit-log",
      status: "fail",
      message: `Runtime DB ${RUNTIME_DB_FILE} is missing; SQLite audit_log table cannot be probed.`,
    };
  }
  if (probe.kind === "open-failed") {
    return {
      name: "sqlite-audit-log",
      status: "fail",
      message: `Runtime DB ${RUNTIME_DB_FILE} could not be opened: ${probe.error}`,
    };
  }
  if (probe.value.kind === "missing-table") {
    return {
      name: "sqlite-audit-log",
      status: "fail",
      message: `SQLite audit_log table is missing from ${RUNTIME_DB_FILE}.`,
    };
  }
  return {
    name: "sqlite-audit-log",
    status: "pass",
    message: `SQLite audit_log table is queryable (${probe.value.rowCount} rows).`,
    details: { rowCount: probe.value.rowCount },
  };
}

export async function runAllChecks(cwd: string): Promise<DoctorReport> {
  const startedAt = new Date().toISOString();
  const results = await Promise.all([
    checkRuntimeState(cwd),
    checkSchemas(cwd),
    checkModelsConfig(cwd),
    checkAuditLog(cwd),
    checkSqliteRuntimeDb(cwd),
    checkSqliteConsistency(cwd),
    checkSqliteAuditLog(cwd),
  ]);
  const finishedAt = new Date().toISOString();
  const overall: DoctorCheckStatus = results.some((r) => r.status === "fail")
    ? "fail"
    : results.some((r) => r.status === "warn")
      ? "warn"
      : "pass";
  return {
    version: 1,
    cwd: resolve(cwd),
    startedAt,
    finishedAt,
    overall,
    checks: results,
  };
}

export default function doctorExtension(): void {}
