import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { generateMockStitchArtifact, writeMockStitchArtifactArtifacts } from "../../.pi/agent/extensions/stitch.ts";
import { makeTempRepo } from "./test-utils.ts";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function writePromptFixture(repoRoot: string): Promise<void> {
  const base = join(repoRoot, "docs", "initiatives", "checkout-redesign");
  const promptDir = join(base, "stitch-prompts");
  await mkdir(promptDir, { recursive: true });

  const intake = `${JSON.stringify({ version: 1, initiativeId: "checkout-redesign", status: "ready_for_prd" }, null, 2)}\n`;
  const prd = "# Checkout Redesign PRD\n\nHelp shoppers review totals before paying.\n";
  const backlog = "# Backlog\n\n- slice-001: Review checkout totals screen.\n";
  const slicePlan = `${JSON.stringify({ version: 1, initiativeId: "checkout-redesign", status: "ready" }, null, 2)}\n`;
  await writeFile(join(base, "intake.json"), intake, "utf8");
  await writeFile(join(base, "prd.md"), prd, "utf8");
  await writeFile(join(base, "backlog.md"), backlog, "utf8");
  await writeFile(join(base, "slice-plan.json"), slicePlan, "utf8");

  const prompt = [
    "# Stitch Prompt: checkout-redesign / slice-001",
    "",
    "## Target screens",
    "- Checkout review",
    "",
    "## Screen states",
    "- default",
    "- loading",
    "- empty",
    "- error",
    "",
    "## Data needs and mocked data assumptions",
    "- Cart total",
    "",
    "## Accessibility expectations",
    "- Keyboard-accessible controls",
    "- Visible focus states",
    "",
  ].join("\n");
  await writeFile(join(promptDir, "slice-001.prompt.md"), prompt, "utf8");
  await writeFile(join(promptDir, "slice-001.prompt.json"), `${JSON.stringify({
    version: 1,
    initiativeId: "checkout-redesign",
    sliceId: "slice-001",
    phase: "stitch_prompt",
    status: "draft",
    promptPath: "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.md",
    promptHash: sha256(prompt),
    sources: {
      intakePath: "docs/initiatives/checkout-redesign/intake.json",
      prdPath: "docs/initiatives/checkout-redesign/prd.md",
      backlogPath: "docs/initiatives/checkout-redesign/backlog.md",
      slicePlanPath: "docs/initiatives/checkout-redesign/slice-plan.json",
    },
    sourceHashes: {
      intake: sha256(intake),
      prd: sha256(prd),
      backlog: sha256(backlog),
      slicePlan: sha256(slicePlan),
    },
    targetScreens: ["Checkout review"],
    nextAllowedPhase: "stitch_generation",
    nextBlockedUntil: "human_prompt_review",
  }, null, 2)}\n`, "utf8");
}

test("valid prompt metadata produces deterministic mock screen artifact", async () => {
  const repoRoot = await makeTempRepo("stitch-artifact-unit-");
  await writePromptFixture(repoRoot);

  const first = await generateMockStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  const second = await generateMockStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });

  assert.deepEqual(first.artifact, second.artifact);
  assert.equal(first.artifact.artifactId, "mock-screen-slice-001-v1");
  assert.equal(first.artifact.sourcePrompt.promptPath, "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.md");
  assert.match(first.artifact.sourcePrompt.promptHash, /^[a-f0-9]{64}$/);
  assert.equal(first.artifact.constraints.liveStitchCalled, false);
  assert.equal(first.artifact.constraints.taskPacketsCreated, false);
  assert.equal(first.artifact.constraints.queueJobsCreated, false);
  assert.equal(first.artifact.nextAllowedPhase, "screen_approval");
  assert.deepEqual(first.artifact.screens[0].states, ["default", "loading", "empty", "error"]);
  assert.deepEqual(first.artifact.screens[0].accessibilityNotes, ["Keyboard-accessible controls", "Visible focus states"]);
  assert.equal(first.jsonPath, "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.json");
});

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

test("write helper writes only screen artifact JSON and Markdown under initiative folder", async () => {
  const repoRoot = await makeTempRepo("stitch-artifact-write-");
  await writePromptFixture(repoRoot);

  const result = await generateMockStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" });
  const createdFiles = await writeMockStitchArtifactArtifacts(result);

  assert.deepEqual(createdFiles, [
    "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.json",
    "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.md",
  ]);
  const artifact = JSON.parse(await readFile(join(repoRoot, createdFiles[0]), "utf8"));
  const markdown = await readFile(join(repoRoot, createdFiles[1]), "utf8");
  assert.equal(artifact.mode, "mock");
  assert.equal(artifact.nextBlockedUntil, "human_artifact_review");
  assert.match(markdown, /Live Stitch called: false/);
  assert.equal(await exists(join(repoRoot, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.md")), true);
});

test("missing prompt markdown blocks clearly", async () => {
  const repoRoot = await makeTempRepo("stitch-artifact-missing-prompt-");
  await writePromptFixture(repoRoot);
  await rm(join(repoRoot, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.md"));

  await assert.rejects(
    generateMockStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Missing required Stitch artifact prompt markdown: docs\/initiatives\/checkout-redesign\/stitch-prompts\/slice-001\.prompt\.md/,
  );
});

test("stale source hash blocks and no ignore-hash option is modeled", async () => {
  const repoRoot = await makeTempRepo("stitch-artifact-stale-hash-");
  await writePromptFixture(repoRoot);
  await writeFile(join(repoRoot, "docs", "initiatives", "checkout-redesign", "prd.md"), "# Changed PRD\n", "utf8");

  await assert.rejects(
    generateMockStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Stale Stitch prompt source hash for prd/,
  );
});

test("screen artifact schema declares mock-only approval handoff fields", async () => {
  const schema = JSON.parse(await readFile(".pi/agent/state/schemas/stitch-screen-artifact.schema.json", "utf8"));
  assert.equal(schema.title, "Stitch Screen Artifact");
  assert.equal(schema.properties.version.const, 1);
  assert.equal(schema.properties.mode.const, "mock");
  assert.equal(schema.properties.phase.const, "stitch_generation");
  assert.equal(schema.properties.nextAllowedPhase.const, "screen_approval");
  assert.equal(schema.properties.constraints.properties.liveStitchCalled.const, false);
  assert.ok(schema.required.includes("screens"));
});

test("missing prompt hash in metadata blocks", async () => {
  const repoRoot = await makeTempRepo("stitch-artifact-missing-prompt-hash-");
  await writePromptFixture(repoRoot);
  const metadataPath = join(repoRoot, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  delete metadata.promptHash;
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  await assert.rejects(
    generateMockStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /promptHash is required/,
  );
});

test("stale prompt hash blocks", async () => {
  const repoRoot = await makeTempRepo("stitch-artifact-stale-prompt-hash-");
  await writePromptFixture(repoRoot);
  await writeFile(join(repoRoot, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.md"), "# Changed prompt\n", "utf8");

  await assert.rejects(
    generateMockStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001" }),
    /Stale Stitch prompt hash/,
  );
});
