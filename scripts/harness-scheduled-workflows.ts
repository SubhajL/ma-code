import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEDULE_TYPES = ["daily", "weekday", "manual-disabled"] as const;
export const QUEUE_PRIORITIES = ["low", "medium", "high"] as const;
export const TEAM_IDS = ["planning", "build", "quality", "recovery"] as const;
export const DOMAIN_IDS = ["frontend", "backend", "infra", "docs", "research"] as const;
export const WORK_TYPES = ["implementation", "docs_only", "research_only", "review_only", "mixed"] as const;
export const TASK_CLASSES = ["research", "docs", "implementation", "runtime_safety"] as const;
export const ROLE_IDS = [
  "orchestrator",
  "planning_lead",
  "build_lead",
  "quality_lead",
  "research_worker",
  "frontend_worker",
  "backend_worker",
  "infra_worker",
  "reviewer_worker",
  "validator_worker",
  "docs_worker",
  "recovery_worker",
] as const;

const CONFIG_FILE = ".pi/agent/schedules/scheduled-workflows.json";
const RUNTIME_STATE_FILE = ".pi/agent/state/runtime/scheduled-workflows.json";
const QUEUE_FILE = ".pi/agent/state/runtime/queue.json";

export type ScheduleType = (typeof SCHEDULE_TYPES)[number];
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number];
export type TeamId = (typeof TEAM_IDS)[number];
export type DomainId = (typeof DOMAIN_IDS)[number];
export type WorkType = (typeof WORK_TYPES)[number];
export type TaskClass = (typeof TASK_CLASSES)[number];
export type HarnessRole = (typeof ROLE_IDS)[number];

export interface ScheduledWorkflowJobTemplate {
  goal: string;
  priority: QueuePriority;
  scope?: string;
  team?: TeamId;
  dependencies?: string[];
  approvalRequired?: boolean;
  acceptanceCriteria: string[];
  taskClass?: TaskClass;
  workType?: WorkType;
  domains?: DomainId[];
  allowedPaths?: string[];
  assignedRole?: HarnessRole;
  notes?: string[];
}

export interface ScheduledWorkflowDefinition {
  id: string;
  title: string;
  description: string;
  schedule:
    | {
        type: "daily" | "weekday";
        hourUtc: number;
        minuteUtc: number;
      }
    | {
        type: "manual-disabled";
      };
  queueJobTemplate: ScheduledWorkflowJobTemplate;
}

export interface ScheduledWorkflowConfig {
  version: 1;
  timezone: "UTC";
  workflows: ScheduledWorkflowDefinition[];
}

export interface ScheduledWorkflowRuntimeEntry {
  lastEvaluatedAt: string | null;
  lastEvaluatedRunKey: string | null;
  lastMaterializedAt: string | null;
  lastMaterializedRunKey: string | null;
  lastJobId: string | null;
}

export interface ScheduledWorkflowRuntimeState {
  version: 1;
  workflows: Record<string, ScheduledWorkflowRuntimeEntry>;
}

export interface QueueJobRecord {
  id: string;
  goal: string;
  priority: QueuePriority;
  status: "queued" | "running" | "blocked" | "done" | "failed";
  scope?: string;
  team?: TeamId;
  dependencies?: string[];
  approvalRequired?: boolean;
  acceptanceCriteria?: string[];
  taskClass?: TaskClass;
  workType?: WorkType;
  domains?: DomainId[];
  allowedPaths?: string[];
  assignedRole?: HarnessRole;
  scheduledWorkflowId?: string | null;
  scheduledRunKey?: string | null;
  notes?: string[];
  updatedAt?: string;
}

export interface QueueState {
  version: 1;
  paused: boolean;
  activeJobId: string | null;
  jobs: QueueJobRecord[];
}

export interface ScheduledWorkflowStatusItem {
  id: string;
  title: string;
  description: string;
  scheduleType: ScheduleType;
  scheduledTimeUtc: string | null;
  runKey: string | null;
  due: boolean;
  disabled: boolean;
  alreadyMaterialized: boolean;
  eligibleForMaterialization: boolean;
  existingJobIds: string[];
  reason: string;
  previewGoal: string;
  previewPriority: QueuePriority;
  approvalRequired: boolean;
}

export interface ScheduledWorkflowStatusView {
  version: 1;
  cwd: string;
  evaluatedAt: string;
  queuePaused: boolean;
  totalWorkflows: number;
  dueWorkflowIds: string[];
  eligibleWorkflowIds: string[];
  items: ScheduledWorkflowStatusItem[];
}

export interface MaterializeScheduledWorkflowResult {
  version: 1;
  cwd: string;
  evaluatedAt: string;
  apply: boolean;
  requestedWorkflowIds: string[] | null;
  dueWorkflowIds: string[];
  eligibleWorkflowIds: string[];
  createdJobIds: string[];
  skipped: Array<{ workflowId: string; reason: string }>;
  queuePaused: boolean;
  queueSize: number;
}

export interface ScheduledWorkflowStatusOptions {
  cwd?: string;
  now?: Date;
  workflowIds?: string[];
}

export interface MaterializeScheduledWorkflowOptions extends ScheduledWorkflowStatusOptions {
  apply?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertOptionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings when provided.`);
  }
  return value.map((entry) => entry.trim());
}

function assertEnum<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T[number];
}

function assertOptionalEnumArray<T extends readonly string[]>(value: unknown, allowed: T, label: string): Array<T[number]> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array when provided.`);
  return value.map((entry, index) => assertEnum(entry, allowed, `${label}[${index}]`));
}

function assertIntegerRange(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return Number(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function toIsoNow(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function getDateKeyUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimeUtc(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)} UTC`;
}

function normalizeWorkflowId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function ensureDate(input: Date | undefined): Date {
  return input ? new Date(input.toISOString()) : new Date();
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureQueueFile(cwd: string): Promise<QueueState> {
  const absolute = resolve(cwd, QUEUE_FILE);
  try {
    const raw = await readJsonFile(absolute);
    return validateQueueState(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const initial: QueueState = { version: 1, paused: false, activeJobId: null, jobs: [] };
    await writeJsonFile(absolute, initial);
    return initial;
  }
}

function validateQueueState(input: unknown): QueueState {
  if (!isObject(input)) throw new Error("Queue state must be an object.");
  if (input.version !== 1) throw new Error("Queue state version must be 1.");
  if (typeof input.paused !== "boolean") throw new Error("Queue state paused must be boolean.");
  if (!(typeof input.activeJobId === "string" || input.activeJobId === null)) {
    throw new Error("Queue state activeJobId must be a string or null.");
  }
  if (!Array.isArray(input.jobs)) throw new Error("Queue state jobs must be an array.");
  return input as unknown as QueueState;
}

async function loadRuntimeState(cwd: string): Promise<ScheduledWorkflowRuntimeState> {
  const absolute = resolve(cwd, RUNTIME_STATE_FILE);
  try {
    const raw = await readJsonFile(absolute);
    return validateRuntimeState(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const initial: ScheduledWorkflowRuntimeState = { version: 1, workflows: {} };
    await writeJsonFile(absolute, initial);
    return initial;
  }
}

function validateRuntimeState(input: unknown): ScheduledWorkflowRuntimeState {
  if (!isObject(input)) throw new Error("Scheduled workflow runtime state must be an object.");
  if (input.version !== 1) throw new Error("Scheduled workflow runtime state version must be 1.");
  if (!isObject(input.workflows)) throw new Error("Scheduled workflow runtime state workflows must be an object.");
  return input as unknown as ScheduledWorkflowRuntimeState;
}

function validateJobTemplate(input: unknown, label: string): ScheduledWorkflowJobTemplate {
  if (!isObject(input)) throw new Error(`${label} must be an object.`);
  return {
    goal: assertString(input.goal, `${label}.goal`),
    priority: assertEnum(input.priority, QUEUE_PRIORITIES, `${label}.priority`),
    scope: input.scope === undefined ? undefined : assertString(input.scope, `${label}.scope`),
    team: input.team === undefined ? undefined : assertEnum(input.team, TEAM_IDS, `${label}.team`),
    dependencies: assertOptionalStringArray(input.dependencies, `${label}.dependencies`),
    approvalRequired: input.approvalRequired === undefined ? undefined : Boolean(input.approvalRequired),
    acceptanceCriteria: assertOptionalStringArray(input.acceptanceCriteria, `${label}.acceptanceCriteria`) ?? (() => {
      throw new Error(`${label}.acceptanceCriteria must be provided.`);
    })(),
    taskClass: input.taskClass === undefined ? undefined : assertEnum(input.taskClass, TASK_CLASSES, `${label}.taskClass`),
    workType: input.workType === undefined ? undefined : assertEnum(input.workType, WORK_TYPES, `${label}.workType`),
    domains: assertOptionalEnumArray(input.domains, DOMAIN_IDS, `${label}.domains`),
    allowedPaths: assertOptionalStringArray(input.allowedPaths, `${label}.allowedPaths`),
    assignedRole: input.assignedRole === undefined ? undefined : assertEnum(input.assignedRole, ROLE_IDS, `${label}.assignedRole`),
    notes: assertOptionalStringArray(input.notes, `${label}.notes`),
  };
}

function validateWorkflowDefinition(input: unknown, label: string): ScheduledWorkflowDefinition {
  if (!isObject(input)) throw new Error(`${label} must be an object.`);
  const id = normalizeWorkflowId(assertString(input.id, `${label}.id`));
  const title = assertString(input.title, `${label}.title`);
  const description = assertString(input.description, `${label}.description`);
  if (!isObject(input.schedule)) throw new Error(`${label}.schedule must be an object.`);
  const type = assertEnum(input.schedule.type, SCHEDULE_TYPES, `${label}.schedule.type`);

  const schedule =
    type === "manual-disabled"
      ? { type }
      : {
          type,
          hourUtc: assertIntegerRange(input.schedule.hourUtc, 0, 23, `${label}.schedule.hourUtc`),
          minuteUtc: assertIntegerRange(input.schedule.minuteUtc, 0, 59, `${label}.schedule.minuteUtc`),
        };

  return {
    id,
    title,
    description,
    schedule,
    queueJobTemplate: validateJobTemplate(input.queueJobTemplate, `${label}.queueJobTemplate`),
  };
}

export async function loadScheduledWorkflowConfig(cwd: string): Promise<ScheduledWorkflowConfig> {
  const absolute = resolve(cwd, CONFIG_FILE);
  const raw = await readJsonFile(absolute);
  if (!isObject(raw)) throw new Error("Scheduled workflow config must be an object.");
  if (raw.version !== 1) throw new Error("Scheduled workflow config version must be 1.");
  if (raw.timezone !== "UTC") throw new Error("Scheduled workflow config timezone must be UTC.");
  if (!Array.isArray(raw.workflows) || raw.workflows.length === 0) {
    throw new Error("Scheduled workflow config workflows must be a non-empty array.");
  }

  const workflows = raw.workflows.map((workflow, index) => validateWorkflowDefinition(workflow, `workflows[${index}]`));
  const ids = workflows.map((workflow) => workflow.id);
  if (uniqueStrings(ids).length !== ids.length) {
    throw new Error("Scheduled workflow config contains duplicate workflow ids.");
  }

  return {
    version: 1,
    timezone: "UTC",
    workflows,
  };
}

function getRuntimeEntry(state: ScheduledWorkflowRuntimeState, workflowId: string): ScheduledWorkflowRuntimeEntry {
  return state.workflows[workflowId] ?? {
    lastEvaluatedAt: null,
    lastEvaluatedRunKey: null,
    lastMaterializedAt: null,
    lastMaterializedRunKey: null,
    lastJobId: null,
  };
}

function computeDueWindow(
  workflow: ScheduledWorkflowDefinition,
  now: Date,
): { runKey: string | null; scheduledTimeUtc: string | null; due: boolean; disabled: boolean; reason: string } {
  if (workflow.schedule.type === "manual-disabled") {
    return {
      runKey: null,
      scheduledTimeUtc: null,
      due: false,
      disabled: true,
      reason: "Manual-disabled workflow. Inspect it, then enable or materialize only after explicit human approval.",
    };
  }

  const runKey = getDateKeyUtc(now);
  const scheduledAt = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      workflow.schedule.hourUtc,
      workflow.schedule.minuteUtc,
      0,
      0,
    ),
  );

  if (workflow.schedule.type === "weekday") {
    const weekday = now.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      return {
        runKey,
        scheduledTimeUtc: formatTimeUtc(workflow.schedule.hourUtc, workflow.schedule.minuteUtc),
        due: false,
        disabled: false,
        reason: "Weekday schedule is not due on weekends.",
      };
    }
  }

  if (now.getTime() < scheduledAt.getTime()) {
    return {
      runKey,
      scheduledTimeUtc: formatTimeUtc(workflow.schedule.hourUtc, workflow.schedule.minuteUtc),
      due: false,
      disabled: false,
      reason: `Next run becomes due at ${scheduledAt.toISOString()}.`,
    };
  }

  return {
    runKey,
    scheduledTimeUtc: formatTimeUtc(workflow.schedule.hourUtc, workflow.schedule.minuteUtc),
    due: true,
    disabled: false,
    reason: `Scheduled run ${runKey} is due for explicit operator materialization.`,
  };
}

function findExistingRunJobIds(queue: QueueState, workflowId: string, runKey: string | null): string[] {
  if (!runKey) return [];
  return queue.jobs
    .filter((job) => job.scheduledWorkflowId === workflowId && job.scheduledRunKey === runKey)
    .map((job) => job.id);
}

function buildScheduledWorkflowStatusItems(
  workflows: ScheduledWorkflowDefinition[],
  runtimeState: ScheduledWorkflowRuntimeState,
  queue: QueueState,
  now: Date,
): ScheduledWorkflowStatusItem[] {
  return workflows.map((workflow) => {
    const dueWindow = computeDueWindow(workflow, now);
    const runtimeEntry = getRuntimeEntry(runtimeState, workflow.id);
    const existingJobIds = findExistingRunJobIds(queue, workflow.id, dueWindow.runKey);
    const alreadyMaterialized =
      (dueWindow.runKey !== null && runtimeEntry.lastMaterializedRunKey === dueWindow.runKey) || existingJobIds.length > 0;

    const eligibleForMaterialization = dueWindow.due && !dueWindow.disabled && !alreadyMaterialized;
    let reason = dueWindow.reason;
    if (alreadyMaterialized && dueWindow.runKey) {
      reason = `Run ${dueWindow.runKey} already has a queued/history record; duplicate materialization is blocked.`;
    }

    return {
      id: workflow.id,
      title: workflow.title,
      description: workflow.description,
      scheduleType: workflow.schedule.type,
      scheduledTimeUtc: dueWindow.scheduledTimeUtc,
      runKey: dueWindow.runKey,
      due: dueWindow.due,
      disabled: dueWindow.disabled,
      alreadyMaterialized,
      eligibleForMaterialization,
      existingJobIds,
      reason,
      previewGoal: workflow.queueJobTemplate.goal,
      previewPriority: workflow.queueJobTemplate.priority,
      approvalRequired: workflow.queueJobTemplate.approvalRequired === true,
    };
  });
}

function filterRequestedWorkflows(
  workflows: ScheduledWorkflowDefinition[],
  workflowIds: string[] | undefined,
): ScheduledWorkflowDefinition[] {
  if (!workflowIds || workflowIds.length === 0) return workflows;
  const requested = uniqueStrings(workflowIds.map(normalizeWorkflowId));
  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  for (const workflowId of requested) {
    if (!workflowMap.has(workflowId)) throw new Error(`Unknown scheduled workflow id: ${workflowId}`);
  }
  return requested.map((workflowId) => workflowMap.get(workflowId)!);
}

function createScheduledQueueJob(workflow: ScheduledWorkflowDefinition, runKey: string, now: Date): QueueJobRecord {
  const jobId = `scheduled-${workflow.id}-${runKey}`;
  const notes = uniqueStrings([
    ...(workflow.queueJobTemplate.notes ?? []),
    `Scheduled workflow: ${workflow.id}`,
    `Scheduled run key: ${runKey}`,
    `Materialized at: ${now.toISOString()}`,
  ]);

  return {
    id: jobId,
    goal: workflow.queueJobTemplate.goal,
    priority: workflow.queueJobTemplate.priority,
    status: "queued",
    scope: workflow.queueJobTemplate.scope,
    team: workflow.queueJobTemplate.team,
    dependencies: workflow.queueJobTemplate.dependencies,
    approvalRequired: workflow.queueJobTemplate.approvalRequired,
    acceptanceCriteria: workflow.queueJobTemplate.acceptanceCriteria,
    taskClass: workflow.queueJobTemplate.taskClass,
    workType: workflow.queueJobTemplate.workType,
    domains: workflow.queueJobTemplate.domains,
    allowedPaths: workflow.queueJobTemplate.allowedPaths,
    assignedRole: workflow.queueJobTemplate.assignedRole,
    scheduledWorkflowId: workflow.id,
    scheduledRunKey: runKey,
    notes,
    updatedAt: now.toISOString(),
  };
}

export async function buildScheduledWorkflowStatus(options: ScheduledWorkflowStatusOptions = {}): Promise<ScheduledWorkflowStatusView> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const now = ensureDate(options.now);
  const config = await loadScheduledWorkflowConfig(cwd);
  const queue = await ensureQueueFile(cwd);
  const runtimeState = await loadRuntimeState(cwd);
  const workflows = filterRequestedWorkflows(config.workflows, options.workflowIds);
  const items = buildScheduledWorkflowStatusItems(workflows, runtimeState, queue, now);

  for (const item of items) {
    runtimeState.workflows[item.id] = {
      ...getRuntimeEntry(runtimeState, item.id),
      lastEvaluatedAt: now.toISOString(),
      lastEvaluatedRunKey: item.runKey,
    };
  }
  await writeJsonFile(resolve(cwd, RUNTIME_STATE_FILE), runtimeState);

  return {
    version: 1,
    cwd,
    evaluatedAt: now.toISOString(),
    queuePaused: queue.paused,
    totalWorkflows: items.length,
    dueWorkflowIds: items.filter((item) => item.due).map((item) => item.id),
    eligibleWorkflowIds: items.filter((item) => item.eligibleForMaterialization).map((item) => item.id),
    items,
  };
}

export async function materializeScheduledWorkflows(
  options: MaterializeScheduledWorkflowOptions = {},
): Promise<MaterializeScheduledWorkflowResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const now = ensureDate(options.now);
  const apply = options.apply === true;
  const config = await loadScheduledWorkflowConfig(cwd);
  const queue = await ensureQueueFile(cwd);
  const runtimeState = await loadRuntimeState(cwd);
  const workflows = filterRequestedWorkflows(config.workflows, options.workflowIds);
  const items = buildScheduledWorkflowStatusItems(workflows, runtimeState, queue, now);

  const createdJobIds: string[] = [];
  const skipped: Array<{ workflowId: string; reason: string }> = [];

  for (const item of items) {
    runtimeState.workflows[item.id] = {
      ...getRuntimeEntry(runtimeState, item.id),
      lastEvaluatedAt: now.toISOString(),
      lastEvaluatedRunKey: item.runKey,
    };

    if (!item.eligibleForMaterialization) {
      skipped.push({ workflowId: item.id, reason: item.reason });
      continue;
    }

    if (!apply) continue;

    const workflow = workflows.find((candidate) => candidate.id === item.id)!;
    const created = createScheduledQueueJob(workflow, item.runKey!, now);
    queue.jobs.push(created);
    createdJobIds.push(created.id);
    runtimeState.workflows[item.id] = {
      ...runtimeState.workflows[item.id],
      lastMaterializedAt: now.toISOString(),
      lastMaterializedRunKey: item.runKey,
      lastJobId: created.id,
    };
  }

  await writeJsonFile(resolve(cwd, RUNTIME_STATE_FILE), runtimeState);
  if (apply) {
    await writeJsonFile(resolve(cwd, QUEUE_FILE), queue);
  }

  return {
    version: 1,
    cwd,
    evaluatedAt: now.toISOString(),
    apply,
    requestedWorkflowIds: options.workflowIds ? uniqueStrings(options.workflowIds.map(normalizeWorkflowId)) : null,
    dueWorkflowIds: items.filter((item) => item.due).map((item) => item.id),
    eligibleWorkflowIds: items.filter((item) => item.eligibleForMaterialization).map((item) => item.id),
    createdJobIds,
    skipped,
    queuePaused: queue.paused,
    queueSize: queue.jobs.length,
  };
}

export function renderScheduledWorkflowStatus(view: ScheduledWorkflowStatusView): string {
  const lines = [
    "Harness Scheduled Workflows",
    `cwd: ${view.cwd}`,
    `evaluated at: ${view.evaluatedAt}`,
    `queue paused: ${view.queuePaused ? "yes" : "no"}`,
    `total workflows: ${view.totalWorkflows}`,
    `due workflows: ${view.dueWorkflowIds.length > 0 ? view.dueWorkflowIds.join(", ") : "none"}`,
    `eligible to materialize: ${view.eligibleWorkflowIds.length > 0 ? view.eligibleWorkflowIds.join(", ") : "none"}`,
  ];

  for (const item of view.items) {
    const flags = [
      item.disabled ? "disabled" : item.due ? "due" : "not-due",
      item.alreadyMaterialized ? "already-materialized" : item.eligibleForMaterialization ? "eligible" : "blocked",
      item.approvalRequired ? "approval-required" : "no-approval",
    ].join(", ");
    lines.push(
      `- ${item.id} :: ${item.scheduleType}${item.scheduledTimeUtc ? ` @ ${item.scheduledTimeUtc}` : ""} :: ${flags}`,
      `  goal: ${item.previewGoal}`,
      `  reason: ${item.reason}`,
      `  existing jobs: ${item.existingJobIds.length > 0 ? item.existingJobIds.join(", ") : "none"}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function renderScheduledWorkflowMaterialization(result: MaterializeScheduledWorkflowResult): string {
  const lines = [
    "Harness Scheduled Workflow Materialization",
    `cwd: ${result.cwd}`,
    `evaluated at: ${result.evaluatedAt}`,
    `mode: ${result.apply ? "apply" : "dry-run"}`,
    `due workflows: ${result.dueWorkflowIds.length > 0 ? result.dueWorkflowIds.join(", ") : "none"}`,
    `eligible workflows: ${result.eligibleWorkflowIds.length > 0 ? result.eligibleWorkflowIds.join(", ") : "none"}`,
    `created jobs: ${result.createdJobIds.length > 0 ? result.createdJobIds.join(", ") : "none"}`,
    `queue size: ${result.queueSize}`,
  ];

  if (result.skipped.length > 0) {
    lines.push("skipped:");
    for (const skipped of result.skipped) {
      lines.push(`- ${skipped.workflowId}: ${skipped.reason}`);
    }
  }

  if (!result.apply) {
    lines.push("note: rerun with --apply to enqueue eligible scheduled workflows explicitly.");
  }

  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(`Usage: node --import tsx scripts/harness-scheduled-workflows.ts <command> [options]\n\nCommands:\n  status          Inspect due/disabled/already-materialized scheduled workflows\n  materialize     Show or apply explicit queue materialization for eligible scheduled workflows\n\nOptions:\n  --cwd <path>       Inspect a specific repo/runtime root (default: current working directory)\n  --workflow <id>    Restrict output to one or more workflow ids (repeatable)\n  --now <iso>        Override the evaluation timestamp for testing/debugging\n  --apply            For materialize only, actually enqueue eligible jobs\n  --json             Emit machine-readable JSON\n  -h, --help         Show this help text\n`);
}

function parseArgs(argv: string[]): {
  command?: string;
  cwd?: string;
  workflowIds: string[];
  now?: Date;
  apply: boolean;
  json: boolean;
  help: boolean;
} {
  const result: {
    command?: string;
    cwd?: string;
    workflowIds: string[];
    now?: Date;
    apply: boolean;
    json: boolean;
    help: boolean;
  } = {
    workflowIds: [],
    apply: false,
    json: false,
    help: false,
  };

  const [command, ...rest] = argv;
  result.command = command;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--apply") {
      result.apply = true;
      continue;
    }
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      result.help = true;
      continue;
    }
    if (arg === "--cwd") {
      const value = rest[index + 1];
      if (!value) throw new Error("--cwd requires a path value.");
      result.cwd = value;
      index += 1;
      continue;
    }
    if (arg === "--workflow") {
      const value = rest[index + 1];
      if (!value) throw new Error("--workflow requires a workflow id value.");
      result.workflowIds.push(value);
      index += 1;
      continue;
    }
    if (arg === "--now") {
      const value = rest[index + 1];
      if (!value) throw new Error("--now requires an ISO timestamp value.");
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid --now value: ${value}`);
      result.now = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    printUsage();
    return;
  }

  if (args.command === "status") {
    const view = await buildScheduledWorkflowStatus({ cwd: args.cwd, now: args.now, workflowIds: args.workflowIds });
    process.stdout.write(args.json ? `${JSON.stringify(view, null, 2)}\n` : renderScheduledWorkflowStatus(view));
    return;
  }

  if (args.command === "materialize") {
    const result = await materializeScheduledWorkflows({
      cwd: args.cwd,
      now: args.now,
      workflowIds: args.workflowIds,
      apply: args.apply,
    });
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderScheduledWorkflowMaterialization(result));
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`harness-scheduled-workflows failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
