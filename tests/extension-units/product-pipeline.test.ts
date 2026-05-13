import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  PRODUCT_PIPELINE_PHASE_ORDER,
  buildProductPipelineRun,
  computeNextReadySlices,
  detectHitlGate,
  loadProductPipelinePlan,
  writeProductPipelineRun,
  type ProductPipelinePlan,
} from "../../.pi/agent/extensions/product-pipeline.ts";
import { makeTempRepo } from "./test-utils.ts";

function plan(overrides: Partial<ProductPipelinePlan> = {}): ProductPipelinePlan {
  return {
    version: 1,
    initiativeId: "checkout-redesign",
    maxParallelSlices: 2,
    slices: [
      {
        sliceId: "slice-001",
        title: "Checkout review",
        status: "ready",
        currentPhase: "fe_implementation",
        phaseOrder: [...PRODUCT_PIPELINE_PHASE_ORDER],
        artifacts: { frontendPacket: "docs/initiatives/checkout-redesign/packets/slice-001.frontend.packet.json" },
        hitlGate: null,
        blockers: [],
      },
      {
        sliceId: "slice-002",
        title: "Checkout confirmation",
        status: "ready",
        currentPhase: "fe_implementation",
        phaseOrder: [...PRODUCT_PIPELINE_PHASE_ORDER],
        artifacts: { frontendPacket: "docs/initiatives/checkout-redesign/packets/slice-002.frontend.packet.json" },
        hitlGate: null,
        blockers: [],
      },
    ],
    parallelDecisions: [],
    ...overrides,
  };
}

test("buildProductPipelineRun emits a complete sequential DAG and blocks missing Phase 10 proof", () => {
  const run = buildProductPipelineRun({ plan: plan(), mode: "dry_run", runId: "run-test", now: "2026-05-08T00:00:00.000Z", maxParallelSlices: 2 });

  assert.equal(run.mode, "dry_run");
  assert.equal(run.status, "planned");
  assert.deepEqual(run.slices.map((slice) => slice.sliceId), ["slice-001", "slice-002"]);
  assert.deepEqual(run.slices[0].phaseOrder, PRODUCT_PIPELINE_PHASE_ORDER);
  assert.equal(run.sliceDag[0].nodes.length, PRODUCT_PIPELINE_PHASE_ORDER.length);
  assert.equal(run.sliceDag[0].edges[0].from, "stitch_prompt");
  assert.equal(run.sliceDag[0].edges[0].to, "stitch_generation");
  assert.equal(run.parallelDecisions[0].parallelAllowed, false);
  assert.match(run.parallelDecisions[0].blockers[0], /Missing Phase 10 parallelAllowed proof/);
  assert.deepEqual(run.materializedWork.queueJobIds, []);
});

test("computeNextReadySlices respects max parallel and requires explicit parallelAllowed true", () => {
  const missingProof = computeNextReadySlices(plan(), 2);
  assert.deepEqual(missingProof.readySliceIds, ["slice-001"]);
  assert.ok(missingProof.blockers.some((blocker) => blocker.includes("Missing Phase 10")));

  const allowed = computeNextReadySlices(plan({ parallelDecisions: [{ sliceIds: ["slice-001", "slice-002"], parallelAllowed: true, blockers: [] }] }), 2);
  assert.deepEqual(allowed.readySliceIds, ["slice-001", "slice-002"]);
});

test("detectHitlGate reports unresolved approval gates", () => {
  const gate = detectHitlGate({
    sliceId: "slice-001",
    status: "ready",
    currentPhase: "screen_approval",
    phaseOrder: [...PRODUCT_PIPELINE_PHASE_ORDER],
    artifacts: { screenApproval: "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.approval.json" },
    hitlGate: { type: "screen_approval", status: "waiting_for_human", summary: "Approve screen" },
    blockers: [],
  });

  assert.equal(gate?.type, "screen_approval");
  assert.equal(gate?.status, "waiting_for_human");
});

test("buildProductPipelineRun captures mixed-domain coordinators with child lane queue jobs and parent reunification", () => {
  const run = buildProductPipelineRun({
    plan: {
      version: 1,
      initiativeId: "mixed-domain-harness-optimization",
      maxParallelSlices: 1,
      slices: [
        {
          sliceId: "issue-006",
          title: "Add coordinated sub-lane execution under one mixed-domain parent slice",
          status: "ready",
          currentPhase: "fe_implementation",
          phaseOrder: [...PRODUCT_PIPELINE_PHASE_ORDER],
          artifacts: {
            frontendPacket: "docs/initiatives/mixed-domain-harness-optimization/packets/issue-006.frontend.packet.json",
            backendPacket: "docs/initiatives/mixed-domain-harness-optimization/packets/issue-006.backend.packet.json",
            bffPacket: "docs/initiatives/mixed-domain-harness-optimization/packets/issue-006.bff.packet.json",
          },
          hitlGate: null,
          blockers: [],
        },
      ],
      parallelDecisions: [],
    },
    mode: "apply",
    runId: "run-mixed",
    now: "2026-05-08T00:00:00.000Z",
    maxParallelSlices: 1,
  });

  assert.equal(run.coordinators.length, 1);
  assert.equal(run.coordinators[0]?.parentSliceId, "issue-006");
  assert.equal(run.coordinators[0]?.conflictCheck.status, "passed");
  assert.deepEqual(run.coordinators[0]?.childLanes.map((lane) => lane.laneKind), ["frontend", "backend", "bff"]);
  assert.deepEqual(run.materializedWork.queueJobIds, [
    "preview:mixed-domain-harness-optimization:issue-006:frontend",
    "preview:mixed-domain-harness-optimization:issue-006:backend",
    "preview:mixed-domain-harness-optimization:issue-006:bff",
    "preview:mixed-domain-harness-optimization:issue-006:reunify",
  ]);
});

test("writeProductPipelineRun writes a durable run artifact outside runtime state", async () => {
  const cwd = await makeTempRepo("product-pipeline-write-");
  const run = buildProductPipelineRun({ plan: plan(), mode: "apply", runId: "run-write", now: "2026-05-08T00:00:00.000Z", maxParallelSlices: 1 });
  const written = await writeProductPipelineRun({ repoRoot: cwd, run });

  assert.equal(written, "docs/initiatives/checkout-redesign/pipeline-runs/run-write.json");
  const saved = JSON.parse(await readFile(join(cwd, written), "utf8"));
  assert.equal(saved.runId, "run-write");
  assert.equal(saved.materializedWork.queueJobIds.length, 1);
  assert.equal(saved.materializedWork.workerSessionIds.length, 0);
  assert.equal(saved.materializedWork.worktreePaths.length, 0);
});

test("loadProductPipelinePlan reads docs/initiatives/<slug>/pipeline.json", async () => {
  const cwd = await makeTempRepo("product-pipeline-load-");
  await mkdir(join(cwd, "docs", "initiatives", "checkout-redesign"), { recursive: true });
  await writeFile(join(cwd, "docs", "initiatives", "checkout-redesign", "pipeline.json"), `${JSON.stringify(plan(), null, 2)}\n`, "utf8");
  const loaded = await loadProductPipelinePlan({ repoRoot: cwd, initiativeId: "checkout-redesign" });
  assert.equal(loaded.initiativeId, "checkout-redesign");
});
