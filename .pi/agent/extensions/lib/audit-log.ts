import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { closeRuntimeDb, openRuntimeDb, type RuntimeDb } from "./sqlite-state.ts";

export const AUDIT_LOG = "logs/harness-actions.jsonl";

export interface AuditLogEntry {
  ts: string;
  extension?: string;
  action?: string;
  [key: string]: unknown;
}

export interface ReadAuditEntriesFilters {
  extension?: string;
  action?: string;
  limit?: number;
}

interface AuditRow {
  payload_json: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function deriveTsMs(entry: AuditLogEntry): number {
  if (typeof entry.ts === "string") {
    const parsed = Date.parse(entry.ts);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function deriveExtension(entry: AuditLogEntry): string {
  return typeof entry.extension === "string" && entry.extension.length > 0 ? entry.extension : "unknown";
}

function deriveAction(entry: AuditLogEntry): string {
  return typeof entry.action === "string" && entry.action.length > 0 ? entry.action : "unknown";
}

function insertEntrySql(db: RuntimeDb, entry: AuditLogEntry): void {
  db.handle
    .prepare(`INSERT INTO audit_log (ts, extension, action, payload_json) VALUES (?, ?, ?, ?)`)
    .run(deriveTsMs(entry), deriveExtension(entry), deriveAction(entry), JSON.stringify(entry));
}

async function appendJsonlLine(cwd: string, entry: AuditLogEntry): Promise<void> {
  const logFile = resolve(cwd, AUDIT_LOG);
  await mkdir(dirname(logFile), { recursive: true });
  await withFileMutationQueue(logFile, async () => {
    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  });
}

export async function appendAuditEntry(cwd: string, entry: AuditLogEntry): Promise<void> {
  const db = openRuntimeDb(cwd);
  try {
    db.handle.exec("BEGIN IMMEDIATE");
    try {
      insertEntrySql(db, entry);
      db.handle.exec("COMMIT");
    } catch (error) {
      db.handle.exec("ROLLBACK");
      throw error;
    }
  } finally {
    closeRuntimeDb(db);
  }
  await appendJsonlLine(cwd, entry);
}

export async function readAuditEntries(
  cwd: string,
  filters: ReadAuditEntriesFilters = {},
): Promise<AuditLogEntry[]> {
  const db = openRuntimeDb(cwd);
  try {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.extension !== undefined) {
      clauses.push("extension = ?");
      params.push(filters.extension);
    }
    if (filters.action !== undefined) {
      clauses.push("action = ?");
      params.push(filters.action);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = filters.limit !== undefined ? `LIMIT ${Math.max(0, Math.floor(filters.limit))}` : "";
    const sql = `SELECT payload_json FROM audit_log ${where} ORDER BY id ASC ${limitClause}`.trim();
    const rows = db.handle.prepare(sql).all(...params) as unknown as AuditRow[];
    return rows.map((row) => {
      const parsed = JSON.parse(row.payload_json);
      return isRecord(parsed) ? (parsed as AuditLogEntry) : ({ ts: "" } as AuditLogEntry);
    });
  } finally {
    closeRuntimeDb(db);
  }
}
