import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { materializeTaskQueueJob, readQueueState } from "../../.pi/agent/extensions/queue-runner.ts";
import { writeTaskState, type TaskRecord } from "../../.pi/agent/extensions/till-done.ts";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function makeRepo(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function queuedImplementationTask(id: string): TaskRecord {
  const now = "2026-05-16T00:00:00.000Z";
  return {
    id,
    title: "Risk 1: Add safe queue enqueue/materialization seam",
    owner: "orchestrator",
    status: "queued",
    taskClass: "implementation",
    acceptance: [
      "Add or identify an approved queue materialization API/tool; do not directly edit runtime JSON.",
      "Prove exactly one selected risk task can become a queued MO-compatible job.",
    ],
    evidence: [],
    dependencies: [],
    retryCount: 0,
    validation: {
      tier: "standard",
      decision: "pending",
      source: null,
      checklist: null,
      approvalRef: null,
      updatedAt: null,
    },
    notes: ["Planning-ready risk task fixture."],
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

test("materializes one planning-ready task into exactly one MO-compatible queue job", async () => {
  const cwd = await makeRepo("task-queue-materialize-");
  const task = queuedImplementationTask("task-risk-1");
  await writeTaskState(cwd, { version: 1, activeTaskId: null, tasks: [task] });

  const first = await materializeTaskQueueJob(cwd, {
    taskId: task.id,
    jobId: "queue-risk-1",
    initiativeId: "phase-c1-risks",
    allowedPaths: [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/task-queue-materialization.test.ts"],
    assignedRole: "backend_worker",
    workType: "implementation",
    domains: ["infra"],
    maxRuntimeMinutes: 15,
    validationCommands: ["npm run test:queue-materialization"],
    tddSlice: {
      firstTracerBehavior: "A planning-ready risk task becomes one queued MO-compatible job.",
      publicInterface: "materializeTaskQueueJob(cwd, input)",
      testSurface: ["tests/extension-units/task-queue-materialization.test.ts"],
      boundaryDependencies: ["runtime task state", "runtime queue state"],
      mockPlan: "Use temp runtime state files; do not touch live runtime state.",
      outOfScopeBehaviors: ["worker execution", "PR creation", "merge"],
    },
  });

  assert.equal(first.created, true);
  assert.equal(first.job.id, "queue-risk-1");
  assert.equal(first.job.status, "queued");
  assert.equal(first.job.linkedTaskId, task.id);
  assert.equal(first.job.queueJobSource?.kind, "task-materialization");
  assert.equal(first.job.queueJobSource?.initiativeId, "phase-c1-risks");
  assert.equal(first.job.queueJobSource?.issueId, task.id);
  assert.deepEqual(first.job.acceptanceCriteria, task.acceptance);
  assert.deepEqual(first.job.allowedPaths, [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/task-queue-materialization.test.ts"]);
  assert.equal(first.job.assignedRole, "backend_worker");
  assert.equal(first.job.workType, "implementation");
  assert.deepEqual(first.job.validationCommands, ["npm run test:queue-materialization"]);
  assert.equal(first.job.tddSlice?.firstTracerBehavior, "A planning-ready risk task becomes one queued MO-compatible job.");
  assert.equal(first.job.budget?.maxRuntimeMinutes, 15);
  assert.deepEqual(first.job.stop_conditions, ["approval_boundary_hit"]);

  const duplicate = await materializeTaskQueueJob(cwd, {
    taskId: task.id,
    jobId: "queue-risk-1-duplicate",
    initiativeId: "phase-c1-risks",
    allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
    assignedRole: "backend_worker",
    workType: "implementation",
    maxRuntimeMinutes: 15,
  });

  assert.equal(duplicate.created, false);
  assert.equal(duplicate.job.id, "queue-risk-1");

  const queue = await readQueueState(cwd);
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0]?.id, "queue-risk-1");
});

test("materialization requires explicit job id and runtime bound", async () => {
  const cwd = await makeRepo("task-queue-materialize-required-");
  const task = queuedImplementationTask("task-risk-required");
  await writeTaskState(cwd, { version: 1, activeTaskId: null, tasks: [task] });

  await assert.rejects(
    materializeTaskQueueJob(cwd, {
      taskId: task.id,
      allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
      assignedRole: "backend_worker",
      workType: "implementation",
      maxRuntimeMinutes: 15,
    }),
    /jobId is required/,
  );

  await assert.rejects(
    materializeTaskQueueJob(cwd, {
      taskId: task.id,
      jobId: "queue-risk-required",
      allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
      assignedRole: "backend_worker",
      workType: "implementation",
    }),
    /maxRuntimeMinutes is required/,
  );
});

test("materialization rejects queue job id collisions for different tasks", async () => {
  const cwd = await makeRepo("task-queue-materialize-collision-");
  const firstTask = queuedImplementationTask("task-risk-1");
  const secondTask = queuedImplementationTask("task-risk-2");
  await writeTaskState(cwd, { version: 1, activeTaskId: null, tasks: [firstTask, secondTask] });

  await materializeTaskQueueJob(cwd, {
    taskId: firstTask.id,
    jobId: "queue-risk-shared",
    allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
    assignedRole: "backend_worker",
    workType: "implementation",
    maxRuntimeMinutes: 15,
  });

  await assert.rejects(
    materializeTaskQueueJob(cwd, {
      taskId: secondTask.id,
      jobId: "queue-risk-shared",
      allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
      assignedRole: "backend_worker",
      workType: "implementation",
      maxRuntimeMinutes: 15,
    }),
    /Queue job id already exists: queue-risk-shared/,
  );

  const queue = await readQueueState(cwd);
  assert.equal(queue.jobs.length, 1);
});

test("harness-task-queue-materialize CLI wires the materializer as a non-test entry point", async () => {
  const cwd = await makeRepo("task-queue-materialize-cli-");
  const task = queuedImplementationTask("task-risk-cli");
  await writeTaskState(cwd, { version: 1, activeTaskId: null, tasks: [task] });

  const { stdout } = await execFile(
    process.execPath,
    [
      "--import",
      "tsx",
      join(repoRoot, "scripts/harness-task-queue-materialize.ts"),
      "--cwd",
      cwd,
      "--task-id",
      task.id,
      "--job-id",
      "queue-risk-cli",
      "--initiative",
      "phase-c1-risks",
      "--allowed-path",
      ".pi/agent/extensions/queue-runner.ts",
      "--assigned-role",
      "backend_worker",
      "--work-type",
      "implementation",
      "--domain",
      "infra",
      "--validation-command",
      "npm run test:task-queue-materialization",
      "--max-runtime-minutes",
      "15",
      "--json",
    ],
    { cwd: repoRoot },
  );

  const result = JSON.parse(stdout) as {
    created: boolean;
    job: {
      id: string;
      linkedTaskId?: string;
      queueJobSource?: { kind?: string; taskId?: string };
      tddSlice?: { firstTracerBehavior?: string };
    };
  };
  assert.equal(result.created, true);
  assert.equal(result.job.id, "queue-risk-cli");
  assert.equal(result.job.linkedTaskId, task.id);
  assert.equal(result.job.queueJobSource?.kind, "task-materialization");
  assert.equal(result.job.queueJobSource?.taskId, task.id);
  assert.match(String(result.job.tddSlice?.firstTracerBehavior), /Materialize queued task task-risk-cli/);

  const queue = await readQueueState(cwd);
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0]?.id, "queue-risk-cli");
});
