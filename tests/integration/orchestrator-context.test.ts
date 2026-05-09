import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rootRepoForDeps = process.env.HARNESS_SOURCE_ROOT ?? "/Users/subhajlimanond/dev/ma-code";
const rootRequire = createRequire(join(rootRepoForDeps, "package.json"));
const tsxImport = process.env.TSX_IMPORT_PATH ?? process.env.HARNESS_TSX_IMPORT ?? rootRequire.resolve("tsx/dist/loader.mjs");

async function runOrchestrate(args: string[]) {
  return execFile("node", ["--import", tsxImport, "scripts/harness-orchestrate.ts", ...args], { cwd: repoRoot, env: { ...process.env, TSX_IMPORT_PATH: tsxImport, HARNESS_TSX_IMPORT: tsxImport }, maxBuffer: 1024 * 1024 });
}

test("context command reports current harness repo as non-greenfield", async () => {
  const { stdout } = await runOrchestrate(["context", "--initiative", "greenfield-scaffold", "--goal", "continue greenfield scaffold AFK issues", "--json"]);
  const parsed = JSON.parse(stdout) as {
    repoContext: string;
    initiativeMaturity: string;
    greenfieldEligible: boolean;
    blockedModes: string[];
    safeNextModes: string[];
    reasoning: string[];
  };

  assert.equal(parsed.repoContext, "existing_harness_repo");
  assert.equal(parsed.initiativeMaturity, "active_existing_initiative");
  assert.equal(parsed.greenfieldEligible, false);
  assert.ok(parsed.blockedModes.includes("greenfield_assumption"));
  assert.ok(parsed.safeNextModes.includes("afk_queue"));
  assert.ok(parsed.reasoning.some((line) => line.includes("label-only")));
});

test("context command is read-only", async () => {
  const before = await topLevelSnapshot();
  await runOrchestrate(["context", "--initiative", "greenfield-scaffold", "--json"]);
  const after = await topLevelSnapshot();
  assert.deepEqual(after, before);
});

test("operator delegates orchestrate context", async () => {
  const { stdout } = await execFile("node", ["--import", tsxImport, "scripts/harness-operator.ts", "orchestrate", "context", "--initiative", "greenfield-scaffold", "--json"], { cwd: repoRoot, env: { ...process.env, TSX_IMPORT_PATH: tsxImport, HARNESS_TSX_IMPORT: tsxImport }, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout) as { greenfieldEligible: boolean; repoContext: string };
  assert.equal(parsed.repoContext, "existing_harness_repo");
  assert.equal(parsed.greenfieldEligible, false);
});

async function topLevelSnapshot(): Promise<string[]> {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git") continue;
    const s = await stat(resolve(repoRoot, entry.name));
    out.push(`${entry.name}:${entry.isDirectory() ? "dir" : "file"}:${s.mtimeMs}`);
  }
  return out;
}
