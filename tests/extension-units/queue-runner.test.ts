import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadHandoffPolicy, generateHandoff } from "../../.pi/agent/extensions/handoffs.ts";
import { loadHarnessRoutingConfig } from "../../.pi/agent/extensions/harness-routing.ts";
import queueRunner, { readQueueState } from "../../.pi/agent/extensions/queue-runner.ts";
import { loadPacketPolicy, generateTaskPacket } from "../../.pi/agent/extensions/task-packets.ts";
import { loadTeamDefinitions } from "../../.pi/agent/extensions/team-activation.ts";
import tillDone from "../../.pi/agent/extensions/till-done.ts";
import { FakePi, copyFixtureRepoFile, makeCtx, makeTempRepo, readAuditLog } from "./test-utils.ts";

async function setupQueueRunnerRepo() {
  const cwd = await makeTempRepo("queue-runner-");
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
  ]) {
    await copyFixtureRepoFile(cwd, relativePath);
  }

  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "queue.json"),
    JSON.stringify(
      {
        version: 1,
        paused: false,
        activeJobId: null,
        jobs: [],
      },
      null,
      2,
    ),
  );

  const pi = new FakePi("feat/harness-032-tests");
  tillDone(pi as any);
  queueRunner(pi as any);

  const queueTool = pi.getTool("run_next_queue_job");
  const queueCompatTool = pi.getTool("run_queue_once");
  const taskTool = pi.getTool("task_update");
  const inspectTool = pi.getTool("inspect_queue_state");
  const pauseTool = pi.getTool("pause_queue");
  const resumeTool = pi.getTool("resume_queue");
  const stopTool = pi.getTool("stop_queue_safely");
  const sessionTool = pi.getTool("run_bounded_queue_session");

  const runNextQueueJob = async (params: Record<string, unknown> = {}) =>
    queueTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const runQueueOnceCompat = async (params: Record<string, unknown> = {}) =>
    queueCompatTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const taskUpdate = async (params: Record<string, unknown>) =>
    taskTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));

  async function inspectQueueStateForOperator(params = {}) {
    return inspectTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  }

  async function pauseQueueForOperator(params = {}) {
    return pauseTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  }

  async function resumeQueueForOperator(params = {}) {
    return resumeTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  }

  async function stopQueueSafelyForOperator(params = {}) {
    return stopTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  }

  async function runBoundedQueueSessionForOperator(params = {}) {
    return sessionTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  }

  return {
    cwd,
    pi,
    runNextQueueJob,
    runQueueOnceCompat,
    inspectQueueStateForOperator,
    pauseQueueForOperator,
    resumeQueueForOperator,
    stopQueueSafelyForOperator,
    runBoundedQueueSessionForOperator,
    taskUpdate,
  };
}

async function writeQueue(cwd: string, queue: unknown) {
  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
}

async function readTaskState(cwd: string) {
  const raw = await readFile(join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"), "utf8");
  return JSON.parse(raw) as {
    activeTaskId: string | null;
    tasks: Array<{ id: string; status: string; owner: string | null; dependencies?: string[]; notes?: string[] }>;
  };
}

async function createWorkerToQualityHandoff(cwd: string) {
  const [routingConfig, packetPolicy, handoffPolicy, teams] = await Promise.all([
    loadHarnessRoutingConfig(cwd),
    loadPacketPolicy(cwd),
    loadHandoffPolicy(cwd),
    loadTeamDefinitions(cwd),
  ]);

  const sourcePacket = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "job-build-source",
    parentTaskId: "task-build-source",
    parentPacketId: null,
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Implement source change for queue-runner quality start",
    goal: "Provide structured queue-to-quality runtime input.",
    scope: "Only inspect queue-runner and queue-runner unit-test files.",
    nonGoals: ["Do not redesign broader queue automation."],
    workType: "implementation",
    domains: ["backend"],
    filesToInspect: [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/queue-runner.test.ts"],
    filesToModify: [".pi/agent/extensions/queue-runner.ts"],
    allowedPaths: [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/queue-runner.test.ts"],
    acceptanceCriteria: ["Structured worker_to_quality input is available for the quality queue job."],
    expectedProof: ["Queue runner derives the quality packet from structured handoff data."],
    migrationPathNote: "Not applicable; keep the runtime change bounded to the existing queue-runner path.",
  }).packet;

  return generateHandoff(handoffPolicy, {
    handoffType: "worker_to_quality",
    sourcePacket,
    fromRole: "backend_worker",
    toRole: "quality_lead",
    changedFiles: [".pi/agent/extensions/queue-runner.ts"],
    unchangedInspected: ["tests/extension-units/queue-runner.test.ts"],
    acceptanceCoverage: ["Queue-runner structured quality start behavior is covered."],
    evidence: ["Validation output: PASS"],
    commandsRun: ["bash scripts/validate-queue-runner.sh --skip-live"],
    wiringVerification: ["worker_to_quality handoff preserves packet scope and changed-file context."],
    expectedProof: ["Quality packet uses structured changedFiles and sourcePacketId."],
    openQuestions: ["none"],
    validationQuestions: ["Does the quality packet stay inside the structured changed-file scope?"],
  }).handoff;
}

test("queue runner exposes run_next_queue_job and preserves run_queue_once as a compatibility alias", async () => {
  const { runNextQueueJob, runQueueOnceCompat } = await setupQueueRunnerRepo();

  const publicResult = await runNextQueueJob({ owner: "assistant" });
  const compatResult = await runQueueOnceCompat({ owner: "assistant" });

  assert.equal((publicResult as any).details.action, "noop");
  assert.equal((compatResult as any).details.action, "noop");
  assert.match(String((publicResult as any).details.reason), /No eligible queued jobs/);
});

test("queue runner no-ops when the queue is empty", async () => {
  const { runNextQueueJob } = await setupQueueRunnerRepo();

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;

  assert.equal(details.ok, true);
  assert.equal(details.action, "noop");
  assert.equal(details.activeJobId, null);
  assert.equal(details.startedJob, null);
  assert.deepEqual(details.blockedJobIds, []);
});

test("queue runner no-ops when the queue is paused", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: true,
    activeJobId: null,
    jobs: [
      {
        id: "job-paused",
        goal: "Do not start while paused",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["The queue runner should not start paused work"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.ok, true);
  assert.equal(details.action, "noop");
  assert.equal(details.queuePaused, true);
  assert.equal(queueState.jobs[0]?.status, "queued");
  assert.equal(queueState.activeJobId, null);
});


test("operator inspect queue state summarizes queue and task status", async function () {
  const { cwd, runNextQueueJob, inspectQueueStateForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-inspect",
        goal: "Inspect current operator state",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Operator summary shows the active queue and task state"],
      },
    ],
  });

  await runNextQueueJob({ owner: "assistant" });
  const inspectResult = await inspectQueueStateForOperator({ recentLimit: 3 });
  const details = inspectResult.details;

  assert.equal(details.summary.activeJob?.id, "job-inspect");
  assert.equal(details.summary.activeTask?.status, "in_progress");
  assert.equal(details.summary.jobCounts.running, 1);
  assert.equal(details.summary.taskCounts.in_progress, 1);
  assert.deepEqual(details.summary.recentJobIds, ["job-inspect"]);
});

test("operator pause and resume controls gate queue pickup", async function () {
  const { cwd, runNextQueueJob, pauseQueueForOperator, resumeQueueForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-pause-resume",
        goal: "Pause then resume queue pickup",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Paused queue does not start work until resumed"],
      },
    ],
  });

  const pauseResult = await pauseQueueForOperator({ note: "operator requested pause" });
  assert.equal(pauseResult.details.action, "paused");
  assert.equal(pauseResult.details.queuePaused, true);

  const pausedRun = await runNextQueueJob({ owner: "assistant" });
  assert.equal(pausedRun.details.action, "noop");
  assert.equal(pausedRun.details.queuePaused, true);

  const resumeResult = await resumeQueueForOperator({ note: "operator resumed work" });
  assert.equal(resumeResult.details.action, "resumed");
  assert.equal(resumeResult.details.queuePaused, false);

  const resumedRun = await runNextQueueJob({ owner: "assistant" });
  assert.equal(resumedRun.details.action, "started");
  assert.equal(resumedRun.details.startedJob.id, "job-pause-resume");
});

test("bounded queue session tool starts queued work and stops at the next waiting point", async function () {
  const { cwd, runBoundedQueueSessionForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-session-start",
        goal: "Start one bounded queue-session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Bounded queue session starts the queued job and then waits on task progress"],
      },
    ],
  });

  const result = await runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 5, maxRuntimeSeconds: 60 });
  const details = result.details;

  assert.equal(details.stopReason, "waiting_on_active_task");
  assert.equal(details.stepsRun, 1);
  assert.equal(details.steps[0]?.action, "started");
  assert.equal(details.finalInspection.summary.activeJob?.id, "job-session-start");
  assert.equal(details.triage.nextAction, "inspect_active_task");
  assert.equal(details.triage.actionCounts.started, 1);
});

test("bounded queue session can finalize visible terminal work and start the next queued job in one invocation", async function () {
  const { cwd, runNextQueueJob, runBoundedQueueSessionForOperator, taskUpdate } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-session-first",
        goal: "First bounded queue-session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["First job is terminal before the session continues"],
      },
      {
        id: "job-session-second",
        goal: "Second bounded queue-session job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Second job is started by the same bounded session"],
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant" });
  const linkedTaskId = started.details.linkedTask.id;
  await taskUpdate({ action: "evidence", id: linkedTaskId, evidence: ["Changed files: .pi/agent/extensions/queue-runner.ts"] });
  await taskUpdate({ action: "review", id: linkedTaskId, note: "Ready to finalize the first job" });
  await taskUpdate({
    action: "validate",
    id: linkedTaskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
  });
  await taskUpdate({ action: "done", id: linkedTaskId, note: "First job completed before the session run." });

  const result = await runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 5, maxRuntimeSeconds: 60 });
  const details = result.details;

  assert.equal(details.stopReason, "waiting_on_active_task");
  assert.equal(details.stepsRun, 2);
  assert.deepEqual(
    details.steps.map((step: any) => ({ step: step.step, action: step.action, finalized: step.finalizedJobId, started: step.startedJobId })),
    [
      { step: 1, action: "finalized", finalized: "job-session-first", started: null },
      { step: 2, action: "started", finalized: null, started: "job-session-second" },
    ],
  );
  assert.equal(details.triage.actionCounts.finalized, 1);
  assert.equal(details.triage.actionCounts.started, 1);
  assert.deepEqual(details.triage.finalizedJobIds, ["job-session-first"]);
  assert.deepEqual(details.triage.startedJobIds, ["job-session-second"]);
  assert.equal(details.finalInspection.summary.activeJob?.id, "job-session-second");
});

test("operator safe stop pauses queue and blocks the active linked task", async function () {
  const { cwd, runNextQueueJob, stopQueueSafelyForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-stop",
        goal: "Stop active queue work safely",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Safe stop blocks the active job and linked task"],
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const activeTaskId = start.details.startedJob.linkedTaskId;

  const stopResult = await stopQueueSafelyForOperator({ note: "operator ended run for review" });
  const details = stopResult.details;
  const queueState = await readQueueState(cwd);
  const taskState = await readTaskState(cwd);

  assert.equal(details.action, "stopped");
  assert.equal(details.queuePaused, true);
  assert.equal(details.stoppedJob.id, "job-stop");
  assert.equal(details.stoppedJob.status, "blocked");
  assert.equal(details.stoppedTask.id, activeTaskId);
  assert.equal(details.stoppedTask.status, "blocked");
  assert.equal(queueState.paused, true);
  assert.equal(queueState.activeJobId, null);
  assert.equal(taskState.activeTaskId, null);
  assert.equal(taskState.tasks[0]?.status, "blocked");
});

test("queue runner starts one eligible queued build job with linked task, packet, and initial handoff", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-start",
        goal: "Implement queue runner step",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queue runner starts exactly one queued job"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant", allowInitialHandoff: true });
  const details = (result as any).details;

  assert.equal(details.action, "started");
  assert.equal(details.startedJob.id, "job-start");
  assert.equal(details.startedJob.status, "running");
  assert.equal(details.activeJobId, "job-start");
  assert.equal(details.packet.assignedRole, "backend_worker");
  assert.equal(details.initialHandoff.handoffType, "build_to_worker");

  const taskState = await readTaskState(cwd);
  assert.equal(taskState.activeTaskId, details.startedJob.linkedTaskId);
  assert.equal(taskState.tasks[0]?.status, "in_progress");

  const queueState = await readQueueState(cwd);
  assert.equal(queueState.activeJobId, "job-start");
  assert.equal(queueState.jobs[0]?.packetId, details.packet.packetId);
});

test("queue runner can start a quality job from structured worker_to_quality input", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();
  const handoff = await createWorkerToQualityHandoff(cwd);

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-quality-structured",
        goal: "Run quality review from structured handoff input",
        priority: "high",
        status: "queued",
        team: "quality",
        assignedRole: "quality_lead",
        workType: "review_only",
        acceptanceCriteria: ["Queue runner starts a quality job from structured handoff fields"],
        qualityInput: {
          sourcePacketId: handoff.sourcePacketId,
          sourceHandoff: handoff,
        },
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.action, "started");
  assert.equal(details.packet.assignedTeam, "quality");
  assert.equal(details.packet.assignedRole, "quality_lead");
  assert.equal(details.packet.source.parentPacketId, handoff.sourcePacketId);
  assert.deepEqual(details.packet.allowedPaths, [
    ".pi/agent/extensions/queue-runner.ts",
    "tests/extension-units/queue-runner.test.ts",
  ]);
  assert.deepEqual(details.packet.filesToInspect, [
    ".pi/agent/extensions/queue-runner.ts",
    "tests/extension-units/queue-runner.test.ts",
  ]);
  assert.equal(details.initialHandoff, null);
  assert.equal(queueState.jobs[0]?.packetId, details.packet.packetId);
});

test("queue runner blocks a quality job when structured worker_to_quality input is missing", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-quality-missing-input",
        goal: "Try to start quality work without structured input",
        priority: "high",
        status: "queued",
        team: "quality",
        assignedRole: "quality_lead",
        workType: "review_only",
        acceptanceCriteria: ["Queue runner blocks missing structured quality input"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.action, "blocked");
  assert.match(String(details.reason), /structured worker_to_quality handoff/i);
  assert.equal(queueState.jobs[0]?.status, "blocked");
  assert.match((queueState.jobs[0]?.notes ?? []).join("\n"), /qualityInput/i);
});

test("queue runner does not start a new job while the active linked task is still non-terminal", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-running",
        goal: "Keep the current job active",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Do not start a second job while the first is still running"],
      },
      {
        id: "job-next",
        goal: "This should stay queued",
        priority: "medium",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["This job waits until the active job is terminal"],
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const activeTaskId = (start as any).details.startedJob.linkedTaskId as string;
  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const taskState = await readTaskState(cwd);
  const queueState = await readQueueState(cwd);

  assert.equal(details.ok, true);
  assert.equal(details.action, "noop");
  assert.equal(details.activeJobId, "job-running");
  assert.equal(details.linkedTask.id, activeTaskId);
  assert.equal(taskState.tasks.length, 1);
  assert.equal(queueState.jobs.find((job) => job.id === "job-next")?.status, "queued");
});

test("queue runner finalizes an active running job when its linked task reaches done", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-done",
        goal: "Finalize queue runner implementation",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queue runner finalizes done jobs"],
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const taskId = (start as any).details.startedJob.linkedTaskId as string;

  await taskUpdate({ action: "evidence", id: taskId, evidence: ["Changed files: .pi/agent/extensions/queue-runner.ts"] });
  await taskUpdate({ action: "review", id: taskId });
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
  await taskUpdate({ action: "done", id: taskId });

  const finalize = await runNextQueueJob({ owner: "assistant" });
  const details = (finalize as any).details;

  assert.equal(details.action, "finalized");
  assert.equal(details.finalizedJob.id, "job-done");
  assert.equal(details.finalizedJob.status, "done");
  assert.equal(details.activeJobId, null);

  const queueState = await readQueueState(cwd);
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "done");
});

test("queue runner finalizes a running job as blocked when its linked task becomes blocked and clears activeJobId", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-blocked",
        goal: "Block a running queue job from linked task state",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queue runner maps blocked linked tasks to blocked queue jobs"],
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const taskId = (start as any).details.startedJob.linkedTaskId as string;

  await taskUpdate({ action: "block", id: taskId, note: "human clarification required" });

  const finalize = await runNextQueueJob({ owner: "assistant" });
  const details = (finalize as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.action, "finalized");
  assert.equal(details.finalizedJob.status, "blocked");
  assert.equal(details.activeJobId, null);
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "blocked");
});

test("queue runner compensates safely when queue activation succeeds but linked task start fails", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  const dependency = await taskUpdate({
    action: "create",
    title: "blocked dependency",
    acceptance: ["Dependency stays blocked"],
  });
  const dependencyId = (dependency as any).details.task.id as string;
  await taskUpdate({ action: "claim", id: dependencyId, owner: "assistant" });
  await taskUpdate({ action: "block", id: dependencyId, note: "dependency remains blocked" });

  const linkedTask = await taskUpdate({
    action: "create",
    title: "prepared linked task",
    acceptance: ["This task should remain queued after compensation"],
    dependencies: [dependencyId],
  });
  const linkedTaskId = (linkedTask as any).details.task.id as string;

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-compensate",
        goal: "Compensate partial queue start safely",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queue runner blocks the queue job and clears activeJobId when final task start fails"],
        linkedTaskId,
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const taskState = await readTaskState(cwd);
  const compensatedTask = taskState.tasks.find((task) => task.id === linkedTaskId);

  assert.equal(details.action, "blocked");
  assert.equal(details.ok, false);
  assert.equal(details.activeJobId, null);
  assert.deepEqual(details.blockedJobIds, ["job-compensate"]);
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "blocked");
  assert.match(queueState.jobs[0]?.notes?.at(-1) ?? "", /compensated a partial start/i);
  assert.equal(taskState.activeTaskId, null);
  assert.equal(compensatedTask?.status, "queued");
});

test("queue runner blocks jobs without acceptance criteria and starts the next eligible job", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-missing-acceptance",
        goal: "Bad queued job",
        priority: "high",
        status: "queued",
        team: "build",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
      },
      {
        id: "job-valid",
        goal: "Good queued job",
        priority: "medium",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Runner skips invalid jobs and starts one valid job"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;

  assert.equal(details.action, "started");
  assert.deepEqual(details.blockedJobIds, ["job-missing-acceptance"]);
  assert.equal(details.startedJob.id, "job-valid");

  const queueState = await readQueueState(cwd);
  assert.equal(queueState.jobs.find((job) => job.id === "job-missing-acceptance")?.status, "blocked");
  assert.equal(queueState.jobs.find((job) => job.id === "job-valid")?.status, "running");
});


test("queue runner blocks unsupported budget fields and unsupported free-form stop_conditions but allows supported HARNESS-034 controls", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-unsupported-controls",
        goal: "Reject unsupported queue controls clearly",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Unsupported controls are blocked clearly before start"],
        budget: { maxCostUsd: 5, maxFilesChanged: 3 },
        stop_conditions: ["stop after first validation failure"],
      },
      {
        id: "job-supported-controls",
        goal: "Allow supported HARNESS-034 stop controls",
        priority: "medium",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Supported controls no longer trigger blanket HARNESS-032 deferral blocking"],
        budget: { maxRetries: 2, maxRuntimeMinutes: 30, maxFailedValidations: 1 },
        stop_conditions: ["approval_boundary_hit"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const blockedJob = queueState.jobs.find((job) => job.id === "job-unsupported-controls");
  const startedJob = queueState.jobs.find((job) => job.id === "job-supported-controls");

  assert.equal(details.action, "started");
  assert.deepEqual(details.blockedJobIds, ["job-unsupported-controls"]);
  assert.equal(details.startedJob.id, "job-supported-controls");
  assert.equal(blockedJob?.status, "blocked");
  assert.match(blockedJob?.notes?.at(-1) ?? "", /unsupported/i);
  assert.match(blockedJob?.notes?.at(-1) ?? "", /maxCostUsd/i);
  assert.match(blockedJob?.notes?.at(-1) ?? "", /maxFilesChanged/i);
  assert.match(blockedJob?.notes?.at(-1) ?? "", /stop after first validation failure/i);
  assert.equal(startedJob?.status, "running");
});

test("queue runner blocks queued approvalRequired jobs before start", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-approval-boundary",
        goal: "Respect approval boundary before start",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["approvalRequired queued jobs are blocked before they start"],
        approvalRequired: true,
        stop_conditions: ["approval_boundary_hit"],
      },
      {
        id: "job-after-approval-block",
        goal: "Start the next valid job",
        priority: "medium",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Runner continues after approval boundary block"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const blockedJob = queueState.jobs.find((job) => job.id === "job-approval-boundary");

  assert.equal(details.action, "started");
  assert.deepEqual(details.blockedJobIds, ["job-approval-boundary"]);
  assert.equal(details.startedJob.id, "job-after-approval-block");
  assert.equal(blockedJob?.status, "blocked");
  assert.match(blockedJob?.notes?.at(-1) ?? "", /approval boundary/i);
  assert.equal(queueState.activeJobId, "job-after-approval-block");
});

test("queue runner logs queued approval boundary blocks to the audit log", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-approval-log-block",
        goal: "Record approval boundary block",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["approval boundary blocks are visible in the audit log"],
        approvalRequired: true,
        stop_conditions: ["approval_boundary_hit"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const auditLog = await readAuditLog(cwd);
  const lastEntry = JSON.parse(auditLog.trim().split("\n").at(-1) ?? "{}");

  assert.equal(details.action, "blocked");
  assert.deepEqual(details.blockedJobIds, ["job-approval-log-block"]);
  assert.equal(lastEntry.action, "run_next_queue_job");
  assert.equal(lastEntry.result.action, "blocked");
  assert.deepEqual(lastEntry.result.blockedJobIds, ["job-approval-log-block"]);
  assert.equal(lastEntry.result.startedJobId, null);
});

test("queue runner fails queued retries that already exhausted maxRetries or maxFailedValidations before restart", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  const retriedTask = await taskUpdate({
    action: "create",
    title: "exhausted retry task",
    acceptance: ["Retry budget is already exhausted"],
  });
  const retriedTaskId = (retriedTask as any).details.task.id as string;
  await taskUpdate({ action: "claim", id: retriedTaskId, owner: "assistant" });
  await taskUpdate({ action: "start", id: retriedTaskId });
  await taskUpdate({ action: "evidence", id: retriedTaskId, evidence: ["Changed files: retry.ts"] });
  await taskUpdate({ action: "fail", id: retriedTaskId, note: "first attempt failed" });
  await taskUpdate({ action: "start", id: retriedTaskId });
  await taskUpdate({ action: "evidence", id: retriedTaskId, evidence: ["Changed files: retry.ts"] });
  await taskUpdate({ action: "fail", id: retriedTaskId, note: "second attempt failed" });

  const validationTask = await taskUpdate({
    action: "create",
    title: "exhausted validation task",
    acceptance: ["Validation failure budget is already exhausted"],
  });
  const validationTaskId = (validationTask as any).details.task.id as string;
  await taskUpdate({ action: "claim", id: validationTaskId, owner: "assistant" });
  await taskUpdate({ action: "start", id: validationTaskId });
  await taskUpdate({ action: "evidence", id: validationTaskId, evidence: ["Changed files: validation.ts"] });
  await taskUpdate({ action: "review", id: validationTaskId });
  await taskUpdate({
    action: "validate",
    id: validationTaskId,
    validationSource: "validator",
    validationDecision: "fail",
    validationChecklist: {
      acceptance: "met",
      tests: "not_met",
      diff_review: "met",
      evidence: "met",
    },
    note: "validator rejected the attempt",
  });

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-retry-exhausted",
        goal: "Do not restart after retry exhaustion",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queued job fails before restart when linked task retry budget is exhausted"],
        linkedTaskId: retriedTaskId,
        budget: { maxRetries: 1 },
      },
      {
        id: "job-validation-exhausted",
        goal: "Do not restart after validation failure exhaustion",
        priority: "medium",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queued job fails before restart when failed-validation budget is exhausted"],
        linkedTaskId: validationTaskId,
        budget: { maxFailedValidations: 1 },
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.action, "blocked");
  assert.deepEqual(details.blockedJobIds, ["job-retry-exhausted", "job-validation-exhausted"]);
  assert.equal(details.startedJob, null);

  const retryJob = queueState.jobs.find((job) => job.id === "job-retry-exhausted");
  const validationJob = queueState.jobs.find((job) => job.id === "job-validation-exhausted");
  assert.equal(retryJob?.status, "failed");
  assert.equal(validationJob?.status, "failed");
  assert.match(retryJob?.notes?.at(-1) ?? "", /maxRetries/i);
  assert.match(validationJob?.notes?.at(-1) ?? "", /maxFailedValidations/i);
});

test("queue runner treats retryCount plus the current validation fail as exhausting maxFailedValidations before restart", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  const validationTask = await taskUpdate({
    action: "create",
    title: "retry-aware validation exhaustion",
    acceptance: ["Retry count plus current validation failure exhausts the validation budget"],
  });
  const validationTaskId = (validationTask as any).details.task.id as string;
  await taskUpdate({ action: "claim", id: validationTaskId, owner: "assistant" });
  await taskUpdate({ action: "start", id: validationTaskId });
  await taskUpdate({ action: "evidence", id: validationTaskId, evidence: ["Changed files: validation.ts"] });
  await taskUpdate({ action: "fail", id: validationTaskId, note: "first implementation attempt failed" });
  await taskUpdate({ action: "start", id: validationTaskId });
  await taskUpdate({ action: "evidence", id: validationTaskId, evidence: ["Changed files: validation.ts"] });
  await taskUpdate({ action: "review", id: validationTaskId });
  await taskUpdate({
    action: "validate",
    id: validationTaskId,
    validationSource: "validator",
    validationDecision: "fail",
    validationChecklist: {
      acceptance: "met",
      tests: "not_met",
      diff_review: "met",
      evidence: "met",
    },
    note: "current validation failed after one retry",
  });

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-retry-aware-validation-exhausted",
        goal: "Do not restart when retryCount plus current validation fail reaches the limit",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queue runner fails the queued job before restart when retryCount + current validation fail exhausts the budget"],
        linkedTaskId: validationTaskId,
        budget: { maxFailedValidations: 2 },
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const validationJob = queueState.jobs.find((job) => job.id === "job-retry-aware-validation-exhausted");

  assert.equal(details.action, "blocked");
  assert.deepEqual(details.blockedJobIds, ["job-retry-aware-validation-exhausted"]);
  assert.equal(details.startedJob, null);
  assert.equal(validationJob?.status, "failed");
  assert.match(validationJob?.notes?.at(-1) ?? "", /retryCount plus the current validation failure/i);
});

test("queue runner allows restart when a single current validation fail is still below maxFailedValidations", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  const validationTask = await taskUpdate({
    action: "create",
    title: "single validation failure below threshold",
    acceptance: ["One current validation fail does not exhaust a budget of two failed validations"],
  });
  const validationTaskId = (validationTask as any).details.task.id as string;
  await taskUpdate({ action: "claim", id: validationTaskId, owner: "assistant" });
  await taskUpdate({ action: "start", id: validationTaskId });
  await taskUpdate({ action: "evidence", id: validationTaskId, evidence: ["Changed files: validation.ts"] });
  await taskUpdate({ action: "review", id: validationTaskId });
  await taskUpdate({
    action: "validate",
    id: validationTaskId,
    validationSource: "validator",
    validationDecision: "fail",
    validationChecklist: {
      acceptance: "met",
      tests: "not_met",
      diff_review: "met",
      evidence: "met",
    },
    note: "first validation failed but budget should remain",
  });

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-validation-budget-remaining",
        goal: "Restart when one failed validation remains within budget",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queue runner restarts the queued job when one failed validation remains below the budget"],
        linkedTaskId: validationTaskId,
        budget: { maxFailedValidations: 2 },
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const restartedJob = queueState.jobs.find((job) => job.id === "job-validation-budget-remaining");

  assert.equal(details.action, "started");
  assert.equal(details.startedJob.id, "job-validation-budget-remaining");
  assert.equal(details.startedJob.status, "running");
  assert.deepEqual(details.blockedJobIds, []);
  assert.equal(restartedJob?.status, "running");
  assert.equal(queueState.activeJobId, "job-validation-budget-remaining");
});

test("queue runner coordinates queue and linked task stop when approval boundary is hit on an active running job", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-running-approval-stop",
        goal: "Stop active job at approval boundary",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["approvalRequired active jobs block both queue and linked task together"],
        stop_conditions: ["approval_boundary_hit"],
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const startedJobId = (start as any).details.startedJob.id as string;
  const taskId = (start as any).details.startedJob.linkedTaskId as string;

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: startedJobId,
    jobs: [
      {
        ...(await readQueueState(cwd)).jobs[0],
        approvalRequired: true,
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const taskState = await readTaskState(cwd);
  const linkedTask = taskState.tasks.find((task) => task.id === taskId);

  assert.equal(details.action, "blocked");
  assert.equal(details.blockedJobIds[0], "job-running-approval-stop");
  assert.equal(details.activeJobId, null);
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "blocked");
  assert.equal(linkedTask?.status, "blocked");
  assert.match(queueState.jobs[0]?.notes?.at(-1) ?? "", /approval boundary/i);
  assert.match(linkedTask?.notes?.at(-1) ?? "", /approval boundary/i);
});

test("queue runner coordinates queue and linked task failure when active runtime exceeds maxRuntimeMinutes", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-runtime-stop",
        goal: "Stop active job when runtime budget is exceeded",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Exceeded runtime budget fails both queue and linked task together"],
        budget: { maxRuntimeMinutes: 1 },
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const startedJob = (start as any).details.startedJob;
  const taskId = startedJob.linkedTaskId as string;
  const queueStateAfterStart = await readQueueState(cwd);

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: startedJob.id,
    jobs: [
      {
        ...queueStateAfterStart.jobs[0],
        startedAt: "2000-01-01T00:00:00.000Z",
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const taskState = await readTaskState(cwd);
  const linkedTask = taskState.tasks.find((task) => task.id === taskId);

  assert.equal(details.action, "finalized");
  assert.equal(details.finalizedJob.status, "failed");
  assert.equal(details.activeJobId, null);
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "failed");
  assert.equal(linkedTask?.status, "failed");
  assert.match(queueState.jobs[0]?.notes?.at(-1) ?? "", /maxRuntimeMinutes/i);
  assert.match(linkedTask?.notes?.at(-1) ?? "", /maxRuntimeMinutes/i);
});

test("queue runner selects the next queued job deterministically by existing order within the same priority", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-first",
        goal: "First queued high-priority job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["The first high-priority job should start first"],
      },
      {
        id: "job-second",
        goal: "Second queued high-priority job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["The second job should remain queued on the first step"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.action, "started");
  assert.equal(details.startedJob.id, "job-first");
  assert.equal(queueState.jobs[0]?.status, "running");
  assert.equal(queueState.jobs[1]?.status, "queued");
});

test("queue runner finalizes failed jobs with a bounded recovery recommendation", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-fail",
        goal: "Recover from a failing queue job",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Runner reuses recovery-runtime semantics on failure"],
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const taskId = (start as any).details.startedJob.linkedTaskId as string;

  await taskUpdate({ action: "evidence", id: taskId, evidence: ["reports/validation/failure.md"] });
  await taskUpdate({ action: "fail", id: taskId, note: "validator rejected the first attempt" });

  const finalize = await runNextQueueJob({ owner: "assistant" });
  const details = (finalize as any).details;

  assert.equal(details.action, "finalized");
  assert.equal(details.finalizedJob.status, "failed");
  assert.equal(details.recoveryDecision.recommendedAction, "retry_same_lane");
  assert.equal(details.recoveryDecision.haltAutonomy, false);
});
