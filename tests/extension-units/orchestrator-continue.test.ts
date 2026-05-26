import assert from "node:assert/strict";
import test from "node:test";

import {
  runOrchestratorContinue,
  type OrchestratorContinueAfkExecutor,
  type OrchestratorContinueRunExecutor,
} from "../../.pi/agent/extensions/orchestrator-continue.ts";
import type { AfkMaterializedQueueJob, AfkOrchestrationRun } from "../../.pi/agent/extensions/afk-orchestration.ts";
import type { OrchestratorRunSessionResult } from "../../.pi/agent/extensions/orchestrator-run.ts";

function afkRun(overrides: Partial<AfkOrchestrationRun> = {}): AfkOrchestrationRun {
  return {
    version: 1,
    runId: "afk-run-001",
    initiativeId: "mixed-domain-harness-optimization",
    mode: "dry_run",
    maxParallel: 1,
    sourceArtifacts: { issues: "", slicePlan: "", pipeline: "", summaries: [] },
    eligibleIssues: [],
    blockedIssues: [],
    deferredIssues: [],
    skippedIssues: [],
    doneIssues: [],
    parallelDecisions: [],
    materializedQueueJobs: [],
    startedQueueJobs: [],
    lastAction: "dry-run",
    nextOperatorAction: "Inspect AFK frontier.",
    explainIssue: null,
    ...overrides,
  };
}

function queueJob(overrides: Partial<AfkMaterializedQueueJob> = {}): AfkMaterializedQueueJob {
  return {
    id: "afk-mixed-domain-harness-optimization-issue-004",
    title: "Issue 004",
    status: "queued",
    sourceIssueId: "issue-004",
    sourceInitiativeId: "mixed-domain-harness-optimization",
    taskClass: "implementation",
    assignedTeam: "build",
    assignedRole: "backend_worker",
    acceptanceCriteria: ["pass"],
    domains: ["backend"],
    allowedPaths: [],
    dependencies: [],
    budget: {},
    approvalRequired: false,
    stop_conditions: [],
    sourceArtifactPaths: [],
    queueJobSource: {
      kind: "issue-materialization",
      initiativeId: "mixed-domain-harness-optimization",
      issueId: "issue-004",
    },
    ...overrides,
  };
}

function runResult(overrides: Partial<OrchestratorRunSessionResult> = {}): OrchestratorRunSessionResult {
  return {
    version: 1,
    mode: "run",
    runId: "worker-run-001",
    selectedLane: "worker_job",
    delegatedCommand: "npm run harness:worker-execute -- run --initiative mixed-domain-harness-optimization --job-id afk-mixed-domain-harness-optimization-issue-004 --max-steps 3 --max-runtime-seconds 300 --stop-before-pr --json",
    status: "stopped",
    limits: { maxSteps: 3, maxRuntimeSeconds: 300, maxParallel: 1 },
    blockers: [],
    stopReason: "approval_boundary",
    startedWork: ["afk-mixed-domain-harness-optimization-issue-004"],
    completedWork: [],
    rawOutputExcerpt: "",
    nextSafeActions: ["Create and review the bounded PR before continuing."],
    pr: { created: false, url: null, gateStatus: null },
    merge: { attempted: false, allowed: false, reason: "worker run stops before merge" },
    ...overrides,
  };
}

test("continue selects one eligible issue, materializes queue-only, delegates worker_job, and stops on review boundary", async () => {
  const afkCalls: Array<{ command: string; queueOnly?: boolean }> = [];
  const afkExecutor: OrchestratorContinueAfkExecutor = async (input) => {
    afkCalls.push({ command: input.command, queueOnly: input.queueOnly });
    if (input.command === "dry-run" && afkCalls.length === 1) {
      return afkRun({
        eligibleIssues: [{ issueId: "issue-004", title: "Issue 004", disposition: "eligible", reasons: ["ready"], dependencies: ["issue-003"], queueJobId: "afk-mixed-domain-harness-optimization-issue-004" }],
        deferredIssues: [{ issueId: "issue-005", title: "Issue 005", disposition: "deferred", reasons: ["Waiting on issue-004."], dependencies: ["issue-004"] }],
        doneIssues: [
          { issueId: "issue-001", title: "Issue 001", disposition: "done", reasons: ["done"], dependencies: [] },
          { issueId: "issue-002", title: "Issue 002", disposition: "done", reasons: ["done"], dependencies: ["issue-001"] },
          { issueId: "issue-003", title: "Issue 003", disposition: "done", reasons: ["done"], dependencies: ["issue-002"] },
        ],
        materializedQueueJobs: [queueJob()],
      });
    }
    if (input.command === "apply") {
      return afkRun({
        mode: "apply",
        lastAction: "queue-only materialized",
        materializedQueueJobs: [queueJob()],
      });
    }
    return afkRun({
      deferredIssues: [{ issueId: "issue-005", title: "Issue 005", disposition: "deferred", reasons: ["Waiting on issue-004."], dependencies: ["issue-004"] }],
      doneIssues: [
        { issueId: "issue-001", title: "Issue 001", disposition: "done", reasons: ["done"], dependencies: [] },
        { issueId: "issue-002", title: "Issue 002", disposition: "done", reasons: ["done"], dependencies: ["issue-001"] },
        { issueId: "issue-003", title: "Issue 003", disposition: "done", reasons: ["done"], dependencies: ["issue-002"] },
      ],
      nextOperatorAction: "Review the PR boundary before continuing.",
    });
  };

  const runCalls: Array<{ initiative?: string; jobId?: string; lane?: string; maxSteps?: number; maxRuntimeSeconds?: number }> = [];
  const runExecutor: OrchestratorContinueRunExecutor = async (input) => {
    runCalls.push({ initiative: input.initiative, jobId: input.jobId, lane: input.lane, maxSteps: input.maxSteps, maxRuntimeSeconds: input.maxRuntimeSeconds });
    return runResult();
  };

  const result = await runOrchestratorContinue({
    initiative: "mixed-domain-harness-optimization",
    maxSlices: 1,
    maxSteps: 3,
    maxRuntimeSeconds: 300,
  }, afkExecutor, runExecutor);

  assert.equal(result.status, "stopped");
  assert.equal(result.stopReason, "approval_boundary");
  assert.deepEqual(result.selectedIssues, ["issue-004"]);
  assert.deepEqual(result.selectedQueueJobIds, ["afk-mixed-domain-harness-optimization-issue-004"]);
  assert.equal(result.slices.length, 1);
  assert.deepEqual(afkCalls, [
    { command: "dry-run", queueOnly: undefined },
    { command: "apply", queueOnly: true },
    { command: "dry-run", queueOnly: undefined },
  ]);
  assert.deepEqual(runCalls, [{ initiative: "mixed-domain-harness-optimization", jobId: "afk-mixed-domain-harness-optimization-issue-004", lane: "worker_job", maxSteps: 3, maxRuntimeSeconds: 300 }]);
  assert.match(result.delegatedCommands.join("\n"), /harness:afk-orchestrate -- dry-run/);
  assert.match(result.delegatedCommands.join("\n"), /harness:afk-orchestrate -- apply --queue-only/);
  assert.match(result.delegatedCommands.join("\n"), /harness:worker-execute/);
});

test("continue blocks when AFK apply does not materialize the selected queue job", async () => {
  let calls = 0;
  const afkExecutor: OrchestratorContinueAfkExecutor = async (input) => {
    calls += 1;
    if (calls === 1) {
      return afkRun({
        eligibleIssues: [{ issueId: "issue-004", title: "Issue 004", disposition: "eligible", reasons: ["ready"], dependencies: ["issue-003"], queueJobId: "afk-mixed-domain-harness-optimization-issue-004" }],
        materializedQueueJobs: [queueJob()],
      });
    }
    assert.equal(input.command, "apply");
    return afkRun({ mode: "apply", lastAction: "queue-only materialized" });
  };

  const runExecutor: OrchestratorContinueRunExecutor = async () => {
    throw new Error("run executor should not be called");
  };

  const result = await runOrchestratorContinue({
    initiative: "mixed-domain-harness-optimization",
    maxSlices: 1,
    maxSteps: 3,
    maxRuntimeSeconds: 300,
  }, afkExecutor, runExecutor);

  assert.equal(result.status, "blocked");
  assert.equal(result.stopReason, "validation_failure");
  assert.match(result.blockers.join("\n"), /not materialized/);
});

test("continue stops cleanly when no eligible issues remain", async () => {
  const afkExecutor: OrchestratorContinueAfkExecutor = async () => afkRun({
    deferredIssues: [{ issueId: "issue-017", title: "Issue 017", disposition: "deferred", reasons: ["Waiting on HITL approval."], dependencies: ["issue-016"] }],
    nextOperatorAction: "Resolve visible blockers before queue materialization.",
  });

  const runExecutor: OrchestratorContinueRunExecutor = async () => {
    throw new Error("run executor should not be called");
  };

  const result = await runOrchestratorContinue({
    initiative: "greenfield-scaffold",
    maxSlices: 1,
    maxSteps: 3,
    maxRuntimeSeconds: 300,
  }, afkExecutor, runExecutor);

  assert.equal(result.status, "stopped");
  assert.equal(result.stopReason, "no_eligible_issues");
  assert.deepEqual(result.selectedIssues, []);
  assert.match(result.blockers.join("\n"), /issue-017/);
});
