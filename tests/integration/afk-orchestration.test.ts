import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const tsxImport = process.env.TSX_IMPORT_PATH ?? join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");

async function writeFixture(cwd: string): Promise<void> {
  const root = join(cwd, "docs", "initiatives", "greenfield-scaffold");
  await mkdir(join(root, "slices"), { recursive: true });
  const issues = [
    { issueId: "issue-001", title: "Approve", type: "HITL", status: "done", dependencies: [], acceptanceCriteria: ["approved"], validationProof: [], domains: ["docs"], filesToModify: ["docs/foundation.md"], allowedPaths: ["docs"], hitlGates: [] },
    { issueId: "issue-002", title: "Frontend", type: "AFK", status: "planned", dependencies: ["issue-001"], acceptanceCriteria: ["frontend ok"], validationProof: ["npm test -- frontend"], domains: ["frontend"], filesToModify: ["apps/web/src/App.tsx"], allowedPaths: ["apps/web"], hitlGates: [] },
    { issueId: "issue-003", title: "Backend", type: "AFK", status: "planned", dependencies: ["issue-001"], acceptanceCriteria: ["backend ok"], validationProof: ["npm test -- backend"], domains: ["backend"], filesToModify: ["services/api/src/server.ts"], allowedPaths: ["services/api"], hitlGates: [] },
  ];
  await writeFile(join(root, "issues.json"), `${JSON.stringify({ version: 1, initiativeId: "greenfield-scaffold", issues }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "slice-plan.json"), "{\"version\":1}\n", "utf8");
  await writeFile(join(root, "pipeline.json"), "{\"version\":1}\n", "utf8");
  for (const issue of issues) {
    await writeFile(join(root, "slices", `${issue.issueId}.summary.json`), `${JSON.stringify({ version: 1, issueId: issue.issueId, summary: { sliceId: issue.issueId, filesToModify: issue.filesToModify, allowedPaths: issue.allowedPaths } }, null, 2)}\n`, "utf8");
  }
}

async function runCli(cwd: string, args: string[]) {
  return execFile("node", ["--import", tsxImport, join(repoRoot, "scripts", "harness-afk-orchestrate.ts"), ...args], { cwd });
}

test("CLI dry-run emits deterministic plan and writes no files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "afk-cli-dry-"));
  await writeFixture(cwd);
  const before = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();

  const { stdout } = await runCli(cwd, ["dry-run", "--initiative", "greenfield-scaffold", "--max-parallel", "2", "--explain", "issue-002", "--json"]);
  const parsed = JSON.parse(stdout);
  const after = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();

  assert.deepEqual(after, before);
  assert.deepEqual(parsed.eligibleIssues.map((issue: { issueId: string }) => issue.issueId).sort(), ["issue-002", "issue-003"]);
  assert.equal(parsed.explainIssue.issueId, "issue-002");
  assert.equal(parsed.parallelDecisions[0].status, "parallel_candidate");
});

test("CLI apply --queue-only writes queue and run artifact while status reports provenance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "afk-cli-apply-"));
  await writeFixture(cwd);

  await runCli(cwd, ["apply", "--queue-only", "--initiative", "greenfield-scaffold", "--run-id", "afk-cli-run", "--json"]);
  const queue = JSON.parse(await readFile(join(cwd, ".pi/agent/state/runtime/queue.json"), "utf8"));
  const status = JSON.parse((await runCli(cwd, ["status", "--initiative", "greenfield-scaffold", "--explain", "issue-003", "--json"])).stdout);

  assert.equal(queue.jobs.length, 2);
  assert.ok(queue.jobs.every((job: { queueJobSource?: { kind?: string } }) => job.queueJobSource?.kind === "issue-materialization"));
  assert.equal(JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/afk-runs/afk-cli-run.json"), "utf8")).runId, "afk-cli-run");
  assert.match(status.explainIssue.reasons.join(" "), /Current queue job status: queued/);
});

test("CLI run requires --run and bounded limits", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "afk-cli-run-"));
  await writeFixture(cwd);

  await assert.rejects(runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--max-steps", "1", "--max-runtime-seconds", "5"]), /requires explicit --run/);
  await assert.rejects(runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--run"]), /requires --max-steps and --max-runtime-seconds/);
});
