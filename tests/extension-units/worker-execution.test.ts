import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { runWorkerExecution } from "../../.pi/agent/extensions/worker-execution.ts";
import { readQueueState, type QueueJob } from "../../.pi/agent/extensions/queue-runner.ts";
import { readTaskState as readTaskStateLib } from "../../.pi/agent/extensions/till-done.ts";

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

async function writeFixture(options: { issueOverrides?: Record<string, unknown>; jobOverrides?: Partial<QueueJob>; activeJobId?: string | null; packageJson?: Record<string, unknown> | null; checkoutBranch?: string | null } = {}): Promise<string> {
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
  if (options.packageJson) await writeFile(join(cwd, "package.json"), `${JSON.stringify(options.packageJson, null, 2)}\n`, "utf8");
  await writeFile(join(cwd, ".pi/agent/state/runtime/queue.json"), `${JSON.stringify({ version: 1, paused: false, activeJobId: options.activeJobId ?? null, jobs: [queueJob(options.jobOverrides)] }, null, 2)}\n`, "utf8");
  await git(cwd, ["init", "-b", "main"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "fixture"]);
  if (options.checkoutBranch !== null) await git(cwd, ["checkout", "-b", options.checkoutBranch ?? "task/fixture-worker"]);
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


test("run refuses protected main branch before writing worker artifacts", async () => {
  const cwd = await writeFixture({ checkoutBranch: null });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });

  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /refuses protected branch main/);
  await assert.rejects(readFile(join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs", `${result.runId}.json`), "utf8"), /ENOENT/);
});

test("run refuses dirty source worktree before creating worker worktree", async () => {
  const cwd = await writeFixture();
  await writeFile(join(cwd, "README.md"), "fixture dirty\n", "utf8");

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });

  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /refuses dirty or conflicted source worktree/);
  await assert.rejects(readFile(join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs", `${result.runId}.json`), "utf8"), /ENOENT/);
});

test("run refuses stale source branch before worker mutation", async () => {
  const cwd = await writeFixture({ checkoutBranch: null });
  const remote = await mkdtemp(join(tmpdir(), "worker-execution-remote-"));
  await git(remote, ["init", "--bare"]);
  await git(cwd, ["remote", "add", "origin", remote]);
  await git(cwd, ["push", "-u", "origin", "main"]);
  await git(cwd, ["checkout", "-b", "task/stale-worker"]);
  await git(cwd, ["branch", "--set-upstream-to", "origin/main"]);
  await git(cwd, ["checkout", "main"]);
  await writeFile(join(cwd, "remote-change.txt"), "new upstream\n", "utf8");
  await git(cwd, ["add", "remote-change.txt"]);
  await git(cwd, ["commit", "-m", "advance origin"]);
  await git(cwd, ["push", "origin", "main"]);
  await git(cwd, ["checkout", "task/stale-worker"]);

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });

  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /refuses stale source branch task\/stale-worker/);
});

test("run defaults worker baseRef to the current branch so worker worktrees inherit task-branch config", async () => {
  const cwd = await writeFixture({
    jobOverrides: {
      implementationCommand: "node -e \"require('fs').mkdirSync('docs/initiatives/greenfield-scaffold',{recursive:true});require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','ok\\n')\"",
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await writeFile(join(cwd, ".pi", "settings.json"), `${JSON.stringify({ defaultProvider: "github-copilot", defaultModel: "gpt-5.4", defaultThinkingLevel: "high", marker: "current-branch-config" }, null, 2)}\n`, "utf8");
  await git(cwd, ["checkout", "-b", "task/current-runtime-branch"]);
  await git(cwd, ["add", ".pi/settings.json"]);
  await git(cwd, ["commit", "-m", "branch-config"]);

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-current-branch",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });

  assert.equal(result.worktree.baseRef, "task/current-runtime-branch");
  const workerSettings = await readFile(join(result.worktree.path!, ".pi", "settings.json"), "utf8");
  assert.match(workerSettings, /current-branch-config/);
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

  const summary = JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs/summaries/worker-green.json"), "utf8"));
  assert.deepEqual(Object.keys(summary).sort(), ["commands", "modelExecution", "prBoundaryStatus", "queueJobId", "sourceIssueId", "validationStatus", "version"]);
  assert.equal(summary.queueJobId, "afk-greenfield-scaffold-issue-002");
  assert.equal(summary.sourceIssueId, "issue-002");
  assert.deepEqual(summary.commands.implementation, result.steps.coding.commands);
  assert.deepEqual(summary.commands.validation, ["node -e \"process.exit(0)\""]);
  assert.equal(summary.validationStatus, "passed");
  assert.equal(summary.prBoundaryStatus, "stop_before_pr");
  assert.equal(summary.modelExecution.status, "not_required");
});

test("run uses queue job implementation command fallback and allows Pi log artifacts", async () => {
  const cwd = await writeFixture({
    jobOverrides: {
      implementationCommand: "node -e \"require('fs').mkdirSync('logs/coding',{recursive:true});require('fs').mkdirSync('reports/planning',{recursive:true});require('fs').mkdirSync('docs/initiatives/greenfield-scaffold',{recursive:true});require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','ok\\n');require('fs').writeFileSync('logs/CURRENT.md','# current\\n');require('fs').writeFileSync('logs/coding/test.md','# coding\\n');require('fs').writeFileSync('reports/planning/test.md','# planning\\n')\"",
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-job-fallback",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });

  assert.equal(result.status, "review_ready");
  assert.match(result.steps.coding.greenCommand ?? "", /^node -e/);
  assert.ok(result.steps.coding.changedFiles.includes("logs/CURRENT.md"));
  assert.ok(result.steps.coding.changedFiles.includes("reports/planning/test.md"));
});


test("run blocks selected-model jobs before legacy implementation when no child worker plan exists", async () => {
  const cwd = await writeFixture({
    jobOverrides: {
      selectedModelId: "openai-codex/gpt-5.3-codex-spark",
      implementationCommand: "node -e \"require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','should-not-run\\n')\"",
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-selected-model-no-child",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    callerModelId: "openai-codex/gpt-5.5",
  });

  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /selected model not executed/);
  assert.equal(result.modelExecution?.callerModelId, "openai-codex/gpt-5.5");
  assert.equal(result.modelExecution?.selectedModelId, "openai-codex/gpt-5.3-codex-spark");
  assert.equal(result.modelExecution?.actualModelId, null);
  assert.equal(result.modelExecution?.status, "blocked_not_launched");
});


test("run blocks selected-model jobs before mismatched child model execution", async () => {
  const cwd = await writeFixture({
    jobOverrides: {
      selectedModelId: "openai-codex/gpt-5.3-codex-spark",
      workerExecutionPlan: {
        strategy: "same_runtime_prompt",
        prompt: "Implement docs",
        toolProfile: "coding",
        includeProjectExtensions: false,
        includeContextFiles: true,
        provider: "github-copilot",
        modelId: "gpt-5.4",
        thinkingLevel: "high",
      },
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-selected-model-mismatch",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    sameRuntimeExecutor: async () => {
      throw new Error("mismatched child executor should not be launched");
    },
  });

  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /selected model not executed/);
  assert.equal(result.modelExecution.status, "mismatch");
  assert.equal(result.modelExecution.selectedModelId, "openai-codex/gpt-5.3-codex-spark");
  assert.equal(result.modelExecution.plannedModelId, "github-copilot/gpt-5.4");
  assert.equal(result.modelExecution.actualModelId, null);
});

test("run records actual child model when selected model execution matches", async () => {
  const cwd = await writeFixture({
    jobOverrides: {
      selectedModelId: "openai-codex/gpt-5.3-codex-spark",
      selectedThinkingLevel: "high",
      workerExecutionPlan: {
        strategy: "same_runtime_prompt",
        prompt: "Implement docs",
        toolProfile: "coding",
        includeProjectExtensions: false,
        includeContextFiles: true,
        provider: "openai-codex",
        modelId: "gpt-5.3-codex-spark",
        thinkingLevel: "high",
      },
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-selected-model-match",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    callerModelId: "openai-codex/gpt-5.5",
    reviewVerdict: "no_required_fixes",
    sameRuntimeExecutor: async (worktreePath, plan) => {
      assert.equal(plan.provider, "openai-codex");
      assert.equal(plan.modelId, "gpt-5.3-codex-spark");
      assert.equal(plan.thinkingLevel, "high");
      await mkdir(join(worktreePath, "docs", "initiatives", "greenfield-scaffold"), { recursive: true });
      await writeFile(join(worktreePath, "docs", "initiatives", "greenfield-scaffold", "notes.md"), "ok\n", "utf8");
      return { command: "same_runtime_prompt", exitCode: 0, stdout: "__PI_OK__\nok", stderr: "", durationMs: 1 };
    },
  });

  assert.equal(result.status, "review_ready");
  assert.equal(result.modelExecution.callerModelId, "openai-codex/gpt-5.5");
  assert.equal(result.modelExecution.selectedModelId, "openai-codex/gpt-5.3-codex-spark");
  assert.equal(result.modelExecution.plannedModelId, "openai-codex/gpt-5.3-codex-spark");
  assert.equal(result.modelExecution.actualModelId, "openai-codex/gpt-5.3-codex-spark");
  assert.equal(result.modelExecution.actualThinkingLevel, "high");
  assert.equal(result.modelExecution.status, "matched");
});

test("run records actual selected child model when child execution fails", async () => {
  const cwd = await writeFixture({
    jobOverrides: {
      selectedModelId: "openai-codex/gpt-5.3-codex-spark",
      workerExecutionPlan: {
        strategy: "same_runtime_prompt",
        prompt: "Implement docs",
        toolProfile: "coding",
        includeProjectExtensions: false,
        includeContextFiles: true,
        provider: "openai-codex",
        modelId: "gpt-5.3-codex-spark",
        thinkingLevel: "high",
      },
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-selected-model-child-failure",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    sameRuntimeExecutor: async () => ({
      command: "same_runtime_prompt",
      exitCode: 2,
      stdout: "",
      stderr: "provider unavailable",
      durationMs: 1,
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.modelExecution.selectedModelId, "openai-codex/gpt-5.3-codex-spark");
  assert.equal(result.modelExecution.actualModelId, "openai-codex/gpt-5.3-codex-spark");
  assert.equal(result.modelExecution.actualThinkingLevel, "high");
  assert.equal(result.modelExecution.status, "matched");
});

test("run prefers structured same-runtime worker execution plans over legacy implementation commands", async () => {
  const cwd = await writeFixture({
    jobOverrides: {
      implementationCommand: "node -e \"process.exit(17)\"",
      workerExecutionPlan: {
        strategy: "same_runtime_prompt",
        prompt: "Implement the bounded docs update and return success.",
        toolProfile: "coding",
        includeProjectExtensions: false,
        includeContextFiles: true,
        provider: "github-copilot",
        modelId: "gpt-5.4",
        thinkingLevel: "high",
      },
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-same-runtime-plan",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    reviewVerdict: "no_required_fixes",
    sameRuntimeExecutor: async (worktreePath, plan) => {
      assert.equal(plan.strategy, "same_runtime_prompt");
      assert.equal(plan.modelId, "gpt-5.4");
      await mkdir(join(worktreePath, "logs", "coding"), { recursive: true });
      await mkdir(join(worktreePath, "reports", "planning"), { recursive: true });
      await mkdir(join(worktreePath, "docs", "initiatives", "greenfield-scaffold"), { recursive: true });
      await writeFile(join(worktreePath, "docs", "initiatives", "greenfield-scaffold", "notes.md"), "ok\n", "utf8");
      await writeFile(join(worktreePath, "logs", "CURRENT.md"), "# current\n", "utf8");
      await writeFile(join(worktreePath, "logs", "coding", "task.md"), "## log\n", "utf8");
      await writeFile(join(worktreePath, "reports", "planning", "task.md"), "## plan\n", "utf8");
      return {
        command: "same_runtime_prompt",
        exitCode: 0,
        stdout: "__PI_OK__\nok",
        stderr: "",
        durationMs: 1,
      };
    },
  });

  assert.equal(result.status, "review_ready");
  assert.equal(result.steps.coding.status, "passed");
  assert.match(result.steps.coding.greenCommand ?? "", /same_runtime_prompt/);
  assert.ok(result.steps.coding.changedFiles.includes("docs/initiatives/greenfield-scaffold/notes.md"));
  assert.ok(result.steps.coding.changedFiles.includes("logs/CURRENT.md"));
  assert.ok(result.steps.coding.changedFiles.includes("logs/coding/task.md"));
  assert.ok(result.steps.coding.changedFiles.includes("reports/planning/task.md"));
});

test("provider-failed mixed-domain run with preserved diff and passing local proof is promoted to review_ready", async () => {
  const cwd = await writeFixture({
    activeJobId: "afk-greenfield-scaffold-issue-002",
    issueOverrides: {
      domains: ["frontend", "backend"],
      filesToModify: ["apps/web/src/lib/health-client.ts", "services/api/src/routes/health.ts"],
      allowedPaths: ["apps/web/src/lib", "services/api/src/routes"],
      validationProof: ["node -e \"process.exit(0)\""],
    },
    jobOverrides: {
      status: "running",
      domains: ["frontend", "backend"],
      allowedPaths: ["apps/web/src/lib", "services/api/src/routes"],
      workerExecutionPlan: {
        strategy: "same_runtime_prompt",
        prompt: "Implement the bounded mixed-domain health handshake.",
        toolProfile: "coding",
        includeProjectExtensions: false,
        includeContextFiles: true,
        provider: "github-copilot",
        modelId: "gpt-5.4",
        thinkingLevel: "high",
      },
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-salvage-review-ready",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    sameRuntimeExecutor: async (worktreePath) => {
      await mkdir(join(worktreePath, "apps", "web", "src", "lib"), { recursive: true });
      await mkdir(join(worktreePath, "services", "api", "src", "routes"), { recursive: true });
      await writeFile(join(worktreePath, "apps", "web", "src", "lib", "health-client.ts"), "export const status = 'ok';\n", "utf8");
      await writeFile(join(worktreePath, "services", "api", "src", "routes", "health.ts"), "export const status = 'ok';\n", "utf8");
      return {
        command: "same_runtime_prompt",
        exitCode: 1,
        stdout: "partial diff preserved",
        stderr: "provider interrupted after writing the mixed-domain diff",
        durationMs: 1,
      };
    },
  });

  assert.equal(result.status, "review_ready");
  assert.match(result.stopReason ?? "", /salvaged/i);
  assert.equal(result.salvage?.outcome, "reviewable");
  assert.deepEqual(result.salvage?.preservedDiff, [
    "apps/web/src/lib/health-client.ts",
    "services/api/src/routes/health.ts",
  ]);
  assert.ok((result.salvage?.retainedProof ?? []).some((line) => /node -e/.test(line)));
  assert.equal(result.steps.validation.status, "passed");

  const queue = await readQueueState(cwd);
  assert.equal(queue.jobs[0].status, "running");
  assert.equal(queue.jobs[0].workerExecution?.status, "review_ready");
  assert.equal(queue.jobs[0].workerExecution?.salvage?.outcome, "reviewable");

  const taskState = (await readTaskStateLib(cwd)) as unknown as {
    tasks: Array<{ id: string; status: string; evidence: string[]; validation?: { decision?: string } }>;
  };
  assert.equal(taskState.tasks.find((task) => task.id === result.linkedTaskId)?.status, "review");
  assert.equal(taskState.tasks.find((task) => task.id === result.linkedTaskId)?.validation?.decision, "pass");
  assert.match((taskState.tasks.find((task) => task.id === result.linkedTaskId)?.evidence ?? []).join("\n"), /salvage/i);
});

test("provider-failed mixed-domain run with preserved diff but without passing proof becomes resumable instead of failed", async () => {
  const cwd = await writeFixture({
    activeJobId: "afk-greenfield-scaffold-issue-002",
    issueOverrides: {
      domains: ["frontend", "backend"],
      filesToModify: ["apps/web/src/lib/health-client.ts", "services/api/src/routes/health.ts"],
      allowedPaths: ["apps/web/src/lib", "services/api/src/routes"],
      validationProof: ["node -e \"process.exit(2)\""],
    },
    jobOverrides: {
      status: "running",
      domains: ["frontend", "backend"],
      allowedPaths: ["apps/web/src/lib", "services/api/src/routes"],
      workerExecutionPlan: {
        strategy: "same_runtime_prompt",
        prompt: "Implement the bounded mixed-domain health handshake.",
        toolProfile: "coding",
        includeProjectExtensions: false,
        includeContextFiles: true,
        provider: "github-copilot",
        modelId: "gpt-5.4",
        thinkingLevel: "high",
      },
      validationCommands: ["node -e \"process.exit(2)\""],
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-salvage-blocked",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    sameRuntimeExecutor: async (worktreePath) => {
      await mkdir(join(worktreePath, "apps", "web", "src", "lib"), { recursive: true });
      await mkdir(join(worktreePath, "services", "api", "src", "routes"), { recursive: true });
      await writeFile(join(worktreePath, "apps", "web", "src", "lib", "health-client.ts"), "export const status = 'ok';\n", "utf8");
      await writeFile(join(worktreePath, "services", "api", "src", "routes", "health.ts"), "export const status = 'ok';\n", "utf8");
      return {
        command: "same_runtime_prompt",
        exitCode: 1,
        stdout: "partial diff preserved",
        stderr: "provider interrupted before validation proof could be established",
        durationMs: 1,
      };
    },
  });

  assert.equal(result.status, "blocked");
  assert.doesNotMatch(result.stopReason ?? "", /failed/i);
  assert.equal(result.salvage?.outcome, "resumable");
  assert.deepEqual(result.salvage?.preservedDiff, [
    "apps/web/src/lib/health-client.ts",
    "services/api/src/routes/health.ts",
  ]);
  assert.deepEqual(result.salvage?.retainedProof, []);

  const queue = await readQueueState(cwd);
  assert.equal(queue.activeJobId, null);
  assert.equal(queue.jobs[0].status, "blocked");
  assert.equal(queue.jobs[0].workerExecution?.status, "blocked");
  assert.equal(queue.jobs[0].workerExecution?.salvage?.outcome, "resumable");

  const taskState = (await readTaskStateLib(cwd)) as unknown as {
    tasks: Array<{ id: string; status: string; evidence: string[] }>;
  };
  assert.equal(taskState.tasks.find((task) => task.id === result.linkedTaskId)?.status, "blocked");
  assert.match((taskState.tasks.find((task) => task.id === result.linkedTaskId)?.evidence ?? []).join("\n"), /Salvage Outcome: resumable/i);
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
    implementationCommand: "node -e \"require('fs').mkdirSync('docs/initiatives/greenfield-scaffold',{recursive:true});require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','ok\\n')\"",
    validationCommands: ["node -e \"process.exit(0)\""],
  });

  await assert.rejects(
    runWorkerExecution({ repoRoot: cwd, command: "resume", initiativeId: "greenfield-scaffold", runId: "worker-terminal", baseRef: "main", maxSteps: 4, maxRuntimeSeconds: 10 }),
    /resume requires a non-terminal worker run/,
  );
});

test("failed validation finalizes linked task and clears active queue job while review changes-required still blocks before completion", async () => {
  const validationCwd = await writeFixture({
    activeJobId: "afk-greenfield-scaffold-issue-002",
    jobOverrides: {
      status: "running",
      implementationCommand: "node -e \"require('fs').mkdirSync('docs/initiatives/greenfield-scaffold',{recursive:true});require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','ok\\n')\"",
      validationCommands: ["node -e \"process.exit(2)\""],
    },
  });

  const failed = await runWorkerExecution({
    repoRoot: validationCwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-validation-fail",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });
  assert.equal(failed.status, "failed");
  assert.match(failed.stopReason ?? "", /validation failure/);
  assert.ok(failed.worktree.path);
  const failedQueue = await readQueueState(validationCwd);
  const failedTasks = (await readTaskStateLib(validationCwd)) as unknown as { tasks: Array<{ id: string; status: string }> };
  assert.equal(failedQueue.activeJobId, null);
  assert.equal(failedQueue.jobs[0].status, "failed");
  assert.equal(failedTasks.tasks.find((task) => task.id === failed.linkedTaskId)?.status, "failed");

  const reviewCwd = await writeFixture({
    jobOverrides: {
      implementationCommand: "node -e \"require('fs').mkdirSync('docs/initiatives/greenfield-scaffold',{recursive:true});require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','ok\\n')\"",
      validationCommands: ["node -e \"process.exit(0)\""],
    },
  });
  const review = await runWorkerExecution({
    repoRoot: reviewCwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-review-fail",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
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

test("run blocks clearly when no implementation command or queue execution plan is available", async () => {
  const cwd = await writeFixture();
  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-missing-plan",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });

  assert.equal(result.status, "blocked");
  assert.match(result.stopReason ?? "", /No implementation command or queue execution plan/);
});

test("run blocks with a validation-contract reason before mixed-domain worker execution begins when the wrapper script is missing", async () => {
  const validationCommand = "npm run test:integration -- health-handshake";
  const cwd = await writeFixture({
    issueOverrides: {
      domains: ["frontend", "backend"],
      filesToModify: ["apps/web/src/lib/health-client.ts", "services/api/src/routes/health.ts", "tests/integration/health-handshake.test.ts"],
      allowedPaths: ["apps/web/src/lib", "services/api/src/routes", "tests/integration"],
      validationProof: [validationCommand],
    },
    jobOverrides: {
      domains: ["frontend", "backend"],
      allowedPaths: ["apps/web/src/lib", "services/api/src/routes", "tests/integration"],
      implementationCommand: "node -e \"process.exit(0)\"",
      validationCommands: [validationCommand],
    },
    packageJson: {
      name: "fixture",
      private: true,
      scripts: {
        "test:unit": "node -e \"process.exit(0)\"",
      },
    },
  });

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-missing-validation-wrapper",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.worktree.path, null);
  assert.equal(result.steps.validation.status, "blocked");
  assert.match(result.stopReason ?? "", /validation-contract/i);
  assert.match(result.stopReason ?? "", /missing npm script "test:integration"/i);
  const queue = await readQueueState(cwd);
  assert.equal(queue.jobs[0].status, "blocked");
  assert.equal(queue.jobs[0].workerExecution?.status, "blocked");
});

test("run ignores generated initiative runtime run artifacts when checking worktree cleanliness", async () => {
  const cwd = await writeFixture();
  await mkdir(join(cwd, "docs", "initiatives", "greenfield-scaffold", "afk-runs"), { recursive: true });
  await writeFile(join(cwd, "docs", "initiatives", "greenfield-scaffold", "afk-runs", "afk-test.json"), "{}\n", "utf8");

  const result = await runWorkerExecution({
    repoRoot: cwd,
    command: "run",
    initiativeId: "greenfield-scaffold",
    queueJobId: "afk-greenfield-scaffold-issue-002",
    runId: "worker-ignores-afk-runs",
    baseRef: "main",
    maxSteps: 4,
    maxRuntimeSeconds: 10,
    implementationCommand: "node -e \"require('fs').mkdirSync('docs/initiatives/greenfield-scaffold',{recursive:true});require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','ok\\n')\"",
    validationCommands: ["node -e \"process.exit(0)\""],
  });

  assert.equal(result.status, "review_ready");
  assert.doesNotMatch(result.stopReason ?? "", /dirty or conflicted worktree|afk-runs/);
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
