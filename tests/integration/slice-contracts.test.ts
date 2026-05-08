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
const scriptPath = join(repoRoot, "scripts", "harness-slice-contract.ts");

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

async function writeFixture(repoPath: string, options: { malformedSlicePlan?: boolean; rejected?: boolean; stale?: boolean } = {}): Promise<void> {
  const initiativeDir = join(repoPath, "docs", "initiatives", "checkout-redesign");
  const artifactDir = join(initiativeDir, "screen-artifacts");
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(initiativeDir, "prd.md"), "# PRD\n\n## Out Of Scope\n- Native mobile app\n", "utf8");
  await writeFile(join(initiativeDir, "backlog.md"), "# Backlog\n\n## Slice List\n- slice-001 checkout review\n", "utf8");
  await writeFile(
    join(initiativeDir, "slice-plan.json"),
    options.malformedSlicePlan ? "{not json" : `${JSON.stringify({ version: 1, initiativeId: "checkout-redesign", slices: [{ sliceId: "slice-001", currentPhase: "slice_contract" }] }, null, 2)}\n`,
    "utf8",
  );
  const artifactText = `${JSON.stringify({
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
    screens: [{ screenId: "slice-001-primary", name: "Checkout review", states: ["default", "loading", "empty", "error"], dataNeeds: ["cartItems"], userActions: ["confirmOrder"], mockOnly: true }],
    constraints: { liveStitchCalled: false, taskPacketsCreated: false, queueJobsCreated: false },
    nextAllowedPhase: "screen_approval",
    nextBlockedUntil: "human_artifact_review",
  }, null, 2)}\n`;
  await writeFile(join(artifactDir, "slice-001.mock-screen.json"), artifactText, "utf8");
  const artifactHash = sha256(artifactText);
  await writeFile(
    join(artifactDir, "slice-001.approval.json"),
    `${JSON.stringify({
      version: 1,
      initiativeId: "checkout-redesign",
      sliceId: "slice-001",
      artifactPath: "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.json",
      artifactHash: options.stale ? "b".repeat(64) : artifactHash,
      decision: options.rejected ? "rejected" : "approved",
      decidedBy: "product-reviewer",
      decidedAt: "2026-05-08T00:00:00.000Z",
      approvalRef: `screen-approval:checkout-redesign:slice-001:${artifactHash}`,
      notes: ["Approved."],
      requiredBefore: "fe_implementation",
      nextAllowedPhase: options.rejected ? null : "fe_implementation",
      blockedReason: options.rejected ? "Needs updates." : null,
    }, null, 2)}\n`,
    "utf8",
  );
}

async function runSliceContract(repoPath: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd: repoPath, encoding: "utf8" });
}

test("harness-slice-contract dry-run prints preview without writing artifacts", async () => {
  const repoPath = await makeTempDir("harness-slice-contract-dry-run-");
  await writeFixture(repoPath);

  const result = await runSliceContract(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "dry-run");
  assert.deepEqual(json.createdFiles, []);
  assert.equal(json.contract.uiStateContract[0].screenId, "slice-001-primary");
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "contracts")), false);
});

test("harness-slice-contract apply writes only JSON and Markdown contract artifacts", async () => {
  const repoPath = await makeTempDir("harness-slice-contract-apply-");
  await writeFixture(repoPath);

  const result = await runSliceContract(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--apply", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "apply");
  assert.deepEqual(json.createdFiles, [
    "docs/initiatives/checkout-redesign/contracts/slice-001.contract.json",
    "docs/initiatives/checkout-redesign/contracts/slice-001.contract.md",
  ]);
  assert.equal(await exists(join(repoPath, json.createdFiles[0])), true);
  assert.equal(await exists(join(repoPath, json.createdFiles[1])), true);
  assert.equal(await exists(join(repoPath, ".pi", "agent", "state", "runtime")), false);
  const saved = JSON.parse(await readFile(join(repoPath, json.createdFiles[0]), "utf8"));
  assert.equal(saved.nextAllowedPhase, "fe_implementation");
});

test("harness-slice-contract fails clearly for malformed source docs and stale approvals", async () => {
  const malformedRepo = await makeTempDir("harness-slice-contract-malformed-");
  await writeFixture(malformedRepo, { malformedSlicePlan: true });
  await assert.rejects(
    runSliceContract(malformedRepo, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run"]),
    /Invalid slice plan JSON/,
  );

  const staleRepo = await makeTempDir("harness-slice-contract-stale-");
  await writeFixture(staleRepo, { stale: true });
  await assert.rejects(
    runSliceContract(staleRepo, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run"]),
    /Stale screen artifact approval/,
  );
});
