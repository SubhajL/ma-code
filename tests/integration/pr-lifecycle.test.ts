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

async function git(cwd: string, args: string[]): Promise<void> { await execFile("git", args, { cwd }); }

async function fixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "pr-lifecycle-cli-"));
  await mkdir(join(cwd, "docs", "initiatives", "greenfield-scaffold", "worker-runs"), { recursive: true });
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  await writeFile(join(cwd, "README.md"), "fixture\n", "utf8");
  await git(cwd, ["init", "-b", "main"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "fixture"]);
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/change.md"), "change\n", "utf8");
  const worker = {
    version: 1,
    runId: "worker-green",
    initiativeId: "greenfield-scaffold",
    sourceIssueId: "issue-002",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    linkedTaskId: "task-1",
    mode: "run",
    status: "review_ready",
    worktree: { path: cwd, branch: "worker/worker-green-issue-002", baseRef: "main", leaseId: null },
    steps: {
      planning: { status: "passed", evidence: ["planned"] },
      coding: { status: "passed", changedFiles: ["docs/initiatives/greenfield-scaffold/change.md"], redResult: { exitCode: 1 }, greenResult: { exitCode: 0 } },
      validation: { status: "passed", evidence: ["node passed"], results: [{ command: "node", exitCode: 0 }] },
      review: { status: "passed", verdict: "no_required_fixes", evidence: ["Review Verdict: no_required_fixes"], findings: [] }
    },
    retryPolicy: { maxStepRetries: 1, attempts: {} },
    prBoundary: { stopBeforePr: true, allowPrCreate: false, prCreated: false, reason: "stop" },
    stopReason: "stop-before-pr boundary reached",
    nextOperatorAction: "create PR",
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z"
  };
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs/worker-green.json"), `${JSON.stringify(worker, null, 2)}\n`, "utf8");
  await writeFile(join(cwd, ".pi/agent/state/runtime/tasks.json"), `${JSON.stringify({ version: 1, activeTaskId: "task-1", tasks: [{ id: "task-1", title: "Task", owner: "docs_worker", status: "review", taskClass: "implementation", acceptance: ["ok"], evidence: ["Changed files: docs/initiatives/greenfield-scaffold/change.md", "Validation: node passed", "Review Verdict: no_required_fixes"], validation: { decision: "pass" }, notes: [], timestamps: { createdAt: "now", updatedAt: "now" } }] }, null, 2)}\n`, "utf8");
  return cwd;
}

async function runCli(cwd: string, args: string[]) {
  return execFile("node", ["--import", tsxImport, join(repoRoot, "scripts", "harness-pr-lifecycle.ts"), ...args], { cwd });
}

test("CLI dry-run/status boundaries write only when expected", async () => {
  const cwd = await fixture();
  const before = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();
  const dry = JSON.parse((await runCli(cwd, ["dry-run", "--initiative", "greenfield-scaffold", "--worker-run-id", "worker-green", "--run-id", "pr-dry", "--json"])).stdout);
  const after = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();
  assert.deepEqual(after, before);
  assert.equal(dry.lifecycle.createReady, true);
  assert.equal(dry.status, "planned");

  await assert.rejects(runCli(cwd, ["create", "--initiative", "greenfield-scaffold", "--run-id", "pr-create"]), /requires --worker-run-id/);
  await assert.rejects(runCli(cwd, ["merge", "--initiative", "greenfield-scaffold", "--run-id", "pr-create"]), /requires --allow-merge and --approval-ref/);
  await assert.rejects(runCli(cwd, ["merge", "--initiative", "greenfield-scaffold", "--run-id", "pr-create", "--no-stop-before-merge"]), /requires --allow-merge and --approval-ref/);
  await assert.rejects(runCli(cwd, ["create", "--initiative", "greenfield-scaffold", "--worker-run-id", "worker-green", "--run-id", "pr-create", "--close-superseded"]), /requires --close-approval-ref/);
});
