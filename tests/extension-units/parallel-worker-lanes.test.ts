import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCT_PIPELINE_PHASE_ORDER, type ProductPipelinePlan } from "../../.pi/agent/extensions/product-pipeline.ts";
import {
  buildParallelWorkerLaneManifest,
  planParallelWorkerLanes,
  type ParallelWorkerLaneManifest,
} from "../../.pi/agent/extensions/parallel-worker-lanes.ts";

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
    parallelDecisions: [{ sliceIds: ["slice-001", "slice-002"], parallelAllowed: true, blockers: [], source: "phase10:test" }],
    ...overrides,
  };
}

test("plans two independent worker lanes with Phase 10 proof and max parallel 2", () => {
  const result = planParallelWorkerLanes({ plan: plan(), maxParallelSlices: 2, activeLeaseScopes: [] });

  assert.deepEqual(result.selectedSliceIds, ["slice-001", "slice-002"]);
  assert.equal(result.lanes.length, 2);
  assert.equal(result.lanes[0].laneId, "lane-slice-001");
  assert.equal(result.lanes[0].status, "planned");
  assert.equal(result.parallelProof.phase10Decision, "allowed");
  assert.equal(result.parallelProof.sameSliceParallelism, false);
});

test("mixed-domain-style slice ids still rely on explicit Phase 10 proof refs", () => {
  const result = planParallelWorkerLanes({
    plan: plan({
      initiativeId: "mixed-domain-harness-optimization",
      slices: [
        {
          ...plan().slices[0],
          sliceId: "issue-005",
          title: "Improve mixed-domain parallel safety",
          artifacts: { frontendPacket: "docs/initiatives/mixed-domain-harness-optimization/packets/issue-005.frontend.packet.json" },
        },
        {
          ...plan().slices[1],
          sliceId: "issue-006",
          title: "Coordinate mixed-domain sub-lanes",
          artifacts: { frontendPacket: "docs/initiatives/mixed-domain-harness-optimization/packets/issue-006.frontend.packet.json" },
        },
      ],
      parallelDecisions: [{ sliceIds: ["issue-005", "issue-006"], parallelAllowed: true, blockers: [], source: "phase10:mixed-domain-safe" }],
    }),
    maxParallelSlices: 2,
    activeLeaseScopes: [],
  });

  assert.deepEqual(result.selectedSliceIds, ["issue-005", "issue-006"]);
  assert.equal(result.lanes[0].dependencyDecisionRef, "phase10:not_required_single_lane");
  assert.equal(result.lanes[1].dependencyDecisionRef, "phase10:mixed-domain-safe");
});

test("respects max parallel, missing Phase 10 proof, HITL gates, and active worker-lane lease conflicts", () => {
  const maxOne = planParallelWorkerLanes({ plan: plan(), maxParallelSlices: 1, activeLeaseScopes: [] });
  assert.deepEqual(maxOne.selectedSliceIds, ["slice-001"]);
  assert.match(maxOne.blockers.join("\n"), /maxParallelSlices=1/);

  const missingProof = planParallelWorkerLanes({ plan: plan({ parallelDecisions: [] }), maxParallelSlices: 2, activeLeaseScopes: [] });
  assert.deepEqual(missingProof.selectedSliceIds, ["slice-001"]);
  assert.match(missingProof.blockers.join("\n"), /Missing Phase 10 parallelAllowed proof/);

  const hitl = planParallelWorkerLanes({
    plan: plan({
      slices: [
        { ...plan().slices[0], hitlGate: { type: "approval", status: "waiting_for_human", summary: "Approve screen" } },
        plan().slices[1],
      ],
    }),
    maxParallelSlices: 2,
    activeLeaseScopes: [],
  });
  assert.deepEqual(hitl.selectedSliceIds, ["slice-002"]);
  assert.match(hitl.blockers.join("\n"), /HITL gate unresolved/);

  const leaseConflict = planParallelWorkerLanes({ plan: plan(), maxParallelSlices: 2, activeLeaseScopes: ["worker_lane:slice-001"] });
  assert.deepEqual(leaseConflict.selectedSliceIds, ["slice-002"]);
  assert.match(leaseConflict.blockers.join("\n"), /worker-lane lease conflict/);
});

test("manifest uses durable initiative path shape and records parallel proof", () => {
  const manifest: ParallelWorkerLaneManifest = buildParallelWorkerLaneManifest({
    plan: plan(),
    runId: "run-test",
    maxParallelSlices: 2,
    mode: "dry_run",
    now: "2026-05-08T00:00:00.000Z",
    activeLeaseScopes: [],
  });

  assert.equal(manifest.version, 1);
  assert.equal(manifest.status, "planned");
  assert.equal(manifest.orchestrationLeaseId, "parallel-run:checkout-redesign:run-test");
  assert.equal(manifest.lanes[0].packetPath, "docs/initiatives/checkout-redesign/packets/slice-001.frontend.packet.json");
  assert.equal(manifest.parallelProof.phase10Decision, "allowed");
});
