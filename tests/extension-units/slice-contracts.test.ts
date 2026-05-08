import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { approveScreenArtifact, rejectScreenArtifact } from "../../.pi/agent/extensions/screen-artifact-approval.ts";
import { generateSliceContract, renderSliceContractMarkdown } from "../../.pi/agent/extensions/slice-contracts.ts";
import { makeTempRepo } from "./test-utils.ts";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function writePlanningDocs(repoRoot: string, overrideSlicePlan: Record<string, unknown> | string | null = undefined): Promise<void> {
  const dir = join(repoRoot, "docs", "initiatives", "checkout-redesign");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "prd.md"), "# PRD\n\n## Out Of Scope\n- Payment processor migration\n- Native mobile app\n", "utf8");
  await writeFile(join(dir, "backlog.md"), "# Backlog\n\n## Slice List\n- slice-001 checkout review\n", "utf8");
  const slicePlan = overrideSlicePlan ?? {
    version: 1,
    initiativeId: "checkout-redesign",
    status: "draft",
    slices: [{ sliceId: "slice-001", currentPhase: "slice_contract" }],
  };
  await writeFile(join(dir, "slice-plan.json"), typeof slicePlan === "string" ? slicePlan : `${JSON.stringify(slicePlan, null, 2)}\n`, "utf8");
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
    nextBlockedUntil: "human_artifact_review",
    constraints: { liveStitchCalled: false, taskPacketsCreated: false, queueJobsCreated: false },
    screens: [
      {
        screenId: "slice-001-primary",
        name: "Checkout review",
        purpose: "Confirm checkout order before payment.",
        states: ["default", "loading", "empty", "error"],
        dataNeeds: ["cartItems", "totals", "shippingAddress"],
        userActions: ["confirmOrder", "editCart"],
        accessibilityNotes: ["Focus order follows checkout sections."],
        mockOnly: true,
      },
    ],
    ...override,
  };
  await mkdir(join(repoRoot, "docs", "initiatives", "checkout-redesign", "screen-artifacts"), { recursive: true });
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(join(repoRoot, relPath), text, "utf8");
  return sha256(text);
}

async function approvedFixture(repoRoot: string): Promise<string> {
  await writePlanningDocs(repoRoot);
  const artifactHash = await writeMockScreenArtifact(repoRoot);
  await approveScreenArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    decidedBy: "product-reviewer",
    note: "Approved for contract generation.",
    now: new Date("2026-05-08T00:00:00.000Z"),
  });
  return artifactHash;
}

test("valid approved artifact generates a FE/BE slice contract", async () => {
  const repoRoot = await makeTempRepo("slice-contract-valid-");
  const artifactHash = await approvedFixture(repoRoot);

  const result = await generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });

  assert.equal(result.jsonPath, "docs/initiatives/checkout-redesign/contracts/slice-001.contract.json");
  assert.equal(result.markdownPath, "docs/initiatives/checkout-redesign/contracts/slice-001.contract.md");
  assert.equal(result.contract.status, "ready_for_review");
  assert.equal(result.contract.sourceScreenArtifact.artifactHash, artifactHash);
  assert.deepEqual(result.contract.uiStateContract[0].states, ["default", "loading", "empty", "error"]);
  assert.deepEqual(result.contract.uiStateContract[0].requiredData, ["cartItems", "shippingAddress", "totals"]);
  assert.equal(result.contract.apiContract[0].method, "GET");
  assert.equal(result.contract.apiContract[0].auth.required, false);
  assert.ok(result.contract.apiContract[0].auth.assumptions[0].includes("Auth requirements are unset"));
  assert.equal(result.contract.errors[0].uiState, "error");
  assert.equal(result.contract.mockPlan.frontendMockSource, "contract_fixture");
  assert.equal(result.contract.mockPlan.backendFakePlan, "handler_or_service_fake");
  assert.ok(result.contract.tddSeeds[0].scenario.includes("default state renders returned data"));
  assert.deepEqual(result.contract.outOfScope, ["Native mobile app", "Payment processor migration"]);
  assert.equal(result.contract.nextAllowedPhase, "fe_implementation");
});

test("contract generation blocks missing screen artifact and missing approval", async () => {
  const repoRoot = await makeTempRepo("slice-contract-missing-");
  await writePlanningDocs(repoRoot);

  await assert.rejects(
    generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Missing screen artifact: docs\/initiatives\/checkout-redesign\/screen-artifacts\/slice-001\.mock-screen\.json/,
  );

  await writeMockScreenArtifact(repoRoot);
  await assert.rejects(
    generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Missing screen artifact approval: docs\/initiatives\/checkout-redesign\/screen-artifacts\/slice-001\.approval\.json/,
  );
});

test("contract generation blocks rejected approvals and stale approval hashes", async () => {
  const repoRoot = await makeTempRepo("slice-contract-approval-gates-");
  await writePlanningDocs(repoRoot);
  await writeMockScreenArtifact(repoRoot);
  await rejectScreenArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    decidedBy: "reviewer",
    reason: "Needs product copy update.",
    now: new Date("2026-05-08T01:00:00.000Z"),
  });

  await assert.rejects(
    generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Screen artifact approval is not approved/,
  );

  await approveScreenArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    decidedBy: "reviewer",
    note: "Updated and approved.",
    allowReapproval: true,
    now: new Date("2026-05-08T02:00:00.000Z"),
  });
  await writeMockScreenArtifact(repoRoot, { screens: [{ screenId: "slice-001-primary", states: ["default"], dataNeeds: ["changed"], userActions: [], mockOnly: true }] });

  await assert.rejects(
    generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Stale screen artifact approval: artifact hash differs from current artifact hash/,
  );
});

test("contract output is deterministic for identical inputs", async () => {
  const repoRoot = await makeTempRepo("slice-contract-deterministic-");
  await approvedFixture(repoRoot);

  const first = await generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  const second = await generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });

  assert.deepEqual(first.contract, second.contract);
  assert.equal(first.markdown, second.markdown);
  assert.equal(first.contractHash, second.contractHash);
  assert.equal(first.markdown, renderSliceContractMarkdown(first.contract));
});

test("malformed source docs fail clearly", async () => {
  const repoRoot = await makeTempRepo("slice-contract-malformed-docs-");
  await writePlanningDocs(repoRoot, "{bad json");
  await writeMockScreenArtifact(repoRoot);
  await approveScreenArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", decidedBy: "reviewer", note: "approved" });

  await assert.rejects(
    generateSliceContract({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Invalid slice plan JSON/,
  );
});

test("slice contract schema defines required FE/BE shared fields", async () => {
  const schema = JSON.parse(await readFile(".pi/agent/state/schemas/slice-contract.schema.json", "utf8"));
  assert.equal(schema.title, "Slice Contract");
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.properties.status.enum, ["draft", "ready_for_review", "approved", "blocked"]);
  for (const required of ["sourceScreenArtifact", "uiStateContract", "apiContract", "errors", "mockPlan", "tddSeeds", "outOfScope", "nextAllowedPhase"]) {
    assert.ok(schema.required.includes(required), required);
  }
  assert.equal(schema.properties.nextAllowedPhase.const, "fe_implementation");
});
