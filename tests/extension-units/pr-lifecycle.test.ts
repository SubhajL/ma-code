import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { runPrLifecycle, type CommandRunner, type PrLifecycleRun } from "../../.pi/agent/extensions/pr-lifecycle.ts";

const execFile = promisify(execFileCallback);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFile("git", args, { cwd });
}

async function writeFixture(options: { workerOverrides?: Record<string, unknown>; taskEvidence?: string[] } = {}): Promise<{ cwd: string; workerPath: string }> {
  const cwd = await mkdtemp(join(tmpdir(), "pr-lifecycle-"));
  await mkdir(join(cwd, "docs", "initiatives", "greenfield-scaffold", "worker-runs"), { recursive: true });
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  await writeFile(join(cwd, "README.md"), "fixture\n", "utf8");
  await git(cwd, ["init", "-b", "main"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "fixture"]);
  await mkdir(join(cwd, "docs", "initiatives", "greenfield-scaffold"), { recursive: true });
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
      coding: { status: "passed", changedFiles: ["docs/initiatives/greenfield-scaffold/change.md"], redCommand: "node -e \"process.exit(1)\"", redResult: { command: "node -e \"process.exit(1)\"", exitCode: 1, stdout: "", stderr: "", durationMs: 1 }, greenCommand: "node -e \"process.exit(0)\"", greenResult: { command: "node -e \"process.exit(0)\"", exitCode: 0, stdout: "", stderr: "", durationMs: 1 } },
      validation: { status: "passed", evidence: ["node -e passed"], results: [{ command: "node -e \"process.exit(0)\"", exitCode: 0, stdout: "", stderr: "", durationMs: 1 }] },
      review: { status: "passed", verdict: "no_required_fixes", evidence: ["Review Verdict: no_required_fixes"], findings: [] },
    },
    retryPolicy: { maxStepRetries: 1, attempts: {} },
    prBoundary: { stopBeforePr: true, allowPrCreate: false, prCreated: false, reason: "stop" },
    stopReason: "stop-before-pr boundary reached",
    nextOperatorAction: "create PR",
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    ...options.workerOverrides,
  };
  const workerPath = join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs/worker-green.json");
  await writeFile(workerPath, `${JSON.stringify(worker, null, 2)}\n`, "utf8");
  const taskEvidence = options.taskEvidence ?? ["Changed files: docs/initiatives/greenfield-scaffold/change.md", "Validation: node -e passed", "Review Verdict: no_required_fixes"];
  await writeFile(join(cwd, ".pi/agent/state/runtime/tasks.json"), `${JSON.stringify({ version: 1, activeTaskId: "task-1", tasks: [{ id: "task-1", title: "Task", owner: "docs_worker", status: "review", taskClass: "implementation", acceptance: ["ok"], evidence: taskEvidence, validation: { decision: "pass" }, notes: [], timestamps: { createdAt: "now", updatedAt: "now" } }] }, null, 2)}\n`, "utf8");
  return { cwd, workerPath };
}

function fakeRunner(log: string[], prView: Record<string, unknown> = {}): CommandRunner {
  return async (command, args, cwd) => {
    log.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args.includes("rev-parse") && args.includes("HEAD")) return { stdout: "head-sha", stderr: "", code: 0 };
    if (command === "git" && args.includes("branch") && args.includes("--show-current")) return { stdout: "worker/worker-green-issue-002", stderr: "", code: 0 };
    if (command === "git" && args.includes("status")) return { stdout: " M docs/initiatives/greenfield-scaffold/change.md", stderr: "", code: 0 };
    if (command === "git" && args.includes("add")) return { stdout: "", stderr: "", code: 0 };
    if (command === "git" && args.includes("commit")) return { stdout: "[branch commit-sha] msg", stderr: "", code: 0 };
    if (command === "git" && args.includes("push")) return { stdout: "pushed", stderr: "", code: 0 };
    if (command === "gh" && args[0] === "pr" && args[1] === "create") return { stdout: "https://github.com/SubhajL/ma-code/pull/123", stderr: "", code: 0 };
    if (command === "gh" && args[0] === "pr" && args[1] === "view") return { stdout: JSON.stringify({ number: 123, url: "https://github.com/SubhajL/ma-code/pull/123", headRefName: "worker/worker-green-issue-002", baseRefName: "main", reviewDecision: "", mergeStateStatus: "CLEAN", ...prView }), stderr: "", code: 0 };
    return { stdout: "", stderr: "", code: 0 };
  };
}

test("dry-run reports planned PR actions and writes no files", async () => {
  const { cwd } = await writeFixture();
  const before = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();
  const result = await runPrLifecycle({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-dry" });
  const after = (await readdir(join(cwd, "docs/initiatives/greenfield-scaffold"))).sort();
  assert.deepEqual(after, before);
  assert.equal(result.status, "planned");
  assert.equal(result.lifecycle.createReady, true);
  await assert.rejects(readFile(join(cwd, "docs/initiatives/greenfield-scaffold/pr-runs/pr-dry.json"), "utf8"), /ENOENT/);
});

test("create blocks without Phase C validation or g-check evidence", async () => {
  const missingValidation = await writeFixture({ workerOverrides: { steps: { planning: { status: "passed" }, coding: { status: "passed", changedFiles: ["docs/initiatives/greenfield-scaffold/change.md"] }, validation: { status: "failed" }, review: { status: "passed", verdict: "no_required_fixes" } } } });
  const blockedValidation = await runPrLifecycle({ repoRoot: missingValidation.cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-blocked-validation" });
  assert.equal(blockedValidation.status, "blocked");
  assert.match(blockedValidation.blockers.join(" "), /validation output/);

  const missingReview = await writeFixture({ workerOverrides: { steps: { planning: { status: "passed" }, coding: { status: "passed", changedFiles: ["docs/initiatives/greenfield-scaffold/change.md"] }, validation: { status: "passed", evidence: ["ok"], results: [{ command: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1 }] }, review: { status: "blocked", verdict: "changes_required" } } } });
  const blockedReview = await runPrLifecycle({ repoRoot: missingReview.cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-blocked-review" });
  assert.equal(blockedReview.status, "blocked");
  assert.match(blockedReview.blockers.join(" "), /g-check verdict/);
});

test("create commits, pushes, creates PR artifact and human summary when evidence is valid", async () => {
  const { cwd } = await writeFixture();
  const commands: string[] = [];
  const result = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-create", title: "Test PR", body: "Body" }, { runner: fakeRunner(commands) });
  assert.equal(result.status, "pr_created");
  assert.equal(result.pr.number, 123);
  assert.match(result.pr.url ?? "", /pull\/123/);
  assert.ok(commands.some((cmd) => cmd.includes("git add -- docs/initiatives/greenfield-scaffold/change.md")));
  assert.ok(commands.some((cmd) => cmd.includes("gh pr create")));
  assert.equal(JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/pr-runs/pr-create.json"), "utf8")).status, "pr_created");
  assert.match(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/pr-runs/pr-create.md"), "utf8"), /PR Lifecycle Run/);
});

test("gate records pass/fail/pending states", async () => {
  const { cwd } = await writeFixture();
  const base = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-gate", title: "Test PR" }, { runner: fakeRunner([]) });
  assert.equal(base.status, "pr_created");

  const passed = await runPrLifecycle({ repoRoot: cwd, command: "gate", initiativeId: "greenfield-scaffold", runId: "pr-gate" }, { prGate: async () => ({ finalStatus: "pass", attempts: [{ checks: [{ name: "ci", state: "SUCCESS" }], summary: { passCount: 1, failCount: 0, pendingCount: 0, totalCount: 1 }, attempt: 1, status: "pass" }], commentSummary: { blockingCommentCount: 0, totalCommentCount: 0, benignBotCommentCount: 0, blockingComments: [] }, reviewSummary: { reviewDecision: "", totalReviewCount: 0, changesRequestedCount: 0, blockingReviews: [] }, prContext: { number: 123, url: "url", mergeStateStatus: "CLEAN" }, pr: "123", intervalSeconds: 1, maxAttempts: 1, recommendedNextAction: "merge_or_sync", recommendedNextActionReason: "ok" }) });
  assert.equal(passed.status, "gate_passed");

  const failed = await runPrLifecycle({ repoRoot: cwd, command: "gate", initiativeId: "greenfield-scaffold", runId: "pr-gate" }, { prGate: async () => ({ finalStatus: "fail", attempts: [{ checks: [{ name: "ci", state: "FAILURE" }], summary: { passCount: 0, failCount: 1, pendingCount: 0, totalCount: 1 }, attempt: 1, status: "fail" }], commentSummary: { blockingCommentCount: 0, totalCommentCount: 0, benignBotCommentCount: 0, blockingComments: [] }, reviewSummary: { reviewDecision: "", totalReviewCount: 0, changesRequestedCount: 0, blockingReviews: [] }, prContext: { number: 123, url: "url", mergeStateStatus: "CLEAN" }, pr: "123", intervalSeconds: 1, maxAttempts: 1, recommendedNextAction: "fix_required", recommendedNextActionReason: "fail" }) });
  assert.equal(failed.status, "blocked");
  assert.match(failed.blockers.join(" "), /PR gate failed/);
});

test("gate passes zero-check stacked PRs when merge state is clean and review state is clear", async () => {
  const { cwd } = await writeFixture({ workerOverrides: { worktree: { path: ".", branch: "worker/worker-green-issue-002", baseRef: "task/task-phase3-sweep", leaseId: null } } });
  const base = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-stacked-gate", title: "Test PR" }, { runner: fakeRunner([], { baseRefName: "task/task-phase3-sweep" }), dirtyFiles: async () => [] });
  assert.equal(base.status, "pr_created");

  const gated = await runPrLifecycle({ repoRoot: cwd, command: "gate", initiativeId: "greenfield-scaffold", runId: "pr-stacked-gate" }, {
    prGate: async () => ({
      finalStatus: "pending",
      attempts: [{ checks: [], summary: { passCount: 0, failCount: 0, pendingCount: 0, totalCount: 0 }, attempt: 1, status: "pending" }],
      commentSummary: { blockingCommentCount: 0, totalCommentCount: 0, benignBotCommentCount: 0, blockingComments: [] },
      reviewSummary: { reviewDecision: "", changesRequestedCount: 0, approvalsCount: 0, reviews: [] },
      prContext: { number: 123, state: "OPEN", reviewDecision: "", mergeStateStatus: "CLEAN", url: "https://github.com/SubhajL/ma-code/pull/123" },
      finalChecks: [],
      recommendedNextAction: "wait_and_rerun",
      recommendedNextActionReason: "Checks are still pending or the bounded polling limit was reached before terminal success/failure.",
    }),
  });

  assert.equal(gated.status, "gate_passed");
  assert.match(gated.evidence.join("\n"), /zero-check stacked PR/);
});

test("merge-ready blocks requested changes, pending checks, and dirty root; passes only when gate and PR are clean", async () => {
  const { cwd } = await writeFixture();
  await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-ready", title: "Test PR" }, { runner: fakeRunner([]) });
  await runPrLifecycle({ repoRoot: cwd, command: "gate", initiativeId: "greenfield-scaffold", runId: "pr-ready" }, { prGate: async () => ({ finalStatus: "pass", attempts: [{ checks: [{ name: "ci", state: "SUCCESS" }], summary: { passCount: 1, failCount: 0, pendingCount: 0, totalCount: 1 }, attempt: 1, status: "pass" }], commentSummary: { blockingCommentCount: 0, totalCommentCount: 0, benignBotCommentCount: 0, blockingComments: [] }, reviewSummary: { reviewDecision: "", totalReviewCount: 0, changesRequestedCount: 0, blockingReviews: [] }, prContext: { number: 123, url: "url", mergeStateStatus: "CLEAN" }, pr: "123", intervalSeconds: 1, maxAttempts: 1, recommendedNextAction: "merge_or_sync", recommendedNextActionReason: "ok" }) });

  const blocked = await runPrLifecycle({ repoRoot: cwd, command: "merge-ready", initiativeId: "greenfield-scaffold", runId: "pr-ready" }, { runner: fakeRunner([], { reviewDecision: "CHANGES_REQUESTED" }) });
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blockers.join(" "), /requested changes/);

  await runPrLifecycle({ repoRoot: cwd, command: "gate", initiativeId: "greenfield-scaffold", runId: "pr-ready" }, { prGate: async () => ({ finalStatus: "pass", attempts: [{ checks: [{ name: "ci", state: "SUCCESS" }], summary: { passCount: 1, failCount: 0, pendingCount: 0, totalCount: 1 }, attempt: 1, status: "pass" }], commentSummary: { blockingCommentCount: 0, totalCommentCount: 0, benignBotCommentCount: 0, blockingComments: [] }, reviewSummary: { reviewDecision: "", totalReviewCount: 0, changesRequestedCount: 0, blockingReviews: [] }, prContext: { number: 123, url: "url", mergeStateStatus: "CLEAN" }, pr: "123", intervalSeconds: 1, maxAttempts: 1, recommendedNextAction: "merge_or_sync", recommendedNextActionReason: "ok" }) });
  const ready = await runPrLifecycle({ repoRoot: cwd, command: "merge-ready", initiativeId: "greenfield-scaffold", runId: "pr-ready" }, { runner: fakeRunner([]), dirtyFiles: async () => ["docs/initiatives/greenfield-scaffold/pr-runs/pr-ready.json", "docs/initiatives/greenfield-scaffold/pr-runs/pr-ready.md"] });
  assert.equal(ready.status, "gate_passed");
  assert.equal(ready.lifecycle.mergeReady, true);
});

test("merge-ready accepts zero-check stacked PRs when gate already passed", async () => {
  const { cwd } = await writeFixture({ workerOverrides: { worktree: { path: ".", branch: "worker/worker-green-issue-002", baseRef: "task/task-phase3-sweep", leaseId: null } } });
  const seed = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-stacked-ready", title: "Test PR" }, { runner: fakeRunner([], { baseRefName: "task/task-phase3-sweep" }), dirtyFiles: async () => [] });
  seed.status = "gate_passed";
  seed.pr.baseRef = "task/task-phase3-sweep";
  seed.pr.mergeStateStatus = "CLEAN";
  seed.pr.checks = [];
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/pr-runs/pr-stacked-ready.json"), `${JSON.stringify(seed, null, 2)}\n`, "utf8");

  const ready = await runPrLifecycle({ repoRoot: cwd, command: "merge-ready", initiativeId: "greenfield-scaffold", runId: "pr-stacked-ready" }, { runner: fakeRunner([], { baseRefName: "task/task-phase3-sweep" }), dirtyFiles: async () => ["docs/initiatives/greenfield-scaffold/pr-runs/pr-stacked-ready.json", "docs/initiatives/greenfield-scaffold/pr-runs/pr-stacked-ready.md", "docs/initiatives/greenfield-scaffold/afk-runs/", "docs/initiatives/greenfield-scaffold/worker-runs/"] });
  assert.equal(ready.status, "gate_passed");
  assert.equal(ready.lifecycle.mergeReady, true);
  assert.match(ready.evidence.join("\n"), /merge-ready accepted zero-check stacked PR/);
});

test("merge requires explicit approval and allowed method; sync records synced main SHA", async () => {
  const { cwd } = await writeFixture();
  const seed: PrLifecycleRun = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-merge", title: "Test PR" }, { runner: fakeRunner([]) });
  seed.status = "gate_passed";
  seed.lifecycle.mergeReady = true;
  seed.pr.mergeStateStatus = "CLEAN";
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/pr-runs/pr-merge.json"), `${JSON.stringify(seed, null, 2)}\n`, "utf8");

  await assert.rejects(runPrLifecycle({ repoRoot: cwd, command: "merge", initiativeId: "greenfield-scaffold", runId: "pr-merge", allowMerge: false }), /requires --allow-merge/);
  await assert.rejects(runPrLifecycle({ repoRoot: cwd, command: "merge", initiativeId: "greenfield-scaffold", runId: "pr-merge", allowMerge: true, approvalRef: "APPROVED", method: "octopus" as never }), /not allowed/);

  const merged = await runPrLifecycle({ repoRoot: cwd, command: "merge", initiativeId: "greenfield-scaffold", runId: "pr-merge", allowMerge: true, approvalRef: "APPROVED", method: "squash" }, { mergeApply: async () => ({ status: "merged", readiness: { ready: true }, merge: { stdout: "Merged pull request #123 (merge-sha)", stderr: "", code: 0 } }) as never });
  assert.equal(merged.status, "merged");
  assert.equal(merged.merge.approvalRef, "APPROVED");

  const synced = await runPrLifecycle({ repoRoot: cwd, command: "sync-main", initiativeId: "greenfield-scaffold", runId: "pr-merge" }, { syncMain: async () => ({ repoRoot: cwd, remote: "origin", branch: "main", status: "synced", beforeHead: "old", remoteHead: "new", afterHead: "new", dirtyTrackedFiles: [], preservedLocalBookkeeping: [] }) });
  assert.equal(synced.status, "synced");
  assert.equal(synced.merge.syncedMainSha, "new");
});

test("create refuses protected branch names", async () => {
  const { cwd } = await writeFixture({ workerOverrides: { worktree: { path: ".", branch: "main", baseRef: "main", leaseId: null } } });
  const result = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-protected" }, { runner: fakeRunner([]), dirtyFiles: async () => [] });
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /protected/);
});

test("create accepts linked task evidence from the worker worktree runtime", async () => {
  const { cwd, workerPath } = await writeFixture();
  const workerWorktree = await mkdtemp(join(tmpdir(), "pr-lifecycle-worker-"));
  await mkdir(join(workerWorktree, ".pi", "agent", "state", "runtime"), { recursive: true });
  await writeFile(join(cwd, ".pi/agent/state/runtime/tasks.json"), `${JSON.stringify({ version: 1, activeTaskId: null, tasks: [] }, null, 2)}\n`, "utf8");
  await writeFile(join(workerWorktree, ".pi/agent/state/runtime/tasks.json"), `${JSON.stringify({ version: 1, activeTaskId: "task-1", tasks: [{ id: "task-1", title: "Task", owner: "docs_worker", status: "review", taskClass: "implementation", acceptance: ["ok"], evidence: ["Changed files: docs/initiatives/greenfield-scaffold/change.md", "Validation: node -e passed", "Review Verdict: no_required_fixes"], validation: { decision: "pass" }, notes: [], timestamps: { createdAt: "now", updatedAt: "now" } }] }, null, 2)}\n`, "utf8");
  const worker = JSON.parse(await readFile(workerPath, "utf8"));
  worker.worktree.path = workerWorktree;
  await writeFile(workerPath, `${JSON.stringify(worker, null, 2)}\n`, "utf8");

  const result = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-worker-runtime", title: "Test PR" }, { runner: fakeRunner([]), dirtyFiles: async () => [] });
  assert.equal(result.status, "pr_created");
  assert.equal(result.lifecycle.taskReady, true);
});

test("create pushes a missing non-protected base branch before creating the PR", async () => {
  const { cwd } = await writeFixture({ workerOverrides: { worktree: { path: ".", branch: "worker/worker-green-issue-002", baseRef: "task/task-phase3-sweep", leaseId: null } } });
  const commands: string[] = [];
  const runner: CommandRunner = async (command, args) => {
    commands.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args[0] === "ls-remote") return { stdout: "", stderr: "", code: 0 };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--verify") return { stdout: "base-sha", stderr: "", code: 0 };
    if (command === "git" && args[0] === "push") return { stdout: "pushed", stderr: "", code: 0 };
    if (command === "gh" && args[0] === "pr" && args[1] === "create") return { stdout: "https://github.com/SubhajL/ma-code/pull/123", stderr: "", code: 0 };
    if (command === "gh" && args[0] === "pr" && args[1] === "view") return { stdout: JSON.stringify({ number: 123, url: "https://github.com/SubhajL/ma-code/pull/123", headRefName: "worker/worker-green-issue-002", baseRefName: "task/task-phase3-sweep", reviewDecision: "", mergeStateStatus: "CLEAN" }), stderr: "", code: 0 };
    return { stdout: "", stderr: "", code: 0 };
  };

  const result = await runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-stacked-base", title: "Test PR" }, { runner, dirtyFiles: async () => [] });
  assert.equal(result.status, "pr_created");
  const basePush = commands.indexOf("git push -u origin task/task-phase3-sweep");
  const headPush = commands.indexOf("git push -u origin worker/worker-green-issue-002");
  const prCreateIndex = commands.findIndex((command) => command.startsWith("gh pr create --base task/task-phase3-sweep --head worker/worker-green-issue-002 --title Test PR --body"));
  assert.notEqual(basePush, -1);
  assert.notEqual(headPush, -1);
  assert.notEqual(prCreateIndex, -1);
  assert.ok(basePush < headPush);
  assert.ok(headPush < prCreateIndex);
});

test("close-superseded requires explicit approval", async () => {
  const { cwd } = await writeFixture();
  await assert.rejects(runPrLifecycle({ repoRoot: cwd, command: "create", initiativeId: "greenfield-scaffold", workerRunId: "worker-green", runId: "pr-close", closeSuperseded: true }), /--close-superseded requires --close-approval-ref/);
});
