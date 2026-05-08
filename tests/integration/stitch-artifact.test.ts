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
const scriptPath = join(repoRoot, "scripts", "harness-stitch-artifact.ts");

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
  await writeFile(join(promptDir, "slice-001.prompt.md"), [
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
  ].join("\n"), "utf8");
  await writeFile(join(promptDir, "slice-001.prompt.json"), `${JSON.stringify({
    version: 1,
    initiativeId: "checkout-redesign",
    sliceId: "slice-001",
    phase: "stitch_prompt",
    status: "draft",
    promptPath: "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.md",
    promptHash: sha256([
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
    ].join("\n")),
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

async function runStitchArtifact(repoPath: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], {
    cwd: repoPath,
    encoding: "utf8",
  });
}

test("harness-stitch-artifact dry-run prints artifact preview and writes nothing", async () => {
  const repoPath = await makeTempDir("harness-stitch-artifact-dry-run-");
  await writePromptFixture(repoPath);

  const result = await runStitchArtifact(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--json"]);
  const json = JSON.parse(result.stdout) as { mode: string; jsonPath: string; markdownPath: string; createdFiles: string[]; artifact: { nextAllowedPhase: string; constraints: { liveStitchCalled: boolean } } };

  assert.equal(json.mode, "dry-run");
  assert.equal(json.jsonPath, "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.json");
  assert.equal(json.markdownPath, "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.md");
  assert.equal(json.artifact.nextAllowedPhase, "screen_approval");
  assert.equal(json.artifact.constraints.liveStitchCalled, false);
  assert.deepEqual(json.createdFiles, []);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts")), false);
});

test("harness-stitch-artifact apply writes mock JSON and Markdown artifacts", async () => {
  const repoPath = await makeTempDir("harness-stitch-artifact-apply-");
  await writePromptFixture(repoPath);

  const result = await runStitchArtifact(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--apply", "--json"]);
  const json = JSON.parse(result.stdout) as { mode: string; createdFiles: string[]; artifact: { artifactId: string; sourcePrompt: { promptHash: string } } };

  assert.equal(json.mode, "apply");
  assert.deepEqual(json.createdFiles, [
    "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.json",
    "docs/initiatives/checkout-redesign/screen-artifacts/slice-001.mock-screen.md",
  ]);
  const artifact = JSON.parse(await readFile(join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts", "slice-001.mock-screen.json"), "utf8"));
  const markdown = await readFile(join(repoPath, "docs", "initiatives", "checkout-redesign", "screen-artifacts", "slice-001.mock-screen.md"), "utf8");
  assert.equal(artifact.artifactId, "mock-screen-slice-001-v1");
  assert.equal(artifact.sourcePrompt.promptHash, json.artifact.sourcePrompt.promptHash);
  assert.match(markdown, /Next allowed phase: screen_approval/);
});

test("harness-stitch-artifact blocks stale hashes and does not expose ignore-hash", async () => {
  const repoPath = await makeTempDir("harness-stitch-artifact-stale-");
  await writePromptFixture(repoPath);
  await writeFile(join(repoPath, "docs", "initiatives", "checkout-redesign", "backlog.md"), "# Changed Backlog\n", "utf8");

  await assert.rejects(
    runStitchArtifact(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run"]),
    /Stale Stitch prompt source hash for backlog/,
  );
  await assert.rejects(
    runStitchArtifact(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--ignore-hash"]),
    /Unknown argument: --ignore-hash/,
  );
});
