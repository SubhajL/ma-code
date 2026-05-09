import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-orchestrate.ts");
const operatorPath = join(repoRoot, "scripts", "harness-operator.ts");
const productIntakeScript = join(repoRoot, "scripts", "harness-product-intake.ts");
const productPipelineScript = join(repoRoot, "scripts", "harness-product-pipeline.ts");

async function makeRepo(prefix: string): Promise<string> {
  const repoPath = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(repoPath, "docs", "initiatives", "greenfield-scaffold"), { recursive: true });
  await mkdir(join(repoPath, "docs", "initiatives", "TEMPLATE"), { recursive: true });
  await writeFile(join(repoPath, "docs", "initiatives", "TEMPLATE", "prd.md"), "# PRD\n", "utf8");
  await writeFile(join(repoPath, "docs", "initiatives", "TEMPLATE", "backlog.md"), "# Backlog\n", "utf8");
  await writeFile(join(repoPath, "docs", "initiatives", "TEMPLATE", "decisions.md"), "# Decisions\n", "utf8");
  await writeFile(
    join(repoPath, "package.json"),
    `${JSON.stringify(
      {
        scripts: {
          "harness:product-intake": `node --import ${tsxImportPath} ${productIntakeScript}`,
          "harness:product-pipeline": `node --import ${tsxImportPath} ${productPipelineScript}`,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(repoPath, "docs", "initiatives", "greenfield-scaffold", "pipeline.json"), JSON.stringify({ version: 1, slices: [] }), "utf8");
  return repoPath;
}

async function snapshotFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(relativeDir: string): Promise<void> {
    const entries = await readdir(join(root, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      const rel = join(relativeDir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) await walk(rel);
      else result.push(rel);
    }
  }
  await walk("");
  return result.sort();
}

async function runCli(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, TSX_IMPORT_PATH: tsxImportPath, HARNESS_TSX_IMPORT: tsxImportPath },
  });
}

async function runOperator(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, operatorPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, TSX_IMPORT_PATH: tsxImportPath, HARNESS_TSX_IMPORT: tsxImportPath },
  });
}

test("harness-orchestrate dry-run emits normalized JSON and writes no files", async () => {
  const cwd = await makeRepo("harness-orchestrate-dry-run-");
  const before = await snapshotFiles(cwd);

  const result = await runCli(cwd, ["dry-run", "--goal", "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance", "--json"]);
  const after = await snapshotFiles(cwd);
  const json = JSON.parse(result.stdout) as { mode: string; selectedPath: string; delegatedCommand: string; status: string; writesFiles: boolean; helperSummary: Record<string, unknown> };

  assert.equal(json.mode, "dry_run");
  assert.equal(json.selectedPath, "product_feature");
  assert.match(json.delegatedCommand, /harness:product-intake/);
  assert.equal(json.status, "ready");
  assert.equal(json.writesFiles, false);
  assert.equal(json.helperSummary.mode, "dry-run");
  assert.deepEqual(after, before);
});

test("ambiguous dry-run emits needs_input and no helper writes", async () => {
  const cwd = await makeRepo("harness-orchestrate-dry-run-ambiguous-");
  const before = await snapshotFiles(cwd);

  const result = await runCli(cwd, ["dry-run", "--goal", "do it", "--json"]);
  const after = await snapshotFiles(cwd);
  const json = JSON.parse(result.stdout) as { selectedPath: string; delegatedCommand: string | null; status: string; blockers: string[] };

  assert.equal(json.selectedPath, "clarification");
  assert.equal(json.delegatedCommand, null);
  assert.equal(json.status, "needs_input");
  assert.ok(json.blockers.length > 0);
  assert.deepEqual(after, before);
});

test("operator wrapper delegates orchestrate dry-run", async () => {
  const cwd = await makeRepo("harness-operator-dry-run-");

  const result = await runOperator(cwd, ["orchestrate", "dry-run", "--goal", "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance", "--json"]);
  const json = JSON.parse(result.stdout) as { selectedPath: string; status: string; delegatedCommand: string };

  assert.equal(json.selectedPath, "product_feature");
  assert.equal(json.status, "ready");
  assert.match(json.delegatedCommand, /harness:product-intake/);
});

test("dry-run rejects mutation flags", async () => {
  const cwd = await makeRepo("harness-orchestrate-dry-run-flags-");
  await assert.rejects(
    runCli(cwd, ["dry-run", "--goal", "Build checkout mini flow", "--apply", "--json"]),
    /--apply is not supported/,
  );
});
