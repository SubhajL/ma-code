import assert from "node:assert/strict";
import { mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  checkAuditLog,
  checkModelsConfig,
  checkRuntimeState,
  checkSchemas,
  checkSqliteAuditLog,
  checkSqliteConsistency,
  checkSqliteRuntimeDb,
  runAllChecks,
} from "../../.pi/agent/extensions/doctor.ts";
import { closeRuntimeDb, openRuntimeDb, type RuntimeDb } from "../../.pi/agent/extensions/lib/sqlite-state.ts";
import { makeTempRepo } from "./test-utils.ts";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function withDb<T>(cwd: string, fn: (db: RuntimeDb) => T): T {
  const db = openRuntimeDb(cwd);
  try {
    return fn(db);
  } finally {
    closeRuntimeDb(db);
  }
}

function seedTask(db: RuntimeDb, id: string, status = "queued"): void {
  db.handle
    .prepare(`INSERT INTO tasks (id, payload_json, status, updated_at) VALUES (?, ?, ?, ?)`)
    .run(id, JSON.stringify({ id, status }), status, Date.now());
}

function seedQueueJob(db: RuntimeDb, id: string, payload: Record<string, unknown> = {}): void {
  const job = { id, status: "queued", ...payload };
  db.handle
    .prepare(`INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, JSON.stringify(job), String(job.status), Date.now(), Date.now());
}

function setActiveTask(db: RuntimeDb, taskId: string | null): void {
  db.handle
    .prepare(`INSERT OR REPLACE INTO active_task (singleton, task_id) VALUES (1, ?)`)
    .run(taskId);
}

function setQueueMeta(db: RuntimeDb, activeJobId: string | null, paused = false): void {
  db.handle
    .prepare(`INSERT OR REPLACE INTO queue_meta (singleton, paused, active_job_id) VALUES (1, ?, ?)`)
    .run(paused ? 1 : 0, activeJobId);
}

function seedAuditRow(db: RuntimeDb, extension: string, action: string): void {
  db.handle
    .prepare(`INSERT INTO audit_log (ts, extension, action, payload_json) VALUES (?, ?, ?, ?)`)
    .run(Date.now(), extension, action, JSON.stringify({ extension, action }));
}

test("checkRuntimeState passes when files are absent", async () => {
  const cwd = await makeTempRepo("doctor-runtime-absent-");
  const result = await checkRuntimeState(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.name, "runtime-state");
  assert.deepEqual(result.details, { leases: "absent", queue: "absent", tasks: "absent" });
});

test("checkRuntimeState passes when files have version 1", async () => {
  const cwd = await makeTempRepo("doctor-runtime-ok-");
  await writeJson(join(cwd, ".pi/agent/state/runtime/leases.json"), { version: 1, leases: [] });
  await writeJson(join(cwd, ".pi/agent/state/runtime/queue.json"), { version: 1, paused: false, activeJobId: null, jobs: [] });
  await writeJson(join(cwd, ".pi/agent/state/runtime/tasks.json"), { version: 1, activeTaskId: null, tasks: [] });
  const result = await checkRuntimeState(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.leases, "ok");
  assert.equal(result.details?.queue, "ok");
  assert.equal(result.details?.tasks, "ok");
});

test("checkRuntimeState fails on malformed JSON", async () => {
  const cwd = await makeTempRepo("doctor-runtime-bad-");
  await mkdir(join(cwd, ".pi/agent/state/runtime"), { recursive: true });
  await writeFile(join(cwd, ".pi/agent/state/runtime/leases.json"), "{not json", "utf8");
  const result = await checkRuntimeState(cwd);
  assert.equal(result.status, "fail");
  assert.equal(result.details?.leases, "parse-error");
});

test("checkRuntimeState fails on wrong version", async () => {
  const cwd = await makeTempRepo("doctor-runtime-version-");
  await writeJson(join(cwd, ".pi/agent/state/runtime/queue.json"), { version: 2, paused: false, activeJobId: null, jobs: [] });
  const result = await checkRuntimeState(cwd);
  assert.equal(result.status, "fail");
  assert.equal(result.details?.queue, "version-mismatch");
});

test("checkSchemas passes when all schema files parse", async () => {
  const cwd = await makeTempRepo("doctor-schemas-ok-");
  const dir = join(cwd, ".pi/agent/state/schemas");
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "alpha.schema.json"), { type: "object" });
  await writeJson(join(dir, "beta.schema.json"), { type: "object" });
  const result = await checkSchemas(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.schemaCount, 2);
});

test("checkSchemas fails when a schema is malformed", async () => {
  const cwd = await makeTempRepo("doctor-schemas-bad-");
  const dir = join(cwd, ".pi/agent/state/schemas");
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "good.schema.json"), { type: "object" });
  await writeFile(join(dir, "broken.schema.json"), "not json", "utf8");
  const result = await checkSchemas(cwd);
  assert.equal(result.status, "fail");
});

test("checkSchemas warns when directory is empty", async () => {
  const cwd = await makeTempRepo("doctor-schemas-empty-");
  await mkdir(join(cwd, ".pi/agent/state/schemas"), { recursive: true });
  const result = await checkSchemas(cwd);
  assert.equal(result.status, "warn");
});

test("checkSchemas fails when directory is missing", async () => {
  const cwd = await makeTempRepo("doctor-schemas-missing-");
  await rm(join(cwd, ".pi/agent/state/schemas"), { recursive: true, force: true });
  const result = await checkSchemas(cwd);
  assert.equal(result.status, "fail");
});

test("checkModelsConfig passes for valid file with routing_defaults", async () => {
  const cwd = await makeTempRepo("doctor-models-ok-");
  await writeJson(join(cwd, ".pi/agent/models.json"), {
    routing_defaults: {
      orchestrator: { provider: "openai-codex", default_model: "gpt-5.5" },
      planning_lead: { provider: "openai-codex", default_model: "gpt-5.5" },
    },
  });
  const result = await checkModelsConfig(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.roleCount, 2);
});

test("checkModelsConfig fails when routing_defaults is missing", async () => {
  const cwd = await makeTempRepo("doctor-models-bad-");
  await writeJson(join(cwd, ".pi/agent/models.json"), { notes: ["only notes"] });
  const result = await checkModelsConfig(cwd);
  assert.equal(result.status, "fail");
});

test("checkModelsConfig fails when file is absent", async () => {
  const cwd = await makeTempRepo("doctor-models-absent-");
  const result = await checkModelsConfig(cwd);
  assert.equal(result.status, "fail");
});

test("checkAuditLog passes when log is absent", async () => {
  const cwd = await makeTempRepo("doctor-audit-absent-");
  const result = await checkAuditLog(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.lineCount, 0);
});

test("checkAuditLog passes when every line is valid JSON", async () => {
  const cwd = await makeTempRepo("doctor-audit-ok-");
  await mkdir(join(cwd, "logs"), { recursive: true });
  await appendFile(join(cwd, "logs/harness-actions.jsonl"), `${JSON.stringify({ event: "a" })}\n`, "utf8");
  await appendFile(join(cwd, "logs/harness-actions.jsonl"), `${JSON.stringify({ event: "b" })}\n`, "utf8");
  const result = await checkAuditLog(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.lineCount, 2);
});

test("checkAuditLog fails when a line is unparseable", async () => {
  const cwd = await makeTempRepo("doctor-audit-bad-");
  await mkdir(join(cwd, "logs"), { recursive: true });
  await appendFile(join(cwd, "logs/harness-actions.jsonl"), `${JSON.stringify({ event: "a" })}\n`, "utf8");
  await appendFile(join(cwd, "logs/harness-actions.jsonl"), "not json\n", "utf8");
  const result = await checkAuditLog(cwd);
  assert.equal(result.status, "fail");
});

test("checkSqliteRuntimeDb fails when the runtime DB file is absent", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-absent-");
  const result = await checkSqliteRuntimeDb(cwd);
  assert.equal(result.name, "sqlite-runtime-db");
  assert.equal(result.status, "fail");
  assert.match(result.message, /pi\.db/);
});

test("checkSqliteRuntimeDb passes when the runtime DB exists with the expected schema and reports row counts", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-ok-");
  withDb(cwd, (db) => {
    seedTask(db, "task-A");
    seedQueueJob(db, "job-1");
  });

  const result = await checkSqliteRuntimeDb(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.integrity, "ok");
  assert.deepEqual(result.details?.rowCounts, { tasks: 1, queue_jobs: 1, leases: 0, audit_log: 0 });
  const tables = result.details?.tables as Record<string, boolean> | undefined;
  assert.equal(tables?.tasks, true);
  assert.equal(tables?.queue_jobs, true);
  assert.equal(tables?.leases, true);
  assert.equal(tables?.audit_log, true);
  assert.equal(tables?.active_task, true);
  assert.equal(tables?.queue_meta, true);
});

test("checkSqliteRuntimeDb fails when a required table is missing", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-missing-table-");
  withDb(cwd, (db) => {
    db.handle.exec("DROP TABLE tasks");
  });
  const result = await checkSqliteRuntimeDb(cwd);
  assert.equal(result.status, "fail");
  assert.match(result.message, /tasks/);
});

test("checkSqliteConsistency passes when active pointers are null and linked-task references are valid", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-consistent-");
  withDb(cwd, (db) => {
    seedTask(db, "task-A");
    seedQueueJob(db, "job-1", { linkedTaskId: "task-A" });
  });
  const result = await checkSqliteConsistency(cwd);
  assert.equal(result.name, "sqlite-consistency");
  assert.equal(result.status, "pass");
});

test("checkSqliteConsistency passes when active pointers reference existing rows", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-active-ok-");
  withDb(cwd, (db) => {
    seedTask(db, "task-A");
    seedQueueJob(db, "job-1");
    setActiveTask(db, "task-A");
    setQueueMeta(db, "job-1");
  });
  const result = await checkSqliteConsistency(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.activeTaskId, "task-A");
  assert.equal(result.details?.activeJobId, "job-1");
});

test("checkSqliteConsistency fails when activeTaskId points at a non-existent task", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-dangling-task-");
  withDb(cwd, (db) => {
    setActiveTask(db, "task-missing");
  });
  const result = await checkSqliteConsistency(cwd);
  assert.equal(result.status, "fail");
  assert.match(result.message, /activeTaskId/);
});

test("checkSqliteConsistency fails when activeJobId points at a non-existent queue job", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-dangling-job-");
  withDb(cwd, (db) => {
    setQueueMeta(db, "job-missing");
  });
  const result = await checkSqliteConsistency(cwd);
  assert.equal(result.status, "fail");
  assert.match(result.message, /activeJobId/);
});

test("checkSqliteConsistency fails when a queue job's linkedTaskId references a non-existent task", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-linked-bad-");
  withDb(cwd, (db) => {
    seedQueueJob(db, "job-1", { linkedTaskId: "task-missing" });
  });
  const result = await checkSqliteConsistency(cwd);
  assert.equal(result.status, "fail");
  assert.match(result.message, /linkedTaskId/);
  const danglingLinks = result.details?.danglingLinkedTaskIds as Array<{ jobId: string; linkedTaskId: string }>;
  assert.deepEqual(danglingLinks, [{ jobId: "job-1", linkedTaskId: "task-missing" }]);
});

test("checkSqliteConsistency reports queue jobs with malformed payload_json", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-malformed-payload-");
  withDb(cwd, (db) => {
    // Seed via raw INSERT so the payload bypasses JSON.stringify and lands as invalid JSON.
    db.handle
      .prepare(`INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run("job-bad", "not-valid-json", "queued", Date.now(), Date.now());
    db.handle
      .prepare(`INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run("job-array", "[1,2,3]", "queued", Date.now(), Date.now());
  });
  const result = await checkSqliteConsistency(cwd);
  assert.equal(result.status, "fail");
  assert.match(result.message, /malformed/);
  const malformed = result.details?.malformedPayloadJobIds as string[];
  assert.deepEqual(malformed.slice().sort(), ["job-array", "job-bad"]);
});

test("checkSqliteAuditLog passes when audit_log table is empty", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-audit-empty-");
  withDb(cwd, () => undefined);
  const result = await checkSqliteAuditLog(cwd);
  assert.equal(result.name, "sqlite-audit-log");
  assert.equal(result.status, "pass");
  assert.equal(result.details?.rowCount, 0);
});

test("checkSqliteAuditLog passes when audit_log has rows", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-audit-rows-");
  withDb(cwd, (db) => {
    seedAuditRow(db, "queue-runner", "advance");
    seedAuditRow(db, "till-done", "evidence");
  });
  const result = await checkSqliteAuditLog(cwd);
  assert.equal(result.status, "pass");
  assert.equal(result.details?.rowCount, 2);
});

test("checkSqliteAuditLog fails when the runtime DB is absent", async () => {
  const cwd = await makeTempRepo("doctor-sqlite-audit-absent-");
  const result = await checkSqliteAuditLog(cwd);
  assert.equal(result.status, "fail");
  assert.match(result.message, /pi\.db/);
});

test("runAllChecks returns overall pass when all individual checks pass", async () => {
  const cwd = await makeTempRepo("doctor-all-pass-");
  const schemasDir = join(cwd, ".pi/agent/state/schemas");
  await mkdir(schemasDir, { recursive: true });
  await writeJson(join(schemasDir, "x.schema.json"), { type: "object" });
  await writeJson(join(cwd, ".pi/agent/models.json"), {
    routing_defaults: { orchestrator: { provider: "x", default_model: "y" } },
  });
  withDb(cwd, () => undefined);
  const report = await runAllChecks(cwd);
  assert.equal(report.overall, "pass");
  assert.equal(report.checks.length, 7);
  const names = report.checks.map((entry) => entry.name);
  assert.ok(names.includes("sqlite-runtime-db"));
  assert.ok(names.includes("sqlite-consistency"));
  assert.ok(names.includes("sqlite-audit-log"));
});

test("runAllChecks returns overall fail when any check fails", async () => {
  const cwd = await makeTempRepo("doctor-all-fail-");
  await mkdir(join(cwd, ".pi/agent/state/runtime"), { recursive: true });
  await writeFile(join(cwd, ".pi/agent/state/runtime/queue.json"), "broken", "utf8");
  const schemasDir = join(cwd, ".pi/agent/state/schemas");
  await mkdir(schemasDir, { recursive: true });
  await writeJson(join(schemasDir, "x.schema.json"), { type: "object" });
  await writeJson(join(cwd, ".pi/agent/models.json"), {
    routing_defaults: { orchestrator: { provider: "x", default_model: "y" } },
  });
  const report = await runAllChecks(cwd);
  assert.equal(report.overall, "fail");
});
