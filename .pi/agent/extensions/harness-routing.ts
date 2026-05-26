import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

export const ROUTE_REASONS = [
  "default",
  "task_simpler",
  "task_harder",
  "provider_failure",
  "budget_pressure",
  "recovery_recommendation",
  "human_override",
] as const;

export const BUDGET_MODES = ["default", "balanced", "conserve", "high"] as const;
export const PHASE_LANES = ["screen_design", "frontend_implementation", "backend_implementation"] as const;
export const PHASE_VERIFICATION_STATUSES = ["unverified", "verified", "unavailable"] as const;
export const PHASE_PROFILE_ACTIVATIONS = ["fallback_until_verified"] as const;
export const THINKING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type HarnessRole = (typeof ROLE_IDS)[number];
export type RouteReason = (typeof ROUTE_REASONS)[number];
export type BudgetMode = (typeof BUDGET_MODES)[number];
export type PhaseLane = (typeof PHASE_LANES)[number];
export type PhaseModelVerificationStatus = (typeof PHASE_VERIFICATION_STATUSES)[number];
export type PhaseProfileActivation = (typeof PHASE_PROFILE_ACTIVATIONS)[number];

export interface RoutingDefault {
  provider: string;
  default_model: string;
  thinking: string;
  allowed_overrides: string[];
  budget_guidance: string;
  fallback_order: string[];
  budget_overrides: string[];
}

export interface OverrideRule {
  allowed_roles: string[];
  blocked_roles?: string[];
  may_use_fallback_order?: boolean;
  may_use_budget_overrides?: boolean;
  prefer_stronger_override?: boolean;
}

export interface BudgetModeRule {
  allow_budget_overrides: boolean;
  prefer_stronger_override: boolean;
}

export interface RoutingPolicy {
  critical_roles: HarnessRole[];
  override_reasons: Record<RouteReason, OverrideRule>;
  budget_modes: Record<BudgetMode, BudgetModeRule>;
}

export interface ThinkingPolicy {
  notes: string[];
  level_order: string[];
  reason_adjustments: Partial<Record<RouteReason, number>>;
  budget_mode_caps: Partial<Record<BudgetMode, string>>;
  critical_role_minimum: string | null;
}


export interface PhaseRoutingProfile {
  intendedUse: string;
  targetModelRequest: string;
  verificationStatus: PhaseModelVerificationStatus;
  verifiedModelId: string | null;
  fallbackModelId: string;
  thinking: string;
  allowedThinking: string[];
  activation: PhaseProfileActivation;
}

export interface CapabilityProfile {
  description: string;
  model_ids: string[];
}

export interface HarnessRoutingConfig {
  notes: string[];
  routing_defaults: Record<HarnessRole, RoutingDefault>;
  phase_routing_profiles: Partial<Record<PhaseLane, PhaseRoutingProfile>>;
  routing_policy: RoutingPolicy;
  thinking_policy: ThinkingPolicy;
  capabilities: Record<string, CapabilityProfile>;
}

export interface CapabilityResolutionInput {
  capability: string;
  unavailableModels?: string[];
}

export interface CapabilityResolution {
  capability: string;
  description: string;
  candidates: string[];
  firstAvailable: string | null;
}

export interface RouteResolutionInput {
  role: HarnessRole;
  reason?: RouteReason;
  budgetMode?: BudgetMode;
  failedModels?: string[];
  modelOverride?: string;
  phaseLane?: PhaseLane;
}

export interface RouteResolution {
  role: HarnessRole;
  reason: RouteReason;
  budgetMode: BudgetMode;
  selectedModelId: string;
  selectedProvider: string;
  selectedModel: string;
  thinking: string;
  budgetGuidance: string;
  criticalRole: boolean;
  source:
    | "default"
    | "budget_override"
    | "stronger_override"
    | "fallback"
    | "explicit_override"
    | "phase_profile"
    | "phase_fallback";
  phaseLane: PhaseLane | null;
  phaseRoutingSource: "none" | "verified_model" | "fallback_until_verified" | "fallback_unavailable" | "explicit_override_precedence";
  requestedModelVerificationStatus: PhaseModelVerificationStatus | null;
  requestedModelTarget: string | null;
  fallbackOrder: string[];
  budgetOverrides: string[];
  failedModels: string[];
  blockedAdjustments: string[];
  policyNotes: string[];
}

const CONFIG_PATH = ".pi/agent/models.json";

const ResolveHarnessRouteSchema = Type.Object({
  role: StringEnum(ROLE_IDS),
  reason: Type.Optional(StringEnum(ROUTE_REASONS)),
  budgetMode: Type.Optional(StringEnum(BUDGET_MODES)),
  failedModels: Type.Optional(Type.Array(Type.String())),
  modelOverride: Type.Optional(Type.String()),
  phaseLane: Type.Optional(StringEnum(PHASE_LANES)),
});

const ResolveHarnessCapabilitySchema = Type.Object({
  capability: Type.String({ description: "Capability id declared under `capabilities` in .pi/agent/models.json." }),
  unavailableModels: Type.Optional(Type.Array(Type.String(), { description: "Fully-qualified <provider>/<model> ids that should be filtered out of the candidate list before picking firstAvailable." })),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function roleMatches(list: string[] | undefined, role: HarnessRole): boolean {
  if (!list || list.length === 0) return false;
  return list.includes("*") || list.includes(role);
}

function isPhaseLane(value: unknown): value is PhaseLane {
  return typeof value === "string" && PHASE_LANES.includes(value as PhaseLane);
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function parseCapabilityProfile(raw: unknown, capabilityId: string): CapabilityProfile {
  if (!isRecord(raw)) {
    throw new Error(`Capability ${capabilityId} must be an object.`);
  }
  const description = typeof raw.description === "string" ? raw.description : "";
  const modelIds = parseStringArray(raw.model_ids)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (modelIds.length === 0) {
    throw new Error(`Capability ${capabilityId} requires a non-empty model_ids array.`);
  }
  for (const modelId of modelIds) {
    if (!modelId.includes("/")) {
      throw new Error(
        `Capability ${capabilityId} model id "${modelId}" must be fully qualified as "<provider>/<model>".`,
      );
    }
  }
  return { description, model_ids: modelIds };
}

function expandCapabilityRefArray(
  rawEntries: unknown,
  capabilities: Record<string, CapabilityProfile>,
  role: string,
  fieldName: string,
  defaultModelFullId?: string,
): string[] {
  if (!Array.isArray(rawEntries)) return [];
  const expanded: string[] = [];
  for (const entry of rawEntries) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.length > 0) expanded.push(trimmed);
      continue;
    }
    if (isRecord(entry) && typeof entry.capability === "string") {
      const capabilityId = entry.capability.trim();
      const profile = capabilities[capabilityId];
      if (!profile) {
        throw new Error(
          `Unknown ${fieldName} capability "${capabilityId}" for role ${role}.`,
        );
      }
      const excludeDefault = entry.excludeDefaultModel === true;
      if (excludeDefault && !defaultModelFullId) {
        throw new Error(
          `${fieldName} capability "${capabilityId}" for role ${role} cannot use excludeDefaultModel here (no default model available in this context).`,
        );
      }
      const candidates = excludeDefault
        ? profile.model_ids.filter((modelId) => modelId !== defaultModelFullId)
        : profile.model_ids;
      expanded.push(...candidates);
      continue;
    }
    throw new Error(
      `Invalid ${fieldName} entry for role ${role}: expected a model id string or { "capability": "..." }.`,
    );
  }
  return expanded;
}

function parsePhaseProfile(raw: unknown, phaseLane: PhaseLane): PhaseRoutingProfile {
  if (!isRecord(raw)) {
    throw new Error(`Missing phase routing profile for lane: ${phaseLane}`);
  }

  const intendedUse = typeof raw.intendedUse === "string" ? raw.intendedUse : "";
  const targetModelRequest = typeof raw.targetModelRequest === "string" ? raw.targetModelRequest : "";
  const verificationStatus = typeof raw.verificationStatus === "string" && PHASE_VERIFICATION_STATUSES.includes(raw.verificationStatus as PhaseModelVerificationStatus)
    ? (raw.verificationStatus as PhaseModelVerificationStatus)
    : null;
  const verifiedModelId = raw.verifiedModelId === null || raw.verifiedModelId === undefined ? null : typeof raw.verifiedModelId === "string" ? raw.verifiedModelId : "";
  const fallbackModelId = typeof raw.fallbackModelId === "string" ? raw.fallbackModelId : "";
  const thinking = typeof raw.thinking === "string" ? raw.thinking : "";
  const allowedThinking = parseStringArray(raw.allowedThinking);
  const activation = typeof raw.activation === "string" && PHASE_PROFILE_ACTIVATIONS.includes(raw.activation as PhaseProfileActivation)
    ? (raw.activation as PhaseProfileActivation)
    : null;

  if (!intendedUse || !targetModelRequest || !verificationStatus || !fallbackModelId || !thinking || allowedThinking.length === 0 || !activation) {
    throw new Error(`Incomplete phase routing profile for lane: ${phaseLane}`);
  }
  if (!allowedThinking.includes(thinking)) {
    throw new Error(`Invalid phase routing profile for ${phaseLane}: thinking must be in allowedThinking.`);
  }
  if (verificationStatus === "verified" && (!verifiedModelId || verifiedModelId.trim().length === 0)) {
    throw new Error(`Invalid phase routing profile for ${phaseLane}: verifiedModelId is required when verificationStatus is verified.`);
  }
  if (verificationStatus !== "verified" && verifiedModelId !== null) {
    throw new Error(`Invalid phase routing profile for ${phaseLane}: verifiedModelId must be null until the requested model is verified.`);
  }
  if (verificationStatus !== "verified" && (targetModelRequest === fallbackModelId || fallbackModelId.endsWith(`/${targetModelRequest}`))) {
    throw new Error(`Invalid phase routing profile for ${phaseLane}: unverified targetModelRequest cannot also be the active fallbackModelId.`);
  }

  return {
    intendedUse,
    targetModelRequest,
    verificationStatus,
    verifiedModelId,
    fallbackModelId,
    thinking,
    allowedThinking,
    activation,
  };
}

function thinkingIndex(levelOrder: string[], level: string): number {
  return levelOrder.indexOf(level);
}

function clampThinkingIndex(index: number, levelOrder: string[]): number {
  if (index < 0) return 0;
  if (index >= levelOrder.length) return levelOrder.length - 1;
  return index;
}

export function resolveThinkingLevel(
  policy: ThinkingPolicy,
  baseThinking: string,
  role: HarnessRole,
  reason: RouteReason,
  budgetMode: BudgetMode,
  criticalRole: boolean,
): string {
  const levelOrder = policy.level_order.length > 0 ? policy.level_order : [...THINKING_LEVEL_ORDER];
  const baseIndex = thinkingIndex(levelOrder, baseThinking);
  if (baseIndex < 0) return baseThinking;

  const adjustment = policy.reason_adjustments[reason] ?? 0;
  let resolvedIndex = clampThinkingIndex(baseIndex + adjustment, levelOrder);

  const budgetCap = policy.budget_mode_caps[budgetMode];
  const budgetCapIndex = budgetCap ? thinkingIndex(levelOrder, budgetCap) : -1;
  if (budgetCapIndex >= 0) {
    resolvedIndex = Math.min(resolvedIndex, budgetCapIndex);
  }

  if (criticalRole && policy.critical_role_minimum) {
    const criticalMinimumIndex = thinkingIndex(levelOrder, policy.critical_role_minimum);
    if (criticalMinimumIndex >= 0) {
      resolvedIndex = Math.max(resolvedIndex, criticalMinimumIndex);
    }
  }

  return levelOrder[resolvedIndex] ?? baseThinking;
}

export function normalizeModelId(modelId: string, defaultProvider: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  return trimmed.includes("/") ? trimmed : `${defaultProvider}/${trimmed}`;
}

export function splitModelId(modelId: string): { provider: string; model: string } {
  const slash = modelId.indexOf("/");
  if (slash < 0) {
    return { provider: "", model: modelId };
  }
  return { provider: modelId.slice(0, slash), model: modelId.slice(slash + 1) };
}

export function defaultModelId(route: RoutingDefault): string {
  return `${route.provider}/${route.default_model}`;
}

export function parseHarnessRoutingConfig(raw: unknown): HarnessRoutingConfig {
  if (!isRecord(raw)) {
    throw new Error("Routing config must be an object.");
  }

  const notes = Array.isArray(raw.notes) ? raw.notes.filter((value): value is string => typeof value === "string") : [];
  const routingDefaultsRaw = raw.routing_defaults;
  const routingPolicyRaw = raw.routing_policy;
  const thinkingPolicyRaw = raw.thinking_policy;
  const phaseProfilesRaw = raw.phase_routing_profiles;

  if (!isRecord(routingDefaultsRaw)) {
    throw new Error("routing_defaults is required.");
  }
  if (!isRecord(routingPolicyRaw)) {
    throw new Error("routing_policy is required.");
  }

  const capabilities: Record<string, CapabilityProfile> = {};
  const capabilitiesRaw = raw.capabilities;
  if (capabilitiesRaw !== undefined) {
    if (!isRecord(capabilitiesRaw)) {
      throw new Error("capabilities must be an object when present.");
    }
    for (const capabilityId of Object.keys(capabilitiesRaw)) {
      capabilities[capabilityId] = parseCapabilityProfile(capabilitiesRaw[capabilityId], capabilityId);
    }
  }

  const routing_defaults = {} as Record<HarnessRole, RoutingDefault>;
  for (const role of ROLE_IDS) {
    const entryRaw = routingDefaultsRaw[role];
    if (!isRecord(entryRaw)) {
      throw new Error(`Missing routing default for role: ${role}`);
    }

    const provider = typeof entryRaw.provider === "string" ? entryRaw.provider : "";
    const default_model = typeof entryRaw.default_model === "string" ? entryRaw.default_model : "";
    const thinking = typeof entryRaw.thinking === "string" ? entryRaw.thinking : "";
    const budget_guidance = typeof entryRaw.budget_guidance === "string" ? entryRaw.budget_guidance : "";
    const defaultModelFullId = provider && default_model
      ? normalizeModelId(default_model, provider)
      : undefined;
    const allowed_overrides = expandCapabilityRefArray(
      entryRaw.allowed_overrides,
      capabilities,
      role,
      "allowed_overrides",
      defaultModelFullId,
    );
    const fallback_order = expandCapabilityRefArray(
      entryRaw.fallback_order,
      capabilities,
      role,
      "fallback_order",
    );
    const budget_overrides = expandCapabilityRefArray(
      entryRaw.budget_overrides,
      capabilities,
      role,
      "budget_overrides",
    );

    if (!provider || !default_model || !thinking || !budget_guidance || fallback_order.length === 0) {
      throw new Error(`Incomplete routing default for role: ${role}`);
    }

    routing_defaults[role] = {
      provider,
      default_model,
      thinking,
      allowed_overrides,
      budget_guidance,
      fallback_order,
      budget_overrides,
    };
  }

  const criticalRoles = Array.isArray(routingPolicyRaw.critical_roles)
    ? routingPolicyRaw.critical_roles.filter((value): value is HarnessRole =>
        typeof value === "string" && ROLE_IDS.includes(value as HarnessRole),
      )
    : [];

  const overrideReasonsRaw = routingPolicyRaw.override_reasons;
  const budgetModesRaw = routingPolicyRaw.budget_modes;

  if (!isRecord(overrideReasonsRaw) || !isRecord(budgetModesRaw)) {
    throw new Error("routing_policy.override_reasons and routing_policy.budget_modes are required.");
  }

  const override_reasons = {} as Record<RouteReason, OverrideRule>;
  for (const reason of ROUTE_REASONS) {
    const ruleRaw = overrideReasonsRaw[reason];
    if (!isRecord(ruleRaw)) {
      throw new Error(`Missing override rule for reason: ${reason}`);
    }

    override_reasons[reason] = {
      allowed_roles: Array.isArray(ruleRaw.allowed_roles)
        ? ruleRaw.allowed_roles.filter((value): value is string => typeof value === "string")
        : [],
      blocked_roles: Array.isArray(ruleRaw.blocked_roles)
        ? ruleRaw.blocked_roles.filter((value): value is string => typeof value === "string")
        : [],
      may_use_fallback_order:
        typeof ruleRaw.may_use_fallback_order === "boolean" ? ruleRaw.may_use_fallback_order : false,
      may_use_budget_overrides:
        typeof ruleRaw.may_use_budget_overrides === "boolean" ? ruleRaw.may_use_budget_overrides : false,
      prefer_stronger_override:
        typeof ruleRaw.prefer_stronger_override === "boolean" ? ruleRaw.prefer_stronger_override : false,
    };
  }

  const budget_modes = {} as Record<BudgetMode, BudgetModeRule>;
  for (const mode of BUDGET_MODES) {
    const ruleRaw = budgetModesRaw[mode];
    if (!isRecord(ruleRaw)) {
      throw new Error(`Missing budget mode rule: ${mode}`);
    }

    budget_modes[mode] = {
      allow_budget_overrides:
        typeof ruleRaw.allow_budget_overrides === "boolean" ? ruleRaw.allow_budget_overrides : false,
      prefer_stronger_override:
        typeof ruleRaw.prefer_stronger_override === "boolean" ? ruleRaw.prefer_stronger_override : false,
    };
  }

  const thinking_policy: ThinkingPolicy = {
    notes: [],
    level_order: [...THINKING_LEVEL_ORDER],
    reason_adjustments: {},
    budget_mode_caps: {},
    critical_role_minimum: null,
  };

  if (isRecord(thinkingPolicyRaw)) {
    thinking_policy.notes = Array.isArray(thinkingPolicyRaw.notes)
      ? thinkingPolicyRaw.notes.filter((value): value is string => typeof value === "string")
      : [];

    const rawLevelOrder = Array.isArray(thinkingPolicyRaw.level_order)
      ? thinkingPolicyRaw.level_order.filter((value): value is string => typeof value === "string")
      : [];
    thinking_policy.level_order = rawLevelOrder.length > 0 ? rawLevelOrder : [...THINKING_LEVEL_ORDER];

    if (isRecord(thinkingPolicyRaw.reason_adjustments)) {
      for (const reason of ROUTE_REASONS) {
        const rawAdjustment = thinkingPolicyRaw.reason_adjustments[reason];
        if (typeof rawAdjustment === "number" && Number.isInteger(rawAdjustment)) {
          thinking_policy.reason_adjustments[reason] = rawAdjustment;
        }
      }
    }

    if (isRecord(thinkingPolicyRaw.budget_mode_caps)) {
      for (const mode of BUDGET_MODES) {
        const rawCap = thinkingPolicyRaw.budget_mode_caps[mode];
        if (typeof rawCap === "string" && rawCap.length > 0) {
          thinking_policy.budget_mode_caps[mode] = rawCap;
        }
      }
    }

    thinking_policy.critical_role_minimum =
      typeof thinkingPolicyRaw.critical_role_minimum === "string" && thinkingPolicyRaw.critical_role_minimum.length > 0
        ? thinkingPolicyRaw.critical_role_minimum
        : null;
  }

  const phase_routing_profiles: Partial<Record<PhaseLane, PhaseRoutingProfile>> = {};
  if (phaseProfilesRaw !== undefined) {
    if (!isRecord(phaseProfilesRaw)) {
      throw new Error("phase_routing_profiles must be an object when present.");
    }
    for (const key of Object.keys(phaseProfilesRaw)) {
      if (!isPhaseLane(key)) {
        throw new Error(`Unknown phase routing profile lane: ${key}`);
      }
    }
    for (const phaseLane of PHASE_LANES) {
      phase_routing_profiles[phaseLane] = parsePhaseProfile(phaseProfilesRaw[phaseLane], phaseLane);
    }
  }

  return {
    notes,
    routing_defaults,
    phase_routing_profiles,
    routing_policy: {
      critical_roles: criticalRoles,
      override_reasons,
      budget_modes,
    },
    thinking_policy,
    capabilities,
  };
}

export function resolveHarnessCapability(
  config: HarnessRoutingConfig,
  input: CapabilityResolutionInput,
): CapabilityResolution {
  const profile = config.capabilities[input.capability];
  if (!profile) {
    throw new Error(`Unknown capability: ${input.capability}`);
  }
  const unavailable = new Set(input.unavailableModels ?? []);
  const candidates = profile.model_ids.filter((modelId) => !unavailable.has(modelId));
  return {
    capability: input.capability,
    description: profile.description,
    candidates,
    firstAvailable: candidates[0] ?? null,
  };
}

export async function loadHarnessRoutingConfig(cwd: string): Promise<HarnessRoutingConfig> {
  const raw = await readFile(resolve(cwd, CONFIG_PATH), "utf8");
  return parseHarnessRoutingConfig(JSON.parse(raw));
}

export function resolveHarnessRoute(config: HarnessRoutingConfig, input: RouteResolutionInput): RouteResolution {
  const reason = input.reason ?? "default";
  const budgetMode = input.budgetMode ?? "default";
  const roleConfig = config.routing_defaults[input.role];
  const reasonRule = config.routing_policy.override_reasons[reason];
  const budgetRule = config.routing_policy.budget_modes[budgetMode];

  if (!roleConfig) {
    throw new Error(`Unknown role: ${input.role}`);
  }

  const criticalRole = config.routing_policy.critical_roles.includes(input.role);
  const fallbackOrder = uniqueStrings(roleConfig.fallback_order.map((modelId) => normalizeModelId(modelId, roleConfig.provider)));
  const budgetOverrides = uniqueStrings(
    roleConfig.budget_overrides.map((modelId) => normalizeModelId(modelId, roleConfig.provider)),
  );
  const failedModels = uniqueStrings(
    (input.failedModels ?? []).map((modelId) => normalizeModelId(modelId, roleConfig.provider)),
  );
  const availableFallbacks = fallbackOrder.filter((modelId) => !failedModels.includes(modelId));
  const availableBudgetOverrides = budgetOverrides.filter((modelId) => !failedModels.includes(modelId));

  if (availableFallbacks.length === 0) {
    throw new Error(`No viable routing candidates remain for ${input.role} after filtering failed models.`);
  }

  const blockedAdjustments: string[] = [];
  const policyNotes: string[] = [];
  const blockedByReason = roleMatches(reasonRule.blocked_roles, input.role);
  const allowedByReason = roleMatches(reasonRule.allowed_roles, input.role);

  const defaultRoute = availableFallbacks[0];
  let selectedModelId = defaultRoute;
  let source: RouteResolution["source"] = "default";
  let explicitOverrideApplied = false;

  if (blockedByReason) {
    blockedAdjustments.push(`${input.role} is blocked from ${reason} adjustments by routing policy.`);
  }

  const budgetOverridesAllowed = !blockedByReason && allowedByReason && reasonRule.may_use_budget_overrides && budgetRule.allow_budget_overrides;
  const strongerOverridesPreferred =
    !blockedByReason && reasonRule.may_use_fallback_order && (reasonRule.prefer_stronger_override || budgetRule.prefer_stronger_override);

  if (input.modelOverride) {
    const normalizedOverride = normalizeModelId(input.modelOverride, roleConfig.provider);
    const isFallbackOverride = availableFallbacks.includes(normalizedOverride);
    const isBudgetOverride = availableBudgetOverrides.includes(normalizedOverride);

    if (isBudgetOverride && (budgetOverridesAllowed || reason === "human_override")) {
      selectedModelId = normalizedOverride;
      source = "explicit_override";
      explicitOverrideApplied = true;
      policyNotes.push(`Applied explicit budget override ${normalizedOverride}.`);
    } else if (isFallbackOverride && !blockedByReason && reasonRule.may_use_fallback_order) {
      selectedModelId = normalizedOverride;
      source = normalizedOverride === defaultRoute ? "default" : "explicit_override";
      explicitOverrideApplied = true;
      policyNotes.push(`Applied explicit override ${normalizedOverride}.`);
    } else {
      blockedAdjustments.push(
        `Requested override ${normalizedOverride} was not permitted for ${input.role} under reason ${reason}; kept ${defaultRoute}.`,
      );
    }
  } else if (budgetOverridesAllowed && availableBudgetOverrides.length > 0) {
    selectedModelId = availableBudgetOverrides[0];
    source = "budget_override";
    policyNotes.push(`Applied budget override ${selectedModelId} for ${input.role}.`);
  } else if (strongerOverridesPreferred && availableFallbacks.length > 1) {
    selectedModelId = availableFallbacks[1];
    source = "stronger_override";
    policyNotes.push(`Preferred stronger fallback ${selectedModelId} for ${input.role}.`);
  } else if (reasonRule.may_use_fallback_order && failedModels.length > 0 && defaultRoute !== fallbackOrder[0]) {
    selectedModelId = defaultRoute;
    source = "fallback";
    policyNotes.push(`Applied fallback route ${selectedModelId} after filtering failed models.`);
  }

  if (!allowedByReason && reason !== "default") {
    blockedAdjustments.push(`${input.role} is not eligible for ${reason} adjustments; kept ${defaultRoute}.`);
    selectedModelId = defaultRoute;
    source = failedModels.length > 0 && defaultRoute !== fallbackOrder[0] ? "fallback" : "default";
  }

  let phaseLane: PhaseLane | null = null;
  let phaseRoutingSource: RouteResolution["phaseRoutingSource"] = "none";
  let requestedModelVerificationStatus: PhaseModelVerificationStatus | null = null;
  let requestedModelTarget: string | null = null;
  let baseThinking = roleConfig.thinking;

  if (input.phaseLane !== undefined) {
    if (!isPhaseLane(input.phaseLane)) {
      throw new Error(`Unknown phase lane: ${String(input.phaseLane)}`);
    }
    phaseLane = input.phaseLane;
    const phaseProfile = config.phase_routing_profiles[phaseLane];
    if (!phaseProfile) {
      throw new Error(`Missing phase routing profile for lane: ${phaseLane}`);
    }
    requestedModelVerificationStatus = phaseProfile.verificationStatus;
    requestedModelTarget = phaseProfile.targetModelRequest;

    if (explicitOverrideApplied) {
      phaseRoutingSource = "explicit_override_precedence";
      policyNotes.push(`Explicit model override takes precedence over phase lane ${phaseLane}.`);
    } else if (phaseProfile.verificationStatus === "verified" && phaseProfile.verifiedModelId) {
      selectedModelId = normalizeModelId(phaseProfile.verifiedModelId, roleConfig.provider);
      source = "phase_profile";
      phaseRoutingSource = "verified_model";
      policyNotes.push(`Applied verified phase routing profile ${phaseLane} with ${selectedModelId}.`);
    } else {
      selectedModelId = normalizeModelId(phaseProfile.fallbackModelId, roleConfig.provider);
      source = "phase_fallback";
      phaseRoutingSource = phaseProfile.verificationStatus === "unavailable" ? "fallback_unavailable" : "fallback_until_verified";
      policyNotes.push(`Phase lane ${phaseLane} requested ${phaseProfile.targetModelRequest} (${phaseProfile.verificationStatus}); using verified fallback ${selectedModelId}.`);
    }
    baseThinking = phaseProfile.thinking;
  }

  const selected = splitModelId(selectedModelId);
  const resolvedThinking = resolveThinkingLevel(
    config.thinking_policy,
    baseThinking,
    input.role,
    reason,
    budgetMode,
    criticalRole,
  );
  return {
    role: input.role,
    reason,
    budgetMode,
    selectedModelId,
    selectedProvider: selected.provider,
    selectedModel: selected.model,
    thinking: resolvedThinking,
    budgetGuidance: roleConfig.budget_guidance,
    criticalRole,
    source,
    phaseLane,
    phaseRoutingSource,
    requestedModelVerificationStatus,
    requestedModelTarget,
    fallbackOrder,
    budgetOverrides,
    failedModels,
    blockedAdjustments,
    policyNotes,
  };
}

export default function harnessRouting(pi: ExtensionAPI) {
  pi.registerTool({
    name: "resolve_harness_route",
    label: "Resolve Harness Route",
    description: "Resolve deterministic provider/model routing for a harness role using the repo-local routing policy.",
    promptSnippet: "Use deterministic harness routing instead of ad hoc model switching.",
    promptGuidelines: [
      "Use this tool when provider/model selection for a harness role should follow the repo-local routing policy.",
      "Prefer this tool before improvising model overrides for orchestrator, planning, build, quality, or recovery roles.",
    ],
    parameters: ResolveHarnessRouteSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const config = await loadHarnessRoutingConfig(ctx.cwd);
        const result = resolveHarnessRoute(config, params);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: { ok: true, ...result },
        };
      } catch (error) {
        const message = `Routing resolution failed: ${String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: { ok: false, error: String(error) },
        };
      }
    },
  });

  pi.registerTool({
    name: "resolve_harness_capability",
    label: "Resolve Harness Capability",
    description: "Resolve the repo-local model candidate list for a named capability (e.g. strong_reasoning, economy_reasoning). Returns ordered candidates and the firstAvailable model after filtering out caller-supplied unavailable ids.",
    promptSnippet: "Use deterministic capability resolution instead of hard-coding preferred model IDs.",
    promptGuidelines: [
      "Use this tool when a harness extension or operator needs the current preferred model for a repo-local capability declared in .pi/agent/models.json `capabilities`.",
      "Prefer this tool before hard-coding model IDs for reasoning, routing, or implementation capabilities — capability lists are the single place frontier-model bumps land.",
    ],
    parameters: ResolveHarnessCapabilitySchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const config = await loadHarnessRoutingConfig(ctx.cwd);
        const result = resolveHarnessCapability(config, params);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: { ok: true, ...result },
        };
      } catch (error) {
        const message = `Capability resolution failed: ${String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: { ok: false, error: String(error) },
        };
      }
    },
  });
}
