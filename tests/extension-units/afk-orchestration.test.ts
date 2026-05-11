import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { runAfkOrchestration, type AfkIssueArtifact } from "../../.pi/agent/extensions/afk-orchestration.ts";
import { readQueueState } from "../../.pi/agent/extensions/queue-runner.ts";

function baseIssue(id: string, overrides: Partial<AfkIssueArtifact> = {}): AfkIssueArtifact {
  return {
    issueId: id,
    title: `Issue ${id}`,
    type: "AFK",
    status: "planned",
    dependencies: [],
    acceptanceCriteria: [`${id} acceptance`],
    validationProof: [`npm test -- ${id}`],
    domains: ["backend"],
    filesToModify: [`services/${id}/index.ts`],
    allowedPaths: [`services/${id}`],
    hitlGates: [],
    whatToBuild: `Build ${id}`,
    ...overrides,
  };
}

async function writeInitiative(cwd: string, issues: AfkIssueArtifact[], options: { omitSummaries?: string[] } = {}): Promise<void> {
  const root = join(cwd, "docs", "initiatives", "greenfield-scaffold");
  await mkdir(join(root, "slices"), { recursive: true });
  await writeFile(join(root, "issues.json"), `${JSON.stringify({ version: 1, initiativeId: "greenfield-scaffold", issues }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "slice-plan.json"), `${JSON.stringify({ version: 1, initiativeId: "greenfield-scaffold" }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "pipeline.json"), `${JSON.stringify({ version: 1, initiativeId: "greenfield-scaffold" }, null, 2)}\n`, "utf8");
  for (const issue of issues) {
    if (options.omitSummaries?.includes(issue.issueId)) continue;
    await writeFile(
      join(root, "slices", `${issue.issueId}.summary.json`),
      `${JSON.stringify({ version: 1, initiativeId: "greenfield-scaffold", issueId: issue.issueId, summary: { sliceId: issue.issueId, filesToModify: issue.filesToModify, allowedPaths: issue.allowedPaths } }, null, 2)}\n`,
      "utf8",
    );
  }
}

async function tempRepo(issues: AfkIssueArtifact[], options: { omitSummaries?: string[] } = {}): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "afk-orchestration-"));
  await writeInitiative(cwd, issues, options);
  return cwd;
}

async function writeAfkApprovals(cwd: string, approvals: unknown[]): Promise<void> {
  const root = join(cwd, "docs", "initiatives", "greenfield-scaffold");
  await writeFile(join(root, "afk-approvals.json"), `${JSON.stringify({ version: 1, approvals }, null, 2)}\n`, "utf8");
}

async function writeReviewArtifact(cwd: string, relativePath: string, content = "# artifact\n"): Promise<void> {
  const path = join(cwd, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

const canonicalIssues = () => [
  baseIssue("issue-001", { type: "HITL", status: "planned", validationProof: [], domains: ["docs"], filesToModify: ["docs/foundation.md"], allowedPaths: ["docs"], hitlGates: ["approve foundation"] }),
  baseIssue("issue-002", { dependencies: ["issue-001"], domains: ["frontend"], filesToModify: ["apps/web/src/App.tsx"], allowedPaths: ["apps/web"] }),
  baseIssue("issue-003", { dependencies: ["issue-001"], domains: ["backend"], filesToModify: ["services/api/src/server.ts"], allowedPaths: ["services/api"] }),
  baseIssue("issue-004", { dependencies: ["issue-002", "issue-003"], domains: ["infra"], filesToModify: ["infra/deploy.ts"], allowedPaths: ["infra"] }),
];

test("dry-run writes no files and keeps HITL/dependency blockers visible", async () => {
  const cwd = await tempRepo(canonicalIssues());
  const before = (await readdir(join(cwd, "docs", "initiatives", "greenfield-scaffold"))).sort();

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", now: "2026-05-09T00:00:00.000Z", explainIssueId: "issue-002" });
  const after = (await readdir(join(cwd, "docs", "initiatives", "greenfield-scaffold"))).sort();

  assert.deepEqual(after, before);
  assert.equal(result.eligibleIssues.length, 0);
  assert.equal(result.skippedIssues.find((issue) => issue.issueId === "issue-001")?.disposition, "skipped");
  assert.match(result.deferredIssues.find((issue) => issue.issueId === "issue-002")?.reasons.join(" ") ?? "", /Unresolved dependencies: issue-001/);
  assert.equal(result.explainIssue?.issueId, "issue-002");
  await assert.rejects(readFile(join(cwd, "docs/initiatives/greenfield-scaffold/afk-runs/afk-20260509T000000Z.json"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(cwd, ".pi/agent/state/runtime/queue.json"), "utf8"), /ENOENT/);
});

test("issue 2 and 3 become eligible after issue 1 is done, while issue 4 waits for 2 and 3", async () => {
  const issues = canonicalIssues();
  issues[0].status = "done";
  const cwd = await tempRepo(issues);
  await writeReviewArtifact(cwd, "docs/foundation.md", "# foundation\n");

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", maxParallel: 2 });

  assert.deepEqual(result.eligibleIssues.map((issue) => issue.issueId).sort(), ["issue-002", "issue-003"]);
  assert.match(result.deferredIssues.find((issue) => issue.issueId === "issue-004")?.reasons.join(" ") ?? "", /issue-002, issue-003/);
  assert.equal(result.parallelDecisions.find((decision) => decision.issueIds.join("+") === "issue-002+issue-003")?.status, "parallel_candidate");
});

test("issue 4 becomes eligible only after issues 2 and 3 are done", async () => {
  const issues = canonicalIssues();
  issues[0].status = "done";
  issues[1].status = "done";
  issues[2].status = "done";
  const cwd = await tempRepo(issues);
  await writeReviewArtifact(cwd, "docs/foundation.md", "# foundation\n");

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold" });

  assert.deepEqual(result.eligibleIssues.map((issue) => issue.issueId), ["issue-004"]);
});

test("missing allowedPaths, domains, acceptance, validation proof, or summary blocks materialization", async () => {
  const cwd = await tempRepo([
    baseIssue("issue-001", { status: "done" }),
    baseIssue("issue-002", { dependencies: ["issue-001"], allowedPaths: [] }),
    baseIssue("issue-003", { dependencies: ["issue-001"], domains: [] }),
    baseIssue("issue-004", { dependencies: ["issue-001"], acceptanceCriteria: [] }),
    baseIssue("issue-005", { dependencies: ["issue-001"], validationProof: [] }),
    baseIssue("issue-006", { dependencies: ["issue-001"] }),
  ], { omitSummaries: ["issue-006"] });
  await writeReviewArtifact(cwd, "services/issue-001/index.ts", "export const foundation = true;\n");

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold" });
  const reasons = Object.fromEntries(result.blockedIssues.map((issue) => [issue.issueId, issue.reasons.join(" ")]));

  assert.match(reasons["issue-002"], /Missing allowedPaths/);
  assert.match(reasons["issue-003"], /Missing valid domains/);
  assert.match(reasons["issue-004"], /Missing acceptance criteria/);
  assert.match(reasons["issue-005"], /Missing validation proof/);
  assert.match(reasons["issue-006"], /Missing per-slice summary/);
});

test("durable AFK approvals resolve HITL dependencies for queue materialization", async () => {
  const cwd = await tempRepo(canonicalIssues());
  await writeReviewArtifact(cwd, "docs/foundation.md", "# foundation\n");
  await writeAfkApprovals(cwd, [{ issueId: "issue-001", approvalRef: "hitl:issue-001:approved", approvedBy: "operator", approvedAt: "2026-05-10T00:00:00.000Z", note: "foundation approved" }]);

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", maxParallel: 2 });

  assert.deepEqual(result.doneIssues.map((issue) => issue.issueId), ["issue-001"]);
  assert.match(result.doneIssues[0]?.reasons.join(" ") ?? "", /hitl:issue-001:approved/);
  assert.deepEqual(result.eligibleIssues.map((issue) => issue.issueId), ["issue-002", "issue-003"]);
  assert.deepEqual(result.deferredIssues.map((issue) => issue.issueId), ["issue-004"]);
  assert.ok(result.materializedQueueJobs[0]?.sourceArtifactPaths.includes("docs/initiatives/greenfield-scaffold/afk-approvals.json"));
});

test("AFK apply requeues stale blocked jobs after durable blockers are resolved", async () => {
  const cwd = await tempRepo(canonicalIssues());
  await writeReviewArtifact(cwd, "docs/foundation.md", "# foundation\n");
  await writeAfkApprovals(cwd, [{ issueId: "issue-001", approvalRef: "hitl:issue-001:approved", approvedBy: "operator", approvedAt: "2026-05-10T00:00:00.000Z", note: "foundation approved" }]);
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), `${JSON.stringify({
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [{
      id: "afk-greenfield-scaffold-issue-002",
      goal: "Build issue-002",
      priority: "high",
      status: "blocked",
      team: "build",
      taskClass: "implementation",
      workType: "implementation",
      domains: ["frontend"],
      allowedPaths: ["apps/web"],
      acceptanceCriteria: ["issue-002 acceptance"],
      dependencies: [],
      approvalRequired: false,
      stop_conditions: ["approval_boundary_hit"],
      assignedRole: "frontend_worker",
      notes: ["Blocked before durable HITL approval landed."],
      queueJobSource: { kind: "issue-materialization", initiativeId: "greenfield-scaffold", issueId: "issue-002", sourceArtifactPaths: ["docs/initiatives/greenfield-scaffold/issues.json"] },
    }],
  }, null, 2)}\n`, "utf8");

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "apply", initiativeId: "greenfield-scaffold", maxParallel: 2, runId: "afk-requeue" });
  const queue = await readQueueState(cwd);

  assert.match(result.lastAction, /Requeued 1 stale blocked queue job/);
  assert.equal(queue.jobs.find((job) => job.id === "afk-greenfield-scaffold-issue-002")?.status, "queued");
  assert.equal(queue.jobs.find((job) => job.id === "afk-greenfield-scaffold-issue-003")?.status, "queued");
});

test("shared files or mutating path overlap are forced sequential", async () => {
  const cwd = await tempRepo([
    baseIssue("issue-001", { status: "done" }),
    baseIssue("issue-002", { dependencies: ["issue-001"], filesToModify: ["apps/shared/index.ts"], allowedPaths: ["apps/shared"] }),
    baseIssue("issue-003", { dependencies: ["issue-001"], filesToModify: ["apps/shared/index.ts"], allowedPaths: ["apps/shared"] }),
  ]);
  await writeReviewArtifact(cwd, "services/issue-001/index.ts", "export const foundation = true;\n");

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", maxParallel: 2 });

  assert.equal(result.parallelDecisions[0].status, "forced_sequential");
  assert.ok(result.parallelDecisions[0].sharedPaths.length > 0);
});

test("status reports eligibility without creating runtime queue state", async () => {
  const issues = canonicalIssues();
  issues[0].status = "done";
  const cwd = await tempRepo(issues);
  await writeReviewArtifact(cwd, "docs/foundation.md", "# foundation\n");

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "status", initiativeId: "greenfield-scaffold", explainIssueId: "issue-002" });

  assert.equal(result.explainIssue?.issueId, "issue-002");
  assert.equal(result.eligibleIssues.length, 2);
  await assert.rejects(readFile(join(cwd, ".pi/agent/state/runtime/queue.json"), "utf8"), /ENOENT/);
});

test("apply writes an AFK run artifact and creates queue jobs only through queue helper provenance", async () => {
  const issues = canonicalIssues();
  issues[0].status = "done";
  const cwd = await tempRepo(issues);
  await writeReviewArtifact(cwd, "docs/foundation.md", "# foundation\n");

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "apply", initiativeId: "greenfield-scaffold", now: "2026-05-09T00:00:00.000Z", maxParallel: 2 });
  const queue = await readQueueState(cwd);
  const runArtifact = JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/afk-runs/afk-20260509t000000z.json"), "utf8"));

  assert.equal(result.materializedQueueJobs.length, 2);
  assert.deepEqual(queue.jobs.map((job) => job.id).sort(), ["afk-greenfield-scaffold-issue-002", "afk-greenfield-scaffold-issue-003"]);
  assert.ok(queue.jobs.every((job) => job.queueJobSource?.kind === "issue-materialization"));
  assert.ok(queue.jobs.every((job) => job.approvalRequired === false));
  assert.ok(queue.jobs.every((job) => job.tddSlice));
  assert.equal(runArtifact.materializedQueueJobs[0].queueJobSource.kind, "issue-materialization");
});

test("run mode requires explicit bounds and delegates to bounded session without creating workers when idle", async () => {
  const cwd = await tempRepo(canonicalIssues());

  await assert.rejects(
    runAfkOrchestration({ repoRoot: cwd, command: "run", initiativeId: "greenfield-scaffold", runRequested: true }),
    /requires explicit --max-steps and --max-runtime-seconds/,
  );

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "run", initiativeId: "greenfield-scaffold", runRequested: true, maxSteps: 1, maxRuntimeSeconds: 5, runId: "afk-idle-run" });

  assert.match(result.lastAction, /runBoundedQueueSession; stopReason=idle/);
  assert.deepEqual(result.startedQueueJobs, []);
});

test("durable HITL approval is ignored when required review artifacts are missing", async () => {
  const cwd = await tempRepo(canonicalIssues());
  await writeAfkApprovals(cwd, [{ issueId: "issue-001", approvalRef: "hitl:issue-001:approved", approvedBy: "operator", approvedAt: "2026-05-10T00:00:00.000Z", note: "foundation approved" }]);

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", maxParallel: 2 });
  const skipped = result.skippedIssues.find((issue) => issue.issueId === "issue-001");

  assert.ok(skipped);
  assert.match(skipped?.reasons.join(" ") ?? "", /Missing required approval artifacts: docs\/foundation\.md/);
  assert.match(skipped?.reasons.join(" ") ?? "", /Specific human approval required for issue-001/);
  assert.equal(result.doneIssues.length, 0);
});

test("durable HITL approval requires specific approval context fields", async () => {
  const cwd = await tempRepo(canonicalIssues());
  await writeReviewArtifact(cwd, "docs/foundation.md", "# foundation\n");
  await writeAfkApprovals(cwd, [{ issueId: "issue-001", approvalRef: "hitl:issue-001:approved", approvedBy: "operator", approvedAt: "2026-05-10T00:00:00.000Z" }]);

  const result = await runAfkOrchestration({ repoRoot: cwd, command: "dry-run", initiativeId: "greenfield-scaffold", maxParallel: 2 });
  const skipped = result.skippedIssues.find((issue) => issue.issueId === "issue-001");

  assert.ok(skipped);
  assert.match(skipped?.reasons.join(" ") ?? "", /Durable approval is missing required context fields: note/);
  assert.equal(result.doneIssues.length, 0);
});
