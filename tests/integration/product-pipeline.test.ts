import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-product-pipeline.ts");

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function makePipelineRepo(prefix: string, options: { hitl?: boolean; allowParallel?: boolean } = {}): Promise<string> {
  const cwd = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(join(tmpdir(), prefix)));
  const initiative = join(cwd, "docs", "initiatives", "checkout-redesign");
  await mkdir(initiative, { recursive: true });
  const gate = options.hitl ? { type: "screen_approval", status: "waiting_for_human", summary: "Approve mock screen" } : null;
  await writeFile(join(initiative, "pipeline.json"), `${JSON.stringify({
    version: 1,
    initiativeId: "checkout-redesign",
    maxParallelSlices: 2,
    slices: [
      { sliceId: "slice-001", title: "Checkout review", status: "ready", currentPhase: options.hitl ? "screen_approval" : "fe_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation", "fe_validation", "be_implementation", "be_validation", "quality"], artifacts: {}, hitlGate: gate, blockers: [] },
      { sliceId: "slice-002", title: "Checkout confirmation", status: "ready", currentPhase: "fe_implementation", phaseOrder: ["stitch_prompt", "stitch_generation", "screen_approval", "slice_contract", "fe_implementation", "fe_validation", "be_implementation", "be_validation", "quality"], artifacts: {}, hitlGate: null, blockers: [] },
    ],
    parallelDecisions: options.allowParallel ? [{ sliceIds: ["slice-001", "slice-002"], parallelAllowed: true, blockers: [] }] : [],
  }, null, 2)}\n`, "utf8");
  return cwd;
}

async function runPipeline(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd, encoding: "utf8" });
}

test("harness-product-pipeline dry-run prints DAG/gates/parallel decisions without writing files", async () => {
  const cwd = await makePipelineRepo("product-pipeline-dry-run-");

  const result = await runPipeline(cwd, ["dry-run", "--initiative", "checkout-redesign", "--json", "--max-parallel", "2"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "dry_run");
  assert.equal(json.status, "planned");
  assert.equal(json.sliceDag[0].edges[0].from, "stitch_prompt");
  assert.equal(json.parallelDecisions[0].parallelAllowed, false);
  assert.equal(await exists(join(cwd, "docs", "initiatives", "checkout-redesign", "pipeline-runs")), false);
});

test("harness-product-pipeline apply refuses dirty repo state outside initiative artifacts", async () => {
  const cwd = await makePipelineRepo("product-pipeline-dirty-");
  await execFile("git", ["init", "-b", "main"], { cwd, encoding: "utf8" });
  await execFile("git", ["config", "user.name", "Pi Harness Tests"], { cwd, encoding: "utf8" });
  await execFile("git", ["config", "user.email", "pi-harness-tests@example.com"], { cwd, encoding: "utf8" });
  await writeFile(join(cwd, "README.md"), "dirty\n", "utf8");

  await assert.rejects(
    runPipeline(cwd, ["apply", "--initiative", "checkout-redesign", "--json"]),
    /Refusing apply with dirty repo state outside docs\/initiatives/,
  );
});

test("harness-product-pipeline apply stops at HITL gate and writes one run artifact only", async () => {
  const cwd = await makePipelineRepo("product-pipeline-hitl-", { hitl: true });

  const result = await runPipeline(cwd, ["apply", "--initiative", "checkout-redesign", "--json", "--max-parallel", "2"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.status, "waiting_for_human");
  assert.equal(json.materializedWork.queueJobIds.length, 0);
  const runDir = join(cwd, "docs", "initiatives", "checkout-redesign", "pipeline-runs");
  assert.equal((await readdir(runDir)).length, 1);
  assert.equal(await exists(join(cwd, ".pi", "agent", "state", "runtime", "queue.json")), false);
});

test("harness-product-pipeline apply materializes independent slices only with explicit proof", async () => {
  const cwd = await makePipelineRepo("product-pipeline-apply-", { allowParallel: true });

  const result = await runPipeline(cwd, ["apply", "--initiative", "checkout-redesign", "--json", "--max-parallel", "2"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.status, "materialized");
  assert.deepEqual(json.materializedWork.queueJobIds, ["preview:checkout-redesign:slice-001:fe_implementation", "preview:checkout-redesign:slice-002:fe_implementation"]);
});

test("harness-product-pipeline status reports latest run and next operator action", async () => {
  const cwd = await makePipelineRepo("product-pipeline-status-");
  await runPipeline(cwd, ["apply", "--initiative", "checkout-redesign", "--json"]);

  const result = await runPipeline(cwd, ["status", "--initiative", "checkout-redesign", "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.initiativeId, "checkout-redesign");
  assert.match(json.nextOperatorAction, /Review materialized preview work|Resolve blockers|Approve HITL gate/);
});

test("harness operator delegates product-pipeline subcommand", async () => {
  const cwd = await makePipelineRepo("product-pipeline-operator-", { allowParallel: true });
  const operatorPath = join(repoRoot, "scripts", "harness-operator.ts");

  const result = await execFile(process.execPath, ["--import", tsxImportPath, operatorPath, "product-pipeline", "dry-run", "--initiative", "checkout-redesign", "--json"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARNESS_TSX_IMPORT: tsxImportPath },
  });
  const json = JSON.parse(result.stdout);

  assert.equal(json.initiativeId, "checkout-redesign");
  assert.equal(json.mode, "dry_run");
});
