import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

async function makeRepo(prefix: string): Promise<string> {
  const repoPath = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(repoPath, "docs", "initiatives", "greenfield-scaffold"), { recursive: true });
  await writeFile(
    join(repoPath, "package.json"),
    `${JSON.stringify(
      {
        scripts: {
          "harness:operator": "node --import tsx scripts/harness-operator.ts",
          "harness:product-intake": "node --import tsx scripts/harness-product-intake.ts",
          "harness:product-pipeline": "node --import tsx scripts/harness-product-pipeline.ts",
          "harness:stitch-prompt": "node --import tsx scripts/harness-stitch-prompt.ts",
          "harness:merge": "node --import tsx scripts/harness-merge.ts",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(repoPath, "docs", "initiatives", "greenfield-scaffold", "pipeline.json"), "{}\n", "utf8");
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

test("harness-orchestrate classify emits valid JSON and writes no files", async () => {
  const cwd = await makeRepo("harness-orchestrate-readonly-");
  const before = await snapshotFiles(cwd);

  const result = await runCli(cwd, ["classify", "--goal", "Build checkout mini flow", "--json"]);
  const after = await snapshotFiles(cwd);
  const json = JSON.parse(result.stdout) as { selectedPath: string; nextDryRunCommand: string; inspected: { packageScripts: string[] } };

  assert.equal(json.selectedPath, "product_feature");
  assert.match(json.nextDryRunCommand, /^npm run harness:product-intake -- /);
  assert.ok(json.inspected.packageScripts.includes("harness:product-intake"));
  assert.deepEqual(after, before);
});

test("ambiguous CLI requests return clarification and no command", async () => {
  const cwd = await makeRepo("harness-orchestrate-clarify-");

  const result = await runCli(cwd, ["classify", "--goal", "do it", "--json"]);
  const json = JSON.parse(result.stdout) as { selectedPath: string; nextDryRunCommand: string | null; blockedReasons: string[] };

  assert.equal(json.selectedPath, "clarification");
  assert.equal(json.nextDryRunCommand, null);
  assert.ok(json.blockedReasons.length > 0);
});

test("operator wrapper delegates orchestrate classify", async () => {
  const result = await runOperator(repoRoot, ["orchestrate", "classify", "--goal", "Build checkout mini flow", "--json"]);
  const json = JSON.parse(result.stdout) as { selectedPath: string; nextDryRunCommand: string };

  assert.equal(json.selectedPath, "product_feature");
  assert.match(json.nextDryRunCommand, /harness:product-intake/);
});

test("generated nextDryRunCommand references an existing package script", async () => {
  const cwd = await makeRepo("harness-orchestrate-script-wire-");
  const result = await runCli(cwd, ["classify", "--goal", "Continue greenfield scaffold pipeline", "--json"]);
  const json = JSON.parse(result.stdout) as { selectedPath: string; nextDryRunCommand: string; inspected: { packageScripts: string[] } };
  const packageJson = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
  const scriptName = json.nextDryRunCommand.match(/^npm run ([^\s]+)/)?.[1];

  assert.equal(json.selectedPath, "product_pipeline");
  assert.ok(scriptName, "expected npm run script in nextDryRunCommand");
  assert.ok(packageJson.scripts[scriptName as string], `${scriptName} should exist in package.json`);
});
