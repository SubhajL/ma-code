import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-screen-approval.ts");

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function writeMockScreenArtifact(repoPath: string, name = "Checkout review"): Promise<string> {
  const dir = join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts");
  await mkdir(dir, { recursive: true });
  const text = `${JSON.stringify({
    version: 1,
    initiativeId: "checkout-redesign",
    sliceId: "slice-001",
    artifactId: "mock-screen-slice-001-v1",
    mode: "mock",
    phase: "stitch_generation",
    status: "generated_mock",
    sourcePrompt: {
      promptPath: "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.md",
      promptMetadataPath: "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.json",
      promptHash: "a".repeat(64),
    },
    screens: [{ screenId: "slice-001-primary", name }],
    constraints: { liveStitchCalled: false, taskPacketsCreated: false, queueJobsCreated: false },
    nextAllowedPhase: "screen_approval",
    nextBlockedUntil: "human_artifact_review",
  }, null, 2)}\n`;
  await writeFile(join(dir, "slice-001.mock-screen.json"), text, "utf8");
  return sha256(text);
}

async function runScreenApproval(repoPath: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], {
    cwd: repoPath,
    encoding: "utf8",
  });
}

test("harness-screen-approval status reads missing, pending, and approved states", async () => {
  const repoPath = await makeTempDir("harness-screen-approval-status-");

  const missing = await runScreenApproval(repoPath, ["status", "--initiative", "checkout-redesign", "--slice", "slice-001", "--json"]);
  assert.equal(JSON.parse(missing.stdout).status, "missing");

  const artifactHash = await writeMockScreenArtifact(repoPath);
  const pending = await runScreenApproval(repoPath, ["status", "--initiative", "checkout-redesign", "--slice", "slice-001", "--json"]);
  assert.equal(JSON.parse(pending.stdout).status, "pending");

  await runScreenApproval(repoPath, ["approve", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer", "--note", "Looks aligned.", "--json"]);
  const approved = await runScreenApproval(repoPath, ["status", "--initiative", "checkout-redesign", "--slice", "slice-001", "--json"]);
  const approvedJson = JSON.parse(approved.stdout);
  assert.equal(approvedJson.status, "approved");
  assert.equal(approvedJson.artifactHash, artifactHash);
});

test("harness-screen-approval approve writes only approval sidecar under screen artifacts", async () => {
  const repoPath = await makeTempDir("harness-screen-approval-approve-");
  const artifactHash = await writeMockScreenArtifact(repoPath);

  const result = await runScreenApproval(repoPath, ["approve", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer", "--note", "Looks aligned.", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.approval.decision, "approved");
  assert.equal(json.approval.artifactHash, artifactHash);
  assert.deepEqual(json.createdFiles, ["docs/initiatives/checkout-redesign/screen-artifacts/slice-001.approval.json"]);
  assert.equal(await exists(join(repoPath, ".pi", "agent", "state", "runtime")), false);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts", "slice-001.approval.json")), true);
});

test("harness-screen-approval reject writes rejection sidecar and blocks missing reason", async () => {
  const repoPath = await makeTempDir("harness-screen-approval-reject-");
  await writeMockScreenArtifact(repoPath);

  await assert.rejects(
    runScreenApproval(repoPath, ["reject", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer"]),
    /--reason is required/,
  );

  const result = await runScreenApproval(repoPath, ["reject", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer", "--reason", "Pricing state is missing error copy.", "--json"]);
  const json = JSON.parse(result.stdout);
  assert.equal(json.approval.decision, "rejected");
  assert.equal(json.approval.nextAllowedPhase, null);
  assert.equal(json.approval.blockedReason, "Pricing state is missing error copy.");
});

test("harness-screen-approval refuses stale approval and allows explicit reapproval after rejection", async () => {
  const repoPath = await makeTempDir("harness-screen-approval-reapprove-");
  await writeMockScreenArtifact(repoPath);
  await runScreenApproval(repoPath, ["reject", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer", "--reason", "Needs error copy.", "--json"]);

  await assert.rejects(
    runScreenApproval(repoPath, ["approve", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer", "--note", "Updated copy okay.", "--json"]),
    /Re-approval after rejection requires explicit --reapprove/,
  );

  const reapproved = await runScreenApproval(repoPath, ["approve", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer", "--note", "Updated copy okay.", "--reapprove", "--json"]);
  assert.equal(JSON.parse(reapproved.stdout).approval.history[0].decision, "rejected");

  await writeMockScreenArtifact(repoPath, "Changed checkout review");
  const status = await runScreenApproval(repoPath, ["status", "--initiative", "checkout-redesign", "--slice", "slice-001", "--json"]);
  assert.equal(JSON.parse(status.stdout).staleApproval, true);
  await assert.rejects(
    runScreenApproval(repoPath, ["approve", "--initiative", "checkout-redesign", "--slice", "slice-001", "--by", "product-reviewer", "--note", "changed", "--json"]),
    /Stale screen artifact approval/,
  );
});
