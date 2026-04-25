import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import queueRunner from "../../.pi/agent/extensions/queue-runner.ts";
import tillDone from "../../.pi/agent/extensions/till-done.ts";
import { materializeScheduledWorkflows } from "../../scripts/harness-scheduled-workflows.ts";
import { buildHarnessQueueSession, renderHarnessQueueSession } from "../../scripts/harness-queue-session.ts";
import { FakePi, copyFixtureRepoFile, makeCtx, makeTempRepo } from "../extension-units/test-utils.ts";

async function setupQueueSessionRepo(prefix: string) {
  const cwd = await makeTempRepo(prefix);
  await mkdir(join(cwd, "logs"), { recursive: true });

  for (const relativePath of [
    ".pi/agent/models.json",
    ".pi/agent/teams/activation-policy.json",
    ".pi/agent/teams/planning.yaml",
    ".pi/agent/teams/build.yaml",
    ".pi/agent/teams/quality.yaml",
    ".pi/agent/teams/recovery.yaml",
    ".pi/agent/packets/packet-policy.json",
    ".pi/agent/handoffs/handoff-policy.json",
    ".pi/agent/validation/completion-gate-policy.json",
    ".pi/agent/recovery/recovery-policy.json",
    ".pi/agent/schedules/scheduled-workflows.json",
  ]) {
    await copyFixtureRepoFile(cwd, relativePath);
  }

  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "queue.json"),
    JSON.stringify({ version: 1, paused: false, activeJobId: null, jobs: [] }, null, 2),
  );

  const pi = new FakePi("feat/queue-session-tests");
  tillDone(pi as any);
  queueRunner(pi as any);

  const queueTool = pi.getTool("run_next_queue_job");
  const taskTool = pi.getTool("task_update");

  const runNextQueueJob = async (params: Record<string, unknown> = {}) =>
    queueTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const taskUpdate = async (params: Record<string, unknown>) =>
    taskTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));

  return { cwd, runNextQueueJob, taskUpdate };
}

async function writeQueue(cwd: string, queue: unknown) {
  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
}

async function readQueue(cwd: string) {
  return JSON.parse(await readFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), "utf8")) as {
    activeJobId: string | null;
    paused: boolean;
    jobs: Array<{
      id: string;
      status: string;
      linkedTaskId?: string | null;
      scheduledWorkflowId?: string | null;
      scheduledRunKey?: string | null;
      lastRecoveryAction?: string | null;
    }>;
  };
}

async function finalizeTaskPass(taskUpdate: (params: Record<string, unknown>) => Promise<any>, taskId: string, note: string) {
  await taskUpdate({ action: "evidence", id: taskId, evidence: [`Changed files: ${note}`] });
  await taskUpdate({ action: "review", id: taskId, note: "Ready for bounded session validation" });
  await taskUpdate({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
  });
  await taskUpdate({ action: "done", id: taskId, note: "Task completed before the bounded session run." });
}

async function finalizeTaskFail(taskUpdate: (params: Record<string, unknown>) => Promise<any>, taskId: string, note: string) {
  await taskUpdate({ action: "evidence", id: taskId, evidence: [`Changed files: ${note}`, "Validation output: tests failed"] });
  await taskUpdate({ action: "review", id: taskId, note: "Validator should reject this task for recovery proof" });
  await taskUpdate({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "fail",
    validationChecklist: {
      acceptance: "met",
      tests: "not_met",
      diff_review: "met",
      evidence: "met",
    },
    note: "tests failed during bounded session proof",
  });
}

test("queue session starts one queued job and stops at the next waiting point", async () => {
  const { cwd } = await setupQueueSessionRepo("queue-session-start-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-session-start",
        goal: "Start queue session work",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Session should start the queued job"],
      },
    ],
  });

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 3 });
  const rendered = renderHarnessQueueSession(view);

  assert.equal(view.result.stopReason, "waiting_on_active_task");
  assert.equal(view.result.stepsRun, 1);
  assert.equal(view.result.steps[0]?.action, "started");
  assert.equal(view.result.finalInspection.summary.activeJob?.id, "job-session-start");
  assert.equal(view.result.triage.nextAction, "inspect_active_task");
  assert.equal(view.result.triage.actionCounts.started, 1);
  assert.deepEqual(view.result.triage.startedJobIds, ["job-session-start"]);
  assert.match(rendered, /Harness Queue Session/);
  assert.match(rendered, /stop reason: waiting_on_active_task/);
  assert.match(rendered, /recommended next action: inspect_active_task/);
  assert.match(rendered, /action counts: started=1, finalized=0, blocked=0, noop=0/);
  assert.match(rendered, /#1 started started=job-session-start/);
});

test("queue session can finalize visible terminal work and immediately start the next queued job", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueSessionRepo("queue-session-finalize-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-first",
        goal: "First queue session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["First job completes before the session starts"],
      },
      {
        id: "job-second",
        goal: "Second queue session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Second job should be started by the bounded session"],
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant" });
  const linkedTaskId = started.details.linkedTask.id;
  await finalizeTaskPass(taskUpdate, linkedTaskId, ".pi/agent/extensions/queue-runner.ts");

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 5 });

  assert.equal(view.result.stopReason, "waiting_on_active_task");
  assert.equal(view.result.stepsRun, 2);
  assert.deepEqual(
    view.result.steps.map((step) => ({ step: step.step, action: step.action, finalized: step.finalizedJobId, started: step.startedJobId })),
    [
      { step: 1, action: "finalized", finalized: "job-first", started: null },
      { step: 2, action: "started", finalized: null, started: "job-second" },
    ],
  );
  assert.equal(view.result.triage.actionCounts.finalized, 1);
  assert.equal(view.result.triage.actionCounts.started, 1);
  assert.deepEqual(view.result.triage.finalizedJobIds, ["job-first"]);
  assert.deepEqual(view.result.triage.startedJobIds, ["job-second"]);
  assert.equal(view.result.finalInspection.summary.activeJob?.id, "job-second");
});

test("queue session can finalize active work, skip invalid queued work, and start the next eligible job", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueSessionRepo("queue-session-skip-invalid-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-session-complete",
        goal: "Terminal job before the bounded session continues",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["This job is completed before the bounded session run"],
      },
      {
        id: "job-session-invalid",
        goal: "Invalid queued work that should be blocked and skipped",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: [],
      },
      {
        id: "job-session-eligible",
        goal: "Eligible queued work after the invalid item",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Session should still reach this later eligible job"],
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant" });
  await finalizeTaskPass(taskUpdate, started.details.linkedTask.id, ".pi/agent/extensions/queue-runner.ts");

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 5 });

  assert.equal(view.result.stopReason, "waiting_on_active_task");
  assert.equal(view.result.stepsRun, 2);
  assert.equal(view.result.steps[0]?.action, "finalized");
  assert.equal(view.result.steps[1]?.action, "started");
  assert.deepEqual(view.result.steps[1]?.blockedJobIds, ["job-session-invalid"]);
  assert.equal(view.result.finalInspection.summary.activeJob?.id, "job-session-eligible");
  assert.deepEqual(view.result.triage.blockedJobIds, ["job-session-invalid"]);
  assert.equal(view.result.triage.actionCounts.finalized, 1);
  assert.equal(view.result.triage.actionCounts.started, 1);
});

test("queue session keeps previously blocked and failed jobs visible while starting new work", async () => {
  const { cwd } = await setupQueueSessionRepo("queue-session-visible-failures-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-already-blocked",
        goal: "Blocked work from a previous session",
        priority: "high",
        status: "blocked",
      },
      {
        id: "job-already-failed",
        goal: "Failed work from a previous session",
        priority: "high",
        status: "failed",
      },
      {
        id: "job-new-work",
        goal: "Fresh queued work after previous terminal states",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["New work should still start while prior blocked/failed items remain visible"],
      },
    ],
  });

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 5 });

  assert.equal(view.result.stopReason, "waiting_on_active_task");
  assert.equal(view.result.finalInspection.summary.activeJob?.id, "job-new-work");
  assert.deepEqual(view.result.finalInspection.summary.blockedJobIds, ["job-already-blocked"]);
  assert.deepEqual(view.result.finalInspection.summary.failedJobIds, ["job-already-failed"]);
  assert.equal(view.result.triage.nextAction, "inspect_active_task");
});

test("queue session stops immediately when the queue is already paused and recommends resume when work remains", async () => {
  const { cwd } = await setupQueueSessionRepo("queue-session-paused-");

  await writeQueue(cwd, {
    version: 1,
    paused: true,
    activeJobId: null,
    jobs: [
      {
        id: "job-paused-session",
        goal: "Queued work that should not run while paused",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Paused queue should stop the bounded session before any step"],
      },
    ],
  });

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 5 });
  const rendered = renderHarnessQueueSession(view);

  assert.equal(view.result.stopReason, "queue_paused");
  assert.equal(view.result.stepsRun, 0);
  assert.equal(view.result.triage.queuedJobsRemaining, 1);
  assert.equal(view.result.triage.nextAction, "resume_queue");
  assert.match(rendered, /recommended next action: resume_queue/);
});

test("queue session exposes recovery-action visibility after finalizing a failed active job", async () => {
  const { cwd, taskUpdate } = await setupQueueSessionRepo("queue-session-recovery-action-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-recovery-visible",
        goal: "Recovery action should be visible in session triage",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/recovery-runtime.ts"],
        acceptanceCriteria: ["Session triage should expose the bounded recovery recommendation"],
      },
    ],
  });

  const startedView = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 5 });
  const linkedTaskId = startedView.result.finalInspection.summary.activeTask?.id;
  assert.ok(linkedTaskId, "expected active task id after the first bounded session start");

  await finalizeTaskFail(taskUpdate, linkedTaskId!, ".pi/agent/extensions/recovery-runtime.ts");

  const finalizedView = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 5 });

  assert.equal(finalizedView.result.stopReason, "idle");
  assert.deepEqual(finalizedView.result.triage.recoveryActions, ["retry_same_lane"]);
  assert.deepEqual(finalizedView.result.finalInspection.summary.failedJobIds, ["job-recovery-visible"]);
  assert.equal(finalizedView.result.triage.nextAction, "review_failed_jobs");

  const queueState = await readQueue(cwd);
  assert.equal(queueState.jobs[0]?.lastRecoveryAction, "retry_same_lane");
});

test("scheduled-workflow-created jobs can move into bounded queue sessions with preserved provenance", async () => {
  const { cwd } = await setupQueueSessionRepo("queue-session-scheduled-");
  const now = new Date("2026-04-27T16:30:00.000Z");

  const materialized = await materializeScheduledWorkflows({
    cwd,
    now,
    workflowIds: ["repo-audit-run"],
    apply: true,
  });

  assert.deepEqual(materialized.createdJobIds, ["scheduled-repo-audit-run-2026-04-27"]);

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 60, recentLimit: 5 });
  const queueState = await readQueue(cwd);
  const scheduledJob = queueState.jobs.find((job) => job.id === "scheduled-repo-audit-run-2026-04-27");

  assert.equal(view.result.stopReason, "waiting_on_active_task");
  assert.equal(view.result.triage.startedJobIds[0], "scheduled-repo-audit-run-2026-04-27");
  assert.equal(view.result.finalInspection.summary.activeJob?.id, "scheduled-repo-audit-run-2026-04-27");
  assert.equal(scheduledJob?.scheduledWorkflowId, "repo-audit-run");
  assert.equal(scheduledJob?.scheduledRunKey, "2026-04-27");
});

test("queue session respects max-step limits instead of continuing implicitly", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueSessionRepo("queue-session-max-steps-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-first-limit",
        goal: "First queue session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["First job completes before the bounded session reaches the limit"],
      },
      {
        id: "job-second-limit",
        goal: "Second queue session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Second job should remain queued when maxSteps is hit"],
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant" });
  await finalizeTaskPass(taskUpdate, started.details.linkedTask.id, ".pi/agent/extensions/queue-runner.ts");

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 1, maxRuntimeSeconds: 60, recentLimit: 5 });

  assert.equal(view.result.stopReason, "max_steps_reached");
  assert.equal(view.result.stepsRun, 1);
  assert.equal(view.result.steps[0]?.action, "finalized");
  assert.equal(view.result.finalInspection.summary.activeJob, null);
  assert.equal(view.result.finalInspection.summary.jobCounts.queued, 1);
  assert.equal(view.result.triage.queuedJobsRemaining, 1);
  assert.equal(view.result.triage.nextAction, "rerun_bounded_session");
});

test("queue session respects maxRuntimeSeconds before a second step can begin", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueSessionRepo("queue-session-max-runtime-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-first-runtime",
        goal: "First runtime-bound queue session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["First job completes before the runtime boundary is hit"],
      },
      {
        id: "job-second-runtime",
        goal: "Second runtime-bound queue session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Second job should still be queued when maxRuntimeSeconds is reached"],
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant" });
  await finalizeTaskPass(taskUpdate, started.details.linkedTask.id, ".pi/agent/extensions/queue-runner.ts");

  const originalNow = Date.now;
  const timestamps = [1000, 1000, 3500, 3500, 3500, 3500];
  Date.now = () => timestamps.shift() ?? 3500;

  try {
    const view = await buildHarnessQueueSession({ cwd, maxSteps: 5, maxRuntimeSeconds: 1, recentLimit: 5 });

    assert.equal(view.result.stopReason, "max_runtime_reached");
    assert.equal(view.result.stepsRun, 1);
    assert.equal(view.result.steps[0]?.action, "finalized");
    assert.equal(view.result.finalInspection.summary.activeJob, null);
    assert.equal(view.result.triage.queuedJobsRemaining, 1);
    assert.equal(view.result.triage.nextAction, "rerun_bounded_session");
  } finally {
    Date.now = originalNow;
  }
});

test("queue session triage recommends blocked-job review when the session ends on blocked queue state", async () => {
  const { cwd } = await setupQueueSessionRepo("queue-session-blocked-");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-blocked-session",
        goal: "Blocked queue session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: [],
      },
    ],
  });

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 3, maxRuntimeSeconds: 60, recentLimit: 5 });
  const rendered = renderHarnessQueueSession(view);

  assert.equal(view.result.stopReason, "blocked");
  assert.equal(view.result.triage.nextAction, "review_blocked_jobs");
  assert.deepEqual(view.result.triage.blockedJobIds, ["job-blocked-session"]);
  assert.match(rendered, /recommended next action: review_blocked_jobs/);
  assert.match(rendered, /blocked\/touched jobs: job-blocked-session/);
});
