import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { closeRuntimeDb, openRuntimeDb, type RuntimeDb } from "./sqlite-state.ts";

export const AUDIT_LOG = "logs/harness-actions.jsonl";

const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_RETAIN = 5;

export interface AuditLogRotationConfig {
  /** Maximum active JSONL size in bytes before rotation. 0 disables rotation. */
  maxBytes: number;
  /** Number of rotated files to retain (oldest beyond this are unlinked). */
  retain: number;
}

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

function parseNonNegativeInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export function resolveAuditLogRotationConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AuditLogRotationConfig {
  return {
    maxBytes: parseNonNegativeInteger(env.HARNESS_AUDIT_LOG_MAX_BYTES, DEFAULT_MAX_BYTES),
    retain: parseNonNegativeInteger(env.HARNESS_AUDIT_LOG_RETAIN, DEFAULT_RETAIN),
  };
}

export function formatAuditLogRotationTimestamp(date: Date = new Date()): string {
  // ISO "2026-05-27T14:30:12.123Z" -> "20260527T143012123Z" (sortable, ms precision).
  return date.toISOString().replace(/[-:.]/g, "");
}

export async function pruneRotatedAuditLogs(cwd: string, retain: number): Promise<void> {
  const logFile = resolve(cwd, AUDIT_LOG);
  const logDir = dirname(logFile);
  const baseName = AUDIT_LOG.split("/").pop()!;
  let entries: string[];
  try {
    entries = await readdir(logDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const rotated = entries
    .filter((name) => name.startsWith(`${baseName}.`))
    .sort(); // sortable timestamp suffix → lexical sort = chronological
  const keepFromIndex = Math.max(0, rotated.length - Math.max(0, retain));
  const toDelete = rotated.slice(0, keepFromIndex);
  await Promise.all(
    toDelete.map((name) =>
      unlink(join(logDir, name)).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }),
    ),
  );
}

async function maybeRotateAuditLog(
  cwd: string,
  pendingBytes: number,
  config: AuditLogRotationConfig,
): Promise<void> {
  if (config.maxBytes === 0) return;
  const logFile = resolve(cwd, AUDIT_LOG);
  let currentSize: number;
  try {
    const stats = await stat(logFile);
    currentSize = stats.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (currentSize === 0) return;
  if (currentSize + pendingBytes <= config.maxBytes) return;
  // Timestamp suffix gives sortable ordering; a 4-hex-char random
  // discriminator prevents same-millisecond collisions when concurrent
  // appends (or fast back-to-back rotations) all fire within one tick.
  const discriminator = randomBytes(2).toString("hex");
  const rotatedPath = `${logFile}.${formatAuditLogRotationTimestamp()}-${discriminator}`;
  try {
    await rename(logFile, rotatedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Another process rotated first — benign race; proceed.
  }
  await pruneRotatedAuditLogs(cwd, config.retain);
}

async function appendJsonlLine(cwd: string, entry: AuditLogEntry): Promise<void> {
  const logFile = resolve(cwd, AUDIT_LOG);
  await mkdir(dirname(logFile), { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  const config = resolveAuditLogRotationConfig();
  const pendingBytes = Buffer.byteLength(line, "utf8");
  await withFileMutationQueue(logFile, async () => {
    await maybeRotateAuditLog(cwd, pendingBytes, config);
    await appendFile(logFile, line, "utf8");
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
