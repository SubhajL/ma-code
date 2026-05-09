import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { runWorkerExecution } from "../../.pi/agent/extensions/worker-execution.ts";
import { readQueueState, type QueueJob } from "../../.pi/agent/extensions/queue-runner.ts";

const execFile = promisify(execFileCallback);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFile("git", args, { cwd });
}

function queueJob(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: "afk-greenfield-scaffold-issue-002",
    goal: "Update docs",
    priority: "medium",
    status: "queued",
    team: "build",
    approvalRequired: false,
    acceptanceCriteria: ["docs updated"],
    taskClass: "implementation",
    workType: "implementation",
    domains: ["docs"],
    allowedPaths: ["docs/initiatives/greenfield-scaffold"],
    assignedRole: "docs_worker",
    queueJobSource: {
      kind: "issue-materialization",
      initiativeId: "greenfield-scaffold",
      issueId: "issue-002",
      runId: "afk-source",
    },
    tddSlice: {
      firstTracerBehavior: "docs updated",
      publicInterface: "docs/initiatives/greenfield-scaffold/notes.md",
      testSurface: ["node -e \"process.exit(0)\""],
      boundaryDependencies: ["none"],
      mockPlan: "none",
      outOfScopeBehaviors: ["merge"],
    },
    ...overrides,
  };
}

async function writeFixture(options: { issueOverrides?: Record<string, unknown>; jobOverrides?: Partial<QueueJob> } = {}): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "worker-execution-"));
  await mkdir(join(cwd, "docs", "initiatives", "greenfield-scaffold", "slices"), { recursive: true });
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  await mkdir(join(cwd, ".pi", "agent", "validation"), { recursive: true });
  await writeFile(join(cwd, "README.md"), "fixture\n", "utf8");
  const issue = {
    issueId: "issue-002",
    title: "Docs issue",
    type: "AFK",
    status: "planned",
    dependencies: [],
    acceptanceCriteria: ["docs updated"],
    validationProof: ["node -e \"process.exit(0)\""],
    domains: ["docs"],
    filesToModify: ["docs/initiatives/greenfield-scaffold/notes.md"],
    allowedPaths: ["docs/initiatives/greenfield-scaffold"],
    hitlGates: [],
    approvalRequired: false,
    ...options.issueOverrides,
  };
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/issues.json"), `${JSON.stringify({ version: 1, initiativeId: "greenfield-scaffold", issues: [issue] }, null, 2)}\n`, "utf8");
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/slice-plan.json"), "{\"version\":1}\n", "utf8");
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/pipeline.json"), "{\"version\":1}\n", "utf8");
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/slices/issue-002.summary.json"), "{\"version\":1}\n", "utf8");
  await writeFile(join(cwd, ".pi/agent/state/runtime/queue.json"), `${JSON.stringify({ version: 1, paused: false, activeJobId: null, jobs: [queueJob(options.jobOverrides)] }, null, 2)}\n`, "utf8");
  await git(cwd, ["init", "-b", "main"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "fixture"]);
  return cwd;
}

test("dry-run produces planned worker steps and writes no worker-run artifact", async () => {
  const cwd = await writeFixture();
  const before = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();

  const result = await runWorkerExecution({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", queueJobId: "afk-greenfield-scaffold-issue-002", now: "2026-05-09T00:00:00.000Z" });
  const after = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();

  assert.deepEqual(after, before);
  assert.equal(result.status, "planned");
  assert.equal(result.steps.planning.status, "passed");
  assert.equal(result.prBoundary.stopBeforePr, true);
  await assert.rejects(readFile(join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs/worker-20260509t000000z.json"), "utf8"), /ENOENT/);
});

test("eligibility rejects HITL, approvalRequired, missing allowed paths, missing acceptance, and missing validation", async () => {
  for (const [name, issueOverrides, jobOverrides, pattern] of [
    ["hitl", { type: "HITL" }, {}, /HITL\/non-AFK/],
    ["approval", { approvalRequired: true }, { approvalRequired: true }, /approvalRequired=true/],
    ["allowed", { allowedPaths: [] }, { allowedPaths: [] }, /without allowed paths/],
    ["acceptance", { acceptanceCriteria: [] }, { acceptanceCriteria: [] }, /without acceptance criteria/],
    ["validation", { validationProof: [] }, {}, /without validation commands/],
  ] as Array<[string, Record<string, unknown>, Partial<QueueJob>, RegExp]>) {
    const cwd = await writeFixture({ issueOverrides, jobOverrides });
    const result = await runWorkerExecution({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", queueJobId: "afk-greenfield-scaffold-issue-002" });
    assert.match(result.stopReason ?? "", pattern, name);
  }
});

test("run creates isolated worktree, records RED/GREEN, validation, review, queue linkage, and stops before PR", async () => {
  const cwd = await writeFixture();
  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-green",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    redCommand: "node -e \"process.exit(1)\"",
    implementationCommand: "node -e \"require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','ok')\"",
    validationCommands: ["node -e \"process.exit(0)\""],
  });

  assert.equal(result.status, "review_ready");
  assert.match(result.worktree.path ?? "", /worker-green-issue-002/);
  assert.equal(result.steps.coding.redResult?.exitCode, 1);
  assert.equal(result.steps.coding.greenResult?.exitCode, 0);
  assert.deepEqual(result.steps.coding.changedFiles, ["docs/initiatives/greenfield-scaffold/notes.md"]);
  assert.equal(result.steps.review.verdict, "no_required_fixes");
  assert.equal(result.stopReason, "stop-before-pr boundary reached");
  assert.equal(result.prBoundary.prCreated, false);
  const artifact = JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs/worker-green.json"), "utf8"));
  assert.equal(artifact.status, "review_ready");
  const queue = await readQueueState(cwd);
  assert.equal(queue.jobs[0].workerExecution?.status, "review_ready");
  assert.equal(queue.jobs[0].workerExecution?.runArtifactPath, "docs/initiatives/greenfield-scaffold/worker-runs/worker-green.json");
});

test("resume refuses terminal worker runs", async () => {
  const cwd = await writeFixture();
  await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-terminal",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    validationCommands: ["node -e \"process.exit(0)\""],
  });

  await assert.rejects(
    runWorkerExecution({ repoRoot: cwd, command: "resume", initiativeId: "greenfield-scaffold", runId: "worker-terminal", baseRef: "main", maxSteps: 4, maxRuntimeSeconds: 10 }),
    /resume requires a non-terminal worker run/,
  );
});

test("failed validation and review changes-required block before completion while preserving worktree", async () => {
  const validationCwd = await writeFixture();
  const failed = await runWorkerExecution({
    repoRoot: validationCwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-validation-fail",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    validationCommands: ["node -e \"process.exit(2)\""],
  });
  assert.equal(failed.status, "failed");
  assert.match(failed.stopReason ?? "", /validation failure/);
  assert.ok(failed.worktree.path);

  const reviewCwd = await writeFixture();
  const review = await runWorkerExecution({
    repoRoot: reviewCwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-review-fail",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    validationCommands: ["node -e \"process.exit(0)\""],
    reviewVerdict: "changes_required",
  });
  assert.equal(review.status, "blocked");
  assert.match(review.stopReason ?? "", /review changes required/);
});

test("max step budget is respected before worktree execution", async () => {
  const cwd = await writeFixture();
  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-budget",
    baseRef: "main",
    maxSteps: 3,
    maxRuntimeSeconds: 10,
  });
  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /max step budget/);
});

test("protected and outside-allowed path mutations are blocked", async () => {
  const protectedCwd = await writeFixture({ issueOverrides: { allowedPaths: [".pi/agent/state/runtime"] }, jobOverrides: { allowedPaths: [".pi/agent/state/runtime"] } });
  const protectedResult = await runWorkerExecution({ repoRoot: protectedCwd, command: "dry-run", initiativeId: "greenfield-scaffold", queueJobId: "afk-greenfield-scaffold-issue-002" });
  assert.match(protectedResult.stopReason ?? "", /protected allowed path/);

  const cwd = await writeFixture();
  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-outside-path",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    implementationCommand: "node -e \"require('fs').writeFileSync('README.md','bad')\"",
    validationCommands: ["node -e \"process.exit(0)\""],
  });
  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /outside allowed paths/);
});
