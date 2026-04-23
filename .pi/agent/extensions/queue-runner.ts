import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  BUDGET_MODES,
  ROLE_IDS,
  ROUTE_REASONS,
  loadHarnessRoutingConfig,
  type BudgetMode,
  type HarnessRole,
  type RouteReason,
} from "./harness-routing.ts";
import {
  generateHandoff,
  loadHandoffPolicy,
  type GeneratedHandoff,
  type StructuredHandoff,
} from "./handoffs.ts";
import { loadPacketPolicy, generateTaskPacket, type GeneratedTaskPacket, type TaskPacket } from "./task-packets.ts";
import { loadRecoveryPolicy } from "./recovery-policy.ts";
import { resolveRecoveryRuntimeDecision, type RuntimeRecoveryDecision } from "./recovery-runtime.ts";
import {
  DOMAIN_IDS,
  TEAM_IDS,
  WORK_TYPES,
  loadActivationPolicy,
  loadTeamDefinitions,
  resolveTeamActivation,
  type DomainId,
  type TeamDefinition,
  type TeamId,
  type WorkType,
} from "./team-activation.ts";
import {
  applyTaskUpdateAction,
  ensureTaskFile,
  getActiveTask,
  getTask,
  loadCompletionGatePolicy,
  mutateTaskState,
  readTaskState,
  TASKS_FILE,
  writeTaskState,
  type TaskClass,
  type TaskRecord,
  type TaskState,
  type TaskUpdateResult,
} from "./till-done.ts";

export type QueueJobStatus = "queued" | "running" | "blocked" | "done" | "failed";
export type QueuePriority = "low" | "medium" | "high";

export interface QueueJob {
  id: string;
  goal: string;
  priority: QueuePriority;
  status: QueueJobStatus;
  scope?: string;
  team?: TeamId;
  dependencies?: string[];
  budget?: {
    maxRetries?: number;
    maxRuntimeMinutes?: number;
    maxFailedValidations?: number;
    maxCostUsd?: number;
    maxFilesChanged?: number;
  };
  stop_conditions?: string[];
  approvalRequired?: boolean;
  acceptanceCriteria?: string[];
  taskClass?: TaskClass;
  workType?: WorkType;
  domains?: DomainId[];
  allowedPaths?: string[];
  assignedRole?: HarnessRole;
  routeReason?: RouteReason;
  budgetMode?: BudgetMode;
  modelOverride?: string;
  linkedTaskId?: string | null;
  packetId?: string | null;
  selectedModelId?: string | null;
  initialHandoffId?: string | null;
  lastRecoveryAction?: RuntimeRecoveryDecision["recommendedAction"];
  lastRecoveryReason?: string;
  notes?: string[];
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
}

export interface QueueState {
  version: 1;
  paused: boolean;
  activeJobId: string | null;
  jobs: QueueJob[];
}

export interface QueueRunnerResult {
  version: 1;
  ok: boolean;
  action: "noop" | "started" | "finalized" | "blocked";
  reason: string | null;
  queuePaused: boolean;
  activeJobId: string | null;
  startedJob: QueueJob | null;
  finalizedJob: QueueJob | null;
  blockedJobIds: string[];
  linkedTask: TaskRecord | null;
  packet: TaskPacket | null;
  initialHandoff: StructuredHandoff | null;
  recoveryDecision: RuntimeRecoveryDecision | null;
}

export interface QueueInspectionSummary {
  queuePaused: boolean;
  activeJobId: string | null;
  activeTaskId: string | null;
  totalJobs: number;
  totalTasks: number;
  jobCounts: Record<QueueJobStatus, number>;
  taskCounts: Record<string, number>;
  activeJob: QueueJob | null;
  activeTask: TaskRecord | null;
  blockedJobIds: string[];
  failedJobIds: string[];
  blockedTaskIds: string[];
  failedTaskIds: string[];
  recentJobIds: string[];
  recentTaskIds: string[];
}

export interface QueueInspectionResult {
  version: 1;
  queue: QueueState;
  tasks: {
    activeTaskId: string | null;
    tasks: TaskRecord[];
  };
  summary: QueueInspectionSummary;
}

export interface QueueControlResult {
  version: 1;
  ok: boolean;
  action: "paused" | "resumed" | "stopped" | "noop";
  reason: string;
  queuePaused: boolean;
  activeJobId: string | null;
  stoppedJob: QueueJob | null;
  stoppedTask: TaskRecord | null;
  summary: QueueInspectionSummary;
}

const QUEUE_FILE = ".pi/agent/state/runtime/queue.json";
const QUEUE_TASK_COORDINATION_LOCK = ".pi/agent/state/runtime/queue-runner.coordination.lock";
const AUDIT_LOG = "logs/harness-actions.jsonl";
const PUBLIC_QUEUE_RUNNER_TOOL_NAME = "run_next_queue_job";
const QUEUE_RUNNER_COMPAT_TOOL_NAME = "run_queue_once";
const INSPECT_QUEUE_STATE_TOOL_NAME = "inspect_queue_state";
const PAUSE_QUEUE_TOOL_NAME = "pause_queue";
const RESUME_QUEUE_TOOL_NAME = "resume_queue";
const STOP_QUEUE_SAFELY_TOOL_NAME = "stop_queue_safely";
const QUEUE_JOB_STATUSES = ["queued", "running", "blocked", "done", "failed"] as const;
const QUEUE_PRIORITIES = ["low", "medium", "high"] as const;

const RunQueueOnceSchema = Type.Object({
  owner: Type.Optional(Type.String({ minLength: 1 })),
  allowInitialHandoff: Type.Optional(Type.Boolean()),
});

const InspectQueueStateSchema = Type.Object({
  recentLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
});

const QueueControlSchema = Type.Object({
  note: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
});

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function modelIdFromContext(ctx: { model?: { id?: string } | null }): string | null {
  return ctx.model?.id ?? null;
}

function providerFromModelId(modelId: string | null): string | null {
  if (!modelId) return null;
  const slash = modelId.indexOf("/");
  return slash >= 0 ? modelId.slice(0, slash) : null;
}

async function getCurrentBranch(pi: ExtensionAPI, cwd: string): Promise<string | null> {
  const result = await pi.exec("git", ["-C", cwd, "branch", "--show-current"]);
  if (result.code !== 0) return null;
  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
}

async function appendAudit(cwd: string, entry: Record<string, unknown>): Promise<void> {
  const logFile = resolve(cwd, AUDIT_LOG);
  await mkdir(dirname(logFile), { recursive: true });

  await withFileMutationQueue(logFile, async () => {
    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  });
}

async function ensureQueueFile(cwd: string): Promise<void> {
  const absolute = resolve(cwd, QUEUE_FILE);
  await mkdir(dirname(absolute), { recursive: true });

  try {
    await readFile(absolute, "utf8");
  } catch {
    const initial: QueueState = {
      version: 1,
      paused: false,
      activeJobId: null,
      jobs: [],
    };
    await writeFile(absolute, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
  }
}

export async function readQueueState(cwd: string): Promise<QueueState> {
  await ensureQueueFile(cwd);
  const raw = await readFile(resolve(cwd, QUEUE_FILE), "utf8");
  return JSON.parse(raw) as QueueState;
}

async function writeQueueState(cwd: string, state: QueueState): Promise<void> {
  const absolute = resolve(cwd, QUEUE_FILE);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function mutateQueueState<T>(cwd: string, fn: (state: QueueState) => T | Promise<T>): Promise<T> {
  const absolute = resolve(cwd, QUEUE_FILE);
  await ensureQueueFile(cwd);

  return withFileMutationQueue(absolute, async () => {
    const raw = await readFile(absolute, "utf8");
    const state = JSON.parse(raw) as QueueState;
    const result = await fn(state);
    await writeQueueState(cwd, state);
    return result;
  });
}

async function withCoordinatedQueueTaskMutation<T>(
  cwd: string,
  fn: (state: { queueState: QueueState; taskState: TaskState }) => T | Promise<T>,
): Promise<T> {
  const coordinationLock = resolve(cwd, QUEUE_TASK_COORDINATION_LOCK);
  const queueFile = resolve(cwd, QUEUE_FILE);
  const taskFile = resolve(cwd, TASKS_FILE);
  await mkdir(dirname(coordinationLock), { recursive: true });
  await Promise.all([ensureQueueFile(cwd), ensureTaskFile(cwd)]);

  return withFileMutationQueue(coordinationLock, async () => {
    return withFileMutationQueue(taskFile, async () => {
      return withFileMutationQueue(queueFile, async () => {
        const [queueRaw, taskRaw] = await Promise.all([readFile(queueFile, "utf8"), readFile(taskFile, "utf8")]);
        const state = {
          queueState: JSON.parse(queueRaw) as QueueState,
          taskState: JSON.parse(taskRaw) as TaskState,
        };
        const result = await fn(state);
        await writeTaskState(cwd, state.taskState);
        await writeQueueState(cwd, state.queueState);
        return result;
      });
    });
  });
}

function getJob(state: QueueState, id: string): QueueJob | undefined {
  return state.jobs.find((job) => job.id === id);
}

function makeEmptyJobCounts(): Record<QueueJobStatus, number> {
  return {
    queued: 0,
    running: 0,
    blocked: 0,
    done: 0,
    failed: 0,
  };
}

function buildTaskCounts(tasks: TaskRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
}

function buildQueueInspectionSummary(queueState: QueueState, taskState: TaskState, recentLimit: number): QueueInspectionSummary {
  const activeJob = queueState.activeJobId ? getJob(queueState, queueState.activeJobId) ?? null : null;
  const activeTask = taskState.activeTaskId ? getTask(taskState, taskState.activeTaskId) ?? null : null;
  const jobCounts = makeEmptyJobCounts();
  const blockedJobIds: string[] = [];
  const failedJobIds: string[] = [];

  for (const job of queueState.jobs) {
    jobCounts[job.status] += 1;
    if (job.status === "blocked") blockedJobIds.push(job.id);
    if (job.status === "failed") failedJobIds.push(job.id);
  }

  const blockedTaskIds: string[] = [];
  const failedTaskIds: string[] = [];
  for (const task of taskState.tasks) {
    if (task.status === "blocked") blockedTaskIds.push(task.id);
    if (task.status === "failed") failedTaskIds.push(task.id);
  }

  return {
    queuePaused: queueState.paused,
    activeJobId: queueState.activeJobId,
    activeTaskId: taskState.activeTaskId,
    totalJobs: queueState.jobs.length,
    totalTasks: taskState.tasks.length,
    jobCounts,
    taskCounts: buildTaskCounts(taskState.tasks),
    activeJob: activeJob ? normalizeQueueJob(activeJob) : null,
    activeTask,
    blockedJobIds,
    failedJobIds,
    blockedTaskIds,
    failedTaskIds,
    recentJobIds: queueState.jobs.slice(-recentLimit).map(function (job) { return job.id; }).reverse(),
    recentTaskIds: taskState.tasks.slice(-recentLimit).map(function (task) { return task.id; }).reverse(),
  };
}

export async function inspectQueueState(cwd: string, input: { recentLimit?: number } = {}): Promise<QueueInspectionResult> {
  const recentLimit = Math.max(1, Math.min(input.recentLimit ?? 5, 20));
  const [queueState, taskState] = await Promise.all([readQueueState(cwd), readTaskState(cwd)]);
  return {
    version: 1,
    queue: queueState,
    tasks: {
      activeTaskId: taskState.activeTaskId,
      tasks: taskState.tasks,
    },
    summary: buildQueueInspectionSummary(queueState, taskState, recentLimit),
  };
}

async function pauseQueue(cwd: string, note?: string): Promise<QueueControlResult> {
  const normalizedNote = note?.trim() || null;
  return withCoordinatedQueueTaskMutation(cwd, function ({ queueState, taskState }) {
    const alreadyPaused = queueState.paused;
    queueState.paused = true;

    return {
      version: 1,
      ok: true,
      action: alreadyPaused ? "noop" : "paused",
      reason: alreadyPaused
        ? "Queue was already paused."
        : normalizedNote
          ? `Queue paused. ${normalizedNote}`
          : "Queue paused; no new queued job pickup will occur.",
      queuePaused: queueState.paused,
      activeJobId: queueState.activeJobId,
      stoppedJob: null,
      stoppedTask: null,
      summary: buildQueueInspectionSummary(queueState, taskState, 5),
    };
  });
}

async function resumeQueue(cwd: string, note?: string): Promise<QueueControlResult> {
  const normalizedNote = note?.trim() || null;
  return withCoordinatedQueueTaskMutation(cwd, function ({ queueState, taskState }) {
    const alreadyRunning = !queueState.paused;
    queueState.paused = false;

    return {
      version: 1,
      ok: true,
      action: alreadyRunning ? "noop" : "resumed",
      reason: alreadyRunning
        ? "Queue was already resumable."
        : normalizedNote
          ? `Queue resumed. ${normalizedNote}`
          : "Queue resumed; eligible queued jobs may be picked up again.",
      queuePaused: queueState.paused,
      activeJobId: queueState.activeJobId,
      stoppedJob: null,
      stoppedTask: null,
      summary: buildQueueInspectionSummary(queueState, taskState, 5),
    };
  });
}

async function stopQueueSafely(cwd: string, note?: string): Promise<QueueControlResult> {
  const normalizedNote = note?.trim() || "Operator requested safe stop.";
  return withCoordinatedQueueTaskMutation(cwd, function ({ queueState, taskState }) {
    queueState.paused = true;

    if (!queueState.activeJobId) {
      return {
        version: 1,
        ok: true,
        action: "stopped",
        reason: `${normalizedNote} Queue paused with no active job.`,
        queuePaused: true,
        activeJobId: null,
        stoppedJob: null,
        stoppedTask: null,
        summary: buildQueueInspectionSummary(queueState, taskState, 5),
      };
    }

    const activeJob = getJob(queueState, queueState.activeJobId);
    if (!activeJob) {
      const missingId = queueState.activeJobId;
      queueState.activeJobId = null;
      return {
        version: 1,
        ok: true,
        action: "stopped",
        reason: `${normalizedNote} Cleared missing active job pointer ${missingId}.`,
        queuePaused: true,
        activeJobId: null,
        stoppedJob: null,
        stoppedTask: null,
        summary: buildQueueInspectionSummary(queueState, taskState, 5),
      };
    }

    const normalizedJob = normalizeQueueJob(activeJob);
    if (!normalizedJob.linkedTaskId) {
      const blockedJob = blockJobInState(
        queueState,
        normalizedJob.id,
        `${normalizedNote} Active job was blocked because linkedTaskId was missing during safe stop.`,
        { clearActiveJobId: true },
      );
      return {
        version: 1,
        ok: true,
        action: "stopped",
        reason: `${normalizedNote} Active job ${blockedJob.id} was blocked because linkedTaskId was missing.`,
        queuePaused: true,
        activeJobId: queueState.activeJobId,
        stoppedJob: blockedJob,
        stoppedTask: null,
        summary: buildQueueInspectionSummary(queueState, taskState, 5),
      };
    }

    const linkedTask = getTask(taskState, normalizedJob.linkedTaskId);
    if (!linkedTask) {
      const blockedJob = blockJobInState(
        queueState,
        normalizedJob.id,
        `${normalizedNote} Active job was blocked because linked task ${normalizedJob.linkedTaskId} was missing during safe stop.`,
        { clearActiveJobId: true },
      );
      return {
        version: 1,
        ok: true,
        action: "stopped",
        reason: `${normalizedNote} Active job ${blockedJob.id} was blocked because linked task ${normalizedJob.linkedTaskId} was missing.`,
        queuePaused: true,
        activeJobId: queueState.activeJobId,
        stoppedJob: blockedJob,
        stoppedTask: null,
        summary: buildQueueInspectionSummary(queueState, taskState, 5),
      };
    }

    if (taskTerminal(linkedTask)) {
      const finalizedJob = finalizeRunningJobInState(queueState, normalizedJob.id, linkedTask, null);
      return {
        version: 1,
        ok: true,
        action: "stopped",
        reason: `${normalizedNote} Active job ${finalizedJob.id} was finalized from linked task ${linkedTask.id}.`,
        queuePaused: true,
        activeJobId: queueState.activeJobId,
        stoppedJob: finalizedJob,
        stoppedTask: linkedTask,
        summary: buildQueueInspectionSummary(queueState, taskState, 5),
      };
    }

    const stopNote = `${normalizedNote} Active queue job ${normalizedJob.id} was blocked together with linked task ${linkedTask.id}.`;
    const stopped = stopLinkedTaskAndQueueJobInState(queueState, taskState, normalizedJob.id, linkedTask.id, "blocked", stopNote);
    return {
      version: 1,
      ok: true,
      action: "stopped",
      reason: stopNote,
      queuePaused: true,
      activeJobId: queueState.activeJobId,
      stoppedJob: stopped.job,
      stoppedTask: stopped.task,
      summary: buildQueueInspectionSummary(queueState, taskState, 5),
    };
  });
}

function priorityRank(priority: QueuePriority): number {
  switch (priority) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}

function dependenciesSatisfied(state: QueueState, job: QueueJob): boolean {
  return (job.dependencies ?? []).every((dependencyId) => {
    const dependency = getJob(state, dependencyId);
    return !!dependency && dependency.status === "done";
  });
}

export function selectEligibleQueuedJob(state: QueueState): QueueJob | null {
  return state.jobs
    .map((job, index) => ({ job, index }))
    .filter(({ job }) => job.status === "queued" && dependenciesSatisfied(state, job))
    .sort((left, right) => {
      const priorityDiff = priorityRank(left.job.priority) - priorityRank(right.job.priority);
      return priorityDiff !== 0 ? priorityDiff : left.index - right.index;
    })
    .map(({ job }) => job)[0] ?? null;
}

function normalizeQueueJob(job: QueueJob): QueueJob {
  return {
    ...job,
    dependencies: uniqueStrings(job.dependencies ?? []),
    stop_conditions: uniqueStrings(job.stop_conditions ?? []),
    acceptanceCriteria: uniqueStrings(job.acceptanceCriteria ?? []),
    domains: uniqueStrings((job.domains ?? []) as string[]).filter((value): value is DomainId =>
      DOMAIN_IDS.includes(value as DomainId),
    ),
    allowedPaths: uniqueStrings(job.allowedPaths ?? []),
    notes: [...(job.notes ?? [])],
    linkedTaskId: job.linkedTaskId ?? null,
    packetId: job.packetId ?? null,
    selectedModelId: job.selectedModelId ?? null,
    initialHandoffId: job.initialHandoffId ?? null,
  };
}

function unsupportedControlBlockNote(job: QueueJob): string | null {
  const unsupportedBudgetFields = Object.entries(job.budget ?? {})
    .filter(([key, value]) => value !== undefined && ["maxCostUsd", "maxFilesChanged"].includes(key))
    .map(([key]) => key);
  const unsupportedStopConditions = uniqueStrings(job.stop_conditions ?? []).filter(
    (value) => value !== "approval_boundary_hit",
  );

  if (unsupportedBudgetFields.length === 0 && unsupportedStopConditions.length === 0) {
    return null;
  }

  const unsupportedParts: string[] = [];
  if (unsupportedBudgetFields.length > 0) {
    unsupportedParts.push(`unsupported budget fields (${unsupportedBudgetFields.join(", ")})`);
  }
  if (unsupportedStopConditions.length > 0) {
    unsupportedParts.push(`unsupported stop_conditions (${unsupportedStopConditions.join("; ")})`);
  }

  return `Queue runner blocked the job because ${unsupportedParts.join(" and ")} are not supported by HARNESS-034 stop-condition enforcement.`;
}

function taskFailedValidationCount(task: TaskRecord): number {
  return Math.max(task.retryCount ?? 0, 0) + (task.validation.decision === "fail" ? 1 : 0);
}

function jobExceededRetryBudget(job: QueueJob, task: TaskRecord): boolean {
  const maxRetries = job.budget?.maxRetries;
  if (maxRetries === undefined) return false;
  return task.status === "failed" && (task.retryCount ?? 0) >= maxRetries;
}

function jobExceededFailedValidationBudget(job: QueueJob, task: TaskRecord): boolean {
  const maxFailedValidations = job.budget?.maxFailedValidations;
  if (maxFailedValidations === undefined) return false;
  return taskFailedValidationCount(task) >= maxFailedValidations;
}

function jobExceededRuntimeBudget(job: QueueJob, now: Date = new Date()): boolean {
  const maxRuntimeMinutes = job.budget?.maxRuntimeMinutes;
  if (maxRuntimeMinutes === undefined || !job.startedAt) return false;

  const startedAt = new Date(job.startedAt);
  if (Number.isNaN(startedAt.getTime())) return false;

  return now.getTime() - startedAt.getTime() > maxRuntimeMinutes * 60_000;
}

function ensureRoleBelongsToTeam(team: TeamDefinition, role: HarnessRole): void {
  if (team.lead === role) return;
  if (team.workers.includes(role)) return;
  throw new Error(`Assigned role ${role} does not belong to team ${team.name}.`);
}

function deriveActivationInput(job: QueueJob) {
  return {
    workType: job.workType ?? "mixed",
    requirementsClarity: job.acceptanceCriteria && job.acceptanceCriteria.length > 0 ? "clear" : "ambiguous",
    scopeClarity: job.scope && ((job.allowedPaths?.length ?? 0) > 0 || (job.domains?.length ?? 0) > 0) ? "bounded" : "unclear",
    acceptanceCriteria: job.acceptanceCriteria && job.acceptanceCriteria.length > 0 ? "explicit" : "missing",
    repoImpact: ((job.allowedPaths?.length ?? 0) > 0 || (job.domains?.length ?? 0) > 0) ? "known" : "unclear",
    domains: job.domains ?? [],
  } as const;
}

function resolveJobTeamAndRole(job: QueueJob, teams: Record<TeamId, TeamDefinition>, activationPolicy: Awaited<ReturnType<typeof loadActivationPolicy>>) {
  const chosenTeam = job.team ?? resolveTeamActivation(activationPolicy, teams, deriveActivationInput(job)).initialTeam;
  const team = teams[chosenTeam];
  if (!team) {
    throw new Error(`Unknown team: ${chosenTeam}`);
  }

  const assignedRole = job.assignedRole ?? (team.lead as HarnessRole);
  ensureRoleBelongsToTeam(team, assignedRole);

  return {
    teamId: chosenTeam,
    assignedRole,
  };
}

function defaultWorkTypeForTeam(team: TeamId): WorkType {
  switch (team) {
    case "build":
      return "implementation";
    case "quality":
      return "review_only";
    case "recovery":
      return "review_only";
    case "planning":
      return "mixed";
  }
}

function optionalStringArray(values: string[] | undefined): string[] | undefined {
  return values && values.length > 0 ? values : undefined;
}

async function previewPacketForJob(cwd: string, job: QueueJob, teamId: TeamId, assignedRole: HarnessRole): Promise<GeneratedTaskPacket> {
  const [packetPolicy, teams, routingConfig] = await Promise.all([
    loadPacketPolicy(cwd),
    loadTeamDefinitions(cwd),
    loadHarnessRoutingConfig(cwd),
  ]);

  return generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: job.id,
    parentTaskId: job.linkedTaskId ?? null,
    parentPacketId: null,
    assignedTeam: teamId,
    assignedRole,
    title: job.goal,
    scope: job.scope ?? job.goal,
    workType: job.workType ?? defaultWorkTypeForTeam(teamId),
    domains: job.domains,
    allowedPaths: job.allowedPaths,
    acceptanceCriteria: job.acceptanceCriteria ?? [],
    dependencies: job.dependencies,
    routeReason: job.routeReason,
    budgetMode: job.budgetMode,
    modelOverride: job.modelOverride,
  });
}

async function generatePacketForStartedTask(
  cwd: string,
  job: QueueJob,
  teamId: TeamId,
  assignedRole: HarnessRole,
  taskId: string,
): Promise<GeneratedTaskPacket> {
  const [packetPolicy, teams, routingConfig] = await Promise.all([
    loadPacketPolicy(cwd),
    loadTeamDefinitions(cwd),
    loadHarnessRoutingConfig(cwd),
  ]);

  return generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: job.id,
    parentTaskId: taskId,
    parentPacketId: null,
    assignedTeam: teamId,
    assignedRole,
    title: job.goal,
    scope: job.scope ?? job.goal,
    workType: job.workType ?? defaultWorkTypeForTeam(teamId),
    domains: job.domains,
    allowedPaths: job.allowedPaths,
    acceptanceCriteria: job.acceptanceCriteria ?? [],
    dependencies: job.dependencies,
    routeReason: job.routeReason,
    budgetMode: job.budgetMode,
    modelOverride: job.modelOverride,
  });
}

function buildInitialHandoffIfSupported(
  handoffPolicy: Awaited<ReturnType<typeof loadHandoffPolicy>>,
  packet: TaskPacket,
  teamId: TeamId,
  assignedRole: HarnessRole,
  allowInitialHandoff: boolean,
): GeneratedHandoff | null {
  if (!allowInitialHandoff) return null;
  if (teamId !== "build") return null;
  if (!(["frontend_worker", "backend_worker", "infra_worker"] as const).includes(assignedRole as any)) {
    return null;
  }

  return generateHandoff(handoffPolicy, {
    handoffType: "build_to_worker",
    sourcePacket: packet,
    fromRole: "build_lead",
    toRole: assignedRole,
  });
}

function taskTerminal(task: TaskRecord): boolean {
  return task.status === "done" || task.status === "blocked" || task.status === "failed";
}

function mapTerminalTaskToJobStatus(task: TaskRecord): Extract<QueueJobStatus, "done" | "blocked" | "failed"> {
  switch (task.status) {
    case "done":
      return "done";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    default:
      throw new Error(`Task ${task.id} is not terminal.`);
  }
}

function finalizeRunningJobInState(
  state: QueueState,
  jobId: string,
  task: TaskRecord,
  recoveryDecision: RuntimeRecoveryDecision | null,
): QueueJob {
  const target = getJob(state, jobId);
  if (!target) {
    throw new Error(`Queue job ${jobId} disappeared before finalization.`);
  }

  const terminalStatus = mapTerminalTaskToJobStatus(task);
  target.status = terminalStatus;
  target.finishedAt = nowIso();
  target.updatedAt = target.finishedAt;
  target.lastRecoveryAction = recoveryDecision?.recommendedAction;
  target.lastRecoveryReason = recoveryDecision?.decisionReasons.join(" ") ?? target.lastRecoveryReason;
  target.notes = target.notes ?? [];
  target.notes.push(`Finalized from linked task ${task.id} with terminal status ${task.status}.`);
  state.activeJobId = state.activeJobId === target.id ? null : state.activeJobId;
  return normalizeQueueJob(target);
}

function blockJobInState(
  state: QueueState,
  jobId: string,
  note: string,
  options: { clearActiveJobId?: boolean } = {},
): QueueJob {
  const target = getJob(state, jobId);
  if (!target) {
    throw new Error(`Queue job ${jobId} not found.`);
  }
  target.status = "blocked";
  target.updatedAt = nowIso();
  target.notes = target.notes ?? [];
  target.notes.push(note);
  if (options.clearActiveJobId && state.activeJobId === jobId) {
    state.activeJobId = null;
  }
  return normalizeQueueJob(target);
}

function failJobInState(
  state: QueueState,
  jobId: string,
  note: string,
  options: { clearActiveJobId?: boolean } = {},
): QueueJob {
  const target = getJob(state, jobId);
  if (!target) {
    throw new Error(`Queue job ${jobId} not found.`);
  }
  target.status = "failed";
  target.finishedAt = nowIso();
  target.updatedAt = target.finishedAt;
  target.notes = target.notes ?? [];
  target.notes.push(note);
  if (options.clearActiveJobId && state.activeJobId === jobId) {
    state.activeJobId = null;
  }
  return normalizeQueueJob(target);
}

function transitionTaskForStopInState(taskState: TaskState, taskId: string, status: Extract<TaskRecord["status"], "blocked" | "failed">, note: string): TaskRecord {
  const task = getTask(taskState, taskId);
  if (!task) {
    throw new Error(`Linked task ${taskId} was not found.`);
  }
  task.status = status;
  task.notes.push(note);
  task.timestamps.updatedAt = nowIso();
  task.timestamps.completedAt = task.timestamps.completedAt ?? task.timestamps.updatedAt;
  if (taskState.activeTaskId === task.id) {
    taskState.activeTaskId = null;
  }
  return task;
}

function stopLinkedTaskAndQueueJobInState(
  queueState: QueueState,
  taskState: TaskState,
  jobId: string,
  taskId: string,
  status: Extract<QueueJobStatus, "blocked" | "failed">,
  note: string,
): { job: QueueJob; task: TaskRecord } {
  const task = transitionTaskForStopInState(taskState, taskId, status === "blocked" ? "blocked" : "failed", note);
  const job = status === "blocked" ? blockJobInState(queueState, jobId, note, { clearActiveJobId: true }) : failJobInState(queueState, jobId, note, { clearActiveJobId: true });
  return { job, task };
}

async function prepareLinkedTask(cwd: string, job: QueueJob, owner: string): Promise<TaskRecord> {
  const completionGatePolicy = await loadCompletionGatePolicy(cwd);

  return mutateTaskState(cwd, (state: TaskState) => {
    let task = job.linkedTaskId ? getTask(state, job.linkedTaskId) : undefined;
    const currentActive = getActiveTask(state);

    if (currentActive && (!task || currentActive.id !== task.id)) {
      throw new Error(`Another active task exists: ${currentActive.id}`);
    }

    if (!task || task.status === "done") {
      const createResult = applyTaskUpdateAction(
        state,
        {
          action: "create",
          title: job.goal,
          taskClass: job.taskClass ?? "implementation",
          acceptance: job.acceptanceCriteria ?? [],
        },
        completionGatePolicy,
      );
      if (createResult.details.ok !== true) {
        throw new Error(String(createResult.content[0]?.text ?? "Task creation failed."));
      }
      task = createResult.details.task as TaskRecord;
    }

    if (task.owner !== owner) {
      const claimResult = applyTaskUpdateAction(
        state,
        {
          action: "claim",
          id: task.id,
          owner,
        },
        completionGatePolicy,
      );
      if (claimResult.details.ok !== true) {
        throw new Error(String(claimResult.content[0]?.text ?? "Task claim failed."));
      }
      task = claimResult.details.task as TaskRecord;
    }

    return task;
  });
}

async function startPreparedLinkedTask(cwd: string, taskId: string): Promise<{ task: TaskRecord; result: TaskUpdateResult }> {
  const completionGatePolicy = await loadCompletionGatePolicy(cwd);

  return mutateTaskState(cwd, (state: TaskState) => {
    const task = getTask(state, taskId);
    if (!task) {
      throw new Error(`Linked task ${taskId} was not found before start.`);
    }

    if (task.status === "in_progress") {
      const currentActive = getActiveTask(state);
      if (currentActive && currentActive.id !== task.id) {
        throw new Error(`Another active task exists: ${currentActive.id}`);
      }
      state.activeTaskId = task.id;
      return {
        task,
        result: {
          content: [{ type: "text", text: `Task ${task.id} already active` }],
          details: { ok: true, task, activeTaskId: state.activeTaskId },
        } satisfies TaskUpdateResult,
      };
    }

    const startResult = applyTaskUpdateAction(
      state,
      {
        action: "start",
        id: task.id,
      },
      completionGatePolicy,
    );
    if (startResult.details.ok !== true) {
      throw new Error(String(startResult.content[0]?.text ?? "Task start failed."));
    }

    return {
      task: startResult.details.task as TaskRecord,
      result: startResult,
    };
  });
}

function prepareLinkedTaskInState(
  state: TaskState,
  job: QueueJob,
  owner: string,
  completionGatePolicy: Awaited<ReturnType<typeof loadCompletionGatePolicy>>,
): TaskRecord {
  let task = job.linkedTaskId ? getTask(state, job.linkedTaskId) : undefined;
  const currentActive = getActiveTask(state);

  if (currentActive && (!task || currentActive.id !== task.id)) {
    throw new Error(`Another active task exists: ${currentActive.id}`);
  }

  if (!task || task.status === "done") {
    const createResult = applyTaskUpdateAction(
      state,
      {
        action: "create",
        title: job.goal,
        taskClass: job.taskClass ?? "implementation",
        acceptance: job.acceptanceCriteria ?? [],
      },
      completionGatePolicy,
    );
    if (createResult.details.ok !== true) {
      throw new Error(String(createResult.content[0]?.text ?? "Task creation failed."));
    }
    task = createResult.details.task as TaskRecord;
  }

  if (task.owner !== owner) {
    const claimResult = applyTaskUpdateAction(
      state,
      {
        action: "claim",
        id: task.id,
        owner,
      },
      completionGatePolicy,
    );
    if (claimResult.details.ok !== true) {
      throw new Error(String(claimResult.content[0]?.text ?? "Task claim failed."));
    }
    task = claimResult.details.task as TaskRecord;
  }

  return task;
}

function startPreparedLinkedTaskInState(
  state: TaskState,
  taskId: string,
  completionGatePolicy: Awaited<ReturnType<typeof loadCompletionGatePolicy>>,
): { task: TaskRecord; result: TaskUpdateResult } {
  const task = getTask(state, taskId);
  if (!task) {
    throw new Error(`Linked task ${taskId} was not found before start.`);
  }

  if (task.status === "in_progress") {
    const currentActive = getActiveTask(state);
    if (currentActive && currentActive.id !== task.id) {
      throw new Error(`Another active task exists: ${currentActive.id}`);
    }
    state.activeTaskId = task.id;
    return {
      task,
      result: {
        content: [{ type: "text", text: `Task ${task.id} already active` }],
        details: { ok: true, task, activeTaskId: state.activeTaskId },
      } satisfies TaskUpdateResult,
    };
  }

  const startResult = applyTaskUpdateAction(
    state,
    {
      action: "start",
      id: task.id,
    },
    completionGatePolicy,
  );
  if (startResult.details.ok !== true) {
    throw new Error(String(startResult.content[0]?.text ?? "Task start failed."));
  }

  return {
    task: startResult.details.task as TaskRecord,
    result: startResult,
  };
}

async function markJobRunning(
  cwd: string,
  job: QueueJob,
  task: TaskRecord,
  teamId: TeamId,
  assignedRole: HarnessRole,
  packet: TaskPacket,
  initialHandoff: StructuredHandoff | null,
): Promise<QueueJob> {
  return mutateQueueState(cwd, (state) => {
    const target = getJob(state, job.id);
    if (!target) {
      throw new Error(`Queue job ${job.id} disappeared before start.`);
    }
    target.status = "running";
    target.team = teamId;
    target.assignedRole = assignedRole;
    target.linkedTaskId = task.id;
    target.packetId = packet.packetId;
    target.selectedModelId = packet.routing.selectedModelId;
    target.initialHandoffId = initialHandoff?.handoffId ?? null;
    target.startedAt = target.startedAt ?? nowIso();
    target.updatedAt = nowIso();
    target.notes = target.notes ?? [];
    target.notes.push(`Queue runner activated linked task ${task.id} for ${assignedRole}; task start will complete last.`);
    state.activeJobId = target.id;
    return normalizeQueueJob(target);
  });
}

function markJobRunningInState(
  state: QueueState,
  jobId: string,
  task: TaskRecord,
  teamId: TeamId,
  assignedRole: HarnessRole,
  packet: TaskPacket,
  initialHandoff: StructuredHandoff | null,
): QueueJob {
  const target = getJob(state, jobId);
  if (!target) {
    throw new Error(`Queue job ${jobId} disappeared before start.`);
  }
  target.status = "running";
  target.team = teamId;
  target.assignedRole = assignedRole;
  target.linkedTaskId = task.id;
  target.packetId = packet.packetId;
  target.selectedModelId = packet.routing.selectedModelId;
  target.initialHandoffId = initialHandoff?.handoffId ?? null;
  target.startedAt = target.startedAt ?? nowIso();
  target.updatedAt = nowIso();
  target.notes = target.notes ?? [];
  target.notes.push(`Queue runner activated linked task ${task.id} for ${assignedRole}; task start will complete last.`);
  state.activeJobId = target.id;
  return normalizeQueueJob(target);
}

async function noteStartedQueueJob(cwd: string, jobId: string, taskId: string, assignedRole: HarnessRole): Promise<QueueJob> {
  return mutateQueueState(cwd, (state) => {
    const target = getJob(state, jobId);
    if (!target) {
      throw new Error(`Queue job ${jobId} not found after task start.`);
    }
    target.updatedAt = nowIso();
    target.notes = target.notes ?? [];
    target.notes.push(`Started linked task ${taskId} for ${assignedRole}.`);
    return normalizeQueueJob(target);
  });
}

function noteStartedQueueJobInState(state: QueueState, jobId: string, taskId: string, assignedRole: HarnessRole): QueueJob {
  const target = getJob(state, jobId);
  if (!target) {
    throw new Error(`Queue job ${jobId} not found after task start.`);
  }
  target.updatedAt = nowIso();
  target.notes = target.notes ?? [];
  target.notes.push(`Started linked task ${taskId} for ${assignedRole}.`);
  return normalizeQueueJob(target);
}

async function compensateFailedQueueStart(cwd: string, jobId: string, taskId: string, note: string): Promise<QueueJob> {
  return mutateQueueState(cwd, (state) => {
    const target = getJob(state, jobId);
    if (!target) {
      throw new Error(`Queue job ${jobId} not found during queue-start compensation.`);
    }
    if (state.activeJobId === jobId) {
      state.activeJobId = null;
    }
    target.status = "blocked";
    target.updatedAt = nowIso();
    target.notes = target.notes ?? [];
    target.notes.push(`Queue runner compensated a partial start for linked task ${taskId}: ${note}`);
    return normalizeQueueJob(target);
  });
}

function compensateFailedQueueStartInState(state: QueueState, jobId: string, taskId: string, note: string): QueueJob {
  const target = getJob(state, jobId);
  if (!target) {
    throw new Error(`Queue job ${jobId} not found during queue-start compensation.`);
  }
  if (state.activeJobId === jobId) {
    state.activeJobId = null;
  }
  target.status = "blocked";
  target.updatedAt = nowIso();
  target.notes = target.notes ?? [];
  target.notes.push(`Queue runner compensated a partial start for linked task ${taskId}: ${note}`);
  return normalizeQueueJob(target);
}

async function startNextQueuedJob(cwd: string, owner: string, allowInitialHandoff: boolean): Promise<QueueRunnerResult> {
  const blockedJobIds: string[] = [];
  const completionGatePolicy = await loadCompletionGatePolicy(cwd);

  while (true) {
    const attempt = await withCoordinatedQueueTaskMutation(cwd, async ({ queueState, taskState }) => {
      if (queueState.paused) {
        return {
          type: "paused" as const,
          queuePaused: true,
          activeJobId: queueState.activeJobId,
        };
      }
      if (queueState.activeJobId) {
        return {
          type: "queue-active" as const,
          activeJobId: queueState.activeJobId,
        };
      }

      const nextJob = selectEligibleQueuedJob(queueState);
      if (!nextJob) {
        return {
          type: "no-eligible-job" as const,
        };
      }

      const job = normalizeQueueJob(nextJob);
      if ((job.acceptanceCriteria ?? []).length === 0) {
        blockJobInState(queueState, job.id, "Queue runner blocked the job because explicit acceptanceCriteria are required before task creation.");
        return {
          type: "blocked-before-start" as const,
          jobId: job.id,
        };
      }

      const unsupportedControlsNote = unsupportedControlBlockNote(job);
      if (unsupportedControlsNote) {
        blockJobInState(queueState, job.id, unsupportedControlsNote);
        return {
          type: "blocked-before-start" as const,
          jobId: job.id,
        };
      }

      if (job.approvalRequired) {
        blockJobInState(queueState, job.id, "Queue runner blocked the queued job because the approval boundary was hit before start (approvalRequired=true).");
        return {
          type: "blocked-before-start" as const,
          jobId: job.id,
        };
      }

      if (job.linkedTaskId) {
        const linkedTask = getTask(taskState, job.linkedTaskId);
        if (linkedTask) {
          if (jobExceededRetryBudget(job, linkedTask)) {
            failJobInState(queueState, job.id, `Queue runner failed the queued job before restart because linked task ${linkedTask.id} exhausted budget.maxRetries.`);
            return {
              type: "failed-before-start" as const,
              jobId: job.id,
            };
          }

          if (jobExceededFailedValidationBudget(job, linkedTask)) {
            failJobInState(queueState, job.id, `Queue runner failed the queued job before restart because linked task ${linkedTask.id} exhausted budget.maxFailedValidations using retryCount plus the current validation failure.`);
            return {
              type: "failed-before-start" as const,
              jobId: job.id,
            };
          }
        }
      }

      try {
        const [activationPolicy, teams, handoffPolicy] = await Promise.all([
          loadActivationPolicy(cwd),
          loadTeamDefinitions(cwd),
          loadHandoffPolicy(cwd),
        ]);
        const { teamId, assignedRole } = resolveJobTeamAndRole(job, teams, activationPolicy);
        await previewPacketForJob(cwd, job, teamId, assignedRole);
        const task = prepareLinkedTaskInState(taskState, job, owner, completionGatePolicy);
        const generatedPacket = await generatePacketForStartedTask(cwd, job, teamId, assignedRole, task.id);
        const initialHandoff = buildInitialHandoffIfSupported(handoffPolicy, generatedPacket.packet, teamId, assignedRole, allowInitialHandoff);

        markJobRunningInState(queueState, job.id, task, teamId, assignedRole, generatedPacket.packet, initialHandoff?.handoff ?? null);

        try {
          const { task: startedTask } = startPreparedLinkedTaskInState(taskState, task.id, completionGatePolicy);
          const startedJob = noteStartedQueueJobInState(queueState, job.id, startedTask.id, assignedRole);
          return {
            type: "started" as const,
            startedJob,
            startedTask,
            packet: generatedPacket.packet,
            initialHandoff: initialHandoff?.handoff ?? null,
          };
        } catch (startError) {
          const startMessage = String(startError);
          const blockedJob = compensateFailedQueueStartInState(queueState, job.id, task.id, startMessage);
          return {
            type: "start-failed" as const,
            blockedJob,
            task,
            packet: generatedPacket.packet,
            initialHandoff: initialHandoff?.handoff ?? null,
            startMessage,
          };
        }
      } catch (error) {
        const message = String(error);
        if (message.startsWith("Another active task exists:")) {
          return {
            type: "active-task-conflict" as const,
            message,
          };
        }

        blockJobInState(queueState, job.id, `Queue runner blocked the job before start: ${message}`);
        return {
          type: "blocked-before-start" as const,
          jobId: job.id,
        };
      }
    });

    if (attempt.type === "paused") {
      return {
        version: 1,
        ok: true,
        action: "noop",
        reason: "Queue is paused; no new job was started.",
        queuePaused: true,
        activeJobId: attempt.activeJobId,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds,
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (attempt.type === "queue-active") {
      return {
        version: 1,
        ok: false,
        action: "noop",
        reason: `Queue already has active job ${attempt.activeJobId}.`,
        queuePaused: false,
        activeJobId: attempt.activeJobId,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds,
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (attempt.type === "no-eligible-job") {
      return {
        version: 1,
        ok: true,
        action: blockedJobIds.length > 0 ? "blocked" : "noop",
        reason: blockedJobIds.length > 0 ? "Blocked invalid queued jobs; no runnable queued job remained." : "No eligible queued jobs were found.",
        queuePaused: false,
        activeJobId: null,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds,
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (attempt.type === "active-task-conflict") {
      return {
        version: 1,
        ok: false,
        action: "noop",
        reason: attempt.message,
        queuePaused: false,
        activeJobId: null,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds,
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (attempt.type === "blocked-before-start" || attempt.type === "failed-before-start") {
      blockedJobIds.push(attempt.jobId);
      continue;
    }

    if (attempt.type === "start-failed") {
      blockedJobIds.push(attempt.blockedJob.id);
      return {
        version: 1,
        ok: false,
        action: "blocked",
        reason: `Queue runner blocked ${attempt.blockedJob.id} after queue activation because linked task ${attempt.task.id} could not start: ${attempt.startMessage}`,
        queuePaused: false,
        activeJobId: null,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds,
        linkedTask: attempt.task,
        packet: attempt.packet,
        initialHandoff: attempt.initialHandoff,
        recoveryDecision: null,
      };
    }

    return {
      version: 1,
      ok: true,
      action: "started",
      reason: `Started queued job ${attempt.startedJob.id}.`,
      queuePaused: false,
      activeJobId: attempt.startedJob.id,
      startedJob: attempt.startedJob,
      finalizedJob: null,
      blockedJobIds,
      linkedTask: attempt.startedTask,
      packet: attempt.packet,
      initialHandoff: attempt.initialHandoff,
      recoveryDecision: null,
    };
  }
}

export async function runNextQueueJob(cwd: string, input: { owner?: string; allowInitialHandoff?: boolean } = {}): Promise<QueueRunnerResult> {
  const owner = input.owner?.trim() || "assistant";
  const allowInitialHandoff = input.allowInitialHandoff ?? true;
  const queueState = await readQueueState(cwd);

  if (queueState.activeJobId) {
    const runningJob = getJob(queueState, queueState.activeJobId);
    if (!runningJob) {
      return {
        version: 1,
        ok: false,
        action: "noop",
        reason: `Queue activeJobId ${queueState.activeJobId} points to a missing job.`,
        queuePaused: queueState.paused,
        activeJobId: queueState.activeJobId,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds: [],
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    const activeOutcome = await withCoordinatedQueueTaskMutation(cwd, async ({ queueState: coordinatedQueueState, taskState }) => {
      const coordinatedActiveJobId = coordinatedQueueState.activeJobId;
      if (!coordinatedActiveJobId) {
        return {
          type: "no-active-job" as const,
        };
      }

      const coordinatedRunningJob = getJob(coordinatedQueueState, coordinatedActiveJobId);
      if (!coordinatedRunningJob) {
        return {
          type: "missing-active-job" as const,
          activeJobId: coordinatedActiveJobId,
          queuePaused: coordinatedQueueState.paused,
        };
      }

      const normalizedJob = normalizeQueueJob(coordinatedRunningJob);
      if (!normalizedJob.linkedTaskId) {
        const blocked = blockJobInState(
          coordinatedQueueState,
          normalizedJob.id,
          "Queue runner blocked the active job because linkedTaskId was missing.",
          { clearActiveJobId: true },
        );
        return {
          type: "blocked-missing-linked-task-id" as const,
          blocked,
          queuePaused: coordinatedQueueState.paused,
        };
      }

      const linkedTask = getTask(taskState, normalizedJob.linkedTaskId);
      if (!linkedTask) {
        const blocked = blockJobInState(
          coordinatedQueueState,
          normalizedJob.id,
          `Queue runner blocked the active job because linked task ${normalizedJob.linkedTaskId} was not found.`,
          { clearActiveJobId: true },
        );
        return {
          type: "blocked-missing-linked-task" as const,
          blocked,
          queuePaused: coordinatedQueueState.paused,
        };
      }

      if (!taskTerminal(linkedTask)) {
        if (normalizedJob.approvalRequired) {
          const note = `Queue runner stopped the active job at the approval boundary because approvalRequired=true for linked task ${linkedTask.id}.`;
          const stopped = stopLinkedTaskAndQueueJobInState(
            coordinatedQueueState,
            taskState,
            normalizedJob.id,
            linkedTask.id,
            "blocked",
            note,
          );
          return {
            type: "stopped-active-job" as const,
            stopAction: "blocked" as const,
            finalizedJob: stopped.job,
            linkedTask: stopped.task,
            queuePaused: coordinatedQueueState.paused,
          };
        }

        if (jobExceededRuntimeBudget(normalizedJob)) {
          const note = `Queue runner failed the active job because linked task ${linkedTask.id} exceeded budget.maxRuntimeMinutes.`;
          const stopped = stopLinkedTaskAndQueueJobInState(
            coordinatedQueueState,
            taskState,
            normalizedJob.id,
            linkedTask.id,
            "failed",
            note,
          );
          return {
            type: "stopped-active-job" as const,
            stopAction: "finalized" as const,
            finalizedJob: stopped.job,
            linkedTask: stopped.task,
            queuePaused: coordinatedQueueState.paused,
          };
        }

        return {
          type: "active-job-still-running" as const,
          normalizedJob,
          linkedTask,
          queuePaused: coordinatedQueueState.paused,
          activeJobId: coordinatedQueueState.activeJobId,
        };
      }

      const recoveryDecision =
        linkedTask.status === "failed" || linkedTask.status === "blocked"
          ? resolveRecoveryRuntimeDecision(await loadRecoveryPolicy(cwd), await loadHarnessRoutingConfig(cwd), {
              role: normalizedJob.assignedRole ?? "orchestrator",
              currentModelId: normalizedJob.selectedModelId ?? undefined,
              task: linkedTask,
            })
          : null;
      const finalizedJob = finalizeRunningJobInState(coordinatedQueueState, normalizedJob.id, linkedTask, recoveryDecision);
      return {
        type: "finalized" as const,
        finalizedJob,
        linkedTask,
        recoveryDecision,
        queuePaused: coordinatedQueueState.paused,
      };
    });

    if (activeOutcome.type === "no-active-job") {
      return startNextQueuedJob(cwd, owner, allowInitialHandoff);
    }

    if (activeOutcome.type === "missing-active-job") {
      return {
        version: 1,
        ok: false,
        action: "noop",
        reason: `Queue activeJobId ${activeOutcome.activeJobId} points to a missing job.`,
        queuePaused: activeOutcome.queuePaused,
        activeJobId: activeOutcome.activeJobId,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds: [],
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (activeOutcome.type === "blocked-missing-linked-task-id") {
      return {
        version: 1,
        ok: true,
        action: "blocked",
        reason: `Active job ${activeOutcome.blocked.id} was blocked because linkedTaskId was missing.`,
        queuePaused: activeOutcome.queuePaused,
        activeJobId: null,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds: [activeOutcome.blocked.id],
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (activeOutcome.type === "blocked-missing-linked-task") {
      return {
        version: 1,
        ok: true,
        action: "blocked",
        reason: `Active job ${activeOutcome.blocked.id} was blocked because its linked task was missing.`,
        queuePaused: activeOutcome.queuePaused,
        activeJobId: null,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds: [activeOutcome.blocked.id],
        linkedTask: null,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (activeOutcome.type === "active-job-still-running") {
      return {
        version: 1,
        ok: true,
        action: "noop",
        reason: `Active job ${activeOutcome.normalizedJob.id} remains ${activeOutcome.normalizedJob.status} because linked task ${activeOutcome.linkedTask.id} is still ${activeOutcome.linkedTask.status}.`,
        queuePaused: activeOutcome.queuePaused,
        activeJobId: activeOutcome.activeJobId,
        startedJob: null,
        finalizedJob: null,
        blockedJobIds: [],
        linkedTask: activeOutcome.linkedTask,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    if (activeOutcome.type === "stopped-active-job") {
      return {
        version: 1,
        ok: true,
        action: activeOutcome.stopAction,
        reason:
          activeOutcome.stopAction === "blocked"
            ? `Active job ${activeOutcome.finalizedJob.id} was blocked together with linked task ${activeOutcome.linkedTask.id}.`
            : `Active job ${activeOutcome.finalizedJob.id} was failed together with linked task ${activeOutcome.linkedTask.id}.`,
        queuePaused: activeOutcome.queuePaused,
        activeJobId: null,
        startedJob: null,
        finalizedJob: activeOutcome.stopAction === "finalized" ? activeOutcome.finalizedJob : null,
        blockedJobIds: activeOutcome.stopAction === "blocked" ? [activeOutcome.finalizedJob.id] : [],
        linkedTask: activeOutcome.linkedTask,
        packet: null,
        initialHandoff: null,
        recoveryDecision: null,
      };
    }

    return {
      version: 1,
      ok: true,
      action: "finalized",
      reason: `Finalized active job ${activeOutcome.finalizedJob.id} from linked task ${activeOutcome.linkedTask.id}.`,
      queuePaused: activeOutcome.queuePaused,
      activeJobId: null,
      startedJob: null,
      finalizedJob: activeOutcome.finalizedJob,
      blockedJobIds: [],
      linkedTask: activeOutcome.linkedTask,
      packet: null,
      initialHandoff: null,
      recoveryDecision: activeOutcome.recoveryDecision,
    };
  }

  return startNextQueuedJob(cwd, owner, allowInitialHandoff);
}

export const runQueueOnce = runNextQueueJob;

export default function queueRunner(pi: ExtensionAPI) {
  const registerQueueRunnerTool = (toolName: string, label: string, description: string, promptSnippet: string) => {
    pi.registerTool({
      name: toolName,
      label,
      description,
      promptSnippet,
      promptGuidelines: [
        `Prefer ${PUBLIC_QUEUE_RUNNER_TOOL_NAME} when queue-driven autonomy should advance by at most one job in a visible, reviewable step.`,
        "This tool finalizes one running job or starts one queued job; it does not run a free-form daemon loop.",
      ],
      parameters: RunQueueOnceSchema,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const result = await runNextQueueJob(ctx.cwd, params);
        const branch = await getCurrentBranch(pi, ctx.cwd);
        const modelId = modelIdFromContext(ctx);

        await appendAudit(ctx.cwd, {
          ts: nowIso(),
          extension: "queue-runner",
          action: toolName,
          publicToolName: PUBLIC_QUEUE_RUNNER_TOOL_NAME,
          cwd: ctx.cwd,
          branch,
          modelId,
          provider: providerFromModelId(modelId),
          input: params,
          result: {
            ok: result.ok,
            action: result.action,
            reason: result.reason,
            activeJobId: result.activeJobId,
            startedJobId: result.startedJob?.id ?? null,
            finalizedJobId: result.finalizedJob?.id ?? null,
            blockedJobIds: result.blockedJobIds,
            linkedTaskId: result.linkedTask?.id ?? null,
            recoveryAction: result.recoveryDecision?.recommendedAction ?? null,
          },
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      },
    });
  };

  registerQueueRunnerTool(
    PUBLIC_QUEUE_RUNNER_TOOL_NAME,
    "Run Next Queue Job",
    "Finalize one active running queue job if its linked task is terminal, otherwise start one eligible queued job.",
    "Use run_next_queue_job to advance exactly one queue job without improvising multi-job autonomy.",
  );

  registerQueueRunnerTool(
    QUEUE_RUNNER_COMPAT_TOOL_NAME,
    "Run Queue Once (Compatibility Alias)",
    "Compatibility alias for run_next_queue_job.",
    "Compatibility alias for run_next_queue_job; prefer the public run_next_queue_job tool name for new usage.",
  );

  pi.registerTool({
    name: INSPECT_QUEUE_STATE_TOOL_NAME,
    label: "Inspect Queue State",
    description: "Return the current queue and task state plus an operator-friendly summary.",
    promptSnippet: "Use inspect_queue_state to inspect current queue and task status before deciding whether to run, pause, resume, or stop.",
    promptGuidelines: [
      "Use this before operational decisions so queue/task state comes from runtime files rather than chat memory.",
      "Prefer this tool when the operator needs to know the active job/task, blocked items, failed items, or whether the queue is paused.",
    ],
    parameters: InspectQueueStateSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await inspectQueueState(ctx.cwd, params);
      const branch = await getCurrentBranch(pi, ctx.cwd);
      const modelId = modelIdFromContext(ctx);
      await appendAudit(ctx.cwd, {
        ts: nowIso(),
        extension: "queue-runner",
        action: INSPECT_QUEUE_STATE_TOOL_NAME,
        cwd: ctx.cwd,
        branch,
        modelId,
        provider: providerFromModelId(modelId),
        input: params,
        result: result.summary,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: PAUSE_QUEUE_TOOL_NAME,
    label: "Pause Queue",
    description: "Pause new queue pickup while preserving visible queue/task state.",
    promptSnippet: "Use pause_queue when the operator wants to stop new queued job pickup without discarding state.",
    promptGuidelines: [
      "Pause stops new queued job pickup but does not silently discard current queue/task state.",
      "Use inspect_queue_state after pausing if the operator also needs a fresh summary.",
    ],
    parameters: QueueControlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await pauseQueue(ctx.cwd, params.note);
      const branch = await getCurrentBranch(pi, ctx.cwd);
      const modelId = modelIdFromContext(ctx);
      await appendAudit(ctx.cwd, {
        ts: nowIso(),
        extension: "queue-runner",
        action: PAUSE_QUEUE_TOOL_NAME,
        cwd: ctx.cwd,
        branch,
        modelId,
        provider: providerFromModelId(modelId),
        input: params,
        result: {
          action: result.action,
          reason: result.reason,
          queuePaused: result.queuePaused,
          activeJobId: result.activeJobId,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: RESUME_QUEUE_TOOL_NAME,
    label: "Resume Queue",
    description: "Resume eligible queued job pickup from visible runtime state.",
    promptSnippet: "Use resume_queue when the operator wants eligible queued jobs to become runnable again.",
    promptGuidelines: [
      "Resume only flips the queue pause state; it does not fabricate hidden execution context.",
      "Follow with run_next_queue_job when the operator wants to advance at most one bounded job.",
    ],
    parameters: QueueControlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await resumeQueue(ctx.cwd, params.note);
      const branch = await getCurrentBranch(pi, ctx.cwd);
      const modelId = modelIdFromContext(ctx);
      await appendAudit(ctx.cwd, {
        ts: nowIso(),
        extension: "queue-runner",
        action: RESUME_QUEUE_TOOL_NAME,
        cwd: ctx.cwd,
        branch,
        modelId,
        provider: providerFromModelId(modelId),
        input: params,
        result: {
          action: result.action,
          reason: result.reason,
          queuePaused: result.queuePaused,
          activeJobId: result.activeJobId,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: STOP_QUEUE_SAFELY_TOOL_NAME,
    label: "Stop Queue Safely",
    description: "Pause the queue and put the current active queue/task state into a reviewable stopped condition.",
    promptSnippet: "Use stop_queue_safely when the operator wants a safe reviewable stop instead of continued pickup or hidden state.",
    promptGuidelines: [
      "This tool pauses the queue and preserves visible queue/task state instead of silently discarding it.",
      "If an active job is still running, the tool blocks the linked job/task together so the stop is reviewable.",
    ],
    parameters: QueueControlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await stopQueueSafely(ctx.cwd, params.note);
      const branch = await getCurrentBranch(pi, ctx.cwd);
      const modelId = modelIdFromContext(ctx);
      await appendAudit(ctx.cwd, {
        ts: nowIso(),
        extension: "queue-runner",
        action: STOP_QUEUE_SAFELY_TOOL_NAME,
        cwd: ctx.cwd,
        branch,
        modelId,
        provider: providerFromModelId(modelId),
        input: params,
        result: {
          action: result.action,
          reason: result.reason,
          queuePaused: result.queuePaused,
          activeJobId: result.activeJobId,
          stoppedJobId: result.stoppedJob?.id ?? null,
          stoppedTaskId: result.stoppedTask?.id ?? null,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}
