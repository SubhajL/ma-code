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

export const FAILURE_CLASSES = [
  "plan_failure",
  "model_failure",
  "provider_failure",
  "tool_failure",
  "repo_state_failure",
  "validation_failure",
  "ambiguity_failure",
] as const;

export const PROVIDER_FAILURE_STATES = [
  "none",
  "transient_api_error",
  "rate_limited",
  "auth_failed",
  "provider_down",
  "model_unavailable",
] as const;

export const REQUIREMENTS_CLARITY = ["clear", "ambiguous"] as const;
export const PACKET_INTEGRITY = ["sound", "missing_constraints", "contradictory"] as const;
export const TOOL_STATES = ["available", "degraded", "unavailable"] as const;
export const REPO_STATES = ["clean", "dirty", "unsafe", "conflicted"] as const;
export const VALIDATION_STATES = ["not_run", "pass", "fail", "blocked", "contradictory"] as const;
export const EVIDENCE_STATES = ["sufficient", "missing", "contradictory"] as const;
export const MODEL_BEHAVIORS = ["normal", "weak_reasoning", "repeated_misunderstanding"] as const;
export const RECOVERY_ACTIONS = ["retry_same_lane", "retry_stronger_model", "switch_provider", "escalate"] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];
export type ProviderFailureState = (typeof PROVIDER_FAILURE_STATES)[number];
export type RequirementsClarity = (typeof REQUIREMENTS_CLARITY)[number];
export type PacketIntegrity = (typeof PACKET_INTEGRITY)[number];
export type ToolState = (typeof TOOL_STATES)[number];
export type RepoState = (typeof REPO_STATES)[number];
export type ValidationState = (typeof VALIDATION_STATES)[number];
export type EvidenceState = (typeof EVIDENCE_STATES)[number];
export type ModelBehavior = (typeof MODEL_BEHAVIORS)[number];
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

export interface FailureClassPolicy {
  description: string;
  preferred_actions: RecoveryAction[];
  allow_retry_same_lane: boolean;
  allow_retry_stronger_model: boolean;
  allow_switch_provider: boolean;
  notes: string[];
}

export const ROLLBACK_SCOPES = ["current_task_lane", "current_worktree", "last_bounded_change"] as const;

export interface RetryLimits {
  retry_same_lane_max: number;
  retry_stronger_model_max: number;
  switch_provider_max: number;
  total_without_human_max: number;
}

export type RollbackScope = (typeof ROLLBACK_SCOPES)[number];

export interface ProviderFailureRules {
  same_provider_stronger_model_states: ProviderFailureState[];
  switch_provider_states: ProviderFailureState[];
  notes: string[];
}

export interface EscalationConditions {
  approval_required: boolean;
  ambiguous_requirements: boolean;
  repo_state_values: RepoState[];
  tool_state_values: ToolState[];
  validation_state_values: ValidationState[];
  evidence_state_values: EvidenceState[];
  retry_budget_exhausted: boolean;
  notes: string[];
}

export interface ProviderRetryLimits {
  default_max: number;
  per_provider: Record<string, number>;
  notes: string[];
}

export interface RollbackPolicy {
  repeated_validation_failure_retry_gte: number;
  repo_state_values: RepoState[];
  conflicting_changes_trigger: boolean;
  safety_regression_trigger: boolean;
  reviewer_rejects_current_lane_trigger: boolean;
  scope_by_reason: {
    repeated_validation_failure: RollbackScope;
    repo_state_failure: RollbackScope;
    conflicting_changes: RollbackScope;
    safety_regression: RollbackScope;
    reviewer_rejects_current_lane: RollbackScope;
  };
  approval_required_scopes: RollbackScope[];
  notes: string[];
}

export interface StopConditions {
  approval_required: boolean;
  ambiguous_requirements: boolean;
  tool_state_values: ToolState[];
  evidence_state_values: EvidenceState[];
  notes: string[];
}

export interface RecoveryPolicy {
  version: 1;
  notes: string[];
  failure_classes: Record<FailureClass, FailureClassPolicy>;
  retry_limits: RetryLimits;
  role_retry_limits: Record<HarnessRole, RetryLimits>;
  provider_retry_limits: ProviderRetryLimits;
  provider_failure_rules: ProviderFailureRules;
  escalation_conditions: EscalationConditions;
  rollback_policy: RollbackPolicy;
  stop_conditions: StopConditions;
}

export interface RetryCounts {
  sameLane: number;
  strongerModel: number;
  providerSwitch: number;
  total: number;
}

export interface RecoveryPolicyInput {
  role: HarnessRole;
  currentModelId?: string;
  failedModels?: string[];
  requirementsClarity?: RequirementsClarity;
  packetIntegrity?: PacketIntegrity;
  providerFailureState?: ProviderFailureState;
  toolState?: ToolState;
  repoState?: RepoState;
  validationState?: ValidationState;
  evidenceState?: EvidenceState;
  modelBehavior?: ModelBehavior;
  approvalRequired?: boolean;
  retryCounts?: Partial<RetryCounts>;
}

export interface RetryEligibility {
  allowed: boolean;
  reason: string;
  nextModelId: string | null;
  nextProvider: string | null;
}

export interface RecoveryAssessment {
  version: 1;
  failureClass: FailureClass;
  classificationReasons: string[];
  recommendedAction: RecoveryAction;
  retryEligibility: {
    retry_same_lane: RetryEligibility;
    retry_stronger_model: RetryEligibility;
    switch_provider: RetryEligibility;
  };
  escalation: {
    required: boolean;
    reason: string;
  };
  policyNotes: string[];
}

const RECOVERY_POLICY_PATH = ".pi/agent/recovery/recovery-policy.json";

const RetryCountsSchema = Type.Object({
  sameLane: Type.Optional(Type.Integer({ minimum: 0 })),
  strongerModel: Type.Optional(Type.Integer({ minimum: 0 })),
  providerSwitch: Type.Optional(Type.Integer({ minimum: 0 })),
  total: Type.Optional(Type.Integer({ minimum: 0 })),
});

const ResolveRecoveryPolicySchema = Type.Object({
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
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function parseString(raw: unknown, fieldName: string): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return raw.trim();
}

function parseBoolean(raw: unknown, fieldName: string): boolean {
  if (typeof raw !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }
  return raw;
}

function parseInteger(raw: unknown, fieldName: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return raw;
}

function parseRetryLimits(raw: unknown, fieldName: string): RetryLimits {
  if (!isRecord(raw)) {
    throw new Error(`${fieldName} must be an object.`);
  }
  return {
    retry_same_lane_max: parseInteger(raw.retry_same_lane_max, `${fieldName}.retry_same_lane_max`),
    retry_stronger_model_max: parseInteger(raw.retry_stronger_model_max, `${fieldName}.retry_stronger_model_max`),
    switch_provider_max: parseInteger(raw.switch_provider_max, `${fieldName}.switch_provider_max`),
    total_without_human_max: parseInteger(raw.total_without_human_max, `${fieldName}.total_without_human_max`),
  };
}

function parseIntegerRecord(raw: unknown, fieldName: string): Record<string, number> {
  if (!isRecord(raw)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  const parsed: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    parsed[parseString(key, `${fieldName}.key`)] = parseInteger(value, `${fieldName}.${key}`);
  }
  return parsed;
}

function parseRollbackScope(raw: unknown, fieldName: string): RollbackScope {
  const value = parseString(raw, fieldName);
  if (!ROLLBACK_SCOPES.includes(value as RollbackScope)) {
    throw new Error(`${fieldName} must be one of: ${ROLLBACK_SCOPES.join(", ")}.`);
  }
  return value as RollbackScope;
}

function parseEnumArray<T extends string>(raw: unknown, allowed: readonly T[], fieldName: string): T[] {
  const values = uniqueStrings(parseStringArray(raw)).filter((value): value is T => allowed.includes(value as T));
  if (values.length === 0) {
    throw new Error(`${fieldName} must contain at least one allowed value.`);
  }
  return values;
}

export function parseRecoveryPolicy(raw: unknown): RecoveryPolicy {
  if (!isRecord(raw)) {
    throw new Error("Recovery policy must be an object.");
  }

  const failureClassesRaw = raw.failure_classes;
  const retryLimitsRaw = raw.retry_limits;
  const roleRetryLimitsRaw = raw.role_retry_limits;
  const providerRetryLimitsRaw = raw.provider_retry_limits;
  const providerFailureRulesRaw = raw.provider_failure_rules;
  const escalationConditionsRaw = raw.escalation_conditions;
  const rollbackPolicyRaw = raw.rollback_policy;
  const stopConditionsRaw = raw.stop_conditions;

  if (
    !isRecord(failureClassesRaw) ||
    !isRecord(retryLimitsRaw) ||
    !isRecord(roleRetryLimitsRaw) ||
    !isRecord(providerRetryLimitsRaw) ||
    !isRecord(providerFailureRulesRaw) ||
    !isRecord(escalationConditionsRaw) ||
    !isRecord(rollbackPolicyRaw) ||
    !isRecord(stopConditionsRaw)
  ) {
    throw new Error("Recovery policy is missing required top-level sections.");
  }

  const failure_classes = {} as Record<FailureClass, FailureClassPolicy>;
  for (const failureClass of FAILURE_CLASSES) {
    const entryRaw = failureClassesRaw[failureClass];
    if (!isRecord(entryRaw)) {
      throw new Error(`Missing failure class entry for ${failureClass}.`);
    }
    failure_classes[failureClass] = {
      description: parseString(entryRaw.description, `${failureClass}.description`),
      preferred_actions: parseEnumArray(entryRaw.preferred_actions, RECOVERY_ACTIONS, `${failureClass}.preferred_actions`),
      allow_retry_same_lane: parseBoolean(entryRaw.allow_retry_same_lane, `${failureClass}.allow_retry_same_lane`),
      allow_retry_stronger_model: parseBoolean(entryRaw.allow_retry_stronger_model, `${failureClass}.allow_retry_stronger_model`),
      allow_switch_provider: parseBoolean(entryRaw.allow_switch_provider, `${failureClass}.allow_switch_provider`),
      notes: uniqueStrings(parseStringArray(entryRaw.notes)),
    };
  }

  const retry_limits = parseRetryLimits(retryLimitsRaw, "retry_limits");

  const role_retry_limits = {} as Record<HarnessRole, RetryLimits>;
  for (const role of ROLE_IDS) {
    role_retry_limits[role] = parseRetryLimits(roleRetryLimitsRaw[role], `role_retry_limits.${role}`);
  }

  const provider_retry_limits: ProviderRetryLimits = {
    default_max: parseInteger(providerRetryLimitsRaw.default_max, "provider_retry_limits.default_max"),
    per_provider: parseIntegerRecord(providerRetryLimitsRaw.per_provider, "provider_retry_limits.per_provider"),
    notes: uniqueStrings(parseStringArray(providerRetryLimitsRaw.notes)),
  };

  const provider_failure_rules: ProviderFailureRules = {
    same_provider_stronger_model_states: parseEnumArray(
      providerFailureRulesRaw.same_provider_stronger_model_states,
      PROVIDER_FAILURE_STATES,
      "provider_failure_rules.same_provider_stronger_model_states",
    ),
    switch_provider_states: parseEnumArray(
      providerFailureRulesRaw.switch_provider_states,
      PROVIDER_FAILURE_STATES,
      "provider_failure_rules.switch_provider_states",
    ),
    notes: uniqueStrings(parseStringArray(providerFailureRulesRaw.notes)),
  };

  const escalation_conditions: EscalationConditions = {
    approval_required: parseBoolean(escalationConditionsRaw.approval_required, "escalation_conditions.approval_required"),
    ambiguous_requirements: parseBoolean(escalationConditionsRaw.ambiguous_requirements, "escalation_conditions.ambiguous_requirements"),
    repo_state_values: parseEnumArray(escalationConditionsRaw.repo_state_values, REPO_STATES, "escalation_conditions.repo_state_values"),
    tool_state_values: parseEnumArray(escalationConditionsRaw.tool_state_values, TOOL_STATES, "escalation_conditions.tool_state_values"),
    validation_state_values: parseEnumArray(escalationConditionsRaw.validation_state_values, VALIDATION_STATES, "escalation_conditions.validation_state_values"),
    evidence_state_values: parseEnumArray(escalationConditionsRaw.evidence_state_values, EVIDENCE_STATES, "escalation_conditions.evidence_state_values"),
    retry_budget_exhausted: parseBoolean(escalationConditionsRaw.retry_budget_exhausted, "escalation_conditions.retry_budget_exhausted"),
    notes: uniqueStrings(parseStringArray(escalationConditionsRaw.notes)),
  };

  const rollbackScopeByReasonRaw = rollbackPolicyRaw.scope_by_reason;
  if (!isRecord(rollbackScopeByReasonRaw)) {
    throw new Error("rollback_policy.scope_by_reason must be an object.");
  }

  const rollback_policy: RollbackPolicy = {
    repeated_validation_failure_retry_gte: parseInteger(
      rollbackPolicyRaw.repeated_validation_failure_retry_gte,
      "rollback_policy.repeated_validation_failure_retry_gte",
    ),
    repo_state_values: parseEnumArray(rollbackPolicyRaw.repo_state_values, REPO_STATES, "rollback_policy.repo_state_values"),
    conflicting_changes_trigger: parseBoolean(rollbackPolicyRaw.conflicting_changes_trigger, "rollback_policy.conflicting_changes_trigger"),
    safety_regression_trigger: parseBoolean(rollbackPolicyRaw.safety_regression_trigger, "rollback_policy.safety_regression_trigger"),
    reviewer_rejects_current_lane_trigger: parseBoolean(
      rollbackPolicyRaw.reviewer_rejects_current_lane_trigger,
      "rollback_policy.reviewer_rejects_current_lane_trigger",
    ),
    scope_by_reason: {
      repeated_validation_failure: parseRollbackScope(
        rollbackScopeByReasonRaw.repeated_validation_failure,
        "rollback_policy.scope_by_reason.repeated_validation_failure",
      ),
      repo_state_failure: parseRollbackScope(
        rollbackScopeByReasonRaw.repo_state_failure,
        "rollback_policy.scope_by_reason.repo_state_failure",
      ),
      conflicting_changes: parseRollbackScope(
        rollbackScopeByReasonRaw.conflicting_changes,
        "rollback_policy.scope_by_reason.conflicting_changes",
      ),
      safety_regression: parseRollbackScope(
        rollbackScopeByReasonRaw.safety_regression,
        "rollback_policy.scope_by_reason.safety_regression",
      ),
      reviewer_rejects_current_lane: parseRollbackScope(
        rollbackScopeByReasonRaw.reviewer_rejects_current_lane,
        "rollback_policy.scope_by_reason.reviewer_rejects_current_lane",
      ),
    },
    approval_required_scopes: parseEnumArray(
      rollbackPolicyRaw.approval_required_scopes,
      ROLLBACK_SCOPES,
      "rollback_policy.approval_required_scopes",
    ),
    notes: uniqueStrings(parseStringArray(rollbackPolicyRaw.notes)),
  };

  const stop_conditions: StopConditions = {
    approval_required: parseBoolean(stopConditionsRaw.approval_required, "stop_conditions.approval_required"),
    ambiguous_requirements: parseBoolean(stopConditionsRaw.ambiguous_requirements, "stop_conditions.ambiguous_requirements"),
    tool_state_values: parseEnumArray(stopConditionsRaw.tool_state_values, TOOL_STATES, "stop_conditions.tool_state_values"),
    evidence_state_values: parseEnumArray(stopConditionsRaw.evidence_state_values, EVIDENCE_STATES, "stop_conditions.evidence_state_values"),
    notes: uniqueStrings(parseStringArray(stopConditionsRaw.notes)),
  };

  return {
    version: 1,
    notes: uniqueStrings(parseStringArray(raw.notes)),
    failure_classes,
    retry_limits,
    role_retry_limits,
    provider_retry_limits,
    provider_failure_rules,
    escalation_conditions,
    rollback_policy,
    stop_conditions,
  };
}

export async function loadRecoveryPolicy(cwd: string): Promise<RecoveryPolicy> {
  const raw = await readFile(resolve(cwd, RECOVERY_POLICY_PATH), "utf8");
  return parseRecoveryPolicy(JSON.parse(raw));
}

function defaultRetryCounts(retryCounts: Partial<RetryCounts> | undefined): RetryCounts {
  return {
    sameLane: retryCounts?.sameLane ?? 0,
    strongerModel: retryCounts?.strongerModel ?? 0,
    providerSwitch: retryCounts?.providerSwitch ?? 0,
    total: retryCounts?.total ?? 0,
  };
}

function withRecoveryInputDefaults(input: RecoveryPolicyInput): Required<Omit<RecoveryPolicyInput, "currentModelId" | "failedModels">> & Pick<RecoveryPolicyInput, "currentModelId" | "failedModels"> {
  return {
    role: input.role,
    currentModelId: input.currentModelId,
    failedModels: uniqueStrings(input.failedModels ?? []),
    requirementsClarity: input.requirementsClarity ?? "clear",
    packetIntegrity: input.packetIntegrity ?? "sound",
    providerFailureState: input.providerFailureState ?? "none",
    toolState: input.toolState ?? "available",
    repoState: input.repoState ?? "clean",
    validationState: input.validationState ?? "not_run",
    evidenceState: input.evidenceState ?? "sufficient",
    modelBehavior: input.modelBehavior ?? "normal",
    approvalRequired: input.approvalRequired ?? false,
    retryCounts: defaultRetryCounts(input.retryCounts),
  };
}

export function classifyRecoveryFailure(input: RecoveryPolicyInput): { failureClass: FailureClass; reasons: string[] } {
  const normalized = withRecoveryInputDefaults(input);

  if (normalized.requirementsClarity === "ambiguous") {
    return {
      failureClass: "ambiguity_failure",
      reasons: ["requirements are ambiguous and require clarification before bounded retry."],
    };
  }

  if (normalized.packetIntegrity !== "sound") {
    return {
      failureClass: "plan_failure",
      reasons: [`task packet / plan integrity is ${normalized.packetIntegrity}.`],
    };
  }

  if (normalized.providerFailureState !== "none") {
    return {
      failureClass: "provider_failure",
      reasons: [`provider failure state is ${normalized.providerFailureState}.`],
    };
  }

  if (normalized.toolState !== "available") {
    return {
      failureClass: "tool_failure",
      reasons: [`tool state is ${normalized.toolState}.`],
    };
  }

  if (normalized.repoState === "unsafe" || normalized.repoState === "conflicted") {
    return {
      failureClass: "repo_state_failure",
      reasons: [`repo state is ${normalized.repoState}.`],
    };
  }

  if (normalized.modelBehavior !== "normal") {
    return {
      failureClass: "model_failure",
      reasons: [`model behavior is ${normalized.modelBehavior}.`],
    };
  }

  if (
    normalized.validationState === "fail" ||
    normalized.validationState === "contradictory" ||
    normalized.validationState === "blocked" ||
    normalized.evidenceState !== "sufficient"
  ) {
    return {
      failureClass: "validation_failure",
      reasons: [
        `validation state is ${normalized.validationState}.`,
        `evidence state is ${normalized.evidenceState}.`,
      ],
    };
  }

  return {
    failureClass: "validation_failure",
    reasons: ["defaulted to validation_failure because no narrower failure signal was present."],
  };
}

function resolveRoutingCandidates(config: HarnessRoutingConfig, input: Required<Omit<RecoveryPolicyInput, "currentModelId" | "failedModels">> & Pick<RecoveryPolicyInput, "currentModelId" | "failedModels">): {
  strongerModelCandidate: string | null;
  sameProviderStrongerCandidate: string | null;
  providerSwitchCandidate: string | null;
  currentModelId: string;
  currentProvider: string;
} {
  const roleConfig = config.routing_defaults[input.role];
  const currentModelId = normalizeModelId(input.currentModelId ?? defaultModelId(roleConfig), roleConfig.provider);
  const currentProvider = splitModelId(currentModelId).provider;
  const failedModels = uniqueStrings(input.failedModels ?? []).map((modelId) => normalizeModelId(modelId, roleConfig.provider));
  const fallbackOrder = uniqueStrings(roleConfig.fallback_order.map((modelId) => normalizeModelId(modelId, roleConfig.provider)));

  const strongerModelCandidate = fallbackOrder.find((modelId) => modelId !== currentModelId && !failedModels.includes(modelId)) ?? null;
  const sameProviderStrongerCandidate =
    fallbackOrder.find((modelId) => {
      const provider = splitModelId(modelId).provider;
      return provider === currentProvider && modelId !== currentModelId && !failedModels.includes(modelId);
    }) ?? null;
  const providerSwitchCandidate =
    fallbackOrder.find((modelId) => {
      const provider = splitModelId(modelId).provider;
      return provider !== currentProvider && !failedModels.includes(modelId);
    }) ?? null;

  return {
    strongerModelCandidate,
    sameProviderStrongerCandidate,
    providerSwitchCandidate,
    currentModelId,
    currentProvider,
  };
}

function buildDisallowedEligibility(reason: string): RetryEligibility {
  return {
    allowed: false,
    reason,
    nextModelId: null,
    nextProvider: null,
  };
}

export function resolveRecoveryPolicy(
  policy: RecoveryPolicy,
  routingConfig: HarnessRoutingConfig,
  input: RecoveryPolicyInput,
): RecoveryAssessment {
  const normalized = withRecoveryInputDefaults(input);
  const classification = classifyRecoveryFailure(normalized);
  const failurePolicy = policy.failure_classes[classification.failureClass];
  const candidates = resolveRoutingCandidates(routingConfig, normalized);
  const retryCounts = normalized.retryCounts;
  const policyNotes = [...policy.notes, ...failurePolicy.notes];

  const escalationReasons: string[] = [];
  if (policy.escalation_conditions.approval_required && normalized.approvalRequired) {
    escalationReasons.push("human approval is required before proceeding.");
  }
  if (policy.escalation_conditions.ambiguous_requirements && normalized.requirementsClarity === "ambiguous") {
    escalationReasons.push("requirements are ambiguous.");
  }
  if (policy.escalation_conditions.repo_state_values.includes(normalized.repoState)) {
    escalationReasons.push(`repo state ${normalized.repoState} requires escalation.`);
  }
  if (policy.escalation_conditions.tool_state_values.includes(normalized.toolState)) {
    escalationReasons.push(`tool state ${normalized.toolState} requires escalation.`);
  }
  if (policy.escalation_conditions.validation_state_values.includes(normalized.validationState)) {
    escalationReasons.push(`validation state ${normalized.validationState} requires escalation.`);
  }
  if (policy.escalation_conditions.evidence_state_values.includes(normalized.evidenceState)) {
    escalationReasons.push(`evidence state ${normalized.evidenceState} requires escalation.`);
  }
  if (policy.escalation_conditions.retry_budget_exhausted && retryCounts.total >= policy.retry_limits.total_without_human_max) {
    escalationReasons.push("total retry budget is exhausted.");
  }

  const totalBudgetAvailable = retryCounts.total < policy.retry_limits.total_without_human_max;

  const retry_same_lane: RetryEligibility = !failurePolicy.allow_retry_same_lane
    ? buildDisallowedEligibility(`Failure class ${classification.failureClass} does not allow same-lane retry.`)
    : !totalBudgetAvailable
      ? buildDisallowedEligibility("Total retry budget is exhausted.")
      : retryCounts.sameLane >= policy.retry_limits.retry_same_lane_max
        ? buildDisallowedEligibility("Same-lane retry budget is exhausted.")
        : escalationReasons.length > 0
          ? buildDisallowedEligibility(`Retry blocked because ${escalationReasons.join(" ")}`)
          : {
              allowed: true,
              reason: "Same-lane retry remains eligible under current policy.",
              nextModelId: candidates.currentModelId,
              nextProvider: candidates.currentProvider,
            };

  const strongerModelCandidate =
    classification.failureClass === "provider_failure" ? candidates.sameProviderStrongerCandidate : candidates.strongerModelCandidate;
  const retry_stronger_model: RetryEligibility = !failurePolicy.allow_retry_stronger_model
    ? buildDisallowedEligibility(`Failure class ${classification.failureClass} does not allow stronger-model retry.`)
    : !totalBudgetAvailable
      ? buildDisallowedEligibility("Total retry budget is exhausted.")
      : retryCounts.strongerModel >= policy.retry_limits.retry_stronger_model_max
        ? buildDisallowedEligibility("Stronger-model retry budget is exhausted.")
        : escalationReasons.length > 0
          ? buildDisallowedEligibility(`Retry blocked because ${escalationReasons.join(" ")}`)
          : classification.failureClass === "provider_failure" &&
              !policy.provider_failure_rules.same_provider_stronger_model_states.includes(normalized.providerFailureState)
            ? buildDisallowedEligibility(`Provider failure state ${normalized.providerFailureState} does not allow same-provider stronger-model retry.`)
            : !strongerModelCandidate
              ? buildDisallowedEligibility("No stronger-model candidate is available from routing policy.")
              : {
                  allowed: true,
                  reason:
                    classification.failureClass === "provider_failure"
                      ? "Same-provider stronger-model retry is eligible for this provider failure state."
                      : "Stronger-model retry is eligible under current policy.",
                  nextModelId: strongerModelCandidate,
                  nextProvider: splitModelId(strongerModelCandidate).provider,
                };

  const retry_switch_provider: RetryEligibility = !failurePolicy.allow_switch_provider
    ? buildDisallowedEligibility(`Failure class ${classification.failureClass} does not allow provider switch retry.`)
    : !totalBudgetAvailable
      ? buildDisallowedEligibility("Total retry budget is exhausted.")
      : retryCounts.providerSwitch >= policy.retry_limits.switch_provider_max
        ? buildDisallowedEligibility("Provider-switch retry budget is exhausted.")
        : escalationReasons.length > 0
          ? buildDisallowedEligibility(`Retry blocked because ${escalationReasons.join(" ")}`)
          : classification.failureClass === "provider_failure" &&
              !policy.provider_failure_rules.switch_provider_states.includes(normalized.providerFailureState)
            ? buildDisallowedEligibility(`Provider failure state ${normalized.providerFailureState} does not allow provider switch retry.`)
            : !candidates.providerSwitchCandidate
              ? buildDisallowedEligibility("No provider-switch candidate is available from routing policy.")
              : {
                  allowed: true,
                  reason:
                    classification.failureClass === "provider_failure"
                      ? "Provider switch retry is eligible for this provider failure state."
                      : "Provider switch retry is eligible under current policy.",
                  nextModelId: candidates.providerSwitchCandidate,
                  nextProvider: splitModelId(candidates.providerSwitchCandidate).provider,
                };

  let recommendedAction: RecoveryAction = "escalate";
  if (escalationReasons.length === 0) {
    for (const action of failurePolicy.preferred_actions) {
      if (action === "retry_same_lane" && retry_same_lane.allowed) {
        recommendedAction = action;
        break;
      }
      if (action === "retry_stronger_model" && retry_stronger_model.allowed) {
        recommendedAction = action;
        break;
      }
      if (action === "switch_provider" && retry_switch_provider.allowed) {
        recommendedAction = action;
        break;
      }
      if (action === "escalate") {
        recommendedAction = action;
      }
    }
  }

  const escalationRequired = escalationReasons.length > 0 || recommendedAction === "escalate";
  const escalationReason = escalationReasons.length > 0
    ? escalationReasons.join(" ")
    : recommendedAction === "escalate"
      ? "No eligible bounded retry action remained under the current recovery policy."
      : "Bounded retry remains eligible under the current recovery policy.";

  if (classification.failureClass === "provider_failure") {
    policyNotes.push(`Provider failure handling evaluated current provider ${candidates.currentProvider}.`);
  }
  policyNotes.push("Rollback and destructive unwind decisions remain deferred to HARNESS-031.");

  return {
    version: 1,
    failureClass: classification.failureClass,
    classificationReasons: classification.reasons,
    recommendedAction,
    retryEligibility: {
      retry_same_lane,
      retry_stronger_model,
      switch_provider: retry_switch_provider,
    },
    escalation: {
      required: escalationRequired,
      reason: escalationReason,
    },
    policyNotes,
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "resolve_recovery_policy",
    label: "Resolve Recovery Policy",
    description: "Classify bounded failures and determine retry eligibility plus escalation need using the repo-local recovery policy.",
    parameters: ResolveRecoveryPolicySchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const policy = await loadRecoveryPolicy(ctx.cwd);
      const routingConfig = await loadHarnessRoutingConfig(ctx.cwd);
      const assessment = resolveRecoveryPolicy(policy, routingConfig, params as RecoveryPolicyInput);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(assessment, null, 2),
          },
        ],
        details: {
          ok: true,
          assessment,
        },
      };
    },
  });
}
