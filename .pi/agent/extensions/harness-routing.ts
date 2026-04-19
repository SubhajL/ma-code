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

export type HarnessRole = (typeof ROLE_IDS)[number];
export type RouteReason = (typeof ROUTE_REASONS)[number];
export type BudgetMode = (typeof BUDGET_MODES)[number];

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

export interface HarnessRoutingConfig {
  notes: string[];
  routing_defaults: Record<HarnessRole, RoutingDefault>;
  routing_policy: RoutingPolicy;
}

export interface RouteResolutionInput {
  role: HarnessRole;
  reason?: RouteReason;
  budgetMode?: BudgetMode;
  failedModels?: string[];
  modelOverride?: string;
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
    | "explicit_override";
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

  if (!isRecord(routingDefaultsRaw)) {
    throw new Error("routing_defaults is required.");
  }
  if (!isRecord(routingPolicyRaw)) {
    throw new Error("routing_policy is required.");
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
    const allowed_overrides = Array.isArray(entryRaw.allowed_overrides)
      ? entryRaw.allowed_overrides.filter((value): value is string => typeof value === "string")
      : [];
    const fallback_order = Array.isArray(entryRaw.fallback_order)
      ? entryRaw.fallback_order.filter((value): value is string => typeof value === "string")
      : [];
    const budget_overrides = Array.isArray(entryRaw.budget_overrides)
      ? entryRaw.budget_overrides.filter((value): value is string => typeof value === "string")
      : [];

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

  return {
    notes,
    routing_defaults,
    routing_policy: {
      critical_roles: criticalRoles,
      override_reasons,
      budget_modes,
    },
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
      policyNotes.push(`Applied explicit budget override ${normalizedOverride}.`);
    } else if (isFallbackOverride && !blockedByReason && reasonRule.may_use_fallback_order) {
      selectedModelId = normalizedOverride;
      source = normalizedOverride === defaultRoute ? "default" : "explicit_override";
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

  const selected = splitModelId(selectedModelId);
  return {
    role: input.role,
    reason,
    budgetMode,
    selectedModelId,
    selectedProvider: selected.provider,
    selectedModel: selected.model,
    thinking: roleConfig.thinking,
    budgetGuidance: roleConfig.budget_guidance,
    criticalRole,
    source,
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
}
