import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { PRODUCT_SLICE_PHASE_ORDER } from "../../.pi/agent/extensions/product-slice-lifecycle.ts";
import { generateStitchPrompt } from "../../.pi/agent/extensions/stitch-prompt-generator.ts";
import { makeTempRepo } from "./test-utils.ts";

async function writeFixtureInitiative(repoRoot: string): Promise<void> {
  const base = join(repoRoot, "docs", "initiatives", "checkout-redesign");
  await mkdir(base, { recursive: true });
  await writeFile(join(base, "intake.json"), `${JSON.stringify({ version: 1, initiativeId: "checkout-redesign", status: "ready_for_prd", domains: ["frontend"] }, null, 2)}\n`, "utf8");
  await writeFile(join(base, "prd.md"), "# Checkout Redesign PRD\n\nHelp shoppers review totals before paying.\n", "utf8");
  await writeFile(join(base, "backlog.md"), "# Backlog\n\n- slice-001: Review checkout totals screen.\n", "utf8");
  await writeFile(join(base, "slice-plan.json"), `${JSON.stringify({
    version: 1,
    initiativeId: "checkout-redesign",
    status: "ready",
    slices: [
      {
        sliceId: "slice-001",
        title: "Review checkout totals screen",
        type: "AFK",
        status: "planned",
        currentPhase: "stitch_prompt",
        phaseOrder: PRODUCT_SLICE_PHASE_ORDER,
        phaseEvidence: { stitch_prompt: { status: "missing", artifactPath: null, evidence: [] } },
        dependencies: [],
        blockedReason: null,
        userStories: ["As a shopper, I can review cart totals before paying."],
        targetScreens: ["Checkout review"],
        domains: ["frontend"],
        ui: true,
      },
    ],
    policy: {
      intraSliceParallelism: "forbidden",
      unknownTransition: "blocked",
      requiredPhaseOrder: PRODUCT_SLICE_PHASE_ORDER,
    },
  }, null, 2)}\n`, "utf8");
}

test("valid UI slice produces deterministic Stitch prompt Markdown and metadata", async () => {
  const repoRoot = await makeTempRepo("stitch-prompt-unit-");
  await writeFixtureInitiative(repoRoot);

  const first = await generateStitchPrompt({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  const second = await generateStitchPrompt({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });

  assert.equal(first.prompt, second.prompt);
  assert.deepEqual(first.metadata, second.metadata);
  assert.match(first.prompt, /## Product context/);
  assert.match(first.prompt, /## Slice goal/);
  assert.match(first.prompt, /## Target screens/);
  assert.match(first.prompt, /## Screen states/);
  assert.match(first.prompt, /## Data needs and mocked data assumptions/);
  assert.match(first.prompt, /## Accessibility expectations/);
  assert.match(first.prompt, /## Visual\/design constraints/);
  assert.match(first.prompt, /## Out-of-scope behaviors/);
  assert.match(first.prompt, /generate screens only for this slice/i);
  assert.match(first.prompt, /do not invent backend behavior/i);
  assert.match(first.prompt, /do not implement code/i);
  assert.equal(first.metadata.version, 1);
  assert.equal(first.metadata.initiativeId, "checkout-redesign");
  assert.equal(first.metadata.sliceId, "slice-001");
  assert.equal(first.metadata.promptPath, "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.md");
  assert.deepEqual(first.metadata.targetScreens, ["Checkout review"]);
  assert.match(first.metadata.sourceHashes.prd, /^[a-f0-9]{64}$/);

  await assert.rejects(readFile(join(repoRoot, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.md"), "utf8"), /ENOENT/);
});

test("missing source file blocks with a clear error", async () => {
  const repoRoot = await makeTempRepo("stitch-prompt-missing-source-");
  const base = join(repoRoot, "docs", "initiatives", "checkout-redesign");
  await mkdir(base, { recursive: true });
  await writeFile(join(base, "intake.json"), "{}\n", "utf8");
  await writeFile(join(base, "prd.md"), "# PRD\n", "utf8");
  await writeFile(join(base, "slice-plan.json"), "{}\n", "utf8");

  await assert.rejects(
    generateStitchPrompt({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Missing required Stitch prompt source: docs\/initiatives\/checkout-redesign\/backlog.md/,
  );
});

test("non-UI slice blocks by default and can be explicitly allowed", async () => {
  const repoRoot = await makeTempRepo("stitch-prompt-non-ui-");
  await writeFixtureInitiative(repoRoot);
  const planPath = join(repoRoot, "docs", "initiatives", "checkout-redesign", "slice-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.slices[0].title = "Calculate totals";
  plan.slices[0].targetScreens = [];
  plan.slices[0].domains = ["backend"];
  plan.slices[0].ui = false;
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  await assert.rejects(
    generateStitchPrompt({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Slice is not UI-facing: slice-001/,
  );

  const result = await generateStitchPrompt({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", allowNonUi: true });
  assert.equal(result.metadata.sliceId, "slice-001");
  assert.deepEqual(result.metadata.targetScreens, []);
});
