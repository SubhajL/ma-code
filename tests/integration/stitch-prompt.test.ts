import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PRODUCT_SLICE_PHASE_ORDER } from "../../.pi/agent/extensions/product-slice-lifecycle.ts";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-stitch-prompt.ts");

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

async function writeFixtureInitiative(repoPath: string, options: { ui?: boolean } = {}): Promise<void> {
  const base = join(repoPath, "docs", "initiatives", "checkout-redesign");
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
        title: options.ui === false ? "Calculate totals" : "Review checkout totals screen",
        type: "AFK",
        status: "planned",
        currentPhase: "stitch_prompt",
        phaseOrder: PRODUCT_SLICE_PHASE_ORDER,
        phaseEvidence: { stitch_prompt: { status: "missing", artifactPath: null, evidence: [] } },
        dependencies: [],
        blockedReason: null,
        userStories: ["As a shopper, I can review cart totals before paying."],
        targetScreens: options.ui === false ? [] : ["Checkout review"],
        domains: options.ui === false ? ["backend"] : ["frontend"],
        ui: options.ui !== false,
      },
    ],
    policy: {
      intraSliceParallelism: "forbidden",
      unknownTransition: "blocked",
      requiredPhaseOrder: PRODUCT_SLICE_PHASE_ORDER,
    },
  }, null, 2)}\n`, "utf8");
}

async function runStitchPrompt(repoPath: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], {
    cwd: repoPath,
    encoding: "utf8",
  });
}

test("harness-stitch-prompt dry-run prints prompt and planned paths without writing", async () => {
  const repoPath = await makeTempDir("harness-stitch-prompt-dry-run-");
  await writeFixtureInitiative(repoPath);

  const result = await runStitchPrompt(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--json"]);
  const json = JSON.parse(result.stdout) as { mode: string; promptPath: string; metadataPath: string; prompt: string; createdFiles: string[] };

  assert.equal(json.mode, "dry-run");
  assert.equal(json.promptPath, "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.md");
  assert.equal(json.metadataPath, "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.json");
  assert.match(json.prompt, /## Screen states/);
  assert.deepEqual(json.createdFiles, []);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "stitch-prompts")), false);
});

test("harness-stitch-prompt apply writes prompt and metadata artifacts", async () => {
  const repoPath = await makeTempDir("harness-stitch-prompt-apply-");
  await writeFixtureInitiative(repoPath);

  const result = await runStitchPrompt(repoPath, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--apply", "--json"]);
  const json = JSON.parse(result.stdout) as { mode: string; createdFiles: string[]; metadata: { sourceHashes: Record<string, string>; nextBlockedUntil: string } };

  assert.equal(json.mode, "apply");
  assert.deepEqual(json.createdFiles, [
    "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.md",
    "docs/initiatives/checkout-redesign/stitch-prompts/slice-001.prompt.json",
  ]);
  const prompt = await readFile(join(repoPath, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.md"), "utf8");
  const metadata = JSON.parse(await readFile(join(repoPath, "docs", "initiatives", "checkout-redesign", "stitch-prompts", "slice-001.prompt.json"), "utf8"));
  assert.match(prompt, /# Stitch Prompt: checkout-redesign \/ slice-001/);
  assert.equal(metadata.nextBlockedUntil, "human_prompt_review");
  assert.match(metadata.sourceHashes.slicePlan, /^[a-f0-9]{64}$/);
  assert.deepEqual(json.metadata, metadata);
});

test("harness-stitch-prompt rejects malformed slice-plan and non-UI slices", async () => {
  const malformedRepo = await makeTempDir("harness-stitch-prompt-malformed-");
  await writeFixtureInitiative(malformedRepo);
  await writeFile(join(malformedRepo, "docs", "initiatives", "checkout-redesign", "slice-plan.json"), "{not-json\n", "utf8");
  await assert.rejects(
    runStitchPrompt(malformedRepo, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run"]),
    /Invalid product slice plan JSON/,
  );

  const nonUiRepo = await makeTempDir("harness-stitch-prompt-non-ui-");
  await writeFixtureInitiative(nonUiRepo, { ui: false });
  await assert.rejects(
    runStitchPrompt(nonUiRepo, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run"]),
    /Slice is not UI-facing: slice-001/,
  );

  const allowed = await runStitchPrompt(nonUiRepo, ["--initiative", "checkout-redesign", "--slice", "slice-001", "--dry-run", "--allow-non-ui", "--json"]);
  assert.equal(JSON.parse(allowed.stdout).sliceId, "slice-001");
});
