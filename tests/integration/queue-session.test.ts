import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import queueRunner from "../../.pi/agent/extensions/queue-runner.ts";
import tillDone from "../../.pi/agent/extensions/till-done.ts";
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
  assert.match(rendered, /Harness Queue Session/);
  assert.match(rendered, /stop reason: waiting_on_active_task/);
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

  await taskUpdate({ action: "evidence", id: linkedTaskId, evidence: ["Changed files: .pi/agent/extensions/queue-runner.ts"] });
  await taskUpdate({ action: "review", id: linkedTaskId, note: "Ready to finalize first job" });
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
  await taskUpdate({ action: "done", id: linkedTaskId, note: "First job completed before the bounded session run." });

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
  assert.equal(view.result.finalInspection.summary.activeJob?.id, "job-second");
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
  const linkedTaskId = started.details.linkedTask.id;

  await taskUpdate({ action: "evidence", id: linkedTaskId, evidence: ["Changed files: .pi/agent/extensions/queue-runner.ts"] });
  await taskUpdate({ action: "review", id: linkedTaskId, note: "Ready to finalize before max-step proof" });
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
  await taskUpdate({ action: "done", id: linkedTaskId, note: "First job completed before the bounded session run." });

  const view = await buildHarnessQueueSession({ cwd, maxSteps: 1, maxRuntimeSeconds: 60, recentLimit: 5 });

  assert.equal(view.result.stopReason, "max_steps_reached");
  assert.equal(view.result.stepsRun, 1);
  assert.equal(view.result.steps[0]?.action, "finalized");
  assert.equal(view.result.finalInspection.summary.activeJob, null);
  assert.equal(view.result.finalInspection.summary.jobCounts.queued, 1);
});
