import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-slice-dependencies.ts");

async function makeTempRepo(prefix = "slice-dependencies-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeSummary(root: string, relPath: string, sliceId: string, pathStem: string): Promise<void> {
  await mkdir(join(root, dirname(relPath)), { recursive: true });
  await writeFile(join(root, relPath), `${JSON.stringify({
    sliceId,
    filesToModify: [`app/${pathStem}/feature.ts`],
    allowedPaths: [`app/${pathStem}`],
    contracts: [{ path: `docs/contracts/${pathStem}.contract.json`, hash: `${pathStem}-hash` }],
    schemaPaths: [`schemas/${pathStem}.json`],
    migrationPaths: [`migrations/${pathStem}.sql`],
    configPaths: [`config/${pathStem}.json`],
    testPaths: [`tests/${pathStem}.test.ts`],
    fixturePaths: [`tests/fixtures/${pathStem}.json`],
  }, null, 2)}\n`, "utf8");
}

async function runCli(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd, encoding: "utf8" });
}

test("harness-slice-dependencies returns JSON decision for valid disjoint artifact set", async () => {
  const tempRoot = await makeTempRepo("slice-dependencies-valid-");
  await writeSummary(tempRoot, "artifacts/slice-001.json", "slice-001", "one");
  await writeSummary(tempRoot, "artifacts/slice-002.json", "slice-002", "two");

  const result = await runCli(tempRoot, ["--check", "artifacts/slice-001.json", "artifacts/slice-002.json", "--json"]);
  const decision = JSON.parse(result.stdout);

  assert.equal(decision.parallelAllowed, true);
  assert.equal(decision.decision, "allowed");
  assert.deepEqual(decision.sliceIds, ["slice-001", "slice-002"]);
  assert.equal(decision.recommendedExecution, "parallel_candidate");
  assert.match(result.stderr, /^$/);
  await assert.rejects(readFile(join(tempRoot, ".pi", "agent", "state", "runtime", "queue.json")), /ENOENT/);
});

test("harness-slice-dependencies blocks missing artifact path", async () => {
  const tempRoot = await makeTempRepo("slice-dependencies-missing-");
  await writeSummary(tempRoot, "artifacts/slice-001.json", "slice-001", "one");

  const result = await runCli(tempRoot, ["--check", "artifacts/slice-001.json", "artifacts/missing.json", "--json"]);
  const decision = JSON.parse(result.stdout);

  assert.equal(decision.parallelAllowed, false);
  assert.ok(decision.blockers.some((blocker: any) => blocker.type === "missing_proof" && blocker.paths.includes("artifacts/missing.json")));
});

test("harness-slice-dependencies blocks malformed artifact JSON", async () => {
  const tempRoot = await makeTempRepo("slice-dependencies-malformed-");
  await writeSummary(tempRoot, "artifacts/slice-001.json", "slice-001", "one");
  await mkdir(join(tempRoot, "artifacts"), { recursive: true });
  await writeFile(join(tempRoot, "artifacts/bad.json"), "{ not-json\n", "utf8");

  const result = await runCli(tempRoot, ["--check", "artifacts/slice-001.json", "artifacts/bad.json", "--json"]);
  const decision = JSON.parse(result.stdout);

  assert.equal(decision.parallelAllowed, false);
  assert.ok(decision.blockers.some((blocker: any) => blocker.type === "missing_proof" && /Malformed slice artifact/.test(blocker.reason)));
});
