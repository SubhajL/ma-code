import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const tsxImport = process.env.TSX_IMPORT_PATH ?? join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");

async function writeFixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "queue-reconcile-"));
  await mkdir(join(cwd, ".pi/agent/state/runtime"), { recursive: true });
  await writeFile(join(cwd, ".pi/agent/state/runtime/queue.json"), `${JSON.stringify({
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "afk-greenfield-scaffold-issue-002",
        goal: "stale greenfield job",
        priority: "medium",
        status: "blocked",
        team: "build",
        notes: ["old blocker"],
        queueJobSource: { kind: "issue-materialization", initiativeId: "greenfield-scaffold", issueId: "issue-002" },
      },
    ],
  }, null, 2)}\n`, "utf8");
  return cwd;
}

test("harness queue reconcile supersedes a blocked stale job after evidence passes", async () => {
  const cwd = await writeFixture();
  const result = await execFile(process.execPath, [
    "--import", tsxImport,
    join(repoRoot, "scripts/harness-queue-reconcile.ts"),
    "supersede-blocked",
    "--cwd", cwd,
    "--job-id", "afk-greenfield-scaffold-issue-002",
    "--approval-ref", "test-approval",
    "--reason", "current scaffold validation supersedes stale blocked queue job",
    "--evidence-command", "node -e \"process.exit(0)\"",
    "--json",
  ], { cwd });

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.jobId, "afk-greenfield-scaffold-issue-002");
  assert.equal(payload.previousStatus, "blocked");
  assert.equal(payload.status, "done");

  const queue = JSON.parse(await readFile(join(cwd, ".pi/agent/state/runtime/queue.json"), "utf8"));
  assert.equal(queue.jobs[0].status, "done");
  assert.match(queue.jobs[0].notes.at(-1), /Reconciled stale blocked job/);
});

test("harness queue reconcile refuses reconciliation when evidence fails", async () => {
  const cwd = await writeFixture();
  await assert.rejects(execFile(process.execPath, [
    "--import", tsxImport,
    join(repoRoot, "scripts/harness-queue-reconcile.ts"),
    "supersede-blocked",
    "--cwd", cwd,
    "--job-id", "afk-greenfield-scaffold-issue-002",
    "--approval-ref", "test-approval",
    "--reason", "should not reconcile without proof",
    "--evidence-command", "node -e \"process.exit(7)\"",
  ], { cwd }), /evidence command failed/);

  const queue = JSON.parse(await readFile(join(cwd, ".pi/agent/state/runtime/queue.json"), "utf8"));
  assert.equal(queue.jobs[0].status, "blocked");
});
