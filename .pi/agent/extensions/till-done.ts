import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TaskStatus = "queued" | "in_progress" | "review" | "blocked" | "done" | "failed";
export type TaskClass = "research" | "docs" | "implementation" | "runtime_safety";
export type ValidationTier = "lightweight" | "standard" | "strict";
export type ValidationSource = "review" | "validator" | "override";
export type ValidationDecision = "pending" | "pass" | "fail" | "blocked" | "overridden";
export type ChecklistStatus = "met" | "partial" | "not_met" | "not_applicable";
export type ChecklistCategory = "acceptance" | "tests" | "diff_review" | "evidence";

export interface ValidationChecklist {
  acceptance: ChecklistStatus;
  tests: ChecklistStatus;
  diff_review: ChecklistStatus;
  evidence: ChecklistStatus;
}

export interface ValidationState {
  tier: ValidationTier;
  decision: ValidationDecision;
  source: ValidationSource | null;
  checklist: ValidationChecklist | null;
  approvalRef: string | null;
  updatedAt: string | null;
}

export interface CompletionGateTaskClassPolicy {
  tier: ValidationTier;
  allowed_validation_sources: ValidationSource[];
  required_categories: ChecklistCategory[];
  allow_not_applicable: ChecklistCategory[];
  override_requires_approval: boolean;
  notes: string[];
}

export interface CompletionGatePolicy {
  version: 1;
  checklist_categories: ChecklistCategory[];
  validation_tiers: Record<ValidationTier, { description: string }>;
  task_classes: Record<TaskClass, CompletionGateTaskClassPolicy>;
}

export interface TaskRecord {
  id: string;
  title: string;
  owner: string | null;
  status: TaskStatus;
  taskClass: TaskClass;
  acceptance: string[];
  evidence: string[];
  dependencies?: string[];
  retryCount?: number;
  validation: ValidationState;
  notes: string[];
  timestamps: {
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
  };
}

export interface TaskState {
  version: 1;
  activeTaskId: string | null;
  tasks: TaskRecord[];
}

export interface TaskUpdateParams {
  action: "show" | "create" | "claim" | "start" | "note" | "evidence" | "review" | "validate" | "override" | "requeue" | "block" | "done" | "fail";
  id?: string;
  title?: string;
  owner?: string;
  taskClass?: TaskClass;
  acceptance?: string[];
  dependencies?: string[];
  evidence?: string[];
  note?: string;
  validationSource?: ValidationSource;
  validationDecision?: "pass" | "fail" | "blocked";
  validationChecklist?: ValidationChecklist;
  approvalRef?: string;
}

export interface TaskUpdateResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

export const TASKS_FILE = ".pi/agent/state/runtime/tasks.json";
const AUDIT_LOG = "logs/harness-actions.jsonl";
const COMPLETION_GATE_POLICY_FILE = ".pi/agent/validation/completion-gate-policy.json";
const TASK_CLASSES = ["research", "docs", "implementation", "runtime_safety"] as const;
const VALIDATION_SOURCES = ["review", "validator", "override"] as const;
const VALIDATION_DECISIONS = ["pass", "fail", "blocked"] as const;
const CHECKLIST_STATUSES = ["met", "partial", "not_met", "not_applicable"] as const;

const ValidationChecklistSchema = Type.Object({
  acceptance: StringEnum(CHECKLIST_STATUSES),
  tests: StringEnum(CHECKLIST_STATUSES),
  diff_review: StringEnum(CHECKLIST_STATUSES),
  evidence: StringEnum(CHECKLIST_STATUSES),
});

const TaskUpdateSchema = Type.Object({
  action: StringEnum([
    "show",
    "create",
    "claim",
    "start",
    "note",
    "evidence",
    "review",
    "validate",
    "override",
    "requeue",
    "block",
    "done",
    "fail",
  ] as const),
  id: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  owner: Type.Optional(Type.String()),
  taskClass: Type.Optional(StringEnum(TASK_CLASSES)),
  acceptance: Type.Optional(Type.Array(Type.String())),
  dependencies: Type.Optional(Type.Array(Type.String())),
  evidence: Type.Optional(Type.Array(Type.String())),
  note: Type.Optional(Type.String()),
  validationSource: Type.Optional(StringEnum(VALIDATION_SOURCES)),
  validationDecision: Type.Optional(StringEnum(VALIDATION_DECISIONS)),
  validationChecklist: Type.Optional(ValidationChecklistSchema),
  approvalRef: Type.Optional(Type.String()),
});

function nowIso(): string {
  return new Date().toISOString();
}

function makeTaskId(): string {
  return `task-${Date.now()}`;
}

function defaultValidationChecklist(): ValidationChecklist {
  return {
    acceptance: "not_met",
    tests: "not_met",
    diff_review: "not_met",
    evidence: "not_met",
  };
}

function defaultValidationState(taskClass: TaskClass, policy: CompletionGatePolicy): ValidationState {
  return {
    tier: policy.task_classes[taskClass].tier,
    decision: "pending",
    source: null,
    checklist: null,
    approvalRef: null,
    updatedAt: null,
  };
}

export async function loadCompletionGatePolicy(cwd: string): Promise<CompletionGatePolicy> {
  const fallbackPath = fileURLToPath(new URL("../validation/completion-gate-policy.json", import.meta.url));
  const candidates = [resolve(cwd, COMPLETION_GATE_POLICY_FILE), fallbackPath];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      return JSON.parse(raw) as CompletionGatePolicy;
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Unable to load completion-gate policy from ${COMPLETION_GATE_POLICY_FILE}`);
}

function normalizeValidationState(taskClass: TaskClass, validation: Partial<ValidationState> | undefined, policy: CompletionGatePolicy): ValidationState {
  const fallback = defaultValidationState(taskClass, policy);
  const checklist = validation?.checklist
    ? {
        acceptance: validation.checklist.acceptance ?? defaultValidationChecklist().acceptance,
        tests: validation.checklist.tests ?? defaultValidationChecklist().tests,
        diff_review: validation.checklist.diff_review ?? defaultValidationChecklist().diff_review,
        evidence: validation.checklist.evidence ?? defaultValidationChecklist().evidence,
      }
    : null;

  return {
    tier: validation?.tier ?? fallback.tier,
    decision: validation?.decision ?? fallback.decision,
    source: validation?.source ?? fallback.source,
    checklist,
    approvalRef: validation?.approvalRef ?? null,
    updatedAt: validation?.updatedAt ?? null,
  };
}

function normalizeTaskRecord(task: TaskRecord, policy: CompletionGatePolicy): TaskRecord {
  const taskClass = task.taskClass ?? "implementation";
  return {
    ...task,
    taskClass,
    dependencies: task.dependencies ?? [],
    retryCount: task.retryCount ?? 0,
    validation: normalizeValidationState(taskClass, task.validation, policy),
  };
}

export function normalizeState(state: TaskState, policy: CompletionGatePolicy): void {
  state.tasks = state.tasks.map((task) => normalizeTaskRecord(task, policy));
}

function validationBlockReason(task: TaskRecord): string {
  return `Task cannot be completed until validation passes for task class ${task.taskClass}.`;
}

function assertChecklistSatisfied(task: TaskRecord, checklist: ValidationChecklist, policy: CompletionGatePolicy): string[] {
  const taskPolicy = policy.task_classes[task.taskClass];
  const problems: string[] = [];
  const entries: Array<[ChecklistCategory, ChecklistStatus]> = [
    ["acceptance", checklist.acceptance],
    ["tests", checklist.tests],
    ["diff_review", checklist.diff_review],
    ["evidence", checklist.evidence],
  ];

  for (const [category, status] of entries) {
    const required = taskPolicy.required_categories.includes(category);
    const allowNotApplicable = taskPolicy.allow_not_applicable.includes(category);

    if (!required) continue;
    if (status === "met") continue;
    if (status === "not_applicable" && allowNotApplicable) continue;

    problems.push(`${category} must be met${allowNotApplicable ? " or not_applicable" : ""} for task class ${task.taskClass}.`);
  }

  return problems;
}

function isAllowedValidationSource(task: TaskRecord, source: ValidationSource, policy: CompletionGatePolicy): boolean {
  return policy.task_classes[task.taskClass].allowed_validation_sources.includes(source);
}

function transitionToTerminalReviewOutcome(task: TaskRecord, decision: "fail" | "blocked", note: string): void {
  task.status = decision === "fail" ? "failed" : "blocked";
  task.notes.push(note);
  task.timestamps.updatedAt = nowIso();
}

function isMutatingBash(command: string): boolean {
  return [
    /\brm\b/i,
    /\bmv\b/i,
    /\bcp\b/i,
    /\btouch\b/i,
    /\bmkdir\b/i,
    /\btee\b/i,
    />/,
    /\bsed\s+-i\b/i,
    /\bperl\s+-i\b/i,
    /\bgit\s+(add|commit|merge|rebase|cherry-pick|reset|restore|clean|checkout|switch|push)\b/i,
  ].some((pattern) => pattern.test(command));
}

async function appendAudit(cwd: string, entry: Record<string, unknown>): Promise<void> {
  const logFile = resolve(cwd, AUDIT_LOG);
  await mkdir(dirname(logFile), { recursive: true });

  await withFileMutationQueue(logFile, async () => {
    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  });
}

export async function ensureTaskFile(cwd: string): Promise<void> {
  const absolute = resolve(cwd, TASKS_FILE);
  await mkdir(dirname(absolute), { recursive: true });

  try {
    await readFile(absolute, "utf8");
  } catch {
    const initial: TaskState = {
      version: 1,
      activeTaskId: null,
      tasks: [],
    };

    await writeFile(absolute, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
  }
}

export async function readTaskState(cwd: string): Promise<TaskState> {
  await ensureTaskFile(cwd);
  const absolute = resolve(cwd, TASKS_FILE);
  const raw = await readFile(absolute, "utf8");
  return JSON.parse(raw) as TaskState;
}

export async function writeTaskState(cwd: string, state: TaskState): Promise<void> {
  const absolute = resolve(cwd, TASKS_FILE);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function mutateTaskState<T>(cwd: string, fn: (state: TaskState) => T | Promise<T>): Promise<T> {
  const absolute = resolve(cwd, TASKS_FILE);
  await ensureTaskFile(cwd);

  return withFileMutationQueue(absolute, async () => {
    const raw = await readFile(absolute, "utf8");
    const state = JSON.parse(raw) as TaskState;
    const result = await fn(state);
    await writeTaskState(cwd, state);
    return result;
  });
}

export function getTask(state: TaskState, id: string): TaskRecord | undefined {
  return state.tasks.find((task) => task.id === id);
}

export function getActiveTask(state: TaskState): TaskRecord | undefined {
  return state.activeTaskId ? getTask(state, state.activeTaskId) : undefined;
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    queued: ["in_progress", "blocked", "failed"],
    in_progress: ["queued", "review", "blocked", "failed"],
    review: ["in_progress", "blocked", "failed", "done"],
    blocked: ["queued", "in_progress", "failed"],
    done: [],
    failed: ["queued", "in_progress"],
  };

  return allowed[from].includes(to);
}

function taskIsRunnable(task: TaskRecord | undefined): boolean {
  return !!task && task.status === "in_progress" && task.acceptance.length > 0 && !!task.owner;
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

function blockingDependenciesForStart(state: TaskState, task: TaskRecord): string[] {
  return (task.dependencies ?? []).filter((dependencyId) => {
    const dependency = getTask(state, dependencyId);
    return !dependency || dependency.status === "blocked" || dependency.status === "failed";
  });
}

function unresolvedDependenciesForDone(state: TaskState, task: TaskRecord): string[] {
  return (task.dependencies ?? []).filter((dependencyId) => {
    const dependency = getTask(state, dependencyId);
    return !dependency || dependency.status !== "done";
  });
}


export function applyTaskUpdateAction(state: TaskState, params: TaskUpdateParams, completionGatePolicy: CompletionGatePolicy): TaskUpdateResult {
  normalizeState(state, completionGatePolicy);
  const action = params.action;

  if (action === "show") {
    const active = getActiveTask(state);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              activeTaskId: state.activeTaskId,
              activeTask: active ?? null,
              tasks: state.tasks,
            },
            null,
            2,
          ),
        },
      ],
      details: { activeTaskId: state.activeTaskId, taskCount: state.tasks.length },
    };
  }

  if (action === "create") {
    if (!params.title || !params.acceptance || params.acceptance.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "create requires `title` and non-empty `acceptance`.",
          },
        ],
        details: { ok: false },
      };
    }

    const taskClass: TaskClass = params.taskClass ?? "implementation";
    const task: TaskRecord = {
      id: params.id ?? makeTaskId(),
      title: params.title,
      owner: params.owner ?? null,
      status: "queued",
      taskClass,
      acceptance: params.acceptance,
      evidence: [],
      dependencies: params.dependencies ?? [],
      retryCount: 0,
      validation: defaultValidationState(taskClass, completionGatePolicy),
      notes: [],
      timestamps: {
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    };

    state.tasks.push(task);

    return {
      content: [{ type: "text" as const, text: `Created task ${task.id}` }],
      details: { ok: true, task },
    };
  }

  if (!params.id) {
    return {
      content: [{ type: "text" as const, text: `${action} requires \`id\`.` }],
      details: { ok: false },
    };
  }

  const task = getTask(state, params.id);
  if (!task) {
    return {
      content: [{ type: "text" as const, text: `Task not found: ${params.id}` }],
      details: { ok: false },
    };
  }

  if (action === "claim") {
    if (!params.owner) {
      return {
        content: [{ type: "text" as const, text: "claim requires `owner`." }],
        details: { ok: false },
      };
    }

    task.owner = params.owner;
    task.timestamps.updatedAt = nowIso();

    return {
      content: [{ type: "text" as const, text: `Claimed ${task.id} for ${task.owner}` }],
      details: { ok: true, task },
    };
  }

  if (action === "start") {
    const currentActive = getActiveTask(state);
    if (currentActive && currentActive.id !== task.id) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Another active task exists: ${currentActive.id}. Resolve or block it before starting ${task.id}.`,
          },
        ],
        details: { ok: false, activeTaskId: state.activeTaskId },
      };
    }

    if (!canTransition(task.status, "in_progress")) {
      return {
        content: [
          { type: "text" as const, text: `Illegal transition: ${task.status} -> in_progress` },
        ],
        details: { ok: false },
      };
    }

    if (task.acceptance.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "Task cannot start without acceptance criteria." },
        ],
        details: { ok: false },
      };
    }

    if (!task.owner) {
      return {
        content: [{ type: "text" as const, text: "Task cannot start without an owner." }],
        details: { ok: false },
      };
    }

    const blockingDependencies = blockingDependenciesForStart(state, task);
    if (blockingDependencies.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task cannot start while blocked/failed dependencies remain unresolved: ${blockingDependencies.join(", ")}`,
          },
        ],
        details: { ok: false, blockingDependencies },
      };
    }

    const previousStatus = task.status;
    task.status = "in_progress";
    task.validation = defaultValidationState(task.taskClass, completionGatePolicy);
    task.timestamps.startedAt = task.timestamps.startedAt ?? nowIso();
    task.timestamps.updatedAt = nowIso();
    if (previousStatus === "failed") {
      task.retryCount = (task.retryCount ?? 0) + 1;
    }
    state.activeTaskId = task.id;

    return {
      content: [{ type: "text" as const, text: `Started ${task.id} and made it active` }],
      details: {
        ok: true,
        task,
        activeTaskId: state.activeTaskId,
        previousStatus,
        nextStatus: task.status,
        retryCount: task.retryCount ?? 0,
      },
    };
  }

  if (action === "note") {
    if (!params.note) {
      return {
        content: [{ type: "text" as const, text: "note requires `note`." }],
        details: { ok: false },
      };
    }

    task.notes.push(params.note);
    task.timestamps.updatedAt = nowIso();

    return {
      content: [{ type: "text" as const, text: `Added note to ${task.id}` }],
      details: { ok: true, task },
    };
  }

  if (action === "evidence") {
    if (!params.evidence || params.evidence.length === 0) {
      return {
        content: [{ type: "text" as const, text: "evidence requires non-empty `evidence`." }],
        details: { ok: false },
      };
    }

    task.evidence.push(...params.evidence);
    task.timestamps.updatedAt = nowIso();

    return {
      content: [{ type: "text" as const, text: `Added evidence to ${task.id}` }],
      details: { ok: true, task },
    };
  }

  if (action === "review") {
    if (!canTransition(task.status, "review")) {
      return {
        content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> review` }],
        details: { ok: false },
      };
    }

    const previousStatus = task.status;
    task.status = "review";
    task.timestamps.updatedAt = nowIso();
    if (state.activeTaskId === task.id) state.activeTaskId = null;

    return {
      content: [{ type: "text" as const, text: `Moved ${task.id} to review` }],
      details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
    };
  }

  if (action === "validate") {
    if (task.status !== "review") {
      return {
        content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> validate` }],
        details: { ok: false },
      };
    }

    if (!params.validationDecision || !params.validationSource || !params.validationChecklist) {
      return {
        content: [
          {
            type: "text" as const,
            text: "validate requires `validationDecision`, `validationSource`, and `validationChecklist`.",
          },
        ],
        details: { ok: false },
      };
    }

    if (!isAllowedValidationSource(task, params.validationSource, completionGatePolicy)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Validation source ${params.validationSource} is not allowed for task class ${task.taskClass}.`,
          },
        ],
        details: { ok: false },
      };
    }

    const checklistProblems = assertChecklistSatisfied(task, params.validationChecklist, completionGatePolicy);
    if (params.validationDecision === "pass" && checklistProblems.length > 0) {
      return {
        content: [{ type: "text" as const, text: checklistProblems.join(" ") }],
        details: { ok: false, checklistProblems },
      };
    }

    if ((params.validationDecision === "fail" || params.validationDecision === "blocked") && !params.note) {
      return {
        content: [{ type: "text" as const, text: "validate requires `note` for fail or blocked outcomes." }],
        details: { ok: false },
      };
    }

    task.validation = {
      tier: completionGatePolicy.task_classes[task.taskClass].tier,
      decision: params.validationDecision,
      source: params.validationSource,
      checklist: params.validationChecklist,
      approvalRef: null,
      updatedAt: nowIso(),
    };
    if (params.evidence && params.evidence.length > 0) {
      task.evidence.push(...params.evidence);
    }
    task.timestamps.updatedAt = nowIso();

    if (params.validationDecision === "pass") {
      return {
        content: [{ type: "text" as const, text: `Validation passed for ${task.id}` }],
        details: { ok: true, task, validationDecision: task.validation.decision },
      };
    }

    transitionToTerminalReviewOutcome(task, params.validationDecision, params.note!);
    if (state.activeTaskId === task.id) state.activeTaskId = null;

    return {
      content: [
        {
          type: "text" as const,
          text:
            params.validationDecision === "fail"
              ? `Validation failed for ${task.id}`
              : `Validation blocked ${task.id}`,
        },
      ],
      details: { ok: true, task, validationDecision: task.validation.decision, activeTaskId: state.activeTaskId },
    };
  }

  if (action === "override") {
    if (task.status !== "review" && task.status !== "blocked") {
      return {
        content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> override` }],
        details: { ok: false },
      };
    }

    const taskPolicy = completionGatePolicy.task_classes[task.taskClass];
    if (taskPolicy.override_requires_approval && (!params.approvalRef || !params.note)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "override requires `approvalRef` and `note` for manual completion-gate bypass.",
          },
        ],
        details: { ok: false },
      };
    }

    task.status = "review";
    task.validation = {
      tier: taskPolicy.tier,
      decision: "overridden",
      source: "override",
      checklist: task.validation.checklist,
      approvalRef: params.approvalRef ?? null,
      updatedAt: nowIso(),
    };
    task.notes.push(params.note!);
    if (params.evidence && params.evidence.length > 0) {
      task.evidence.push(...params.evidence);
    }
    task.timestamps.updatedAt = nowIso();

    return {
      content: [{ type: "text" as const, text: `Override recorded for ${task.id}` }],
      details: { ok: true, task, validationDecision: task.validation.decision },
    };
  }

  if (action === "requeue") {
    if (!params.note) {
      return {
        content: [{ type: "text" as const, text: "requeue requires `note`." }],
        details: { ok: false },
      };
    }

    if (!canTransition(task.status, "queued")) {
      return {
        content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> queued` }],
        details: { ok: false },
      };
    }

    const previousStatus = task.status;
    task.status = "queued";
    task.notes.push(params.note);
    task.timestamps.updatedAt = nowIso();
    if (state.activeTaskId === task.id) state.activeTaskId = null;

    return {
      content: [{ type: "text" as const, text: `Requeued ${task.id}` }],
      details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
    };
  }

  if (action === "block") {
    if (!params.note) {
      return {
        content: [{ type: "text" as const, text: "block requires `note`." }],
        details: { ok: false },
      };
    }

    if (!canTransition(task.status, "blocked")) {
      return {
        content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> blocked` }],
        details: { ok: false },
      };
    }

    const previousStatus = task.status;
    task.status = "blocked";
    task.notes.push(params.note);
    task.timestamps.updatedAt = nowIso();
    if (state.activeTaskId === task.id) state.activeTaskId = null;

    return {
      content: [{ type: "text" as const, text: `Blocked ${task.id}` }],
      details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
    };
  }

  if (action === "done") {
    if (task.status !== "review") {
      return {
        content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> done` }],
        details: { ok: false },
      };
    }

    if (task.evidence.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "Task cannot be completed without evidence." },
        ],
        details: { ok: false },
      };
    }

    const unresolvedDependencies = unresolvedDependenciesForDone(state, task);
    if (unresolvedDependencies.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task cannot be completed while dependencies remain unresolved: ${unresolvedDependencies.join(", ")}`,
          },
        ],
        details: { ok: false, unresolvedDependencies },
      };
    }

    if (task.validation.decision !== "pass" && task.validation.decision !== "overridden") {
      return {
        content: [{ type: "text" as const, text: validationBlockReason(task) }],
        details: { ok: false, validationDecision: task.validation.decision, validationTier: task.validation.tier },
      };
    }

    const previousStatus = task.status;
    task.status = "done";
    task.timestamps.completedAt = nowIso();
    task.timestamps.updatedAt = nowIso();
    if (state.activeTaskId === task.id) state.activeTaskId = null;

    return {
      content: [{ type: "text" as const, text: `Completed ${task.id}` }],
      details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
    };
  }

  if (action === "fail") {
    if (!params.note) {
      return {
        content: [{ type: "text" as const, text: "fail requires `note`." }],
        details: { ok: false },
      };
    }

    if (!canTransition(task.status, "failed")) {
      return {
        content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> failed` }],
        details: { ok: false },
      };
    }

    const previousStatus = task.status;
    task.status = "failed";
    task.notes.push(params.note);
    task.timestamps.updatedAt = nowIso();
    if (state.activeTaskId === task.id) state.activeTaskId = null;

    return {
      content: [{ type: "text" as const, text: `Failed ${task.id}` }],
      details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
    };
  }

  return {
    content: [{ type: "text" as const, text: `Unhandled action: ${action}` }],
    details: { ok: false },
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "task_update",
    label: "Task Update",
    description: "Create, claim, start, validate, and complete tasks using file-backed JSON state.",
    parameters: TaskUpdateSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const completionGatePolicy = await loadCompletionGatePolicy(ctx.cwd);
      const result = await mutateTaskState(ctx.cwd, async (state) => applyTaskUpdateAction(state, params as TaskUpdateParams, completionGatePolicy));

      const branch = await getCurrentBranch(pi, ctx.cwd);
      const modelId = modelIdFromContext(ctx);
      const details = (result as { details?: Record<string, unknown> }).details ?? {};
      const task = details.task as TaskRecord | undefined;

      await appendAudit(ctx.cwd, {
        ts: nowIso(),
        extension: "till-done",
        action: "task_update",
        toolAction: params.action,
        cwd: ctx.cwd,
        branch,
        modelId,
        provider: providerFromModelId(modelId),
        taskId: task?.id ?? params.id ?? null,
        taskStatus: task?.status ?? null,
        taskClass: task?.taskClass ?? params.taskClass ?? null,
        validationTier: task?.validation?.tier ?? null,
        validationDecision: task?.validation?.decision ?? null,
        validationSource: task?.validation?.source ?? null,
        activeTaskId: (details.activeTaskId as string | null | undefined) ?? null,
        owner: task?.owner ?? params.owner ?? null,
        retryCount: task?.retryCount ?? null,
        details: params,
      });

      return result;
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    const state = await readTaskState(ctx.cwd);
    const activeTask = getActiveTask(state);

    const mutationBlockedReason = !taskIsRunnable(activeTask)
      ? "Mutating actions require an active task in `in_progress` status with an owner and acceptance criteria."
      : null;

    if (event.toolName === "write" || event.toolName === "edit") {
      if (mutationBlockedReason) {
        const branch = await getCurrentBranch(pi, ctx.cwd);
        const modelId = modelIdFromContext(ctx);
        await appendAudit(ctx.cwd, {
          ts: nowIso(),
          extension: "till-done",
          action: "blocked-mutation",
          tool: event.toolName,
          cwd: ctx.cwd,
          branch,
          modelId,
          provider: providerFromModelId(modelId),
          activeTaskId: state.activeTaskId,
          reason: mutationBlockedReason,
        });

        return { block: true, reason: mutationBlockedReason };
      }

      return;
    }

    if (event.toolName === "bash") {
      const command = String((event.input as { command?: string }).command ?? "");
      if (isMutatingBash(command) && mutationBlockedReason) {
        const branch = await getCurrentBranch(pi, ctx.cwd);
        const modelId = modelIdFromContext(ctx);
        await appendAudit(ctx.cwd, {
          ts: nowIso(),
          extension: "till-done",
          action: "blocked-mutation",
          tool: "bash",
          command,
          cwd: ctx.cwd,
          branch,
          modelId,
          provider: providerFromModelId(modelId),
          activeTaskId: state.activeTaskId,
          reason: mutationBlockedReason,
        });

        return { block: true, reason: mutationBlockedReason };
      }
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    const state = await readTaskState(ctx.cwd);
    const activeTask = getActiveTask(state);
    if (!activeTask) return;

    if (ctx.hasUI) {
      ctx.ui.notify(`Active task still open: ${activeTask.id} (${activeTask.status})`, "info");
    }

    const branch = await getCurrentBranch(pi, ctx.cwd);
    const modelId = modelIdFromContext(ctx);
    await appendAudit(ctx.cwd, {
      ts: nowIso(),
      extension: "till-done",
      action: "agent-end-active-task",
      cwd: ctx.cwd,
      branch,
      modelId,
      provider: providerFromModelId(modelId),
      activeTaskId: activeTask.id,
      status: activeTask.status,
      owner: activeTask.owner,
      retryCount: activeTask.retryCount ?? 0,
    });
  });
}
