import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  generateFrontendImplementationPacket,
  type FrontendPacketGeneratorInput,
} from "../../.pi/agent/extensions/frontend-packet-generator.ts";
import { validateTaskPacketShape } from "../../.pi/agent/extensions/task-packets.ts";

const sourceRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function makeTempRepo(prefix = "frontend-packet-generator-"): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(repoRoot, ".pi", "agent"), { recursive: true });
  await cp(join(sourceRepoRoot, ".pi", "agent", "packets"), join(repoRoot, ".pi", "agent", "packets"), { recursive: true });
  await cp(join(sourceRepoRoot, ".pi", "agent", "teams"), join(repoRoot, ".pi", "agent", "teams"), { recursive: true });
  await cp(join(sourceRepoRoot, ".pi", "agent", "models.json"), join(repoRoot, ".pi", "agent", "models.json"));
  return repoRoot;
}

async function writeFixture(repoRoot: string, overrides: { approvalDecision?: string; staleApproval?: boolean; omitContract?: boolean; omitAllowedPaths?: boolean; omitTddSeeds?: boolean; uiFacing?: boolean } = {}): Promise<FrontendPacketGeneratorInput> {
  const initiativeId = "checkout-redesign";
  const sliceId = "slice-001";
  const initiativeDir = join(repoRoot, "docs", "initiatives", initiativeId);
  const artifactDir = join(initiativeDir, "screen-artifacts");
  const contractDir = join(initiativeDir, "contracts");
  await mkdir(artifactDir, { recursive: true });
  await mkdir(contractDir, { recursive: true });
  const screenArtifactPath = `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`;
  const screenApprovalPath = `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.approval.json`;
  const contractPath = `docs/initiatives/${initiativeId}/contracts/${sliceId}.contract.json`;
  const slicePlanPath = `docs/initiatives/${initiativeId}/slice-plan.json`;
  const screenArtifact = `${JSON.stringify({
    version: 1,
    initiativeId,
    sliceId,
    mode: "mock",
    screens: [{ screenId: "checkout-review", name: "Checkout review", states: ["loading", "empty", "error", "success"], dataNeeds: ["cartItems"], userActions: ["confirmOrder"], mockOnly: true }],
    constraints: { liveStitchCalled: false, taskPacketsCreated: false, queueJobsCreated: false },
    nextAllowedPhase: "screen_approval",
  }, null, 2)}\n`;
  await writeFile(join(repoRoot, screenArtifactPath), screenArtifact, "utf8");
  const artifactHash = sha256(screenArtifact);
  await writeFile(join(repoRoot, screenApprovalPath), `${JSON.stringify({
    version: 1,
    initiativeId,
    sliceId,
    artifactPath: screenArtifactPath,
    artifactHash: overrides.staleApproval ? "b".repeat(64) : artifactHash,
    decision: overrides.approvalDecision ?? "approved",
    decidedBy: "product-reviewer",
    decidedAt: "2026-05-08T00:00:00.000Z",
    approvalRef: `screen-approval:${initiativeId}:${sliceId}:${artifactHash}`,
    notes: ["Approved."],
    requiredBefore: "fe_implementation",
    nextAllowedPhase: (overrides.approvalDecision ?? "approved") === "approved" ? "fe_implementation" : null,
    blockedReason: null,
  }, null, 2)}\n`, "utf8");
  await writeFile(join(repoRoot, slicePlanPath), `${JSON.stringify({
    version: 1,
    initiativeId,
    slices: [{ sliceId, uiFacing: overrides.uiFacing ?? true, currentPhase: "fe_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation"] }],
  }, null, 2)}\n`, "utf8");
  if (!overrides.omitContract) {
    const contract: Record<string, unknown> = {
      version: 1,
      initiativeId,
      sliceId,
      status: "approved",
      sourceScreenArtifact: { artifactPath: screenArtifactPath, approvalPath: screenApprovalPath, artifactHash },
      uiStateContract: [{ screenId: "checkout-review", states: ["loading", "empty", "error", "success"], requiredData: ["cartItems"], userActions: ["confirmOrder"] }],
      apiContract: [{ name: "checkoutReview", method: "GET", path: "/api/checkout/review", request: { params: [], bodyShape: {} }, response: { successShape: { cartItems: [] }, errorShape: { code: "string", message: "string" } }, auth: { required: false, assumptions: [] } }],
      errors: [{ code: "checkout_unavailable", userMessage: "Checkout is unavailable.", httpStatus: 503, uiState: "error" }],
      mockPlan: { frontendMockSource: "contract_fixture", backendFakePlan: "handler_or_service_fake", seedData: ["cartItems"] },
      tddSeeds: overrides.omitTddSeeds ? [] : [{ scenario: "success state", frontendExpectation: "renders checkout review", backendExpectation: "returns checkout review data" }],
      outOfScope: ["backend implementation", "schema migration"],
      nextAllowedPhase: "fe_implementation",
      blockedReason: null,
    };
    if (!overrides.omitAllowedPaths) contract.allowedPaths = ["src/checkout", "tests/frontend/checkout"];
    await writeFile(join(repoRoot, contractPath), `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  }
  return { repoRoot, initiativeId, sliceId, screenArtifactPath, screenApprovalPath, contractPath, slicePlanPath };
}

test("approved screen artifact and current contract produce a frontend implementation packet", async () => {
  const repoRoot = await makeTempRepo();
  const input = await writeFixture(repoRoot);

  const result = await generateFrontendImplementationPacket(input, "2026-05-08T00:00:00.000Z");

  validateTaskPacketShape(result.packet);
  assert.equal(result.packet.assignedTeam, "build");
  assert.equal(result.packet.assignedRole, "frontend_worker");
  assert.equal(result.packet.workType, "implementation");
  assert.deepEqual(result.packet.domains, ["frontend"]);
  assert.ok(result.packet.tddSlice);
  assert.deepEqual(result.packet.allowedPaths, ["src/checkout", "tests/frontend/checkout"]);
  assert.ok(result.packet.filesToInspect.includes(input.screenArtifactPath));
  assert.ok(result.packet.filesToInspect.includes(input.screenApprovalPath));
  assert.ok(result.packet.filesToInspect.includes(input.contractPath));
  assert.match(result.packet.expectedProof.join("\n"), /Accessibility\/state assumptions noted/);
  assert.equal((result.packet.routing as any).phaseLane, "frontend_implementation");
  assert.match((result.packet.routing as any).phaseRoutingSource, /fallback|verified_model/);
});

test("frontend packet generation blocks unsafe or stale inputs", async () => {
  const rejectedRepo = await makeTempRepo("frontend-packet-rejected-");
  await assert.rejects(
    generateFrontendImplementationPacket(await writeFixture(rejectedRepo, { approvalDecision: "rejected" })),
    /approval is not approved/i,
  );

  const staleRepo = await makeTempRepo("frontend-packet-stale-");
  await assert.rejects(
    generateFrontendImplementationPacket(await writeFixture(staleRepo, { staleApproval: true })),
    /artifact hash does not match/i,
  );

  const missingContractRepo = await makeTempRepo("frontend-packet-missing-contract-");
  await assert.rejects(
    generateFrontendImplementationPacket(await writeFixture(missingContractRepo, { omitContract: true })),
    /Missing slice contract/i,
  );

  const missingAllowedRepo = await makeTempRepo("frontend-packet-missing-allowed-");
  await assert.rejects(
    generateFrontendImplementationPacket(await writeFixture(missingAllowedRepo, { omitAllowedPaths: true })),
    /allowedPaths/i,
  );

  const missingTddRepo = await makeTempRepo("frontend-packet-missing-tdd-");
  await assert.rejects(
    generateFrontendImplementationPacket(await writeFixture(missingTddRepo, { omitTddSeeds: true })),
    /tddSeeds/i,
  );

  const nonUiRepo = await makeTempRepo("frontend-packet-non-ui-");
  await assert.rejects(
    generateFrontendImplementationPacket(await writeFixture(nonUiRepo, { uiFacing: false })),
    /not frontend\/UI-facing/i,
  );
});
