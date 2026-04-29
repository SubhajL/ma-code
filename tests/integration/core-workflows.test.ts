import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadHandoffPolicy, generateHandoff } from "../../.pi/agent/extensions/handoffs.ts";
import { loadHarnessRoutingConfig } from "../../.pi/agent/extensions/harness-routing.ts";
import queueRunner, { readQueueState } from "../../.pi/agent/extensions/queue-runner.ts";
import recoveryRuntime from "../../.pi/agent/extensions/recovery-runtime.ts";
import safeBash from "../../.pi/agent/extensions/safe-bash.ts";
import { loadPacketPolicy, generateTaskPacket } from "../../.pi/agent/extensions/task-packets.ts";
import { loadTeamDefinitions } from "../../.pi/agent/extensions/team-activation.ts";
import tillDone from "../../.pi/agent/extensions/till-done.ts";
import { FakePi, copyFixtureRepoFile, makeCtx, makeTempRepo } from "../extension-units/test-utils.ts";

async function setupCoreWorkflowRepo() {
  const cwd = await makeTempRepo("core-workflows-");
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

  const pi = new FakePi("feat/harness-038-core-workflows");
  tillDone(pi as any);
  queueRunner(pi as any);
  recoveryRuntime(pi as any);
  safeBash(pi as any);

  const taskTool = pi.getTool("task_update");
  const queueTool = pi.getTool("run_next_queue_job");
  const recoveryTool = pi.getTool("resolve_recovery_runtime_decision");
  const toolCallHandler = pi.getHandler("tool_call");

  const taskUpdate = async (params: Record<string, unknown>) =>
    taskTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const runNextQueueJob = async (params: Record<string, unknown> = {}) =>
    queueTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const resolveRecoveryRuntimeDecision = async (params: Record<string, unknown>) =>
    recoveryTool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  const runToolCallGuard = async (event: { toolName: string; input: Record<string, unknown> }) =>
    toolCallHandler(event, makeCtx(cwd));

  return { cwd, taskUpdate, runNextQueueJob, resolveRecoveryRuntimeDecision, runToolCallGuard };
}

async function writeQueue(cwd: string, queue: unknown) {
  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
}

async function readTaskState(cwd: string) {
  const raw = await readFile(join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"), "utf8");
  return JSON.parse(raw) as {
    activeTaskId: string | null;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      taskClass: string;
      notes?: string[];
      validation: { decision: string; source: string | null };
    }>;
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
    title: "Implement source change for quality review",
    goal: "Provide structured build output for a bounded quality transition.",
    scope: "Only inspect queue-runner and core-workflow proof files for the quality transition.",
    nonGoals: ["Do not broaden into recovery or scheduler redesign."],
    workType: "implementation",
    domains: ["backend"],
    filesToInspect: [".pi/agent/extensions/queue-runner.ts", "tests/integration/core-workflows.test.ts"],
    filesToModify: [".pi/agent/extensions/queue-runner.ts"],
    allowedPaths: [".pi/agent/extensions/queue-runner.ts", "tests/integration/core-workflows.test.ts"],
    acceptanceCriteria: ["Structured queue-to-quality input stays bounded and reviewable."],
    expectedProof: ["A queued quality job can start from structured worker_to_quality input."],
    migrationPathNote: "Not applicable; keep the change in the existing queue-runner quality transition.",
  }).packet;

  return generateHandoff(handoffPolicy, {
    handoffType: "worker_to_quality",
    sourcePacket,
    fromRole: "backend_worker",
    toRole: "quality_lead",
    changedFiles: [".pi/agent/extensions/queue-runner.ts"],
    unchangedInspected: ["tests/integration/core-workflows.test.ts"],
    acceptanceCoverage: ["Structured queue-to-quality start path is covered."],
    evidence: ["Validation output: PASS"],
    commandsRun: ["bash scripts/validate-core-workflows.sh"],
    wiringVerification: ["worker_to_quality preserves packet scope and changed-file context."],
    expectedProof: ["Quality packet derives inspect scope from structured handoff data."],
    openQuestions: ["none"],
    validationQuestions: ["Does the quality packet stay inside the structured changed-file scope?"],
  }).handoff;
}

test("docs-only workflow allows lighter review validation and completion", async () => {
  const { cwd, taskUpdate } = await setupCoreWorkflowRepo();

  const created = await taskUpdate({
    action: "create",
    title: "Docs-only workflow proof",
    owner: "assistant",
    taskClass: "docs",
    acceptance: ["Update docs with a bounded clarification"],
  });
  const taskId = created.details.task.id;

  await taskUpdate({ action: "claim", id: taskId, owner: "assistant" });
  await taskUpdate({ action: "start", id: taskId, owner: "assistant" });
  await taskUpdate({ action: "evidence", id: taskId, evidence: ["Changed files: README.md"] });
  await taskUpdate({ action: "review", id: taskId, note: "Ready for lightweight docs review" });
  await taskUpdate({
    action: "validate",
    id: taskId,
    validationSource: "review",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "not_applicable",
      diff_review: "not_applicable",
      evidence: "met",
    },
  });
  const done = await taskUpdate({ action: "done", id: taskId, note: "Docs-only workflow completed." });
  const taskState = await readTaskState(cwd);

  assert.equal(done.details.task.status, "done");
  assert.equal(taskState.tasks[0]?.taskClass, "docs");
  assert.equal(taskState.tasks[0]?.validation.decision, "pass");
});

test("implementation workflow can start from the queue, pass validation, and finalize cleanly", async () => {
  const { cwd, taskUpdate, runNextQueueJob } = await setupCoreWorkflowRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-implementation-pass",
        goal: "Implement a bounded runtime change",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Implementation completes with validator approval"],
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant", allowInitialHandoff: true });
  const linkedTaskId = started.details.linkedTask.id;

  await taskUpdate({ action: "evidence", id: linkedTaskId, evidence: ["Changed files: .pi/agent/extensions/queue-runner.ts"] });
  await taskUpdate({ action: "review", id: linkedTaskId, note: "Implementation ready for validation" });
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
  await taskUpdate({ action: "done", id: linkedTaskId, note: "Implementation passed validation." });

  const finalized = await runNextQueueJob({ owner: "assistant" });
  const queueState = await readQueueState(cwd);

  assert.equal(started.details.action, "started");
  assert.equal(finalized.details.action, "finalized");
  assert.equal(finalized.details.finalizedJob.status, "done");
  assert.equal(finalized.details.recoveryDecision, null);
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "done");
});

test("validation fail workflow keeps the failed task visible with validator evidence", async () => {
  const { cwd, taskUpdate } = await setupCoreWorkflowRepo();

  const created = await taskUpdate({
    action: "create",
    title: "Implementation validation fail",
    owner: "assistant",
    taskClass: "implementation",
    acceptance: ["Demonstrate failed validator flow"],
  });
  const taskId = created.details.task.id;

  await taskUpdate({ action: "claim", id: taskId, owner: "assistant" });
  await taskUpdate({ action: "start", id: taskId, owner: "assistant" });
  await taskUpdate({ action: "evidence", id: taskId, evidence: ["Changed files: impl.ts", "Validation output: tests failed"] });
  await taskUpdate({ action: "review", id: taskId, note: "Validator should reject this change" });
  const failed = await taskUpdate({
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
    note: "tests failed",
  });
  const taskState = await readTaskState(cwd);

  assert.equal(failed.details.task.status, "failed");
  assert.equal(taskState.tasks[0]?.validation.decision, "fail");
  assert.match((taskState.tasks[0]?.notes ?? []).join("\n"), /tests failed/i);
});

test("quality workflow can start from a queued structured worker_to_quality handoff", async () => {
  const { cwd, runNextQueueJob } = await setupCoreWorkflowRepo();
  const handoff = await createWorkerToQualityHandoff(cwd);

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-quality-structured",
        goal: "Run bounded quality review from structured handoff input",
        priority: "high",
        status: "queued",
        team: "quality",
        assignedRole: "quality_lead",
        workType: "review_only",
        acceptanceCriteria: ["Quality job starts from structured worker_to_quality input"],
        qualityInput: {
          sourcePacketId: handoff.sourcePacketId,
          sourceHandoff: handoff,
        },
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant" });

  assert.equal(started.details.action, "started");
  assert.equal(started.details.packet.assignedTeam, "quality");
  assert.equal(started.details.packet.assignedRole, "quality_lead");
  assert.equal(started.details.packet.source.parentPacketId, handoff.sourcePacketId);
  assert.deepEqual(started.details.packet.allowedPaths, [
    ".pi/agent/extensions/queue-runner.ts",
    "tests/integration/core-workflows.test.ts",
  ]);
  assert.deepEqual(started.details.packet.filesToInspect, [
    ".pi/agent/extensions/queue-runner.ts",
    "tests/integration/core-workflows.test.ts",
  ]);
  assert.equal(started.details.initialHandoff, null);
});

test("quality queue job blocks when structured worker_to_quality input is missing", async () => {
  const { cwd, runNextQueueJob } = await setupCoreWorkflowRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-quality-missing-input",
        goal: "Try to run quality review without structured handoff input",
        priority: "high",
        status: "queued",
        team: "quality",
        assignedRole: "quality_lead",
        workType: "review_only",
        acceptanceCriteria: ["Runtime should block missing structured quality input"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const queueState = await readQueueState(cwd);

  assert.equal(result.details.action, "blocked");
  assert.match(String(result.details.reason), /structured worker_to_quality handoff/i);
  assert.equal(queueState.jobs[0]?.status, "blocked");
  assert.match((queueState.jobs[0]?.notes ?? []).join("\n"), /qualityInput/i);
});

test("recovery path finalizes a failed queue job with a bounded retry recommendation", async () => {
  const { cwd, taskUpdate, runNextQueueJob } = await setupCoreWorkflowRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-recovery",
        goal: "Exercise recovery flow",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/recovery-runtime.ts"],
        acceptanceCriteria: ["Failure is finalized with a bounded next action"],
      },
    ],
  });

  const started = await runNextQueueJob({ owner: "assistant" });
  const linkedTaskId = started.details.linkedTask.id;

  await taskUpdate({ action: "evidence", id: linkedTaskId, evidence: ["Changed files: .pi/agent/extensions/recovery-runtime.ts"] });
  await taskUpdate({ action: "review", id: linkedTaskId, note: "Validator should reject the first attempt" });
  await taskUpdate({
    action: "validate",
    id: linkedTaskId,
    validationSource: "validator",
    validationDecision: "fail",
    validationChecklist: {
      acceptance: "met",
      tests: "not_met",
      diff_review: "met",
      evidence: "met",
    },
    note: "tests failed on first attempt",
  });

  const finalized = await runNextQueueJob({ owner: "assistant" });
  const queueState = await readQueueState(cwd);

  assert.equal(finalized.details.action, "finalized");
  assert.equal(finalized.details.finalizedJob.status, "failed");
  assert.equal(finalized.details.recoveryDecision.recommendedAction, "retry_same_lane");
  assert.equal(finalized.details.recoveryDecision.haltAutonomy, false);
  assert.equal(queueState.jobs[0]?.lastRecoveryAction, "retry_same_lane");
});

test("provider/tool block workflow exercises safe-bash blocking and bounded recovery guidance", async () => {
  const { cwd, taskUpdate, resolveRecoveryRuntimeDecision, runToolCallGuard } = await setupCoreWorkflowRepo();

  const created = await taskUpdate({
    action: "create",
    title: "Provider/tool block workflow proof",
    owner: "assistant",
    taskClass: "implementation",
    acceptance: ["Exercise safe-bash blocking and provider-failure recovery guidance"],
  });
  const taskId = created.details.task.id;

  await taskUpdate({ action: "claim", id: taskId, owner: "assistant" });
  await taskUpdate({ action: "start", id: taskId, owner: "assistant" });

  const blockedToolCall = await runToolCallGuard({
    toolName: "bash",
    input: {
      command: "git reset --hard HEAD~1",
    },
  });

  assert.equal(blockedToolCall.block, true);
  assert.match(blockedToolCall.reason, /destructive git reset is blocked/i);

  const recoveryResult = await resolveRecoveryRuntimeDecision({
    taskId,
    role: "backend_worker",
    currentModelId: "openai-codex/gpt-5.4-mini",
    providerFailureState: "model_unavailable",
    providerRetryCounts: {
      "openai-codex": 1,
    },
  });

  const decision = recoveryResult.details.decision;
  assert.equal(decision.recommendedAction, "switch_provider");
  assert.equal(decision.haltAutonomy, false);
  assert.equal(decision.retryPlan.nextProvider, "anthropic");
  assert.match(decision.retryPlan.reason ?? "", /provider switch retry is eligible/i);
  assert.match(decision.decisionReasons.join("\n"), /provider failure state is model_unavailable/i);
  assert.match(decision.decisionReasons.join("\n"), /provider-specific retry limit blocks stronger-model retry on openai-codex/i);

  const auditLog = await readFile(join(cwd, "logs", "harness-actions.jsonl"), "utf8");
  assert.match(auditLog, /"extension":"safe-bash"/);
  assert.match(auditLog, /"action":"blocked"/);
  assert.match(auditLog, /git reset --hard HEAD~1/);
});
