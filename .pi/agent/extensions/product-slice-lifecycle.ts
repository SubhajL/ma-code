import { readFile } from "node:fs/promises";

export const PRODUCT_SLICE_PHASE_ORDER = [
  "stitch_prompt",
  "stitch_generation",
  "screen_approval",
  "slice_contract",
  "fe_implementation",
  "fe_validation",
  "be_implementation",
  "be_validation",
  "quality",
] as const;

export type ProductSlicePhase = (typeof PRODUCT_SLICE_PHASE_ORDER)[number];
export type ProductSlicePlanStatus = "draft" | "ready" | "blocked";
export type ProductSliceType = "HITL" | "AFK";
export type ProductSliceStatus = "planned" | "active" | "blocked" | "done";
export type ProductSliceEvidenceStatus = "missing" | "ready" | "approved" | "done" | "blocked";
export type ProductSliceTransitionReason =
  | "allowed"
  | "already_current"
  | "blocked_invalid_plan"
  | "blocked_slice_not_found"
  | "blocked_slice_blocked"
  | "blocked_unknown_phase"
  | "blocked_same_slice_parallel"
  | "blocked_current_evidence_incomplete"
  | "blocked_out_of_order";

export interface ProductSlicePhaseEvidence {
  status: ProductSliceEvidenceStatus;
  artifactPath: string | null;
  evidence: string[];
}

export interface ProductSlice {
  sliceId: string;
  title: string;
  type: ProductSliceType;
  status: ProductSliceStatus;
  currentPhase: ProductSlicePhase;
  phaseOrder: ProductSlicePhase[];
  phaseEvidence: Partial<Record<ProductSlicePhase, ProductSlicePhaseEvidence>>;
  dependencies: string[];
  blockedReason: string | null;
}

export interface ProductSlicePlanPolicy {
  intraSliceParallelism: "forbidden";
  unknownTransition: "blocked";
  requiredPhaseOrder: ProductSlicePhase[];
}

export interface ProductSlicePlan {
  version: 1;
  initiativeId: string;
  status: ProductSlicePlanStatus;
  slices: ProductSlice[];
  policy: ProductSlicePlanPolicy;
}

export interface ProductSlicePlanValidation {
  valid: boolean;
  errors: string[];
  plan?: ProductSlicePlan;
}

export interface ProductSlicePhaseTransitionInput {
  plan: unknown;
  sliceId: string;
  requestedPhase: string;
  /** Existing same-slice non-current phase execution. Any value here blocks new phase starts. */
  inFlightPhase?: string | null;
}

export interface ProductSlicePhaseTransitionDecision {
  allowed: boolean;
  reason: ProductSliceTransitionReason;
  currentPhase: ProductSlicePhase | null;
  requestedPhase: string;
  requiredPreviousPhase: ProductSlicePhase | null;
  blockers: string[];
}

const PHASE_SET = new Set<string>(PRODUCT_SLICE_PHASE_ORDER);
const COMPLETE_EVIDENCE_STATUSES = new Set<ProductSliceEvidenceStatus>(["approved", "done"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPhase(value: unknown): value is ProductSlicePhase {
  return typeof value === "string" && PHASE_SET.has(value);
}

function isEvidenceStatus(value: unknown): value is ProductSliceEvidenceStatus {
  return ["missing", "ready", "approved", "done", "blocked"].includes(String(value));
}

function phaseOrderEqualsRequired(value: unknown): value is ProductSlicePhase[] {
  return Array.isArray(value)
    && value.length === PRODUCT_SLICE_PHASE_ORDER.length
    && value.every((phase, index) => phase === PRODUCT_SLICE_PHASE_ORDER[index]);
}

function validatePhaseEvidence(value: unknown, path: string, errors: string[]): Partial<Record<ProductSlicePhase, ProductSlicePhaseEvidence>> {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return {};
  }

  const normalized: Partial<Record<ProductSlicePhase, ProductSlicePhaseEvidence>> = {};
  for (const [phase, evidenceValue] of Object.entries(value)) {
    if (!isPhase(phase)) {
      errors.push(`${path}.${phase} uses an invalid phase name.`);
      continue;
    }
    if (!isRecord(evidenceValue)) {
      errors.push(`${path}.${phase} must be an object.`);
      continue;
    }
    if (!isEvidenceStatus(evidenceValue.status)) {
      errors.push(`${path}.${phase}.status is invalid.`);
      continue;
    }
    const artifactPath = evidenceValue.artifactPath;
    if (artifactPath !== null && typeof artifactPath !== "string") {
      errors.push(`${path}.${phase}.artifactPath must be string or null.`);
      continue;
    }
    if (!isStringArray(evidenceValue.evidence)) {
      errors.push(`${path}.${phase}.evidence must be an array of strings.`);
      continue;
    }
    normalized[phase] = {
      status: evidenceValue.status,
      artifactPath: artifactPath as string | null,
      evidence: evidenceValue.evidence,
    };
  }
  return normalized;
}

export function validateProductSlicePlan(value: unknown): ProductSlicePlanValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["Product slice plan must be an object."] };

  if (value.version !== 1) errors.push("version must be 1.");
  if (typeof value.initiativeId !== "string" || value.initiativeId.trim() === "") errors.push("initiativeId must be a non-empty string.");
  if (!["draft", "ready", "blocked"].includes(String(value.status))) errors.push("status must be draft, ready, or blocked.");

  const policyValue = value.policy;
  let policy: ProductSlicePlanPolicy | undefined;
  if (!isRecord(policyValue)) {
    errors.push("policy must be an object.");
  } else {
    if (policyValue.intraSliceParallelism !== "forbidden") errors.push("policy.intraSliceParallelism must be forbidden.");
    if (policyValue.unknownTransition !== "blocked") errors.push("policy.unknownTransition must be blocked.");
    if (!phaseOrderEqualsRequired(policyValue.requiredPhaseOrder)) {
      errors.push("policy.requiredPhaseOrder must exactly match the required product-slice phase order.");
    } else {
      policy = {
        intraSliceParallelism: "forbidden",
        unknownTransition: "blocked",
        requiredPhaseOrder: [...PRODUCT_SLICE_PHASE_ORDER],
      };
    }
  }

  const slices: ProductSlice[] = [];
  if (!Array.isArray(value.slices)) {
    errors.push("slices must be an array.");
  } else {
    value.slices.forEach((sliceValue, index) => {
      const path = `slices[${index}]`;
      if (!isRecord(sliceValue)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      if (typeof sliceValue.sliceId !== "string" || sliceValue.sliceId.trim() === "") errors.push(`${path}.sliceId must be a non-empty string.`);
      if (typeof sliceValue.title !== "string" || sliceValue.title.trim() === "") errors.push(`${path}.title must be a non-empty string.`);
      if (!["HITL", "AFK"].includes(String(sliceValue.type))) errors.push(`${path}.type must be HITL or AFK.`);
      if (!["planned", "active", "blocked", "done"].includes(String(sliceValue.status))) errors.push(`${path}.status must be planned, active, blocked, or done.`);
      if (!isPhase(sliceValue.currentPhase)) errors.push(`${path}.currentPhase is an invalid phase name.`);
      if (!phaseOrderEqualsRequired(sliceValue.phaseOrder)) errors.push(`${path}.phaseOrder must exactly match the required product-slice phase order.`);
      if (!isStringArray(sliceValue.dependencies)) errors.push(`${path}.dependencies must be an array of strings.`);
      if (sliceValue.blockedReason !== null && typeof sliceValue.blockedReason !== "string") errors.push(`${path}.blockedReason must be string or null.`);
      const phaseEvidence = validatePhaseEvidence(sliceValue.phaseEvidence, `${path}.phaseEvidence`, errors);

      if (
        typeof sliceValue.sliceId === "string"
        && typeof sliceValue.title === "string"
        && ["HITL", "AFK"].includes(String(sliceValue.type))
        && ["planned", "active", "blocked", "done"].includes(String(sliceValue.status))
        && isPhase(sliceValue.currentPhase)
        && phaseOrderEqualsRequired(sliceValue.phaseOrder)
        && isStringArray(sliceValue.dependencies)
        && (sliceValue.blockedReason === null || typeof sliceValue.blockedReason === "string")
      ) {
        slices.push({
          sliceId: sliceValue.sliceId,
          title: sliceValue.title,
          type: sliceValue.type as ProductSliceType,
          status: sliceValue.status as ProductSliceStatus,
          currentPhase: sliceValue.currentPhase,
          phaseOrder: [...PRODUCT_SLICE_PHASE_ORDER],
          phaseEvidence,
          dependencies: sliceValue.dependencies,
          blockedReason: sliceValue.blockedReason as string | null,
        });
      }
    });
  }

  if (errors.length > 0 || !policy) return { valid: false, errors };
  return {
    valid: true,
    errors: [],
    plan: {
      version: 1,
      initiativeId: value.initiativeId as string,
      status: value.status as ProductSlicePlanStatus,
      slices,
      policy,
    },
  };
}

export function parseProductSlicePlan(value: unknown): ProductSlicePlan {
  const result = validateProductSlicePlan(value);
  if (!result.valid || !result.plan) throw new Error(`Invalid product slice plan: ${result.errors.join("; ")}`);
  return result.plan;
}

export async function loadProductSlicePlan(path: string): Promise<ProductSlicePlan> {
  return parseProductSlicePlan(JSON.parse(await readFile(path, "utf8")));
}

function decision(input: {
  allowed: boolean;
  reason: ProductSliceTransitionReason;
  currentPhase: ProductSlicePhase | null;
  requestedPhase: string;
  requiredPreviousPhase?: ProductSlicePhase | null;
  blockers?: string[];
}): ProductSlicePhaseTransitionDecision {
  return {
    allowed: input.allowed,
    reason: input.reason,
    currentPhase: input.currentPhase,
    requestedPhase: input.requestedPhase,
    requiredPreviousPhase: input.requiredPreviousPhase ?? null,
    blockers: input.blockers ?? [],
  };
}

function isEvidenceComplete(evidence: ProductSlicePhaseEvidence | undefined): boolean {
  return Boolean(evidence && COMPLETE_EVIDENCE_STATUSES.has(evidence.status) && evidence.evidence.length > 0);
}

export function decideProductSlicePhaseTransition(input: ProductSlicePhaseTransitionInput): ProductSlicePhaseTransitionDecision {
  const validation = validateProductSlicePlan(input.plan);
  if (!validation.valid || !validation.plan) {
    return decision({
      allowed: false,
      reason: "blocked_invalid_plan",
      currentPhase: null,
      requestedPhase: input.requestedPhase,
      blockers: validation.errors,
    });
  }

  const slice = validation.plan.slices.find((candidate) => candidate.sliceId === input.sliceId);
  if (!slice) {
    return decision({ allowed: false, reason: "blocked_slice_not_found", currentPhase: null, requestedPhase: input.requestedPhase });
  }

  if (!isPhase(input.requestedPhase)) {
    return decision({
      allowed: false,
      reason: "blocked_unknown_phase",
      currentPhase: slice.currentPhase,
      requestedPhase: input.requestedPhase,
      blockers: [`Unknown product-slice phase: ${input.requestedPhase}`],
    });
  }

  if (input.inFlightPhase) {
    return decision({
      allowed: false,
      reason: "blocked_same_slice_parallel",
      currentPhase: slice.currentPhase,
      requestedPhase: input.requestedPhase,
      blockers: [`Same-slice phase already in flight: ${input.inFlightPhase}`],
    });
  }

  if (slice.status === "blocked" || validation.plan.status === "blocked") {
    return decision({
      allowed: false,
      reason: "blocked_slice_blocked",
      currentPhase: slice.currentPhase,
      requestedPhase: input.requestedPhase,
      blockers: [slice.blockedReason ?? "Product slice plan is blocked."],
    });
  }

  if (input.requestedPhase === slice.currentPhase) {
    return decision({ allowed: true, reason: "already_current", currentPhase: slice.currentPhase, requestedPhase: input.requestedPhase });
  }

  const currentIndex = PRODUCT_SLICE_PHASE_ORDER.indexOf(slice.currentPhase);
  const requestedIndex = PRODUCT_SLICE_PHASE_ORDER.indexOf(input.requestedPhase);
  const requiredPreviousPhase = requestedIndex > 0 ? PRODUCT_SLICE_PHASE_ORDER[requestedIndex - 1] : null;

  if (requestedIndex !== currentIndex + 1) {
    return decision({
      allowed: false,
      reason: "blocked_out_of_order",
      currentPhase: slice.currentPhase,
      requestedPhase: input.requestedPhase,
      requiredPreviousPhase,
    });
  }

  const currentEvidence = slice.phaseEvidence[slice.currentPhase];
  if (!isEvidenceComplete(currentEvidence)) {
    return decision({
      allowed: false,
      reason: "blocked_current_evidence_incomplete",
      currentPhase: slice.currentPhase,
      requestedPhase: input.requestedPhase,
      requiredPreviousPhase: slice.currentPhase,
      blockers: [`Current phase evidence is not complete: ${slice.currentPhase}`],
    });
  }

  return decision({
    allowed: true,
    reason: "allowed",
    currentPhase: slice.currentPhase,
    requestedPhase: input.requestedPhase,
    requiredPreviousPhase: slice.currentPhase,
  });
}
