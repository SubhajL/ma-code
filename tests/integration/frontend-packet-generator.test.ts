import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { validateTaskPacketShape } from "../../.pi/agent/extensions/task-packets.ts";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-fe-packet.ts");

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function makeTempRepo(prefix = "harness-fe-packet-"): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(tempRoot, ".pi", "agent"), { recursive: true });
  await cp(join(repoRoot, ".pi", "agent", "packets"), join(tempRoot, ".pi", "agent", "packets"), { recursive: true });
  await cp(join(repoRoot, ".pi", "agent", "teams"), join(tempRoot, ".pi", "agent", "teams"), { recursive: true });
  await cp(join(repoRoot, ".pi", "agent", "models.json"), join(tempRoot, ".pi", "agent", "models.json"));
  await writeFixture(tempRoot);
  return tempRoot;
}

async function writeFixture(tempRoot: string): Promise<void> {
  const initiativeId = "checkout-redesign";
  const sliceId = "slice-001";
  const baseDir = join(tempRoot, "docs", "initiatives", initiativeId);
  const artifactDir = join(baseDir, "screen-artifacts");
  const contractDir = join(baseDir, "contracts");
  await mkdir(artifactDir, { recursive: true });
  await mkdir(contractDir, { recursive: true });
  const screenArtifactPath = `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`;
  const approvalPath = `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.approval.json`;
  const artifactText = `${JSON.stringify({
    version: 1,
    initiativeId,
    sliceId,
    mode: "mock",
    screens: [{ screenId: "checkout-review", states: ["loading", "empty", "error", "success"], dataNeeds: ["cartItems"], userActions: ["confirmOrder"], mockOnly: true }],
    constraints: { liveStitchCalled: false, taskPacketsCreated: false, queueJobsCreated: false },
    nextAllowedPhase: "screen_approval",
  }, null, 2)}\n`;
  await writeFile(join(tempRoot, screenArtifactPath), artifactText, "utf8");
  const artifactHash = sha256(artifactText);
  await writeFile(join(tempRoot, approvalPath), `${JSON.stringify({
    version: 1,
    initiativeId,
    sliceId,
    artifactPath: screenArtifactPath,
    artifactHash,
    decision: "approved",
    decidedBy: "product-reviewer",
    decidedAt: "2026-05-08T00:00:00.000Z",
    approvalRef: `screen-approval:${initiativeId}:${sliceId}:${artifactHash}`,
    notes: ["Approved."],
    requiredBefore: "fe_implementation",
    nextAllowedPhase: "fe_implementation",
    blockedReason: null,
  }, null, 2)}\n`, "utf8");
  await writeFile(join(baseDir, "slice-plan.json"), `${JSON.stringify({
    version: 1,
    initiativeId,
    slices: [{ sliceId, domains: ["frontend"], currentPhase: "fe_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation"] }],
  }, null, 2)}\n`, "utf8");
  await writeFile(join(contractDir, `${sliceId}.contract.json`), `${JSON.stringify({
    version: 1,
    initiativeId,
    sliceId,
    status: "approved",
    sourceScreenArtifact: { artifactPath: screenArtifactPath, approvalPath, artifactHash },
    allowedPaths: ["src/checkout", "tests/frontend/checkout"],
    uiStateContract: [{ screenId: "checkout-review", states: ["loading", "empty", "error", "success"], requiredData: ["cartItems"], userActions: ["confirmOrder"] }],
    apiContract: [{ name: "checkoutReview", method: "GET", path: "/api/checkout/review", request: { params: [], bodyShape: {} }, response: { successShape: { cartItems: [] }, errorShape: { code: "string", message: "string" } }, auth: { required: false, assumptions: [] } }],
    errors: [{ code: "checkout_unavailable", userMessage: "Checkout is unavailable.", httpStatus: 503, uiState: "error" }],
    mockPlan: { frontendMockSource: "contract_fixture", backendFakePlan: "handler_or_service_fake", seedData: ["cartItems"] },
    tddSeeds: [{ scenario: "success state", frontendExpectation: "renders checkout review", backendExpectation: "returns checkout review data" }],
    outOfScope: ["backend implementation", "schema migration"],
    nextAllowedPhase: "fe_implementation",
    blockedReason: null,
  }, null, 2)}\n`, "utf8");
}

async function runFePacket(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd, encoding: "utf8" });
}

test("harness-fe-packet dry-run prints a packet preview without writing files", async () => {
  const tempRoot = await makeTempRepo("harness-fe-packet-dry-run-");

  const result = await runFePacket(tempRoot, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "dry-run");
  assert.deepEqual(json.createdFiles, []);
  assert.equal(json.packet.assignedRole, "frontend_worker");
  assert.equal(json.packet.routing.phaseLane, "frontend_implementation");
  validateTaskPacketShape(json.packet);
  assert.equal(await exists(join(tempRoot, "docs", "initiatives", "checkout-redesign", "packets")), false);
  assert.equal(await exists(join(tempRoot, ".pi", "agent", "state", "runtime")), false);
});

test("harness-fe-packet apply writes only JSON and Markdown packet preview artifacts", async () => {
  const tempRoot = await makeTempRepo("harness-fe-packet-apply-");

  const result = await runFePacket(tempRoot, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--apply", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "apply");
  assert.deepEqual(json.createdFiles, [
    "docs/initiatives/checkout-redesign/packets/slice-001.frontend.packet.json",
    "docs/initiatives/checkout-redesign/packets/slice-001.frontend.packet.md",
  ]);
  const savedPacket = JSON.parse(await readFile(join(tempRoot, json.createdFiles[0]), "utf8"));
  validateTaskPacketShape(savedPacket);
  assert.equal(savedPacket.assignedTeam, "build");
  assert.equal(savedPacket.assignedRole, "frontend_worker");
  assert.match(await readFile(join(tempRoot, json.createdFiles[1]), "utf8"), /## TDD Slice/);
  assert.equal(await exists(join(tempRoot, ".pi", "agent", "state", "runtime")), false);
  assert.equal(await exists(join(tempRoot, "docs", "initiatives", "checkout-redesign", "contracts", "slice-001.backend.packet.json")), false);
});
