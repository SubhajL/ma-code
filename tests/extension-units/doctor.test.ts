import assert from "node:assert/strict";
import { mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  checkAuditLog,
  checkModelsConfig,
  checkRuntimeState,
  checkSchemas,
  runAllChecks,
} from "../../.pi/agent/extensions/doctor.ts";
import { makeTempRepo } from "./test-utils.ts";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

test("runAllChecks returns overall pass when all individual checks pass", async () => {
  const cwd = await makeTempRepo("doctor-all-pass-");
  const schemasDir = join(cwd, ".pi/agent/state/schemas");
  await mkdir(schemasDir, { recursive: true });
  await writeJson(join(schemasDir, "x.schema.json"), { type: "object" });
  await writeJson(join(cwd, ".pi/agent/models.json"), {
    routing_defaults: { orchestrator: { provider: "x", default_model: "y" } },
  });
  const report = await runAllChecks(cwd);
  assert.equal(report.overall, "pass");
  assert.equal(report.checks.length, 4);
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
