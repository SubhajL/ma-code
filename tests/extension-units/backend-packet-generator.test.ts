import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  generateBackendImplementationPacket,
  type BackendPacketGeneratorInput,
} from "../../.pi/agent/extensions/backend-packet-generator.ts";
import { validateTaskPacketShape } from "../../.pi/agent/extensions/task-packets.ts";

const sourceRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function makeTempRepo(prefix = "backend-packet-generator-"): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(repoRoot, ".pi", "agent"), { recursive: true });
  await cp(join(sourceRepoRoot, ".pi", "agent", "packets"), join(repoRoot, ".pi", "agent", "packets"), { recursive: true });
  await cp(join(sourceRepoRoot, ".pi", "agent", "teams"), join(repoRoot, ".pi", "agent", "teams"), { recursive: true });
  await cp(join(sourceRepoRoot, ".pi", "agent", "models.json"), join(repoRoot, ".pi", "agent", "models.json"));
  return repoRoot;
}

async function writeFixture(repoRoot: string, overrides: { omitEvidence?: boolean; evidenceStatus?: string; staleEvidence?: boolean; omitContract?: boolean; omitBackendAllowedPaths?: boolean; omitTddSeeds?: boolean; omitApiContract?: boolean; backendApplicable?: boolean } = {}): Promise<BackendPacketGeneratorInput> {
  const initiativeId = "checkout-redesign";
  const sliceId = "slice-001";
  const initiativeDir = join(repoRoot, "docs", "initiatives", initiativeId);
  const packetDir = join(initiativeDir, "packets");
  const evidenceDir = join(initiativeDir, "evidence");
  const contractDir = join(initiativeDir, "contracts");
  await mkdir(packetDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(contractDir, { recursive: true });
  const frontendPacketPath = `docs/initiatives/${initiativeId}/packets/${sliceId}.frontend.packet.json`;
  const frontendEvidencePath = `docs/initiatives/${initiativeId}/evidence/${sliceId}.frontend.validation.json`;
  const contractPath = `docs/initiatives/${initiativeId}/contracts/${sliceId}.contract.json`;
  const slicePlanPath = `docs/initiatives/${initiativeId}/slice-plan.json`;

  await writeFile(join(repoRoot, frontendPacketPath), `${JSON.stringify({
    version: 1,
    packetId: "packet-frontend-worker-phase-8-checkout-redesign-slice-001",
    assignedTeam: "build",
    assignedRole: "frontend_worker",
    workType: "implementation",
    domains: ["frontend"],
    filesToInspect: [contractPath],
    expectedProof: ["Frontend validation complete."],
    tddSlice: { firstTracerBehavior: "Render checkout review", publicInterface: "UI route", testSurface: ["frontend test"], boundaryDependencies: [contractPath], mockPlan: "Use contract fixture.", outOfScopeBehaviors: ["backend implementation"] },
    routing: { phaseLane: "frontend_implementation" },
  }, null, 2)}\n`, "utf8");

  await writeFile(join(repoRoot, slicePlanPath), `${JSON.stringify({
    version: 1,
    initiativeId,
    slices: [{ sliceId, domains: overrides.backendApplicable === false ? ["frontend"] : ["frontend", "backend"], backendApplicable: overrides.backendApplicable ?? true, currentPhase: "be_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation", "fe_validation", "be_implementation"] }],
  }, null, 2)}\n`, "utf8");

  let contractHash = "";
  if (!overrides.omitContract) {
    const contract: Record<string, unknown> = {
      version: 1,
      initiativeId,
      sliceId,
      status: "approved",
      sourceScreenArtifact: { artifactPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`, approvalPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.approval.json`, artifactHash: "a".repeat(64) },
      uiStateContract: [{ screenId: "checkout-review", states: ["loading", "empty", "error", "success"], requiredData: ["cartItems"], userActions: ["confirmOrder"] }],
      apiContract: overrides.omitApiContract ? [] : [{ name: "checkoutReview", method: "GET", path: "/api/checkout/review", request: { params: [], bodyShape: {} }, response: { successShape: { cartItems: [] }, errorShape: { code: "string", message: "string" } }, auth: { required: false, assumptions: ["No auth in fixture."] } }],
      errors: [{ code: "checkout_unavailable", userMessage: "Checkout is unavailable.", httpStatus: 503, uiState: "error" }],
      mockPlan: { frontendMockSource: "contract_fixture", backendFakePlan: "handler_or_service_fake", seedData: ["cartItems"] },
      tddSeeds: overrides.omitTddSeeds ? [] : [{ scenario: "success state", frontendExpectation: "renders checkout review", backendExpectation: "returns contract-compliant checkout review data" }],
      outOfScope: ["frontend implementation", "screen design changes"],
      nextAllowedPhase: "fe_implementation",
      blockedReason: null,
      backend: overrides.omitBackendAllowedPaths ? {} : { allowedPaths: ["api/checkout", "tests/backend/checkout"] },
    };
    const contractText = `${JSON.stringify(contract, null, 2)}\n`;
    contractHash = sha256(contractText);
    await writeFile(join(repoRoot, contractPath), contractText, "utf8");
  }

  if (!overrides.omitEvidence) {
    await writeFile(join(repoRoot, frontendEvidencePath), `${JSON.stringify({
      version: 1,
      initiativeId,
      sliceId,
      phase: "fe_validation",
      status: overrides.evidenceStatus ?? "passed",
      frontendPacketPath,
      contractHash: overrides.staleEvidence ? "b".repeat(64) : contractHash,
      validatedBehaviors: ["success state renders checkout review", "error state shows unavailable message"],
      commandsRun: ["npm run test:frontend -- checkout"],
      knownGaps: [],
      completedAt: "2026-05-08T00:00:00.000Z",
    }, null, 2)}\n`, "utf8");
  }
  return { repoRoot, initiativeId, sliceId, frontendPacketPath, frontendEvidencePath, contractPath, slicePlanPath };
}

test("backend packet generation blocks missing FE validation evidence, then succeeds with valid evidence and current contract", async () => {
  const missingRepo = await makeTempRepo("backend-packet-missing-evidence-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(missingRepo, { omitEvidence: true })),
    /Missing frontend validation evidence/i,
  );

  const repoRoot = await makeTempRepo();
  const input = await writeFixture(repoRoot);
  const result = await generateBackendImplementationPacket(input, "2026-05-08T00:00:00.000Z");

  validateTaskPacketShape(result.packet);
  assert.equal(result.packet.assignedTeam, "build");
  assert.equal(result.packet.assignedRole, "backend_worker");
  assert.equal(result.packet.workType, "implementation");
  assert.deepEqual(result.packet.domains, ["backend"]);
  assert.deepEqual(result.packet.allowedPaths, ["api/checkout", "tests/backend/checkout"]);
  assert.ok(result.packet.tddSlice);
  assert.ok(result.packet.filesToInspect.includes(input.contractPath));
  assert.ok(result.packet.filesToInspect.includes(input.frontendPacketPath));
  assert.ok(result.packet.filesToInspect.includes(input.frontendEvidencePath));
  assert.match(result.packet.expectedProof.join("\n"), /Auth\/data\/side-effect assumptions noted/);
  assert.equal((result.packet.routing as any).phaseLane, "backend_implementation");
  assert.match((result.packet.routing as any).phaseRoutingSource, /fallback|verified_model/);
});

test("backend packet generation blocks failed, stale, incomplete, or non-backend inputs", async () => {
  const failedRepo = await makeTempRepo("backend-packet-failed-fe-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(failedRepo, { evidenceStatus: "failed" })),
    /FE validation evidence status is not passed/i,
  );

  const staleRepo = await makeTempRepo("backend-packet-stale-fe-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(staleRepo, { staleEvidence: true })),
    /contract hash does not match current contract/i,
  );

  const missingContractRepo = await makeTempRepo("backend-packet-missing-contract-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(missingContractRepo, { omitContract: true })),
    /Missing slice contract/i,
  );

  const missingApiRepo = await makeTempRepo("backend-packet-missing-api-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(missingApiRepo, { omitApiContract: true })),
    /apiContract/i,
  );

  const missingPathsRepo = await makeTempRepo("backend-packet-missing-paths-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(missingPathsRepo, { omitBackendAllowedPaths: true })),
    /backend allowedPaths/i,
  );

  const missingTddRepo = await makeTempRepo("backend-packet-missing-tdd-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(missingTddRepo, { omitTddSeeds: true })),
    /tddSeeds/i,
  );

  const frontendOnlyRepo = await makeTempRepo("backend-packet-frontend-only-");
  await assert.rejects(
    generateBackendImplementationPacket(await writeFixture(frontendOnlyRepo, { backendApplicable: false })),
    /not backend-applicable/i,
  );
});

test("frontend validation evidence schema declares the Phase 9 gate fields", async () => {
  const schema = JSON.parse(await readFile(join(sourceRepoRoot, ".pi", "agent", "state", "schemas", "frontend-validation-evidence.schema.json"), "utf8"));
  assert.equal(schema.properties.phase.const, "fe_validation");
  assert.equal(schema.properties.status.enum.includes("passed"), true);
  for (const field of ["frontendPacketPath", "contractHash", "validatedBehaviors", "commandsRun", "knownGaps", "completedAt"]) {
    assert.ok(schema.required.includes(field), field);
  }
});
