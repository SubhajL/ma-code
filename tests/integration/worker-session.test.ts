import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  releaseHarnessWorkerSession,
  renderHarnessWorkerSession,
  startHarnessWorkerSession,
  statusHarnessWorkerSession,
} from "../../scripts/harness-worker-session.ts";
import { readExecutionLeaseState } from "../../.pi/agent/extensions/execution-leases.ts";
import { makeTempRepo } from "../extension-units/test-utils.ts";

const execFile = promisify(execFileCallback);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFile("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.stdout.trim();
}

async function initGitRepo(prefix: string): Promise<string> {
  const cwd = await makeTempRepo(prefix);
  await runGit(cwd, ["init", "-b", "main"]);
  await runGit(cwd, ["config", "user.name", "Pi Harness Tests"]);
  await runGit(cwd, ["config", "user.email", "pi-harness-tests@example.com"]);
  await writeFile(join(cwd, "README.md"), "# temp repo\n", "utf8");
  await runGit(cwd, ["add", "README.md"]);
  await runGit(cwd, ["commit", "-m", "initial commit"]);
  return cwd;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("worker-session start creates a bounded worktree and records a worker-lane lease", async () => {
  const repoRoot = await initGitRepo("worker-session-start-");

  const started = await startHarnessWorkerSession({
    repoRoot,
    id: "HARNESS-064",
    slug: "worker lane",
    owner: "assistant",
    baseRef: "main",
  });
  const rendered = renderHarnessWorkerSession(started);
  const leases = await readExecutionLeaseState(repoRoot);
  const lease = leases.leases.find((entry) => entry.id === started.leaseId);

  assert.equal(started.action, "started");
  assert.equal(started.branchName, "worker/harness-064-worker-lane");
  assert.ok(await pathExists(started.worktreePath));
  assert.equal(await runGit(started.worktreePath, ["branch", "--show-current"]), started.branchName);
  assert.equal(lease?.scope, "worker_lane:harness-064");
  assert.equal(lease?.owner, "assistant");
  assert.equal(lease?.metadata?.leaseType, "worker_lane");
  assert.equal(lease?.metadata?.scopeKey, "harness-064");
  assert.equal(lease?.metadata?.worktreePath, started.worktreePath);
  assert.equal(lease?.metadata?.branchName, started.branchName);
  assert.match(rendered, /Harness Worker Session Started/);
  assert.match(rendered, /worker\/harness-064-worker-lane/);
});

test("worker-session status reports the worker-lane lease and worktree cleanliness", async () => {
  const repoRoot = await initGitRepo("worker-session-status-");
  const started = await startHarnessWorkerSession({ repoRoot, id: "HARNESS-065", slug: "status lane", owner: "assistant", baseRef: "main" });

  const status = await statusHarnessWorkerSession({ repoRoot, scopeKey: "harness-065" });
  const rendered = renderHarnessWorkerSession(status);

  assert.equal(status.action, "status");
  assert.equal(status.lease?.id, started.leaseId);
  assert.equal(status.worktree?.path, started.worktreePath);
  assert.equal(status.worktree?.branch, started.branchName);
  assert.equal(status.worktree?.clean, true);
  assert.match(rendered, /Harness Worker Session Status/);
  assert.match(rendered, /clean/);
});

test("worker-session release clears the lease and preserves the worktree by default", async () => {
  const repoRoot = await initGitRepo("worker-session-release-");
  const started = await startHarnessWorkerSession({ repoRoot, id: "HARNESS-066", slug: "release lane", owner: "assistant", baseRef: "main" });

  const released = await releaseHarnessWorkerSession({ repoRoot, scopeKey: "harness-066" });
  const leases = await readExecutionLeaseState(repoRoot);

  assert.equal(released.action, "released");
  assert.equal(released.released, true);
  assert.equal(released.cleanup?.removed, false);
  assert.ok(await pathExists(started.worktreePath));
  assert.equal(leases.leases.some((lease) => lease.id === started.leaseId), false);
});

test("worker-session release --cleanup removes a clean worktree", async () => {
  const repoRoot = await initGitRepo("worker-session-cleanup-");
  const started = await startHarnessWorkerSession({ repoRoot, id: "HARNESS-067", slug: "cleanup lane", owner: "assistant", baseRef: "main" });

  const released = await releaseHarnessWorkerSession({ repoRoot, scopeKey: "harness-067", cleanup: true });

  assert.equal(released.released, true);
  assert.equal(released.cleanup?.removed, true);
  assert.equal(await pathExists(started.worktreePath), false);
});

test("worker-session release --cleanup fails safely on a dirty worktree and leaves lease/worktree intact", async () => {
  const repoRoot = await initGitRepo("worker-session-dirty-");
  const started = await startHarnessWorkerSession({ repoRoot, id: "HARNESS-068", slug: "dirty lane", owner: "assistant", baseRef: "main" });
  await writeFile(join(started.worktreePath, "draft.txt"), "dirty lane\n", "utf8");

  await assert.rejects(
    releaseHarnessWorkerSession({ repoRoot, scopeKey: "harness-068", cleanup: true }),
    /dirty worktree/i,
  );
  const leases = await readExecutionLeaseState(repoRoot);
  const worktreeStat = await stat(started.worktreePath);

  assert.equal(worktreeStat.isDirectory(), true);
  assert.equal(leases.leases.some((lease) => lease.id === started.leaseId), true);
});
