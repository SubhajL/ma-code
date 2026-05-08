import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const validatorPath = join(repoRoot, "scripts", "validate-product-pipeline-e2e.sh");

async function runValidator(prefix: string) {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  const report = join(cwd, "e2e.md");
  const summaryJson = join(cwd, "e2e.json");
  const result = await execFile("bash", [validatorPath, "--report", report, "--summary-json", summaryJson], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });
  return { cwd, report, summaryJson, stdout: result.stdout, stderr: result.stderr };
}

test("product pipeline E2E validator emits success and HITL-aware reports", async () => {
  const { report, summaryJson, stdout } = await runValidator("product-pipeline-e2e-success-");
  const summary = JSON.parse(await readFile(summaryJson, "utf8"));
  const markdown = await readFile(report, "utf8");

  assert.match(stdout, /product-pipeline-e2e-validation: PASS/);
  assert.equal(summary.version, 1);
  assert.equal(summary.initiativeId, "checkout-mini");
  assert.equal(summary.status, "pass");
  assert.equal(summary.boundedFullAutoReadiness, "ready");
  assert.equal(summary.goNoGo.decision, "go");
  assert.ok(summary.phases.some((phase: { phase: string; status: string }) => phase.phase === "screen_approval" && phase.status === "pass"));
  assert.ok(summary.hitlGatesProven.includes("screen_approval_waiting_for_human"));
  assert.ok(summary.blockedPathsProven.includes("missing_screen_approval_blocks_fe_packet"));
  assert.match(markdown, /# Product Pipeline E2E Pilot — checkout-mini/);
  assert.match(markdown, /bounded full-auto readiness: ready/);
});

test("product pipeline E2E validator proves blocked paths, stale artifacts, and idempotency", async () => {
  const { summaryJson } = await runValidator("product-pipeline-e2e-blocked-");
  const summary = JSON.parse(await readFile(summaryJson, "utf8"));

  for (const expected of [
    "vague_intake_blocks",
    "missing_screen_approval_blocks_fe_packet",
    "stale_screen_approval_blocks_contract",
    "failed_fe_validation_blocks_be_packet",
    "failed_be_validation_blocks_quality",
    "missing_phase_10_proof_blocks_parallel_execution",
  ]) {
    assert.ok(summary.blockedPathsProven.includes(expected), expected);
  }
  assert.equal(summary.idempotency.status, "pass");
  assert.ok(summary.idempotency.evidence.some((entry: string) => entry.includes("no duplicate")));
  assert.equal(summary.observability.missingEvidence.length, 0);
});

test("product pipeline E2E validator writes caller-selected report paths only", async () => {
  const { report, summaryJson } = await runValidator("product-pipeline-e2e-paths-");
  await stat(report);
  await stat(summaryJson);
  const summary = JSON.parse(await readFile(summaryJson, "utf8"));
  assert.deepEqual(summary.observability.reportsWritten.sort(), [report, summaryJson].sort());
  assert.ok(summary.observability.logsReferenced.includes("logs/coding/2026-05-08_product-pipeline-e2e-phase-14.md"));
});

test("product pipeline E2E default run does not use runtime JSON or live boundaries", async () => {
  const { summaryJson } = await runValidator("product-pipeline-e2e-safety-");
  const summary = JSON.parse(await readFile(summaryJson, "utf8"));

  assert.equal(summary.safety.liveProviderCalls, 0);
  assert.equal(summary.safety.liveStitchCalls, 0);
  assert.deepEqual(summary.safety.trackedRuntimeJsonFiles, []);
  assert.ok(summary.safety.productImplementationOutputs.every((pathValue: string) => pathValue.startsWith("/tmp/") || pathValue.includes("/var/")));
});
