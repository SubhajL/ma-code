import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  applyLiveStitchArtifact,
  planLiveStitchArtifact,
  writeLiveStitchArtifactArtifacts,
  type LiveStitchCommandRunner,
} from "../../.pi/agent/extensions/stitch.ts";
import { makeTempRepo } from "./test-utils.ts";

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

test("dry-run validates prompt metadata, plans managed paths, and writes no files", async () => {
  const repoRoot = await makeTempRepo("live-stitch-dry-run-");
  await writePromptFixture(repoRoot);

  const result = await planLiveStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", runId: "run-test" });

  assert.equal(result.artifact.mode, "live");
  assert.equal(result.artifact.status, "blocked");
  assert.equal(result.artifact.constraints.liveStitchCalled, false);
  assert.equal(result.artifact.constraints.requiresHumanApproval, true);
  assert.equal(result.artifact.managedArtifacts.root, ".pi/agent/artifacts/stitch/checkout-redesign/slice-001/run-test");
  assert.equal(result.summaryJsonPath, "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.live-screen.json");
  assert.deepEqual(result.createdFiles, []);
  assert.deepEqual(result.requiredConfig, ["STITCH_API_KEY or STITCH_AUTH_TOKEN or STITCH_LIVE_AUTH_TOKEN"]);
  assert.equal(await exists(join(repoRoot, ".pi", "agent", "artifacts", "stitch")), false);
  assert.equal(await exists(join(repoRoot, "docs", "initiatives", "checkout-redesign", "screen-artifacts")), false);
});

test("apply requires explicit live approval ref", async () => {
  const repoRoot = await makeTempRepo("live-stitch-approval-");
  await writePromptFixture(repoRoot);

  await assert.rejects(
    applyLiveStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", runId: "run-test", env: { STITCH_API_KEY: "redacted" }, providerCommand: "fake-stitch", policyAllowsProviderCommand: true }),
    /--approval-ref is required for live Stitch apply/,
  );
});

test("stale prompt hash and missing prompt metadata block", async () => {
  const repoRoot = await makeTempRepo("live-stitch-stale-");
  await writePromptFixture(repoRoot);
  await writeFile(join(repoRoot, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.md"), "# Changed prompt\n", "utf8");

  await assert.rejects(
    planLiveStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", runId: "run-test" }),
    /Stale Stitch prompt hash/,
  );

  await rm(join(repoRoot, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.json"));
  await assert.rejects(
    planLiveStitchArtifact({ repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", runId: "run-test" }),
    /Missing required live Stitch prompt metadata/,
  );
});

test("apply with fake live runner writes managed manifest and durable summary", async () => {
  const repoRoot = await makeTempRepo("live-stitch-apply-");
  await writePromptFixture(repoRoot);
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: LiveStitchCommandRunner = async (command, args) => {
    calls.push({ command, args });
    return {
      stdout: JSON.stringify({ screens: [{ id: "checkout-review", name: "Checkout review" }] }),
      stderr: "",
    };
  };

  const result = await applyLiveStitchArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    runId: "run-test",
    approvalRef: "operator-approved-live-stitch:test-ref",
    providerCommand: "fake-stitch",
    policyAllowsProviderCommand: true,
    env: { STITCH_API_KEY: "redacted" },
    runner,
  });
  const created = await writeLiveStitchArtifactArtifacts(result);

  assert.equal(calls.length, 1);
  assert.equal(result.artifact.status, "generated_live");
  assert.equal(result.artifact.constraints.liveStitchCalled, true);
  assert.equal(result.artifact.constraints.taskPacketsCreated, false);
  assert.equal(result.artifact.constraints.queueJobsCreated, false);
  assert.equal(result.artifact.nextAllowedPhase, "screen_approval");
  assert.equal(result.artifact.approvalRef, "operator-approved-live-stitch:test-ref");
  assert.ok(result.artifact.managedArtifacts.outputHashes.length >= 1);
  assert.ok(created.includes("docs/initiatives/checkout-redesign/screen-artifacts/slice-001.live-screen.json"));
  assert.ok(created.includes(".pi/agent/artifacts/stitch/checkout-redesign/slice-001/run-test/manifest.json"));
  const manifest = JSON.parse(await readFile(join(repoRoot, ".pi", "agent", "artifacts", "stitch", "checkout-redesign", "slice-001", "run-test", "manifest.json"), "utf8"));
  assert.equal(manifest.provider.command, "fake-stitch");
  assert.deepEqual(manifest.provider.auth, { present: true, source: "environment" });
  assert.equal(manifest.outputs[0].sha256, result.artifact.managedArtifacts.outputHashes[0]?.sha256);
});

test("apply blocks missing auth/config, forbidden args, and unmanaged output path", async () => {
  const repoRoot = await makeTempRepo("live-stitch-blocks-");
  await writePromptFixture(repoRoot);
  const base = { repoRoot, initiative: "checkout-redesign", sliceId: "slice-001", runId: "run-test", approvalRef: "operator-approved-live-stitch:test-ref" };

  await assert.rejects(
    applyLiveStitchArtifact({ ...base, providerCommand: "fake-stitch", policyAllowsProviderCommand: true }),
    /Missing live Stitch auth\/config/,
  );
  await assert.rejects(
    applyLiveStitchArtifact({ ...base, providerCommand: "fake-stitch --watch", policyAllowsProviderCommand: true, env: { STITCH_API_KEY: "redacted" } }),
    /Forbidden live Stitch provider argument/,
  );
  await assert.rejects(
    applyLiveStitchArtifact({ ...base, providerCommand: "fake-stitch --output=docs/raw", policyAllowsProviderCommand: true, env: { STITCH_API_KEY: "redacted" } }),
    /Forbidden live Stitch provider argument/,
  );
  await assert.rejects(
    planLiveStitchArtifact({ ...base, managedRoot: "docs/initiatives/checkout-redesign/raw" }),
    /Managed live Stitch artifact root must stay under \.pi\/agent\/artifacts\/stitch/,
  );
});

test("timeout maps to failed live artifact result without leaking auth", async () => {
  const repoRoot = await makeTempRepo("live-stitch-timeout-");
  await writePromptFixture(repoRoot);
  const runner: LiveStitchCommandRunner = async () => {
    const error = new Error("timeout after 5ms");
    Object.assign(error, { code: "ETIMEDOUT" });
    throw error;
  };

  const result = await applyLiveStitchArtifact({
    repoRoot,
    initiative: "checkout-redesign",
    sliceId: "slice-001",
    runId: "run-test",
    approvalRef: "operator-approved-live-stitch:test-ref",
    providerCommand: "fake-stitch",
    policyAllowsProviderCommand: true,
    env: { STITCH_API_KEY: "super-secret-token" },
    runner,
  });

  assert.equal(result.artifact.status, "failed");
  assert.match(result.failureMessage ?? "", /timeout after 5ms/);
  assert.doesNotMatch(JSON.stringify(result), /super-secret-token/);
});

test("live artifact schema declares human approval and managed artifact fields", async () => {
  const schema = JSON.parse(await readFile(".pi/agent/state/schemas/live-stitch-artifact.schema.json", "utf8"));
  assert.equal(schema.title, "Live Stitch Artifact");
  assert.equal(schema.properties.version.const, 1);
  assert.equal(schema.properties.mode.const, "live");
  assert.equal(schema.properties.nextAllowedPhase.const, "screen_approval");
  assert.equal(schema.properties.constraints.properties.requiresHumanApproval.const, true);
  assert.ok(schema.required.includes("managedArtifacts"));
});
