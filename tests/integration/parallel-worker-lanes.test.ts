import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-parallel-worker-lanes.ts");
const operatorPath = join(repoRoot, "scripts", "harness-operator.ts");

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function makeLaneRepo(prefix: string, options: { allowParallel?: boolean; hitl?: boolean; missingPacket?: boolean } = {}): Promise<string> {
  const cwd = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(join(tmpdir(), prefix)));
  const initiative = join(cwd, "docs", "initiatives", "checkout-redesign");
  const packets = join(initiative, "packets");
  await mkdir(packets, { recursive: true });
  const packetOne = "docs/initiatives/checkout-redesign/packets/slice-001.frontend.packet.json";
  const packetTwo = "docs/initiatives/checkout-redesign/packets/slice-002.frontend.packet.json";
  if (!options.missingPacket) {
    await writeFile(join(cwd, packetOne), '{"sliceId":"slice-001"}\n', "utf8");
    await writeFile(join(cwd, packetTwo), '{"sliceId":"slice-002"}\n', "utf8");
  }
  await writeFile(join(initiative, "pipeline.json"), `${JSON.stringify({
    version: 1,
    initiativeId: "checkout-redesign",
    maxParallelSlices: 2,
    slices: [
      { sliceId: "slice-001", title: "Checkout review", status: "ready", currentPhase: "fe_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation", "fe_validation", "be_implementation", "be_validation", "quality"], artifacts: { frontendPacket: packetOne }, hitlGate: options.hitl ? { type: "approval", status: "waiting_for_human", summary: "Approve screen" } : null, blockers: [] },
      { sliceId: "slice-002", title: "Checkout confirmation", status: "ready", currentPhase: "fe_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation", "fe_validation", "be_implementation", "be_validation", "quality"], artifacts: { frontendPacket: packetTwo }, hitlGate: null, blockers: [] },
    ],
    parallelDecisions: options.allowParallel ? [{ sliceIds: ["slice-001", "slice-002"], parallelAllowed: true, blockers: [], source: "phase10:test" }] : [],
  }, null, 2)}\n`, "utf8");

  await execFile("git", ["init", "-b", "main"], { cwd, encoding: "utf8" });
  await execFile("git", ["config", "user.name", "Pi Harness Tests"], { cwd, encoding: "utf8" });
  await execFile("git", ["config", "user.email", "pi-harness-tests@example.com"], { cwd, encoding: "utf8" });
  await execFile("git", ["add", "."], { cwd, encoding: "utf8" });
  await execFile("git", ["commit", "-m", "fixture"], { cwd, encoding: "utf8" });
  return cwd;
}

async function runLanes(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd, encoding: "utf8" });
}

test("harness-parallel-worker-lanes dry-run plans independent lanes without writing files", async () => {
  const cwd = await makeLaneRepo("parallel-lanes-dry-run-", { allowParallel: true });

  const result = await runLanes(cwd, ["dry-run", "--initiative", "checkout-redesign", "--max-parallel", "2", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "dry_run");
  assert.equal(json.lanes.length, 2);
  assert.equal(json.parallelProof.phase10Decision, "allowed");
  assert.equal(await exists(join(cwd, "docs", "initiatives", "checkout-redesign", "pipeline-runs")), false);
});

test("harness-parallel-worker-lanes apply refuses missing Phase 10 proof, HITL gates, and packet files", async () => {
  const noProof = await makeLaneRepo("parallel-lanes-no-proof-");
  await assert.rejects(runLanes(noProof, ["apply", "--initiative", "checkout-redesign", "--json"]), /Missing Phase 10 parallelAllowed proof/);

  const hitl = await makeLaneRepo("parallel-lanes-hitl-", { allowParallel: true, hitl: true });
  await assert.rejects(runLanes(hitl, ["apply", "--initiative", "checkout-redesign", "--json"]), /HITL gate unresolved/);

  const missingPacket = await makeLaneRepo("parallel-lanes-missing-packet-", { allowParallel: true, missingPacket: true });
  await assert.rejects(runLanes(missingPacket, ["apply", "--initiative", "checkout-redesign", "--json"]), /missing packet artifacts/);
});

test("harness-parallel-worker-lanes apply materializes worker sessions and durable manifest", async () => {
  const cwd = await makeLaneRepo("parallel-lanes-apply-", { allowParallel: true });

  const result = await runLanes(cwd, ["apply", "--initiative", "checkout-redesign", "--max-parallel", "2", "--base-ref", "main", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.status, "materialized");
  assert.equal(json.lanes.length, 2);
  assert.ok(json.lanes.every((lane: { status: string; worktreePath: string }) => lane.status === "leased" && lane.worktreePath));
  assert.equal(json.writtenManifestPath, `docs/initiatives/checkout-redesign/pipeline-runs/${json.runId}.parallel-lanes.json`);
  const saved = JSON.parse(await readFile(join(cwd, json.writtenManifestPath), "utf8"));
  assert.equal(saved.lanes.length, 2);
});

test("harness-parallel-worker-lanes run uses fake command, records success, and cleanup is explicit", async () => {
  const cwd = await makeLaneRepo("parallel-lanes-run-", { allowParallel: true });
  const applied = JSON.parse((await runLanes(cwd, ["apply", "--initiative", "checkout-redesign", "--max-parallel", "2", "--base-ref", "main", "--json"])).stdout);

  const result = await runLanes(cwd, ["run", "--initiative", "checkout-redesign", "--max-parallel", "2", "--max-runtime-seconds", "20", "--worker-command", `${process.execPath} -e \"process.exit(0)\"`, "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.status, "done");
  assert.ok(json.lanes.every((lane: { status: string; exitCode: number }) => lane.status === "done" && lane.exitCode === 0));

  const cleanup = JSON.parse((await runLanes(cwd, ["cleanup", "--initiative", "checkout-redesign", "--lane-id", applied.lanes[0].laneId, "--json"])).stdout);
  assert.equal(cleanup.runId, applied.runId);
  assert.equal(await exists(applied.lanes[0].worktreePath), false);
});

test("harness-parallel-worker-lanes failed run preserves worktree and stops new launches", async () => {
  const cwd = await makeLaneRepo("parallel-lanes-failed-run-", { allowParallel: true });
  const applied = JSON.parse((await runLanes(cwd, ["apply", "--initiative", "checkout-redesign", "--max-parallel", "2", "--base-ref", "main", "--json"])).stdout);

  const result = await runLanes(cwd, ["run", "--initiative", "checkout-redesign", "--max-parallel", "1", "--max-runtime-seconds", "20", "--worker-command", `${process.execPath} -e \"process.exit(7)\"`, "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.status, "failed");
  assert.equal(json.lanes[0].status, "failed");
  assert.equal(await exists(applied.lanes[0].worktreePath), true);
  assert.equal(json.lanes[1].status, "leased");
});

test("harness operator delegates parallel-worker-lanes subcommand", async () => {
  const cwd = await makeLaneRepo("parallel-lanes-operator-", { allowParallel: true });

  const result = await execFile(process.execPath, ["--import", tsxImportPath, operatorPath, "parallel-worker-lanes", "dry-run", "--initiative", "checkout-redesign", "--json"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARNESS_TSX_IMPORT: tsxImportPath },
  });
  const json = JSON.parse(result.stdout);

  assert.equal(json.initiativeId, "checkout-redesign");
  assert.equal(json.mode, "dry_run");
  assert.equal((await readdir(join(cwd, "docs", "initiatives", "checkout-redesign"))).includes("pipeline-runs"), false);
});
