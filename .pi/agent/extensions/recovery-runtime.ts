import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ROLE_IDS,
  type HarnessRole,
  defaultModelId,
  loadHarnessRoutingConfig,
  normalizeModelId,
  splitModelId,
  type HarnessRoutingConfig,
} from "./harness-routing.ts";
import {
  EVIDENCE_STATES,
  FAILURE_CLASSES,
  MODEL_BEHAVIORS,
  PACKET_INTEGRITY,
  PROVIDER_FAILURE_STATES,
  REPO_STATES,
  REQUIREMENTS_CLARITY,
  ROLLBACK_SCOPES,
  TOOL_STATES,
  VALIDATION_STATES,
  type EvidenceState,
  type FailureClass,
  type ModelBehavior,
  type PacketIntegrity,
  type ProviderFailureState,
  type RecoveryAssessment,
  type RecoveryPolicy,
  type RecoveryPolicyInput,
  type RepoState,
  type RequirementsClarity,
  type RetryCounts,
  type RetryEligibility,
  type RollbackScope,
  type ToolState,
  type ValidationState,
  loadRecoveryPolicy,
  resolveRecoveryPolicy,
} from "./recovery-policy.ts";

const TASKS_FILE = ".pi/agent/state/runtime/tasks.json";
const TASK_STATUSES = ["queued", "in_progress", "review", "blocked", "done", "failed"] as const;
const TASK_CLASSES = ["research", "docs", "implementation", "runtime_safety"] as const;
const TASK_VALIDATION_DECISIONS = ["pending", "pass", "fail", "blocked", "overridden"] as const;
const RUNTIME_RECOVERY_ACTIONS = ["retry_same_lane", "retry_stronger_model", "switch_provider", "rollback", "stop", "escalate"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskClass = (typeof TASK_CLASSES)[number];
export type TaskValidationDecision = (typeof TASK_VALIDATION_DECISIONS)[number];
export type RuntimeRecoveryAction = (typeof RUNTIME_RECOVERY_ACTIONS)[number];

export interface RecoveryRuntimeTaskInput {
  id?: string;
  title?: string;
  status?: TaskStatus;
  taskClass?: TaskClass;
  retryCount?: number;
  evidence?: string[];
  notes?: string[];
  validation?: {
    decision?: TaskValidationDecision | null;
  } | null;
  validationDecision?: TaskValidationDecision | null;
}

export interface RecoveryRuntimeTaskContext {
  taskId: string | null;
  title: string | null;
  status: TaskStatus | null;
  taskClass: TaskClass | null;
  retryCount: number;
  validationDecision: TaskValidationDecision;
  evidenceCount: number;
  noteCount: number;
}

export interface RuntimeRetryPlan {
  action: Extract<RuntimeRecoveryAction, "retry_same_lane" | "retry_stronger_model" | "switch_provider"> | null;
  nextModelId: string | null;
  nextProvider: string | null;
  reason: string | null;
}

export interface RuntimeRollbackPlan {
  recommended: boolean;
  scope: RollbackScope | null;
  reason: string | null;
  requiresHumanApproval: boolean;
  destructive: boolean;
  triggerEvidence: string[];
}

export interface RuntimeStopPlan {
  recommended: boolean;
  reason: string | null;
}

export interface RuntimeRecoveryDecision {
  version: 1;
  taskContext: RecoveryRuntimeTaskContext | null;
  baseAssessment: RecoveryAssessment;
  recommendedAction: RuntimeRecoveryAction;
  decisionReasons: string[];
  haltAutonomy: boolean;
  retryPlan: RuntimeRetryPlan;
  rollback: RuntimeRollbackPlan;
  stop: RuntimeStopPlan;
}

export interface RecoveryRuntimeDecisionInput extends RecoveryPolicyInput {
  taskId?: string;
  task?: RecoveryRuntimeTaskInput;
  providerRetryCounts?: Record<string, number>;
  conflictingChanges?: boolean;
  safetyRegression?: boolean;
  reviewerRejectsCurrentLane?: boolean;
  destructiveRollback?: boolean;
}

interface TaskStateFile {
  version: number;
  activeTaskId: string | null;
  tasks: RecoveryRuntimeTaskInput[];
}

const RetryCountsSchema = Type.Object({
  sameLane: Type.Optional(Type.Integer({ minimum: 0 })),
  strongerModel: Type.Optional(Type.Integer({ minimum: 0 })),
  providerSwitch: Type.Optional(Type.Integer({ minimum: 0 })),
  total: Type.Optional(Type.Integer({ minimum: 0 })),
});

const ProviderRetryCountsSchema = Type.Record(Type.String(), Type.Integer({ minimum: 0 }));

const TaskInputSchema = Type.Object({
  id: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  status: Type.Optional(StringEnum(TASK_STATUSES)),
  taskClass: Type.Optional(StringEnum(TASK_CLASSES)),
  retryCount: Type.Optional(Type.Integer({ minimum: 0 })),
  evidence: Type.Optional(Type.Array(Type.String())),
  notes: Type.Optional(Type.Array(Type.String())),
  validationDecision: Type.Optional(StringEnum(TASK_VALIDATION_DECISIONS)),
});

const ResolveRecoveryRuntimeDecisionSchema = Type.Object({
  taskId: Type.Optional(Type.String()),
  task: Type.Optional(TaskInputSchema),
  role: StringEnum(ROLE_IDS),
  currentModelId: Type.Optional(Type.String()),
  failedModels: Type.Optional(Type.Array(Type.String())),
  requirementsClarity: Type.Optional(StringEnum(REQUIREMENTS_CLARITY)),
  packetIntegrity: Type.Optional(StringEnum(PACKET_INTEGRITY)),
  providerFailureState: Type.Optional(StringEnum(PROVIDER_FAILURE_STATES)),
  toolState: Type.Optional(StringEnum(TOOL_STATES)),
  repoState: Type.Optional(StringEnum(REPO_STATES)),
  validationState: Type.Optional(StringEnum(VALIDATION_STATES)),
  evidenceState: Type.Optional(StringEnum(EVIDENCE_STATES)),
  modelBehavior: Type.Optional(StringEnum(MODEL_BEHAVIORS)),
  approvalRequired: Type.Optional(Type.Boolean()),
  retryCounts: Type.Optional(RetryCountsSchema),
  providerRetryCounts: Type.Optional(ProviderRetryCountsSchema),
  conflictingChanges: Type.Optional(Type.Boolean()),
  safetyRegression: Type.Optional(Type.Boolean()),
  reviewerRejectsCurrentLane: Type.Optional(Type.Boolean()),
  destructiveRollback: Type.Optional(Type.Boolean()),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeTaskStatus(raw: unknown): TaskStatus | null {
  return typeof raw === "string" && TASK_STATUSES.includes(raw as TaskStatus) ? (raw as TaskStatus) : null;
}

function normalizeTaskClass(raw: unknown): TaskClass | null {
  return typeof raw === "string" && TASK_CLASSES.includes(raw as TaskClass) ? (raw as TaskClass) : null;
}

function normalizeValidationDecision(raw: unknown): TaskValidationDecision {
  return typeof raw === "string" && TASK_VALIDATION_DECISIONS.includes(raw as TaskValidationDecision)
    ? (raw as TaskValidationDecision)
    : "pending";
}

function parseStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function normalizeTaskInput(task: RecoveryRuntimeTaskInput | undefined | null): RecoveryRuntimeTaskInput | null {
  if (!task || typeof task !== "object") return null;

  return {
    id: typeof task.id === "string" ? task.id : undefined,
    title: typeof task.title === "string" ? task.title : undefined,
    status: normalizeTaskStatus(task.status) ?? undefined,
    taskClass: normalizeTaskClass(task.taskClass) ?? undefined,
    retryCount: typeof task.retryCount === "number" && Number.isInteger(task.retryCount) && task.retryCount >= 0 ? task.retryCount : 0,
    evidence: uniqueStrings(parseStringArray(task.evidence)),
    notes: uniqueStrings(parseStringArray(task.notes)),
    validationDecision: normalizeValidationDecision(task.validationDecision ?? task.validation?.decision),
  };
}

function taskContextFromInput(task: RecoveryRuntimeTaskInput | null): RecoveryRuntimeTaskContext | null {
  if (!task) return null;
  return {
    taskId: task.id ?? null,
    title: task.title ?? null,
    status: task.status ?? null,
    taskClass: task.taskClass ?? null,
    retryCount: task.retryCount ?? 0,
    validationDecision: normalizeValidationDecision(task.validationDecision),
    evidenceCount: (task.evidence ?? []).length,
    noteCount: (task.notes ?? []).length,
  };
}

function deriveValidationState(task: RecoveryRuntimeTaskInput | null, explicit: ValidationState | undefined): ValidationState {
  if (explicit) return explicit;
  const validationDecision = normalizeValidationDecision(task?.validationDecision);
  switch (validationDecision) {
    case "pass":
    case "overridden":
      return "pass";
    case "fail":
      return "fail";
    case "blocked":
      return "blocked";
    default:
      return "not_run";
  }
}

function deriveEvidenceState(task: RecoveryRuntimeTaskInput | null, explicit: EvidenceState | undefined): EvidenceState {
  if (explicit) return explicit;
  return (task?.evidence ?? []).length > 0 ? "sufficient" : "missing";
}

function deriveRetryCounts(task: RecoveryRuntimeTaskInput | null, explicit: Partial<RetryCounts> | undefined): RetryCounts {
  const taskRetries = task?.retryCount ?? 0;
  return {
    sameLane: explicit?.sameLane ?? taskRetries,
    strongerModel: explicit?.strongerModel ?? 0,
    providerSwitch: explicit?.providerSwitch ?? 0,
    total: explicit?.total ?? taskRetries,
  };
}

function disallowEligibility(eligibility: RetryEligibility, reason: string): RetryEligibility {
  return {
    allowed: false,
    reason,
    nextModelId: eligibility.nextModelId,
    nextProvider: eligibility.nextProvider,
  };
}

function runtimeRetryPreferenceOrder(failureClass: FailureClass): Array<Extract<RuntimeRecoveryAction, "retry_same_lane" | "retry_stronger_model" | "switch_provider">> {
  switch (failureClass) {
    case "model_failure":
      return ["retry_stronger_model", "retry_same_lane", "switch_provider"];
    case "provider_failure":
      return ["retry_stronger_model", "switch_provider", "retry_same_lane"];
    case "validation_failure":
      return ["retry_same_lane", "retry_stronger_model", "switch_provider"];
    default:
      return ["retry_same_lane", "retry_stronger_model", "switch_provider"];
  }
}

function normalizeProviderRetryCounts(raw: Record<string, number> | undefined): Record<string, number> {
  if (!raw) return {};
  const normalized: Record<string, number> = {};
  for (const [provider, count] of Object.entries(raw)) {
    if (Number.isInteger(count) && count >= 0) {
      normalized[provider] = count;
    }
  }
  return normalized;
}

function providerBudgetFor(policy: RecoveryPolicy, provider: string | null): number {
  if (!provider) return policy.provider_retry_limits.default_max;
  return policy.provider_retry_limits.per_provider[provider] ?? policy.provider_retry_limits.default_max;
}

function preferredRetryEligibility(
  action: Extract<RuntimeRecoveryAction, "retry_same_lane" | "retry_stronger_model" | "switch_provider">,
  baseAssessment: RecoveryAssessment,
): RetryEligibility {
  switch (action) {
    case "retry_same_lane":
      return baseAssessment.retryEligibility.retry_same_lane;
    case "retry_stronger_model":
      return baseAssessment.retryEligibility.retry_stronger_model;
    case "switch_provider":
      return baseAssessment.retryEligibility.switch_provider;
  }
}

function roleAdjustedRetryEligibility(
  policy: RecoveryPolicy,
  input: RecoveryRuntimeDecisionInput,
  baseAssessment: RecoveryAssessment,
  retryCounts: RetryCounts,
  providerRetryCounts: Record<string, number>,
): {
  retry_same_lane: RetryEligibility;
  retry_stronger_model: RetryEligibility;
  switch_provider: RetryEligibility;
  reasons: string[];
} {
  const reasons: string[] = [];
  const roleLimits = policy.role_retry_limits[input.role] ?? policy.retry_limits;

  let retry_same_lane = baseAssessment.retryEligibility.retry_same_lane;
  let retry_stronger_model = baseAssessment.retryEligibility.retry_stronger_model;
  let switch_provider = baseAssessment.retryEligibility.switch_provider;

  const applyRoleLimit = (
    action: Extract<RuntimeRecoveryAction, "retry_same_lane" | "retry_stronger_model" | "switch_provider">,
    current: RetryEligibility,
  ): RetryEligibility => {
    if (!current.allowed) return current;

    if (retryCounts.total >= roleLimits.total_without_human_max) {
      reasons.push(`Role-specific retry limits exhausted for ${input.role}.`);
      return disallowEligibility(current, `Role-specific total retry budget for ${input.role} is exhausted.`);
    }

    if (action === "retry_same_lane" && retryCounts.sameLane >= roleLimits.retry_same_lane_max) {
      reasons.push(`Role-specific same-lane retry limit blocks ${input.role}.`);
      return disallowEligibility(current, `Role-specific same-lane retry budget for ${input.role} is exhausted.`);
    }
    if (action === "retry_stronger_model" && retryCounts.strongerModel >= roleLimits.retry_stronger_model_max) {
      reasons.push(`Role-specific stronger-model retry limit blocks ${input.role}.`);
      return disallowEligibility(current, `Role-specific stronger-model retry budget for ${input.role} is exhausted.`);
    }
    if (action === "switch_provider" && retryCounts.providerSwitch >= roleLimits.switch_provider_max) {
      reasons.push(`Role-specific provider-switch retry limit blocks ${input.role}.`);
      return disallowEligibility(current, `Role-specific provider-switch retry budget for ${input.role} is exhausted.`);
    }

    return current;
  };

  retry_same_lane = applyRoleLimit("retry_same_lane", retry_same_lane);
  retry_stronger_model = applyRoleLimit("retry_stronger_model", retry_stronger_model);
  switch_provider = applyRoleLimit("switch_provider", switch_provider);

  const applyProviderLimit = (
    actionLabel: string,
    current: RetryEligibility,
  ): RetryEligibility => {
    if (!current.allowed || !current.nextProvider) return current;
    const providerCount = providerRetryCounts[current.nextProvider] ?? 0;
    const providerBudget = providerBudgetFor(policy, current.nextProvider);
    if (providerCount >= providerBudget) {
      reasons.push(`Provider-specific retry limit blocks ${actionLabel} on ${current.nextProvider}.`);
      return disallowEligibility(current, `Provider-specific retry budget for ${current.nextProvider} is exhausted.`);
    }
    return current;
  };

  retry_same_lane = applyProviderLimit("same-lane retry", retry_same_lane);
  retry_stronger_model = applyProviderLimit("stronger-model retry", retry_stronger_model);
  switch_provider = applyProviderLimit("provider switch", switch_provider);

  return { retry_same_lane, retry_stronger_model, switch_provider, reasons };
}

function rollbackFromSignals(
  policy: RecoveryPolicy,
  task: RecoveryRuntimeTaskInput | null,
  derived: {
    repoState: RepoState;
    validationState: ValidationState;
  },
  input: RecoveryRuntimeDecisionInput,
  retryCounts: RetryCounts,
): RuntimeRollbackPlan {
  const triggerEvidence: string[] = [];
  let scope: RollbackScope | null = null;

  const assignScope = (candidate: RollbackScope) => {
    if (scope === null) {
      scope = candidate;
    }
  };

  if (
    derived.validationState === "fail" &&
    retryCounts.total >= policy.rollback_policy.repeated_validation_failure_retry_gte
  ) {
    triggerEvidence.push("Repeated validation failure exceeded the bounded retry threshold.");
    assignScope(policy.rollback_policy.scope_by_reason.repeated_validation_failure);
  }

  if (policy.rollback_policy.repo_state_values.includes(derived.repoState)) {
    triggerEvidence.push(`Repo state ${derived.repoState} matches a rollback trigger.`);
    assignScope(policy.rollback_policy.scope_by_reason.repo_state_failure);
  }

  if (input.conflictingChanges && policy.rollback_policy.conflicting_changes_trigger) {
    triggerEvidence.push("Conflicting or overlapping changes were reported for the current lane.");
    assignScope(policy.rollback_policy.scope_by_reason.conflicting_changes);
  }

  if (input.safetyRegression && policy.rollback_policy.safety_regression_trigger) {
    triggerEvidence.push("Safety regression was reported for the current change set.");
    assignScope(policy.rollback_policy.scope_by_reason.safety_regression);
  }

  if (input.reviewerRejectsCurrentLane && policy.rollback_policy.reviewer_rejects_current_lane_trigger) {
    triggerEvidence.push("Reviewer or validator rejected the current lane as a rollback candidate.");
    assignScope(policy.rollback_policy.scope_by_reason.reviewer_rejects_current_lane);
  }

  const recommended = triggerEvidence.length > 0;
  const destructive = (scope !== null && policy.rollback_policy.approval_required_scopes.includes(scope)) || Boolean(input.destructiveRollback);
  const requiresHumanApproval = destructive;

  return {
    recommended,
    scope,
    reason: recommended ? triggerEvidence.join(" ") : null,
    requiresHumanApproval,
    destructive,
    triggerEvidence,
  };
}

function stopPlanFromSignals(
  policy: RecoveryPolicy,
  input: RecoveryRuntimeDecisionInput,
  derived: {
    evidenceState: EvidenceState;
    requirementsClarity: RequirementsClarity;
    toolState: ToolState;
  },
  rollback: RuntimeRollbackPlan,
  retryEligible: boolean,
): RuntimeStopPlan {
  const reasons: string[] = [];

  if (policy.stop_conditions.approval_required && input.approvalRequired) {
    reasons.push("Human approval is required before autonomous retry or rollback can continue.");
  }
  if (policy.stop_conditions.ambiguous_requirements && derived.requirementsClarity === "ambiguous") {
    reasons.push("Requirements are ambiguous and autonomy should halt instead of retrying blindly.");
  }
  if (policy.stop_conditions.tool_state_values.includes(derived.toolState)) {
    reasons.push(`Tool state ${derived.toolState} requires an autonomy halt.`);
  }
  if (policy.stop_conditions.evidence_state_values.includes(derived.evidenceState)) {
    reasons.push(`Evidence state ${derived.evidenceState} is too contradictory for autonomous progress.`);
  }
  if (!retryEligible && !rollback.recommended) {
    reasons.push("No safe bounded retry or rollback recommendation remained under the runtime policy.");
  }

  return {
    recommended: reasons.length > 0,
    reason: reasons.length > 0 ? reasons.join(" ") : null,
  };
}

function retryPlanForAction(
  action: RuntimeRecoveryAction,
  eligibility: {
    retry_same_lane: RetryEligibility;
    retry_stronger_model: RetryEligibility;
    switch_provider: RetryEligibility;
  },
): RuntimeRetryPlan {
  if (action === "retry_same_lane") {
    return {
      action,
      nextModelId: eligibility.retry_same_lane.nextModelId,
      nextProvider: eligibility.retry_same_lane.nextProvider,
      reason: eligibility.retry_same_lane.reason,
    };
  }
  if (action === "retry_stronger_model") {
    return {
      action,
      nextModelId: eligibility.retry_stronger_model.nextModelId,
      nextProvider: eligibility.retry_stronger_model.nextProvider,
      reason: eligibility.retry_stronger_model.reason,
    };
  }
  if (action === "switch_provider") {
    return {
      action,
      nextModelId: eligibility.switch_provider.nextModelId,
      nextProvider: eligibility.switch_provider.nextProvider,
      reason: eligibility.switch_provider.reason,
    };
  }
  return {
    action: null,
    nextModelId: null,
    nextProvider: null,
    reason: null,
  };
}

export function resolveRecoveryRuntimeDecision(
  policy: RecoveryPolicy,
  routingConfig: HarnessRoutingConfig,
  input: RecoveryRuntimeDecisionInput,
): RuntimeRecoveryDecision {
  const task = normalizeTaskInput(input.task);
  const requirementsClarity = input.requirementsClarity ?? "clear";
  const repoState = input.repoState ?? "clean";
  const toolState = input.toolState ?? "available";
  const validationState = deriveValidationState(task, input.validationState);
  const evidenceState = deriveEvidenceState(task, input.evidenceState);
  const retryCounts = deriveRetryCounts(task, input.retryCounts);
  const providerRetryCounts = normalizeProviderRetryCounts(input.providerRetryCounts);

  const baseAssessment = resolveRecoveryPolicy(policy, routingConfig, {
    ...input,
    validationState,
    evidenceState,
    retryCounts,
  });

  const roleAndProviderAdjusted = roleAdjustedRetryEligibility(policy, input, baseAssessment, retryCounts, providerRetryCounts);
  const adjustedEligibility = {
    retry_same_lane: roleAndProviderAdjusted.retry_same_lane,
    retry_stronger_model: roleAndProviderAdjusted.retry_stronger_model,
    switch_provider: roleAndProviderAdjusted.switch_provider,
  };

  const retryPreferenceOrder = runtimeRetryPreferenceOrder(baseAssessment.failureClass);
  const firstAllowedRetry = retryPreferenceOrder.find((action) => preferredRetryEligibility(action, {
    ...baseAssessment,
    retryEligibility: adjustedEligibility,
  }).allowed) ?? null;

  const rollback = rollbackFromSignals(
    policy,
    task,
    {
      repoState,
      validationState,
    },
    input,
    retryCounts,
  );

  const stop = stopPlanFromSignals(
    policy,
    input,
    {
      evidenceState,
      requirementsClarity,
      toolState,
    },
    rollback,
    firstAllowedRetry !== null,
  );

  const decisionReasons = [...baseAssessment.classificationReasons, ...roleAndProviderAdjusted.reasons];
  if (rollback.recommended) {
    decisionReasons.push(...rollback.triggerEvidence);
  }
  if (stop.recommended && stop.reason) {
    decisionReasons.push(stop.reason);
  }

  let recommendedAction: RuntimeRecoveryAction = "escalate";
  if (rollback.recommended) {
    recommendedAction = "rollback";
  } else if (stop.recommended) {
    recommendedAction = "stop";
  } else if (firstAllowedRetry) {
    recommendedAction = firstAllowedRetry;
  } else if (baseAssessment.escalation.required) {
    recommendedAction = "escalate";
  }

  if (recommendedAction === "stop" && !stop.reason) {
    stop.reason = "Autonomy should halt because no safe bounded recovery action remained.";
  }

  const retryPlan = retryPlanForAction(recommendedAction, adjustedEligibility);
  if (recommendedAction === "rollback" && !rollback.reason) {
    rollback.reason = "Rollback was recommended by runtime policy.";
  }
  if (recommendedAction === "escalate") {
    decisionReasons.push(baseAssessment.escalation.reason);
  }

  return {
    version: 1,
    taskContext: taskContextFromInput(task),
    baseAssessment: {
      ...baseAssessment,
      retryEligibility: adjustedEligibility,
    },
    recommendedAction,
    decisionReasons: uniqueStrings(decisionReasons),
    haltAutonomy: recommendedAction === "rollback" || recommendedAction === "stop" || recommendedAction === "escalate",
    retryPlan,
    rollback,
    stop,
  };
}

export async function loadRecoveryRuntimeTaskState(cwd: string): Promise<TaskStateFile> {
  const raw = await readFile(resolve(cwd, TASKS_FILE), "utf8");
  const parsed = JSON.parse(raw) as { version?: number; activeTaskId?: string | null; tasks?: unknown[] };
  const tasks = Array.isArray(parsed.tasks)
    ? parsed.tasks
        .map((task) => normalizeTaskInput((isRecord(task) ? task : {}) as RecoveryRuntimeTaskInput))
        .filter((task): task is RecoveryRuntimeTaskInput => task !== null)
    : [];

  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    activeTaskId: typeof parsed.activeTaskId === "string" || parsed.activeTaskId === null ? parsed.activeTaskId : null,
    tasks,
  };
}

export function findRecoveryRuntimeTask(taskState: TaskStateFile, taskId: string): RecoveryRuntimeTaskInput {
  const task = taskState.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task ${taskId} was not found in ${TASKS_FILE}.`);
  }
  return task;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "resolve_recovery_runtime_decision",
    label: "Resolve Recovery Runtime Decision",
    description: "Recommend bounded retry, rollback, stop, or escalation actions using recovery policy plus task-state evidence.",
    parameters: ResolveRecoveryRuntimeDecisionSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = params as RecoveryRuntimeDecisionInput;
      const policy = await loadRecoveryPolicy(ctx.cwd);
      const routingConfig = await loadHarnessRoutingConfig(ctx.cwd);
      const taskState = input.taskId ? await loadRecoveryRuntimeTaskState(ctx.cwd) : null;
      const task = input.task ?? (input.taskId && taskState ? findRecoveryRuntimeTask(taskState, input.taskId) : undefined);
      const decision = resolveRecoveryRuntimeDecision(policy, routingConfig, {
        ...input,
        task,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(decision, null, 2),
          },
        ],
        details: {
          ok: true,
          decision,
        },
      };
    },
  });
}
