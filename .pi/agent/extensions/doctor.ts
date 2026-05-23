import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

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

export async function runAllChecks(cwd: string): Promise<DoctorReport> {
  const startedAt = new Date().toISOString();
  const results = await Promise.all([
    checkRuntimeState(cwd),
    checkSchemas(cwd),
    checkModelsConfig(cwd),
    checkAuditLog(cwd),
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
