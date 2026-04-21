import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import queueRunner, { readQueueState } from "../../.pi/agent/extensions/queue-runner.ts";
import tillDone from "../../.pi/agent/extensions/till-done.ts";
import { FakePi, copyFixtureRepoFile, makeCtx, makeTempRepo } from "./test-utils.ts";

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

  const runNextQueueJob = async (params: Record<string, unknown> = {}) =>
    queueTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const runQueueOnceCompat = async (params: Record<string, unknown> = {}) =>
    queueCompatTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const taskUpdate = async (params: Record<string, unknown>) =>
    taskTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));

  return { cwd, pi, runNextQueueJob, runQueueOnceCompat, taskUpdate };
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

test("queue runner blocks unsupported budget and stop_conditions controls instead of silently ignoring them", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-deferred-controls",
        goal: "Do not silently ignore budget controls",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Jobs with deferred budget enforcement are blocked clearly"],
        budget: { maxRetries: 1 },
        stop_conditions: ["stop after first validation failure"],
      },
      {
        id: "job-after-budget-block",
        goal: "Start the next valid job after deferred controls are blocked",
        priority: "medium",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["The runner should continue after blocking unsupported controls"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const blockedJob = queueState.jobs.find((job) => job.id === "job-deferred-controls");

  assert.equal(details.action, "started");
  assert.deepEqual(details.blockedJobIds, ["job-deferred-controls"]);
  assert.equal(details.startedJob.id, "job-after-budget-block");
  assert.equal(blockedJob?.status, "blocked");
  assert.match(blockedJob?.notes?.at(-1) ?? "", /HARNESS-034/);
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
