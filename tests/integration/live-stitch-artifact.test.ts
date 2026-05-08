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
const scriptPath = join(repoRoot, "scripts", "harness-live-stitch-artifact.ts");

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

async function writePromptFixture(repoPath: string): Promise<void> {
  const base = join(repoPath, "docs", "initiatives", "checkout-redesign");
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

async function writeFakeProvider(repoPath: string): Promise<string> {
  const providerPath = join(repoPath, "fake-live-stitch-provider.mjs");
  await writeFile(providerPath, [
    "const promptIndex = process.argv.indexOf('--prompt');",
    "const outputIndex = process.argv.indexOf('--output-dir');",
    "if (promptIndex === -1 || outputIndex === -1) { console.error('missing planned args'); process.exit(2); }",
    "console.log(JSON.stringify({ provider: 'fake-stitch', prompt: process.argv[promptIndex + 1], outputDir: process.argv[outputIndex + 1], screens: [{ id: 'checkout-review' }] }));",
  ].join("\n"), "utf8");
  return providerPath;
}

async function runLiveStitch(repoPath: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], {
    cwd: repoPath,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("harness-live-stitch-artifact dry-run reports planned paths and writes nothing", async () => {
  const repoPath = await makeTempDir("harness-live-stitch-dry-run-");
  await writePromptFixture(repoPath);

  const result = await runLiveStitch(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--json"]);
  const json = JSON.parse(result.stdout) as { artifact: { mode: string; status: string; managedArtifacts: { root: string }; constraints: { liveStitchCalled: boolean; requiresHumanApproval: boolean } }; createdFiles: string[] };

  assert.equal(json.artifact.mode, "live");
  assert.equal(json.artifact.status, "blocked");
  assert.equal(json.artifact.constraints.liveStitchCalled, false);
  assert.equal(json.artifact.constraints.requiresHumanApproval, true);
  assert.match(json.artifact.managedArtifacts.root, /^\.pi\/agent\/artifacts\/stitch\/checkout-redesign\/slice-001\/run-/);
  assert.deepEqual(json.createdFiles, []);
  assert.equal(await exists(join(repoPath, ".pi", "agent", "artifacts", "stitch")), false);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts")), false);
});

test("harness-live-stitch-artifact apply with fake provider writes managed manifest and durable summary only", async () => {
  const repoPath = await makeTempDir("harness-live-stitch-apply-");
  await writePromptFixture(repoPath);
  const fakeProvider = await writeFakeProvider(repoPath);

  const result = await runLiveStitch(repoPath, [
    "--initiative", "checkout-redesign",
    "--slice", "slice-001",
    "--apply",
    "--approval-ref", "operator-approved-live-stitch:test-ref",
    "--provider-command", `${process.execPath} ${fakeProvider}`,
    "--json",
  ], { HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND: "1", STITCH_API_KEY: "redacted-token" });
  const json = JSON.parse(result.stdout) as { artifact: { status: string; approvalRef: string; managedArtifacts: { outputHashes: Array<{ path: string }> }; constraints: { taskPacketsCreated: boolean; queueJobsCreated: boolean } }; createdFiles: string[] };

  assert.equal(json.artifact.status, "generated_live");
  assert.equal(json.artifact.approvalRef, "operator-approved-live-stitch:test-ref");
  assert.equal(json.artifact.constraints.taskPacketsCreated, false);
  assert.equal(json.artifact.constraints.queueJobsCreated, false);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts", "slice-001.live-screen.json")), true);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts", "slice-001.live-screen.md")), true);
  assert.equal(json.artifact.managedArtifacts.outputHashes[0]?.path.includes(".pi/agent/artifacts/stitch/checkout-redesign/slice-001/"), true);
  assert.equal(await exists(join(repoPath, ".pi", "agent", "state", "runtime", "tasks.json")), false);
  assert.equal(await exists(join(repoPath, ".pi", "agent", "state", "runtime", "queue.json")), false);
});

test("harness-live-stitch-artifact blocks missing auth, stale prompt, and forbidden provider args", async () => {
  const repoPath = await makeTempDir("harness-live-stitch-blocks-");
  await writePromptFixture(repoPath);

  await assert.rejects(
    runLiveStitch(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--apply", "--approval-ref", "operator-approved-live-stitch:test-ref", "--provider-command", "fake-stitch"], { HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND: "1" }),
    /Missing live Stitch auth\/config/,
  );
  await assert.rejects(
    runLiveStitch(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--provider-command", "fake-stitch --watch"], { HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND: "1" }),
    /Forbidden live Stitch provider argument/,
  );
  await writeFile(join(repoPath, "docs", "initiatives", "checkout-redesign", "prd.md"), "# stale\n", "utf8");
  await assert.rejects(
    runLiveStitch(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run"]),
    /Stale Stitch prompt source hash for prd/,
  );
});
