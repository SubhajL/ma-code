import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readExecutionLeaseState, QUEUE_SESSION_LEASE_SCOPE } from "../../.pi/agent/extensions/execution-leases.ts";
import { loadHandoffPolicy, generateHandoff } from "../../.pi/agent/extensions/handoffs.ts";
import { loadHarnessRoutingConfig } from "../../.pi/agent/extensions/harness-routing.ts";
import queueRunner, { readQueueState } from "../../.pi/agent/extensions/queue-runner.ts";
import { loadPacketPolicy, generateTaskPacket } from "../../.pi/agent/extensions/task-packets.ts";
import { loadTeamDefinitions } from "../../.pi/agent/extensions/team-activation.ts";
import tillDone, { writeTaskState, type TaskRecord } from "../../.pi/agent/extensions/till-done.ts";
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

function defaultImplementationTddSlice(label: string, boundaryDependencies: string[] = [".pi/agent/extensions/queue-runner.ts"]): {
  firstTracerBehavior: string;
  publicInterface: string;
  testSurface: string[];
  boundaryDependencies: string[];
  mockPlan: string;
  outOfScopeBehaviors: string[];
} {
  return {
    firstTracerBehavior: `${label} starts with one observable queued implementation behavior before broader changes.`,
    publicInterface: "run_next_queue_job and the generated task packet for queued implementation work",
    testSurface: ["tests/extension-units/queue-runner.test.ts"],
    boundaryDependencies,
    mockPlan: "Reuse real queue/task/handoff fixtures; mock only the Pi runtime boundary.",
    outOfScopeBehaviors: ["Do not widen beyond this queued implementation slice.", "Do not require TDD metadata outside implementation packets."],
  };
}

function withImplementationQueueTddSlices(queue: unknown): unknown {
  if (!queue || typeof queue !== "object" || !Array.isArray((queue as { jobs?: unknown[] }).jobs)) {
    return queue;
  }

  return {
    ...(queue as Record<string, unknown>),
    jobs: ((queue as { jobs: Array<Record<string, unknown>> }).jobs).map((job) => {
      if (job.workType !== "implementation" || job.tddSlice) return job;
      const label = typeof job.goal === "string" && job.goal.trim().length > 0 ? job.goal : String(job.id ?? "queued implementation work");
      const boundaryDependencies = Array.isArray(job.allowedPaths) && job.allowedPaths.length > 0
        ? (job.allowedPaths.filter((value): value is string => typeof value === "string" && value.trim().length > 0))
        : [".pi/agent/extensions/queue-runner.ts"];
      return {
        ...job,
        tddSlice: defaultImplementationTddSlice(label, boundaryDependencies),
      };
    }),
  };
}

async function writeRawQueue(cwd: string, queue: unknown) {
  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
}

async function writeQueue(cwd: string, queue: unknown) {
  await writeRawQueue(cwd, withImplementationQueueTddSlices(queue));
}

async function seedActiveQueueSessionLease(cwd: string, id = "lease-existing-queue-session") {
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "leases.json"),
    `${JSON.stringify(
      {
        version: 1,
        leases: [
          {
            id,
            scope: QUEUE_SESSION_LEASE_SCOPE,
            owner: "other-runner",
            acquiredAt: "2026-05-06T00:00:00.000Z",
            expiresAt: "2999-01-01T00:00:00.000Z",
            heartbeatAt: null,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function readTaskState(cwd: string) {
  const raw = await readFile(join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"), "utf8");
  return JSON.parse(raw) as {
    activeTaskId: string | null;
    tasks: Array<{ id: string; status: string; owner: string | null; dependencies?: string[]; notes?: string[] }>;
  };
}

async function appendBlockedTaskRecord(cwd: string, task: TaskRecord) {
  const state = await readTaskState(cwd);
  await writeTaskState(cwd, {
    version: 1,
    activeTaskId: state.activeTaskId,
    tasks: [...(state.tasks as TaskRecord[]), task],
  });
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
    tddSlice: defaultImplementationTddSlice("Provide structured queue-to-quality runtime input.", [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/queue-runner.test.ts"]),
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

async function createQualityToValidatorHandoff(cwd: string) {
  const [routingConfig, packetPolicy, handoffPolicy, teams] = await Promise.all([
    loadHarnessRoutingConfig(cwd),
    loadPacketPolicy(cwd),
    loadHandoffPolicy(cwd),
    loadTeamDefinitions(cwd),
  ]);

  const sourcePacket = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "job-quality-source",
    parentTaskId: "task-quality-source",
    parentPacketId: "packet-build-parent",
    assignedTeam: "quality",
    assignedRole: "quality_lead",
    title: "Assess bounded queue-runner quality output",
    goal: "Provide structured quality_to_validator runtime input.",
    scope: "Only inspect queue-runner and queue-runner unit-test files for validator pickup.",
    nonGoals: ["Do not broaden into reviewer runtime pickup."],
    workType: "review_only",
    domains: ["backend"],
    filesToInspect: [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/queue-runner.test.ts"],
    filesToModify: [],
    allowedPaths: [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/queue-runner.test.ts"],
    acceptanceCriteria: ["Structured quality_to_validator input is available for a queued validator job."],
    expectedProof: ["Queue runner derives the validator packet from structured handoff data."],
    migrationPathNote: "Not applicable; keep the runtime change bounded to one validator pickup path.",
  }).packet;

  return generateHandoff(handoffPolicy, {
    handoffType: "quality_to_validator",
    sourcePacket,
    fromRole: "quality_lead",
    toRole: "validator_worker",
    filesToInspect: [".pi/agent/extensions/queue-runner.ts", "tests/extension-units/queue-runner.test.ts"],
    validationScope: ["Validate structured queued validator pickup from a quality handoff."],
    expectedProof: ["Validator packet uses preserved packet scope, expected proof, and parent packet linkage."],
    validationQuestions: ["Does the validator packet stay inside the preserved quality packet inspect scope?"],
    knownGaps: ["Reviewer pickup remains intentionally unsupported in this slice."],
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

test("run_next_queue_job blocks without advancing when another queue-session lease is active", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-direct-lease-conflict",
        goal: "Do not start while another queue execution has the lease",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Lease conflict blocks direct queue advancement"],
      },
    ],
  });
  await seedActiveQueueSessionLease(cwd);

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const leaseState = await readExecutionLeaseState(cwd);
  const audit = await readAuditLog(cwd);

  assert.equal(details.ok, true);
  assert.equal(details.action, "blocked");
  assert.equal(details.reason, "Queue advancement could not start because another queue execution already holds the queue-session lease.");
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "queued");
  assert.deepEqual(leaseState.leases.map((lease) => lease.id), ["lease-existing-queue-session"]);
  assert.match(audit, /queue_session_lease_conflict/);
});

test("run_next_queue_job acquires and releases a short queue-session lease", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const leaseState = await readExecutionLeaseState(cwd);
  const audit = await readAuditLog(cwd);

  assert.equal(details.ok, true);
  assert.equal(details.action, "noop");
  assert.deepEqual(leaseState.leases, []);
  assert.match(audit, /queue_session_lease_acquired/);
  assert.match(audit, /queue_session_lease_released/);
});

test("run_queue_once compatibility alias follows queue-session lease enforcement", async () => {
  const { cwd, runQueueOnceCompat } = await setupQueueRunnerRepo();
  await seedActiveQueueSessionLease(cwd);

  const result = await runQueueOnceCompat({ owner: "assistant" });
  const details = (result as any).details;
  const leaseState = await readExecutionLeaseState(cwd);

  assert.equal(details.ok, true);
  assert.equal(details.action, "blocked");
  assert.equal(details.reason, "Queue advancement could not start because another queue execution already holds the queue-session lease.");
  assert.deepEqual(leaseState.leases.map((lease) => lease.id), ["lease-existing-queue-session"]);
});

test("bounded queue session releases its lease after an idle session", async () => {
  const { cwd, runBoundedQueueSessionForOperator } = await setupQueueRunnerRepo();

  const result = await runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 1, maxRuntimeSeconds: 60 });
  const details = (result as any).details;
  const leaseState = await readExecutionLeaseState(cwd);
  const audit = await readAuditLog(cwd);

  assert.equal(details.ok, true);
  assert.equal(details.stopReason, "idle");
  assert.deepEqual(leaseState.leases, []);
  assert.match(audit, /queue_session_lease_acquired/);
  assert.match(audit, /queue_session_lease_released/);
});

test("bounded queue session releases its lease when the session body throws", async () => {
  const { cwd, runBoundedQueueSessionForOperator } = await setupQueueRunnerRepo();
  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), "{not-json\n", "utf8");

  await assert.rejects(
    () => runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 1, maxRuntimeSeconds: 60 }),
    /JSON/,
  );
  const leaseState = await readExecutionLeaseState(cwd);
  const audit = await readAuditLog(cwd);

  assert.deepEqual(leaseState.leases, []);
  assert.match(audit, /queue_session_lease_acquired/);
  assert.match(audit, /queue_session_lease_released/);
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

test("runtime inspection and task show compact large task history by default", async function () {
  const { cwd, inspectQueueStateForOperator, taskUpdate } = await setupQueueRunnerRepo();
  const hugeEvidence = `huge-evidence-${"x".repeat(1200)}`;
  const manyArtifacts = Array.from({ length: 24 }, (_, index) => `docs/initiatives/greenfield-scaffold/slices/issue-${String(index).padStart(3, "0")}.summary.json`);

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: "job-large-8",
    jobs: Array.from({ length: 9 }, (_, index) => ({
      id: `job-large-${index}`,
      goal: `Large queue job ${index} ${"goal-detail-".repeat(40)}`,
      priority: "medium",
      status: index === 8 ? "running" : index % 3 === 0 ? "blocked" : "queued",
      team: "build",
      assignedRole: "backend_worker",
      workType: "implementation",
      domains: ["backend"],
      allowedPaths: ["services/api", "docs/initiatives/greenfield-scaffold"],
      notes: [`job-note-${index}-${"n".repeat(500)}`],
      queueJobSource: {
        kind: "issue-materialization",
        initiativeId: "greenfield-scaffold",
        issueId: `issue-${index}`,
        runId: "afk-large-run",
        sourceArtifactPaths: manyArtifacts,
      },
      updatedAt: `2026-05-09T13:${String(index).padStart(2, "0")}:00.000Z`,
    })),
  } as any);

  await writeTaskState(cwd, {
    activeTaskId: "task-large-8",
    tasks: Array.from({ length: 9 }, (_, index) => ({
      id: `task-large-${index}`,
      title: `Large runtime task ${index}`,
      owner: "assistant",
      status: index === 8 ? "in_progress" : index % 4 === 0 ? "blocked" : "done",
      taskClass: "implementation",
      acceptance: Array.from({ length: 8 }, (_, item) => `acceptance-${index}-${item}-${"a".repeat(220)}`),
      evidence: [hugeEvidence, ...Array.from({ length: 8 }, (_, item) => `evidence-${index}-${item}-${"e".repeat(220)}`)],
      notes: Array.from({ length: 6 }, (_, item) => `note-${index}-${item}-${"n".repeat(220)}`),
      dependencies: [],
      retryCount: 0,
      validation: {
        tier: "standard",
        decision: index === 8 ? "pending" : "pass",
        source: index === 8 ? null : "validator",
        checklist: null,
        approvalRef: null,
        updatedAt: null,
      },
      timestamps: {
        createdAt: "2026-05-09T13:00:00.000Z",
        updatedAt: `2026-05-09T13:${String(index).padStart(2, "0")}:00.000Z`,
      },
    })) as TaskRecord[],
  });

  const compactInspect = await inspectQueueStateForOperator({ recentLimit: 2 });
  const compactInspectText = compactInspect.content[0]?.text ?? "";
  const inspectDetails = compactInspect.details as any;

  assert.equal(inspectDetails.compaction.compact, true);
  assert.equal(inspectDetails.tasks.totalTasks, 9);
  assert.equal(inspectDetails.queue.totalJobs, 9);
  assert.equal(inspectDetails.tasks.recentTasks.length, 2);
  assert.equal(inspectDetails.queue.recentJobs.length, 2);
  assert.equal(inspectDetails.summary.activeTask.evidence.total, 9);
  assert.equal(inspectDetails.summary.activeTask.evidence.omitted, 8);
  assert.equal(inspectDetails.summary.activeJob.sourceArtifactPaths.total, 24);
  assert.ok(compactInspectText.length < 12000, `compact inspect text was ${compactInspectText.length} chars`);
  assert.doesNotMatch(compactInspectText, new RegExp(hugeEvidence));

  const fullInspect = await inspectQueueStateForOperator({ recentLimit: 2, includeHistory: true });
  const fullInspectText = fullInspect.content[0]?.text ?? "";
  assert.match(fullInspectText, new RegExp(hugeEvidence));

  const compactShow = await taskUpdate({ action: "show" });
  const compactShowText = compactShow.content[0]?.text ?? "";
  const compactShowPayload = JSON.parse(compactShowText);
  assert.equal(compactShowPayload.compaction.compact, true);
  assert.equal(compactShowPayload.totalTasks, 9);
  assert.equal(compactShowPayload.activeTask.evidence.total, 9);
  assert.ok(compactShowText.length < 10000, `compact show text was ${compactShowText.length} chars`);
  assert.doesNotMatch(compactShowText, new RegExp(hugeEvidence));

  const fullShow = await taskUpdate({ action: "show", includeHistory: true });
  assert.match(fullShow.content[0]?.text ?? "", new RegExp(hugeEvidence));
});

test("operator inspect queue state surfaces worker-execution salvage metadata in compact summaries", async function () {
  const { cwd, inspectQueueStateForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: "job-salvage-inspect",
    jobs: [
      {
        id: "job-salvage-inspect",
        goal: "Inspect preserved mixed-domain salvage evidence",
        priority: "high",
        status: "running",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["frontend", "backend"],
        allowedPaths: ["apps/web/src/lib", "services/api/src/routes"],
        acceptanceCriteria: ["Compact queue inspection keeps salvage evidence visible"],
        workerExecution: {
          runArtifactPath: "docs/initiatives/mixed-domain-harness-optimization/worker-runs/worker-salvage.json",
          worktreePath: "/tmp/worker-salvage",
          status: "review_ready",
          lastReason: "Salvaged preserved mixed-domain diff after implementation interruption.",
          linkedTaskId: "task-salvage-inspect",
          salvage: {
            outcome: "reviewable",
            detectedAt: "2026-05-13T00:00:00.000Z",
            stage: "implementation_failure",
            reason: "Salvaged preserved mixed-domain diff after implementation interruption; local validation proof passed and the lane was promoted to review_ready.",
            preservedDiff: ["apps/web/src/lib/health-client.ts", "services/api/src/routes/health.ts"],
            retainedProof: ["node -e \"process.exit(0)\" exited 0"],
          },
          updatedAt: "2026-05-13T00:00:00.000Z",
        },
      },
    ],
  });

  await writeTaskState(cwd, {
    activeTaskId: "task-salvage-inspect",
    tasks: [
      {
        id: "task-salvage-inspect",
        title: "Inspect salvage metadata",
        owner: "assistant",
        status: "review",
        taskClass: "implementation",
        acceptance: ["Compact queue inspection keeps salvage evidence visible"],
        evidence: ["Salvage Outcome: reviewable"],
        notes: [],
        dependencies: [],
        retryCount: 0,
        validation: {
          tier: "standard",
          decision: "pass",
          source: "validator",
          checklist: null,
          approvalRef: null,
          updatedAt: null,
        },
        timestamps: {
          createdAt: "2026-05-13T00:00:00.000Z",
          updatedAt: "2026-05-13T00:00:00.000Z",
        },
      } as TaskRecord,
    ],
  });

  const inspectResult = await inspectQueueStateForOperator({ recentLimit: 1 });
  const activeJob = (inspectResult.details as any).summary.activeJob;

  assert.equal(activeJob.workerExecution.status, "review_ready");
  assert.equal(activeJob.workerExecution.salvageOutcome, "reviewable");
  assert.equal(activeJob.workerExecution.retainedProofCount, 1);
  assert.match(String(activeJob.workerExecution.salvageReason), /promoted to review_ready/i);
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
        tddSlice: defaultImplementationTddSlice("Implement queue runner step"),
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
  assert.equal(details.packet.tddSlice.firstTracerBehavior, "Implement queue runner step starts with one observable queued implementation behavior before broader changes.");
  assert.equal(details.initialHandoff.handoffType, "build_to_worker");
  assert.equal(details.initialHandoff.preservedPacket.tddSlice.firstTracerBehavior, details.packet.tddSlice.firstTracerBehavior);

  const taskState = await readTaskState(cwd);
  assert.equal(taskState.activeTaskId, details.startedJob.linkedTaskId);
  assert.equal(taskState.tasks[0]?.status, "in_progress");

  const queueState = await readQueueState(cwd);
  assert.equal(queueState.activeJobId, "job-start");
  assert.equal(queueState.jobs[0]?.packetId, details.packet.packetId);
});

test("queue runner blocks queued implementation jobs that omit explicit tddSlice input", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeRawQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-missing-tdd-slice",
        goal: "Try to start implementation work without explicit TDD metadata",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Queue runner should block missing implementation tddSlice input"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const queueState = await readQueueState(cwd);

  assert.equal(result.details.action, "blocked");
  assert.match(String(result.details.reason), /Implementation packets require tddSlice/i);
  assert.equal(queueState.jobs[0]?.status, "blocked");
  assert.match((queueState.jobs[0]?.notes ?? []).join("\n"), /Implementation packets require tddSlice/i);
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
  assert.deepEqual(details.packet.tddSlice, handoff.preservedPacket.tddSlice);
  assert.equal(details.initialHandoff, null);
  assert.equal(queueState.jobs[0]?.packetId, details.packet.packetId);
});

test("queue runner preserves mixed-domain ownership metadata in generated packets", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-mixed-domain",
        goal: "Coordinate coupled frontend/backend implementation work",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["frontend", "backend"],
        allowedPaths: ["apps/web/src/lib", "services/api/src/routes"],
        acceptanceCriteria: ["Mixed-domain ownership metadata survives queue-to-packet generation"],
        domainOwnership: {
          mode: "mixed_domain",
          owningDomain: "backend",
          owningRole: "backend_worker",
          supportingDomains: ["frontend"],
        },
        escalationInstructions: ["Keep backend ownership explicit and require frontend review before shipping."],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.action, "started");
  assert.equal(details.packet.assignedRole, "backend_worker");
  assert.deepEqual(details.packet.domains, ["frontend", "backend"]);
  assert.deepEqual(details.packet.domainOwnership, {
    mode: "mixed_domain",
    owningDomain: "backend",
    owningRole: "backend_worker",
    supportingDomains: ["frontend"],
  });
  assert.deepEqual(queueState.jobs[0]?.domainOwnership, {
    mode: "mixed_domain",
    owningDomain: "backend",
    owningRole: "backend_worker",
    supportingDomains: ["frontend"],
  });
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

test("queue runner can start a validator job from structured quality_to_validator input", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();
  const handoff = await createQualityToValidatorHandoff(cwd);

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-validator-structured",
        goal: "Run validator review from structured quality handoff input",
        priority: "high",
        status: "queued",
        team: "quality",
        assignedRole: "validator_worker",
        workType: "review_only",
        acceptanceCriteria: ["Queue runner starts a validator job from structured quality_to_validator fields"],
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
  assert.equal(details.packet.assignedRole, "validator_worker");
  assert.equal(details.packet.source.parentPacketId, handoff.sourcePacketId);
  assert.deepEqual(details.packet.allowedPaths, [
    ".pi/agent/extensions/queue-runner.ts",
    "tests/extension-units/queue-runner.test.ts",
  ]);
  assert.deepEqual(details.packet.filesToInspect, [
    ".pi/agent/extensions/queue-runner.ts",
    "tests/extension-units/queue-runner.test.ts",
  ]);
  assert.match(String(details.packet.goal), /Provide structured quality_to_validator runtime input/i);
  assert.equal(details.initialHandoff, null);
  assert.equal(queueState.jobs[0]?.packetId, details.packet.packetId);
});

test("queue runner blocks a validator job when structured quality_to_validator input is missing", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-validator-missing-input",
        goal: "Try to start validator work without structured quality input",
        priority: "high",
        status: "queued",
        team: "quality",
        assignedRole: "validator_worker",
        workType: "review_only",
        acceptanceCriteria: ["Queue runner blocks missing structured validator input"],
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);

  assert.equal(details.action, "blocked");
  assert.match(String(details.reason), /structured quality_to_validator handoff/i);
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


test("queue runner blocks unsupported budget fields and unsupported free-form stop_conditions but allows supported HARNESS-049 controls", async () => {
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
        goal: "Allow supported HARNESS-049 stop controls",
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

test("queue runner blocks queued jobs whose maxUnresolvedBlockers budget is already exceeded and starts the next eligible job from the same blocker snapshot", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  const blockedTask = await taskUpdate({
    action: "create",
    title: "visible blocked task",
    acceptance: ["Blocked task remains visible for stop-control accounting"],
  });
  const blockedTaskId = (blockedTask as any).details.task.id as string;
  await taskUpdate({ action: "claim", id: blockedTaskId, owner: "assistant" });
  await taskUpdate({ action: "block", id: blockedTaskId, note: "waiting on clarification" });

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-existing-blocker",
        goal: "Remain visible as a blocked queue job",
        priority: "low",
        status: "blocked",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Existing blocked queue job stays visible"],
        notes: ["blocked earlier for bounded investigation"],
      },
      {
        id: "job-budget-blocked",
        goal: "Stop when visible unresolved blockers exceed the configured budget",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Job blocks when visible unresolved blockers exceed the configured budget"],
        budget: { maxUnresolvedBlockers: 0 },
      },
      {
        id: "job-budget-allowed",
        goal: "Continue when visible unresolved blockers stay within the configured budget",
        priority: "medium",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Job starts when visible unresolved blockers are at or under budget"],
        budget: { maxUnresolvedBlockers: 2 },
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const blockedJob = queueState.jobs.find((job) => job.id === "job-budget-blocked");
  const startedJob = queueState.jobs.find((job) => job.id === "job-budget-allowed");

  assert.equal(details.action, "started");
  assert.deepEqual(details.blockedJobIds, ["job-budget-blocked"]);
  assert.equal(details.startedJob.id, "job-budget-allowed");
  assert.equal(blockedJob?.status, "blocked");
  assert.match(blockedJob?.notes?.at(-1) ?? "", /maxUnresolvedBlockers/i);
  assert.match(blockedJob?.notes?.at(-1) ?? "", /2 visible unresolved blockers/i);
  assert.equal(startedJob?.status, "running");
});

test("queue runner deduplicates a blocked job and its linked blocked task when enforcing maxUnresolvedBlockers", async () => {
  const { cwd, runNextQueueJob, taskUpdate } = await setupQueueRunnerRepo();

  const blockedTask = await taskUpdate({
    action: "create",
    title: "linked blocked task",
    acceptance: ["Blocked task remains visible for deduplicated stop-control accounting"],
  });
  const blockedTaskId = (blockedTask as any).details.task.id as string;
  await taskUpdate({ action: "claim", id: blockedTaskId, owner: "assistant" });
  await taskUpdate({ action: "block", id: blockedTaskId, note: "waiting on linked blocker" });

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-linked-blocker",
        goal: "Remain visible as one unresolved blocker unit",
        priority: "low",
        status: "blocked",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Linked blocked queue job stays visible"],
        linkedTaskId: blockedTaskId,
        notes: ["blocked earlier for the same linked task"],
      },
      {
        id: "job-budget-allowed-deduped",
        goal: "Start when one linked blocker pair counts once",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Linked blocked job/task pair counts as one unresolved blocker"],
        budget: { maxUnresolvedBlockers: 1 },
      },
    ],
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const startedJob = queueState.jobs.find((job) => job.id === "job-budget-allowed-deduped");

  assert.equal(details.action, "started");
  assert.deepEqual(details.blockedJobIds, []);
  assert.equal(details.startedJob.id, "job-budget-allowed-deduped");
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

test("queue runner blocks the active job when normalized visible unresolved blockers exceed maxUnresolvedBlockers", async () => {
  const { cwd, runNextQueueJob } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-active-blocker-stop",
        goal: "Stop active job when unresolved blocker budget is exceeded",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        workType: "implementation",
        domains: ["backend"],
        allowedPaths: [".pi/agent/extensions/queue-runner.ts"],
        acceptanceCriteria: ["Exceeded unresolved blocker budget blocks both queue and linked task together"],
        budget: { maxUnresolvedBlockers: 0 },
      },
    ],
  });

  const start = await runNextQueueJob({ owner: "assistant" });
  const startedJob = (start as any).details.startedJob;
  const taskId = startedJob.linkedTaskId as string;

  await appendBlockedTaskRecord(cwd, {
    id: "task-external-blocker",
    title: "external visible blocker",
    owner: "assistant",
    status: "blocked",
    taskClass: "implementation",
    acceptance: ["Blocked task remains visible for active stop-control accounting"],
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
    notes: ["waiting on external dependency"],
    timestamps: {
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  });

  const result = await runNextQueueJob({ owner: "assistant" });
  const details = (result as any).details;
  const queueState = await readQueueState(cwd);
  const taskState = await readTaskState(cwd);
  const linkedTask = taskState.tasks.find((task) => task.id === taskId);

  assert.equal(details.action, "blocked");
  assert.deepEqual(details.blockedJobIds, ["job-active-blocker-stop"]);
  assert.equal(details.activeJobId, null);
  assert.equal(queueState.activeJobId, null);
  assert.equal(queueState.jobs[0]?.status, "blocked");
  assert.equal(linkedTask?.status, "blocked");
  assert.match(queueState.jobs[0]?.notes?.at(-1) ?? "", /maxUnresolvedBlockers/i);
  assert.match(queueState.jobs[0]?.notes?.at(-1) ?? "", /1 visible unresolved blocker/i);
  assert.match(linkedTask?.notes?.at(-1) ?? "", /maxUnresolvedBlockers/i);
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

test("bounded queue session explicitly invokes Graphify orchestration for opted-in research jobs", async () => {
  const { cwd, runBoundedQueueSessionForOperator } = await setupQueueRunnerRepo();
  await writeFile(join(cwd, "README.md"), "# graphify research fixture\n");

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-research-graphify",
        goal: "Research broad repo structure with Graphify",
        priority: "high",
        status: "queued",
        team: "planning",
        assignedRole: "research_worker",
        taskClass: "research",
        workType: "research_only",
        domains: ["research"],
        acceptanceCriteria: ["Explicit research Graphify orchestration runs before the job starts"],
        graphifyOrchestration: {
          enabled: true,
          need: "broad_structure",
          graphPresent: false,
          purpose: "curated_research",
          sourcePath: ".",
          taskId: "job-research-graphify",
          maxFilesWithoutApproval: 20,
        },
      },
    ],
  });

  const result = await runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 1, maxRuntimeSeconds: 60 });

  assert.equal(result.details.stopReason, "waiting_on_active_task");
  assert.equal(result.details.steps[0].graphifyOrchestration.jobId, "job-research-graphify");
  assert.equal(result.details.steps[0].graphifyOrchestration.status, "completed");
  assert.equal(result.details.steps[0].graphifyOrchestration.action, "run_preflight");
  assert.equal(result.details.steps[0].graphifyOrchestration.adapterAction, "preflight");

  const queueState = await readQueueState(cwd);
  const startedJob = queueState.jobs.find((job) => job.id === "job-research-graphify");
  assert.equal(startedJob?.status, "running");
  assert.match((startedJob?.notes ?? []).join("\n"), /Graphify orchestration run_preflight completed/);
});

test("bounded queue session does not invoke Graphify when research job lacks explicit opt in", async () => {
  const { cwd, runBoundedQueueSessionForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-research-no-graphify",
        goal: "Research without Graphify",
        priority: "high",
        status: "queued",
        team: "planning",
        assignedRole: "research_worker",
        taskClass: "research",
        workType: "research_only",
        domains: ["research"],
        acceptanceCriteria: ["Research job starts without implicit Graphify"],
      },
    ],
  });

  const result = await runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 1, maxRuntimeSeconds: 60 });

  assert.equal(result.details.stopReason, "waiting_on_active_task");
  assert.equal(result.details.steps[0].graphifyOrchestration, null);
});

test("bounded queue session ignores Graphify opt in on non-research jobs", async () => {
  const { cwd, runBoundedQueueSessionForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-build-graphify-ignored",
        goal: "Implementation job should not invoke Graphify",
        priority: "high",
        status: "queued",
        team: "build",
        assignedRole: "backend_worker",
        taskClass: "implementation",
        workType: "implementation",
        domains: ["backend"],
        acceptanceCriteria: ["Non-research job starts without Graphify even if field is present"],
        graphifyOrchestration: {
          enabled: true,
          need: "broad_structure",
          graphPresent: false,
          purpose: "architecture_review",
          taskId: "job-build-graphify-ignored",
        },
      },
    ],
  });

  const result = await runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 1, maxRuntimeSeconds: 60 });

  assert.equal(result.details.stopReason, "waiting_on_active_task");
  assert.equal(result.details.steps[0].graphifyOrchestration, null);
});

test("bounded queue session blocks research job when explicit Graphify orchestration blocks", async () => {
  const { cwd, runBoundedQueueSessionForOperator } = await setupQueueRunnerRepo();

  await writeQueue(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      {
        id: "job-research-graphify-blocked",
        goal: "Research Graphify blocked path",
        priority: "high",
        status: "queued",
        team: "planning",
        assignedRole: "research_worker",
        taskClass: "research",
        workType: "research_only",
        domains: ["research"],
        acceptanceCriteria: ["Blocked Graphify orchestration blocks the research job visibly"],
        graphifyOrchestration: {
          enabled: true,
          need: "broad_structure",
          graphPresent: false,
          purpose: "curated_research",
          sourcePath: ".",
          taskId: "job-research-graphify-blocked",
          preflightTokenPresent: true,
          preflightToken: "intentionally-wrong",
          extraArgs: ["--watch"],
        },
      },
    ],
  });

  const result = await runBoundedQueueSessionForOperator({ owner: "assistant", maxSteps: 1, maxRuntimeSeconds: 60 });

  assert.equal(result.details.stopReason, "blocked");
  assert.equal(result.details.steps[0].action, "blocked");
  assert.equal(result.details.steps[0].graphifyOrchestration.jobId, "job-research-graphify-blocked");
  assert.equal(result.details.steps[0].graphifyOrchestration.status, "blocked");
  assert.equal(result.details.steps[0].graphifyOrchestration.adapterAction, "scan");

  const queueState = await readQueueState(cwd);
  const blockedJob = queueState.jobs.find((job) => job.id === "job-research-graphify-blocked");
  assert.equal(blockedJob?.status, "blocked");
  assert.match((blockedJob?.notes ?? []).join("\n"), /Graphify orchestration blocked before queue-session start/);
});
