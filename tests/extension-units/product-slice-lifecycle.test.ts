import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  PRODUCT_SLICE_PHASE_ORDER,
  decideProductSlicePhaseTransition,
  loadProductSlicePlan,
  parseProductSlicePlan,
  validateProductSlicePlan,
  type ProductSlicePlan,
} from "../../.pi/agent/extensions/product-slice-lifecycle.ts";
import { makeTempRepo } from "./test-utils.ts";

function makePlan(overrides: Partial<ProductSlicePlan["slices"][number]> = {}): ProductSlicePlan {
  return {
    version: 1,
    initiativeId: "example",
    status: "ready",
    slices: [
      {
        sliceId: "slice-001",
        title: "Example product slice",
        type: "AFK",
        status: "active",
        currentPhase: "fe_implementation",
        phaseOrder: [...PRODUCT_SLICE_PHASE_ORDER],
        phaseEvidence: {
          stitch_prompt: { status: "done", artifactPath: "docs/initiatives/example/stitch-prompt.md", evidence: ["Prompt approved"] },
          stitch_generation: { status: "done", artifactPath: "docs/initiatives/example/stitch-output.md", evidence: ["Screen generated"] },
          screen_approval: { status: "approved", artifactPath: "docs/initiatives/example/screen-approval.md", evidence: ["Human approved screen"] },
          slice_contract: { status: "done", artifactPath: "docs/initiatives/example/slice-contract.md", evidence: ["Contract written"] },
          fe_implementation: { status: "done", artifactPath: null, evidence: ["FE built"] },
          fe_validation: { status: "missing", artifactPath: null, evidence: [] },
        },
        dependencies: [],
        blockedReason: null,
        ...overrides,
      },
    ],
    policy: {
      intraSliceParallelism: "forbidden",
      unknownTransition: "blocked",
      requiredPhaseOrder: [...PRODUCT_SLICE_PHASE_ORDER],
    },
  };
}

test("valid product slice plan parses successfully", async () => {
  const plan = makePlan({ currentPhase: "stitch_prompt", phaseEvidence: { stitch_prompt: { status: "done", artifactPath: null, evidence: ["Prompt ready"] } } });
  const parsed = parseProductSlicePlan(plan);
  assert.equal(parsed.initiativeId, "example");
  assert.deepEqual(parsed.policy.requiredPhaseOrder, PRODUCT_SLICE_PHASE_ORDER);

  const cwd = await makeTempRepo("product-slice-plan-");
  const planPath = join(cwd, "slice-plan.json");
  await writeFile(planPath, JSON.stringify(plan, null, 2));
  const loaded = await loadProductSlicePlan(planPath);
  assert.equal(loaded.slices[0].sliceId, "slice-001");
});

test("invalid phase names fail validation", () => {
  const invalid = makePlan({ currentPhase: "not_a_phase" as ProductSlicePlan["slices"][number]["currentPhase"] });
  const result = validateProductSlicePlan(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("currentPhase")));
});

test("missing required phase order fails validation", () => {
  const invalid = makePlan({ phaseOrder: PRODUCT_SLICE_PHASE_ORDER.slice(0, -1) as ProductSlicePlan["slices"][number]["phaseOrder"] });
  const result = validateProductSlicePlan(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("phaseOrder")));
});

test("allows immediate next transition only when current phase evidence is complete", () => {
  const plan = makePlan({
    currentPhase: "stitch_prompt",
    phaseEvidence: {
      stitch_prompt: { status: "done", artifactPath: "docs/initiatives/example/stitch-prompt.md", evidence: ["Prompt approved"] },
    },
  });
  const decision = decideProductSlicePhaseTransition({ plan, sliceId: "slice-001", requestedPhase: "stitch_generation" });

  assert.deepEqual(decision, {
    allowed: true,
    reason: "allowed",
    currentPhase: "stitch_prompt",
    requestedPhase: "stitch_generation",
    requiredPreviousPhase: "stitch_prompt",
    blockers: [],
  });
});

test("blocks immediate next transition when current evidence is not complete", () => {
  const plan = makePlan({
    currentPhase: "stitch_prompt",
    phaseEvidence: {
      stitch_prompt: { status: "ready", artifactPath: "docs/initiatives/example/stitch-prompt.md", evidence: ["Draft prompt"] },
    },
  });
  const decision = decideProductSlicePhaseTransition({ plan, sliceId: "slice-001", requestedPhase: "stitch_generation" });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "blocked_current_evidence_incomplete");
  assert.equal(decision.requiredPreviousPhase, "stitch_prompt");
});

test("blocks skipped phase transitions", () => {
  const plan = makePlan({
    currentPhase: "stitch_prompt",
    phaseEvidence: { stitch_prompt: { status: "done", artifactPath: null, evidence: ["Prompt approved"] } },
  });
  const decision = decideProductSlicePhaseTransition({ plan, sliceId: "slice-001", requestedPhase: "screen_approval" });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "blocked_out_of_order");
  assert.equal(decision.requiredPreviousPhase, "stitch_generation");
});

test("blocks BE implementation before FE validation is complete", () => {
  const decision = decideProductSlicePhaseTransition({
    plan: makePlan(),
    sliceId: "slice-001",
    requestedPhase: "be_implementation",
  });

  assert.deepEqual(decision, {
    allowed: false,
    reason: "blocked_out_of_order",
    currentPhase: "fe_implementation",
    requestedPhase: "be_implementation",
    requiredPreviousPhase: "fe_validation",
    blockers: [],
  });
});

test("blocks unknown requested phases", () => {
  const decision = decideProductSlicePhaseTransition({ plan: makePlan(), sliceId: "slice-001", requestedPhase: "qa_magic" });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "blocked_unknown_phase");
  assert.deepEqual(decision.blockers, ["Unknown product-slice phase: qa_magic"]);
});

test("blocks same-slice parallel phase requests", () => {
  const decision = decideProductSlicePhaseTransition({
    plan: makePlan({
      currentPhase: "stitch_prompt",
      phaseEvidence: { stitch_prompt: { status: "done", artifactPath: null, evidence: ["Prompt approved"] } },
    }),
    sliceId: "slice-001",
    requestedPhase: "stitch_generation",
    inFlightPhase: "screen_approval",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "blocked_same_slice_parallel");
  assert.equal(decision.currentPhase, "stitch_prompt");
});

test("schema file declares required phase order and planning-only lifecycle fields", async () => {
  const schema = JSON.parse(await readFile(".pi/agent/state/schemas/product-slice-plan.schema.json", "utf8"));
  assert.equal(schema.title, "Product Slice Plan");
  assert.deepEqual(
    schema.$defs.requiredPhaseOrder.prefixItems.map((entry: { const: string }) => entry.const),
    PRODUCT_SLICE_PHASE_ORDER,
  );
  assert.equal(schema.properties.policy.properties.intraSliceParallelism.const, "forbidden");
});
