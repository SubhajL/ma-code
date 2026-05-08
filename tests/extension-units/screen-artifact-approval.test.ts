import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { approveScreenArtifact, getScreenArtifactApprovalStatus, rejectScreenArtifact } from "../../.pi/agent/extensions/screen-artifact-approval.ts";
import { makeTempRepo } from "./test-utils.ts";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function writeMockScreenArtifact(repoRoot: string, override: Record<string, unknown> = {}): Promise<string> {
  const relPath = "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.json";
  const artifact = {
    version: 1,
    initiativeId: "checkout-redesign",
    sliceId: "slice-001",
    artifactId: "mock-screen-slice-001-v1",
    mode: "mock",
    phase: "stitch_generation",
    status: "generated_mock",
    nextAllowedPhase: "screen_approval",
    constraints: { liveStitchCalled: false, taskPacketsCreated: false, queueJobsCreated: false },
    screens: [{ screenId: "slice-001-primary", name: "Checkout review" }],
    ...override,
  };
  await mkdir(join(repoRoot, "docs", "initiatives", "checkout-redesign", "screen-artifacts"), { recursive: true });
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(join(repoRoot, relPath), text, "utf8");
  return sha256(text);
}

async function approveFixture(repoRoot: string) {
  return approveScreenArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    decidedBy: "product-reviewer",
    note: "Aligned with product intent.",
    now: new Date("2026-05-08T00:00:00.000Z"),
  });
}

test("approving a valid mock screen artifact writes an approved sidecar with matching artifact hash", async () => {
  const repoRoot = await makeTempRepo("screen-artifact-approval-unit-");
  const artifactHash = await writeMockScreenArtifact(repoRoot);

  const result = await approveFixture(repoRoot);

  assert.equal(result.approval.decision, "approved");
  assert.equal(result.approval.artifactHash, artifactHash);
  assert.equal(result.approval.requiredBefore, "fe_implementation");
  assert.equal(result.approval.nextAllowedPhase, "fe_implementation");
  assert.equal(result.approval.approvalRef, `screen-approval:checkout-redesign:slice-001:${artifactHash}`);
  assert.equal(result.createdFiles[0], "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.approval.json");

  const sidecar = JSON.parse(await readFile(join(repoRoot, result.approvalPath), "utf8"));
  assert.equal(sidecar.decision, "approved");

  const status = await getScreenArtifactApprovalStatus({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  assert.equal(status.status, "approved");
  assert.equal(status.artifactHash, artifactHash);
});

test("status reports missing and pending without writing an approval", async () => {
  const repoRoot = await makeTempRepo("screen-artifact-status-");

  const missing = await getScreenArtifactApprovalStatus({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  assert.equal(missing.status, "missing");
  assert.equal(missing.artifactExists, false);
  assert.equal(missing.approvalExists, false);

  await writeMockScreenArtifact(repoRoot);
  const pending = await getScreenArtifactApprovalStatus({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  assert.equal(pending.status, "pending");
  assert.equal(pending.artifactExists, true);
  assert.equal(pending.approvalExists, false);
});

test("approve refuses a missing artifact path", async () => {
  const repoRoot = await makeTempRepo("screen-artifact-missing-");
  await assert.rejects(
    approveScreenArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", decidedBy: "reviewer", note: "ok" }),
    /Missing screen artifact: docs\/initiatives\/checkout-redesign\/screen-artifacts\/slice-001\.mock-screen\.json/,
  );
});

test("reject writes rejected sidecar and requires reason", async () => {
  const repoRoot = await makeTempRepo("screen-artifact-reject-");
  const artifactHash = await writeMockScreenArtifact(repoRoot);

  await assert.rejects(
    rejectScreenArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", decidedBy: "reviewer" }),
    /--reason is required/,
  );

  const result = await rejectScreenArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    decidedBy: "reviewer",
    reason: "Pricing state is missing error copy.",
    now: new Date("2026-05-08T01:00:00.000Z"),
  });
  assert.equal(result.approval.decision, "rejected");
  assert.equal(result.approval.artifactHash, artifactHash);
  assert.equal(result.approval.nextAllowedPhase, null);
  assert.equal(result.approval.blockedReason, "Pricing state is missing error copy.");

  const status = await getScreenArtifactApprovalStatus({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  assert.equal(status.status, "rejected");
});

test("approval is stale when artifact hash changes and approve refuses without explicit reapproval", async () => {
  const repoRoot = await makeTempRepo("screen-artifact-stale-");
  await writeMockScreenArtifact(repoRoot);
  await approveFixture(repoRoot);

  await writeMockScreenArtifact(repoRoot, { screens: [{ screenId: "slice-001-primary", name: "Changed checkout review" }] });
  const status = await getScreenArtifactApprovalStatus({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  assert.equal(status.status, "pending");
  assert.equal(status.approvalDecision, "approved");
  assert.equal(status.staleApproval, true);

  await assert.rejects(
    approveScreenArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", decidedBy: "reviewer", note: "reviewed changed artifact" }),
    /Stale screen artifact approval/,
  );
});

test("reapproval after rejection requires explicit flag and records prior decision in history", async () => {
  const repoRoot = await makeTempRepo("screen-artifact-reapprove-");
  await writeMockScreenArtifact(repoRoot);
  await rejectScreenArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    decidedBy: "reviewer",
    reason: "Needs copy update.",
    now: new Date("2026-05-08T01:00:00.000Z"),
  });

  await assert.rejects(
    approveScreenArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", decidedBy: "reviewer", note: "updated" }),
    /Re-approval after rejection requires explicit --reapprove/,
  );

  const result = await approveScreenArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    decidedBy: "reviewer",
    note: "Updated copy is acceptable.",
    allowReapproval: true,
    now: new Date("2026-05-08T02:00:00.000Z"),
  });
  assert.equal(result.approval.decision, "approved");
  assert.equal(result.approval.history?.[0]?.decision, "rejected");
  assert.match(result.approval.notes[0], /Previous decision rejected/);
});

test("invalid decision blocks approval status normalization", async () => {
  const repoRoot = await makeTempRepo("screen-artifact-invalid-decision-");
  const artifactHash = await writeMockScreenArtifact(repoRoot);
  const approvalPath = join(repoRoot, "docs", "initiatives", "checkout-redesign", "screen-artifacts", "slice-001.approval.json");
  await writeFile(approvalPath, `${JSON.stringify({
    version: 1,
    initiativeId: "checkout-redesign",
    sliceId: "slice-001",
    artifactPath: "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.json",
    artifactHash,
    decision: "accepted",
    decidedBy: "reviewer",
    decidedAt: "2026-05-08T00:00:00.000Z",
    approvalRef: `screen-approval:checkout-redesign:slice-001:${artifactHash}`,
    notes: ["bad"],
    requiredBefore: "fe_implementation",
    nextAllowedPhase: "fe_implementation",
    blockedReason: null,
  }, null, 2)}\n`, "utf8");

  await assert.rejects(
    getScreenArtifactApprovalStatus({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /decision must be pending, approved, or rejected/,
  );
});

test("approval schema defines FE gate hash-bound decision shape", async () => {
  const schema = JSON.parse(await readFile(".pi/agent/state/schemas/screen-artifact-approval.schema.json", "utf8"));
  assert.equal(schema.title, "Screen Artifact Approval");
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.properties.decision.enum, ["pending", "approved", "rejected"]);
  assert.equal(schema.properties.requiredBefore.const, "fe_implementation");
  assert.deepEqual(schema.properties.nextAllowedPhase.enum, ["fe_implementation", null]);
  assert.ok(schema.required.includes("artifactHash"));
  assert.ok(schema.properties.history);
});
