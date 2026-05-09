import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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

async function makeRepo(prefix: string, mergeReady = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "docs/initiatives/checkout/worker-runs"), { recursive: true });
  await mkdir(join(root, "docs/initiatives/checkout/pr-runs"), { recursive: true });
  await mkdir(join(root, "reports/lifecycle"), { recursive: true });
  await mkdir(join(root, "logs/coding"), { recursive: true });
  await writeFile(join(root, "logs/CURRENT.md"), "# Current Harness Logs\n\n## Current coding log\n- `logs/coding/fixture.md`\n", "utf8");
  await writeFile(join(root, "logs/coding/fixture.md"), "RED: failed\nGREEN: pass\nReview Verdict: no_required_fixes\n", "utf8");
  await writeFile(join(root, "docs/initiatives/checkout/worker-runs/worker-123.json"), JSON.stringify({ runId: "worker-123", selectedPath: "worker_job", delegatedCommand: "npm run harness:worker-execute -- run --initiative checkout --json", status: "passed" }, null, 2), "utf8");
  await writeFile(join(root, "docs/initiatives/checkout/pr-runs/pr-123.json"), JSON.stringify({ runId: "pr-123", delegatedCommands: ["npm run harness:pr-lifecycle -- gate --pr 123 --json"], prGate: { finalStatus: "pass", mergeStateStatus: "CLEAN" } }, null, 2), "utf8");
  await writeFile(join(root, "reports/lifecycle/task-123.json"), JSON.stringify({ runId: "fixture", lifecycle: { currentStage: mergeReady ? "merge_ready" : "submitted" } }, null, 2), "utf8");
  await writeFile(
    join(root, "scripts/fake-merge.mjs"),
    `const args = process.argv.slice(2);\nconst mode = args[0];\nconst ready = ${mergeReady ? "true" : "false"};\nif (mode === 'check') {\n  console.log(JSON.stringify({ readiness: { ready, blockers: ready ? [] : ['PR gate must be pass'] }, pr: { number: 123 }, prGate: { finalStatus: ready ? 'pass' : 'fail' } }));\n  process.exit(ready ? 0 : 1);\n}\nif (mode === 'apply') {\n  console.log(JSON.stringify({ status: 'merged', readiness: { ready: true, blockers: [] } }));\n}\n`,
    "utf8",
  );
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { "harness:merge": "node scripts/fake-merge.mjs" } }, null, 2), "utf8");
  return root;
}

async function snapshotFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(rel: string): Promise<void> {
    for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
      const next = join(rel, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) await walk(next);
      else out.push(next);
    }
  }
  await walk("");
  return out.sort();
}

async function runCli(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd, encoding: "utf8", env: { ...process.env, TSX_IMPORT_PATH: tsxImportPath, HARNESS_TSX_IMPORT: tsxImportPath } });
}

async function runOperator(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, operatorPath, ...args], { cwd, encoding: "utf8", env: { ...process.env, TSX_IMPORT_PATH: tsxImportPath, HARNESS_TSX_IMPORT: tsxImportPath } });
}

test("evidence CLI emits normalized JSON and default mode writes no reports", async () => {
  const cwd = await makeRepo("orchestrator-evidence-cli-");
  const before = await snapshotFiles(cwd);

  const result = await runCli(cwd, ["evidence", "--initiative", "checkout", "--run-id", "fixture", "--lifecycle-evidence", "reports/lifecycle/task-123.json", "--json"]);
  const after = await snapshotFiles(cwd);
  const json = JSON.parse(result.stdout) as { mode: string; selectedPath: string; nextSafeAction: string; merge: { attempted: boolean } };

  assert.equal(json.mode, "evidence");
  assert.equal(json.selectedPath, "worker_job");
  assert.match(json.nextSafeAction, /harness:merge check/);
  assert.equal(json.merge.attempted, false);
  assert.deepEqual(after, before);
});

test("evidence CLI writes optional schema-shaped JSON and Markdown reports only when requested", async () => {
  const cwd = await makeRepo("orchestrator-evidence-report-");

  const result = await runCli(cwd, ["evidence", "--initiative", "checkout", "--run-id", "fixture", "--lifecycle-evidence", "reports/lifecycle/task-123.json", "--write-report", "--json"]);
  const json = JSON.parse(result.stdout) as { reports: { json: string; markdown: string } };
  assert.equal(json.reports.json, "reports/orchestration/fixture.json");
  assert.equal(json.reports.markdown, "reports/orchestration/fixture.md");
  const report = JSON.parse(await readFile(join(cwd, json.reports.json), "utf8")) as { version: number; runId: string; mode: string };
  assert.equal(report.version, 1);
  assert.equal(report.runId, "fixture");
  assert.equal(report.mode, "evidence");
  assert.match(await readFile(join(cwd, json.reports.markdown), "utf8"), /Orchestrator Evidence/);
});

test("merge-check and merge-apply delegate through harness:merge and require approval", async () => {
  const cwd = await makeRepo("orchestrator-merge-cli-");

  const check = await runCli(cwd, ["merge-check", "--pr", "123", "--method", "squash", "--lifecycle-evidence", "reports/lifecycle/task-123.json", "--json"]);
  const checkJson = JSON.parse(check.stdout) as { mode: string; merge: { attempted: boolean }; consumedEvidence: { mergeHelper: { checkReady: boolean } } };
  assert.equal(checkJson.mode, "merge_check");
  assert.equal(checkJson.merge.attempted, false);
  assert.equal(checkJson.consumedEvidence.mergeHelper.checkReady, true);

  try {
    await runCli(cwd, ["merge-apply", "--pr", "123", "--method", "squash", "--lifecycle-evidence", "reports/lifecycle/task-123.json", "--json"]);
    assert.fail("missing approval should fail");
  } catch (error) {
    const failure = error as { stdout?: string };
    assert.match(failure.stdout ?? "", /approval-ref/);
  }

  const applied = await runCli(cwd, ["merge-apply", "--pr", "123", "--method", "squash", "--approval-ref", "human-123", "--lifecycle-evidence", "reports/lifecycle/task-123.json", "--json"]);
  const appliedJson = JSON.parse(applied.stdout) as { status: string; approval: { approvalRef: string }; merge: { attempted: boolean } };
  assert.equal(appliedJson.status, "merged");
  assert.equal(appliedJson.approval.approvalRef, "human-123");
  assert.equal(appliedJson.merge.attempted, true);
});

test("failed merge check blocks apply before apply delegation", async () => {
  const cwd = await makeRepo("orchestrator-merge-blocked-", false);

  try {
    await runCli(cwd, ["merge-apply", "--pr", "123", "--method", "squash", "--approval-ref", "human-123", "--lifecycle-evidence", "reports/lifecycle/task-123.json", "--json"]);
    assert.fail("failed check should block apply");
  } catch (error) {
    const failure = error as { stdout?: string };
    const json = JSON.parse(failure.stdout ?? "{}");
    assert.equal(json.status, "blocked");
    assert.match(json.blockers.join("\n"), /PR gate/);
  }
});

test("operator wrapper delegates orchestrator evidence mode", async () => {
  const cwd = await makeRepo("orchestrator-evidence-operator-");

  const result = await runOperator(cwd, ["orchestrate", "evidence", "--initiative", "checkout", "--run-id", "fixture", "--lifecycle-evidence", "reports/lifecycle/task-123.json", "--json"]);
  const json = JSON.parse(result.stdout) as { mode: string; selectedPath: string };

  assert.equal(json.mode, "evidence");
  assert.equal(json.selectedPath, "worker_job");
});
