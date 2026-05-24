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

import { validateTaskPacketShape } from "../../.pi/agent/extensions/packets.ts";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-be-packet.ts");

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

async function makeTempRepo(prefix = "harness-be-packet-"): Promise<string> {
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
  const packetDir = join(baseDir, "packets");
  const evidenceDir = join(baseDir, "evidence");
  const contractDir = join(baseDir, "contracts");
  await mkdir(packetDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(contractDir, { recursive: true });
  const contractPath = `docs/initiatives/${initiativeId}/contracts/${sliceId}.contract.json`;
  const frontendPacketPath = `docs/initiatives/${initiativeId}/packets/${sliceId}.frontend.packet.json`;
  const evidencePath = `docs/initiatives/${initiativeId}/evidence/${sliceId}.frontend.validation.json`;
  await writeFile(join(tempRoot, frontendPacketPath), `${JSON.stringify({
    version: 1,
    packetId: "packet-frontend-worker-phase-8-checkout-redesign-slice-001",
    assignedTeam: "build",
    assignedRole: "frontend_worker",
    workType: "implementation",
    domains: ["frontend"],
    filesToInspect: [contractPath],
    dependencies: [contractPath],
    tddSlice: { firstTracerBehavior: "Render checkout review", publicInterface: "UI route", testSurface: ["frontend test"], boundaryDependencies: [contractPath], mockPlan: "Use contract fixture.", outOfScopeBehaviors: ["backend implementation"] },
    routing: { phaseLane: "frontend_implementation" },
  }, null, 2)}\n`, "utf8");
  await writeFile(join(baseDir, "slice-plan.json"), `${JSON.stringify({
    version: 1,
    initiativeId,
    slices: [{ sliceId, domains: ["frontend", "backend"], backendApplicable: true, currentPhase: "be_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation", "fe_validation", "be_implementation"] }],
  }, null, 2)}\n`, "utf8");
  const contractText = `${JSON.stringify({
    version: 1,
    initiativeId,
    sliceId,
    status: "approved",
    sourceScreenArtifact: { artifactPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`, approvalPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.approval.json`, artifactHash: "a".repeat(64) },
    uiStateContract: [{ screenId: "checkout-review", states: ["loading", "empty", "error", "success"], requiredData: ["cartItems"], userActions: ["confirmOrder"] }],
    apiContract: [{ name: "checkoutReview", method: "GET", path: "/api/checkout/review", request: { params: [], bodyShape: {} }, response: { successShape: { cartItems: [] }, errorShape: { code: "string", message: "string" } }, auth: { required: false, assumptions: ["No auth in fixture."] } }],
    errors: [{ code: "checkout_unavailable", userMessage: "Checkout is unavailable.", httpStatus: 503, uiState: "error" }],
    mockPlan: { frontendMockSource: "contract_fixture", backendFakePlan: "handler_or_service_fake", seedData: ["cartItems"] },
    tddSeeds: [{ scenario: "success state", frontendExpectation: "renders checkout review", backendExpectation: "returns checkout review data" }],
    outOfScope: ["frontend implementation", "screen design changes"],
    nextAllowedPhase: "fe_implementation",
    blockedReason: null,
    backend: { allowedPaths: ["api/checkout", "tests/backend/checkout"] },
  }, null, 2)}\n`;
  await writeFile(join(tempRoot, contractPath), contractText, "utf8");
  await writeFile(join(tempRoot, evidencePath), `${JSON.stringify({
    version: 1,
    initiativeId,
    sliceId,
    phase: "fe_validation",
    status: "passed",
    frontendPacketPath,
    contractHash: sha256(contractText),
    validatedBehaviors: ["success state renders checkout review"],
    commandsRun: ["npm run test:frontend -- checkout"],
    knownGaps: [],
    completedAt: "2026-05-08T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");
}

async function runBePacket(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd, encoding: "utf8" });
}

test("harness-be-packet dry-run prints a backend packet preview without writing files", async () => {
  const tempRoot = await makeTempRepo("harness-be-packet-dry-run-");

  const result = await runBePacket(tempRoot, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "dry-run");
  assert.deepEqual(json.createdFiles, []);
  assert.equal(json.packet.assignedRole, "backend_worker");
  assert.equal(json.packet.routing.phaseLane, "backend_implementation");
  validateTaskPacketShape(json.packet);
  assert.equal(await exists(join(tempRoot, "docs", "initiatives", "checkout-redesign", "packets", "slice-001.backend.packet.json")), false);
  assert.equal(await exists(join(tempRoot, ".pi", "agent", "state", "runtime")), false);
});

test("harness-be-packet apply writes only JSON and Markdown backend packet preview artifacts", async () => {
  const tempRoot = await makeTempRepo("harness-be-packet-apply-");

  const result = await runBePacket(tempRoot, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--apply", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "apply");
  assert.deepEqual(json.createdFiles, [
    "docs/initiatives/checkout-redesign/packets/slice-001.backend.packet.json",
    "docs/initiatives/checkout-redesign/packets/slice-001.backend.packet.md",
  ]);
  const savedPacket = JSON.parse(await readFile(join(tempRoot, json.createdFiles[0]), "utf8"));
  validateTaskPacketShape(savedPacket);
  assert.equal(savedPacket.assignedTeam, "build");
  assert.equal(savedPacket.assignedRole, "backend_worker");
  assert.match(await readFile(join(tempRoot, json.createdFiles[1]), "utf8"), /## TDD Slice/);
  assert.equal(await exists(join(tempRoot, ".pi", "agent", "state", "runtime")), false);
  assert.equal(await exists(join(tempRoot, "docs", "initiatives", "checkout-redesign", "packets", "slice-001.frontend.packet.md")), false);
});
