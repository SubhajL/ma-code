import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BUDGET_MODES,
  ROLE_IDS,
  ROUTE_REASONS,
  PHASE_LANES,
  defaultModelId,
  loadHarnessRoutingConfig,
  resolveHarnessRoute,
  type BudgetMode,
  type HarnessRole,
  type PhaseLane,
  type PhaseModelVerificationStatus,
  type RouteReason,
} from "./harness-routing.ts";
import { assessDomainGovernance, DEFAULT_DOMAIN_GOVERNANCE_POLICY } from "./domain-governance.ts";
import {
  DOMAIN_IDS,
  TEAM_IDS,
  WORK_TYPES,
  loadTeamDefinitions,
  type DomainId,
  type TeamDefinition,
  type TeamId,
  type WorkType,
} from "./team-activation.ts";

export interface PacketPolicyDefaults {
  disallowed_paths: string[];
  discovery_summary: string[];
  cross_model_planning_note: string;
  non_goals: string[];
  files_to_inspect: string[];
  expected_proof: string[];
  migration_path_note: string;
  evidence_expectations: string[];
  escalation_instructions: string[];
}

export interface PacketPolicy {
  notes: string[];
  defaults: PacketPolicyDefaults;
  team_validation_expectations: Record<TeamId, string[]>;
  team_wiring_checks: Record<TeamId, string[]>;
}

export interface TaskPacketSource {
  goalId: string;
  parentTaskId: string | null;
  parentPacketId: string | null;
  generatedAt: string;
}

export interface DomainOwnership {
  mode: "single_domain" | "mixed_domain";
  owningDomain: DomainId;
  owningRole: HarnessRole;
  supportingDomains: DomainId[];
}

export const MIXED_DOMAIN_CHILD_LANE_KINDS = ["frontend", "backend", "bff"] as const;
export const MIXED_DOMAIN_COORDINATION_MODES = ["parent", "child"] as const;
export const MIXED_DOMAIN_CONFLICT_CHECK_STATUSES = ["not_required", "pending", "passed", "failed"] as const;
export const PACKET_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type MixedDomainChildLaneKind = (typeof MIXED_DOMAIN_CHILD_LANE_KINDS)[number];
export type MixedDomainCoordinationMode = (typeof MIXED_DOMAIN_COORDINATION_MODES)[number];
export type MixedDomainConflictCheckStatus = (typeof MIXED_DOMAIN_CONFLICT_CHECK_STATUSES)[number];
export type PacketThinkingLevel = (typeof PACKET_THINKING_LEVELS)[number];

export interface MixedDomainChildLaneSummary {
  laneId: string;
  laneKind: MixedDomainChildLaneKind;
  packetPath?: string | null;
  allowedPaths: string[];
  childJobId?: string | null;
}

export interface MixedDomainSliceCoordination {
  mode: MixedDomainCoordinationMode;
  verticalSliceId: string;
  parentSliceId: string;
  parentJobId?: string | null;
  laneId?: string | null;
  laneKind?: MixedDomainChildLaneKind | null;
  childJobIds: string[];
  childLanes: MixedDomainChildLaneSummary[];
  reunifyEvidenceIntoParent?: boolean;
  conflictCheckStatus?: MixedDomainConflictCheckStatus;
  conflictCheckSource?: string | null;
}

export interface GraphifyEvidence {
  graphifyBackedClaim?: boolean;
  claimScope?: "graphify_backed_claim" | "architecture_review" | "other";
  policy?: "optional_default" | "required_for_graphify_backed_claims" | "required_for_architecture_review" | "disabled";
  required?: boolean;
  latestRelevantGraphQueried?: boolean;
  freshnessOrCadenceChecked?: boolean;
  importantClaimsSourceVerified?: boolean;
  graphifyValidationState?: string;
  graphifyOrchestrationAction?: string;
  graphifyAdapterAction?: string;
  graphifyArtifactPath?: string;
  sourceVerificationNotes?: string[];
}

export interface TddSlice {
  firstTracerBehavior: string;
  publicInterface: string;
  testSurface: string[];
  boundaryDependencies: string[];
  mockPlan: string;
  outOfScopeBehaviors: string[];
}

export interface PacketRoutingSummary {
  reason: RouteReason;
  budgetMode: BudgetMode;
  selectedModelId: string;
  selectedProvider: string;
  selectedModel: string;
  thinking: PacketThinkingLevel;
  source: string;
  phaseLane?: PhaseLane | null;
  phaseRoutingSource?: string;
  requestedModelVerificationStatus?: PhaseModelVerificationStatus | null;
  requestedModelTarget?: string | null;
}

export interface TaskPacket {
  version: 1;
  packetId: string;
  source: TaskPacketSource;
  assignedTeam: TeamId;
  assignedRole: HarnessRole;
  title: string;
  goal: string;
  scope: string;
  nonGoals: string[];
  workType: WorkType;
  domains: DomainId[];
  domainOwnership?: DomainOwnership | null;
  sliceCoordination?: MixedDomainSliceCoordination | null;
  discoverySummary: string[];
  crossModelPlanningNote: string;
  filesToInspect: string[];
  filesToModify: string[];
  allowedPaths: string[];
  disallowedPaths: string[];
  acceptanceCriteria: string[];
  evidenceExpectations: string[];
  validationExpectations: string[];
  expectedProof: string[];
  tddSlice?: TddSlice | null;
  graphifyEvidence?: GraphifyEvidence | null;
  wiringChecks: string[];
  migrationPathNote: string;
  escalationInstructions: string[];
  dependencies: string[];
  modelOverride: string | null;
  routing: PacketRoutingSummary;
}

export interface TaskPacketInput {
  sourceGoalId: string;
  parentTaskId?: string | null;
  parentPacketId?: string | null;
  assignedTeam: TeamId;
  assignedRole: HarnessRole;
  title: string;
  goal?: string;
  scope: string;
  nonGoals?: string[];
  workType: WorkType;
  domains?: DomainId[];
  domainOwnership?: DomainOwnership | null;
  sliceCoordination?: MixedDomainSliceCoordination | null;
  filesToInspect?: string[];
  filesToModify?: string[];
  allowedPaths?: string[];
  disallowedPaths?: string[];
  discoverySummary?: string[];
  crossModelPlanningNote?: string;
  acceptanceCriteria: string[];
  evidenceExpectations?: string[];
  validationExpectations?: string[];
  expectedProof?: string[];
  tddSlice?: TddSlice | null;
  graphifyEvidence?: GraphifyEvidence | null;
  wiringChecks?: string[];
  migrationPathNote?: string;
  escalationInstructions?: string[];
  dependencies?: string[];
  routeReason?: RouteReason;
  budgetMode?: BudgetMode;
  failedModels?: string[];
  modelOverride?: string;
  phaseLane?: PhaseLane;
}

export interface GeneratedTaskPacket {
  packet: TaskPacket;
  renderedPacket: string;
  policyNotes: string[];
}

const PACKET_POLICY_PATH = ".pi/agent/packets/packet-policy.json";
const PACKET_SCHEMA_PATH = ".pi/agent/state/schemas/task-packet.schema.json";

const MixedDomainChildLaneSummarySchema = Type.Object({
  laneId: Type.String({ minLength: 1 }),
  laneKind: StringEnum(MIXED_DOMAIN_CHILD_LANE_KINDS),
  packetPath: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  allowedPaths: Type.Array(Type.String()),
  childJobId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
});

const MixedDomainSliceCoordinationSchema = Type.Object({
  mode: StringEnum(MIXED_DOMAIN_COORDINATION_MODES),
  verticalSliceId: Type.String({ minLength: 1 }),
  parentSliceId: Type.String({ minLength: 1 }),
  parentJobId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  laneId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  laneKind: Type.Optional(Type.Union([StringEnum(MIXED_DOMAIN_CHILD_LANE_KINDS), Type.Null()])),
  childJobIds: Type.Array(Type.String()),
  childLanes: Type.Array(MixedDomainChildLaneSummarySchema),
  reunifyEvidenceIntoParent: Type.Optional(Type.Boolean()),
  conflictCheckStatus: Type.Optional(StringEnum(MIXED_DOMAIN_CONFLICT_CHECK_STATUSES)),
  conflictCheckSource: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
});

const GraphifyEvidenceSchema = Type.Object({
  graphifyBackedClaim: Type.Optional(Type.Boolean()),
  claimScope: Type.Optional(StringEnum(["graphify_backed_claim", "architecture_review", "other"] as const)),
  policy: Type.Optional(StringEnum(["optional_default", "required_for_graphify_backed_claims", "required_for_architecture_review", "disabled"] as const)),
  required: Type.Optional(Type.Boolean()),
  latestRelevantGraphQueried: Type.Optional(Type.Boolean()),
  freshnessOrCadenceChecked: Type.Optional(Type.Boolean()),
  importantClaimsSourceVerified: Type.Optional(Type.Boolean()),
  graphifyValidationState: Type.Optional(Type.String()),
  graphifyOrchestrationAction: Type.Optional(Type.String()),
  graphifyAdapterAction: Type.Optional(Type.String()),
  graphifyArtifactPath: Type.Optional(Type.String()),
  sourceVerificationNotes: Type.Optional(Type.Array(Type.String())),
});

const TddSliceSchema = Type.Object({
  firstTracerBehavior: Type.String({ minLength: 1 }),
  publicInterface: Type.String({ minLength: 1 }),
  testSurface: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  boundaryDependencies: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  mockPlan: Type.String({ minLength: 1 }),
  outOfScopeBehaviors: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

const DomainOwnershipSchema = Type.Object({
  mode: StringEnum(["single_domain", "mixed_domain"] as const),
  owningDomain: StringEnum(DOMAIN_IDS),
  owningRole: StringEnum(ROLE_IDS),
  supportingDomains: Type.Array(StringEnum(DOMAIN_IDS)),
});

const GenerateTaskPacketSchema = Type.Object({
  sourceGoalId: Type.String({ minLength: 1 }),
  parentTaskId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  parentPacketId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  assignedTeam: StringEnum(TEAM_IDS),
  assignedRole: StringEnum(ROLE_IDS),
  title: Type.String({ minLength: 1 }),
  goal: Type.Optional(Type.String({ minLength: 1 })),
  scope: Type.String({ minLength: 1 }),
  nonGoals: Type.Optional(Type.Array(Type.String())),
  workType: StringEnum(WORK_TYPES),
  domains: Type.Optional(Type.Array(StringEnum(DOMAIN_IDS))),
  domainOwnership: Type.Optional(Type.Union([DomainOwnershipSchema, Type.Null()])),
  sliceCoordination: Type.Optional(Type.Union([MixedDomainSliceCoordinationSchema, Type.Null()])),
  filesToInspect: Type.Optional(Type.Array(Type.String())),
  filesToModify: Type.Optional(Type.Array(Type.String())),
  allowedPaths: Type.Optional(Type.Array(Type.String())),
  disallowedPaths: Type.Optional(Type.Array(Type.String())),
  discoverySummary: Type.Optional(Type.Array(Type.String())),
  crossModelPlanningNote: Type.Optional(Type.String()),
  acceptanceCriteria: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  evidenceExpectations: Type.Optional(Type.Array(Type.String())),
  validationExpectations: Type.Optional(Type.Array(Type.String())),
  expectedProof: Type.Optional(Type.Array(Type.String())),
  tddSlice: Type.Optional(Type.Union([TddSliceSchema, Type.Null()])),
  graphifyEvidence: Type.Optional(Type.Union([GraphifyEvidenceSchema, Type.Null()])),
  wiringChecks: Type.Optional(Type.Array(Type.String())),
  migrationPathNote: Type.Optional(Type.String()),
  escalationInstructions: Type.Optional(Type.Array(Type.String())),
  dependencies: Type.Optional(Type.Array(Type.String())),
  routeReason: Type.Optional(StringEnum(ROUTE_REASONS)),
  budgetMode: Type.Optional(StringEnum(BUDGET_MODES)),
  failedModels: Type.Optional(Type.Array(Type.String())),
  modelOverride: Type.Optional(Type.String()),
  phaseLane: Type.Optional(StringEnum(PHASE_LANES)),
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

function normalizeOwnedDomains(values: DomainId[]): DomainId[] {
  return uniqueStrings((values ?? []) as string[]).filter((value): value is DomainId => DOMAIN_IDS.includes(value as DomainId));
}

function normalizeDomainOwnership(
  ownership: DomainOwnership | null | undefined,
  domains: DomainId[],
  assignedRole: HarnessRole,
): DomainOwnership | null {
  if (!ownership) return null;
  const owningDomain = DOMAIN_IDS.includes(ownership.owningDomain as DomainId) ? ownership.owningDomain : domains[0] ?? "backend";
  const supportingDomains = normalizeOwnedDomains(ownership.supportingDomains ?? []).filter((domain) => domain !== owningDomain);
  const coveredDomains = normalizeOwnedDomains([owningDomain, ...supportingDomains, ...domains]);
  return {
    mode: coveredDomains.length > 1 ? "mixed_domain" : "single_domain",
    owningDomain,
    owningRole: assignedRole,
    supportingDomains,
  };
}

function normalizeMixedDomainChildLaneSummary(raw: MixedDomainChildLaneSummary, index: number): MixedDomainChildLaneSummary {
  if (!isRecord(raw)) {
    throw new Error(`sliceCoordination.childLanes[${index}] must be an object.`);
  }
  const laneKind = raw.laneKind === undefined || raw.laneKind === null
    ? null
    : parseEnumString(raw.laneKind, MIXED_DOMAIN_CHILD_LANE_KINDS, `sliceCoordination.childLanes[${index}].laneKind`);
  if (!laneKind) {
    throw new Error(`sliceCoordination.childLanes[${index}].laneKind is required.`);
  }
  return {
    laneId: parseString(raw.laneId, `sliceCoordination.childLanes[${index}].laneId`),
    laneKind,
    packetPath: raw.packetPath === undefined || raw.packetPath === null ? null : parseString(raw.packetPath, `sliceCoordination.childLanes[${index}].packetPath`),
    allowedPaths: uniqueStrings(parseStringArray(raw.allowedPaths)),
    childJobId: raw.childJobId === undefined || raw.childJobId === null ? null : parseString(raw.childJobId, `sliceCoordination.childLanes[${index}].childJobId`),
  };
}

export function normalizeMixedDomainSliceCoordination(raw: MixedDomainSliceCoordination | null | undefined): MixedDomainSliceCoordination | null {
  if (!raw || !isRecord(raw)) return null;
  const mode = parseEnumString(raw.mode, MIXED_DOMAIN_COORDINATION_MODES, "sliceCoordination.mode");
  const coordination: MixedDomainSliceCoordination = {
    mode,
    verticalSliceId: parseString(raw.verticalSliceId, "sliceCoordination.verticalSliceId"),
    parentSliceId: parseString(raw.parentSliceId, "sliceCoordination.parentSliceId"),
    parentJobId: raw.parentJobId === undefined || raw.parentJobId === null ? null : parseString(raw.parentJobId, "sliceCoordination.parentJobId"),
    laneId: raw.laneId === undefined || raw.laneId === null ? null : parseString(raw.laneId, "sliceCoordination.laneId"),
    laneKind: raw.laneKind === undefined || raw.laneKind === null ? null : parseEnumString(raw.laneKind, MIXED_DOMAIN_CHILD_LANE_KINDS, "sliceCoordination.laneKind"),
    childJobIds: uniqueStrings(parseStringArray(raw.childJobIds)),
    childLanes: Array.isArray(raw.childLanes) ? raw.childLanes.map((lane, index) => normalizeMixedDomainChildLaneSummary(lane as MixedDomainChildLaneSummary, index)) : [],
    reunifyEvidenceIntoParent: raw.reunifyEvidenceIntoParent === true,
    conflictCheckStatus: raw.conflictCheckStatus === undefined || raw.conflictCheckStatus === null
      ? undefined
      : parseEnumString(raw.conflictCheckStatus, MIXED_DOMAIN_CONFLICT_CHECK_STATUSES, "sliceCoordination.conflictCheckStatus"),
    conflictCheckSource: raw.conflictCheckSource === undefined || raw.conflictCheckSource === null ? null : parseString(raw.conflictCheckSource, "sliceCoordination.conflictCheckSource"),
  };

  if (coordination.mode === "child") {
    if (!coordination.laneId) throw new Error("sliceCoordination.laneId is required for child coordination.");
    if (!coordination.laneKind) throw new Error("sliceCoordination.laneKind is required for child coordination.");
  }

  if (coordination.mode === "parent" && coordination.reunifyEvidenceIntoParent && coordination.childJobIds.length === 0) {
    throw new Error("sliceCoordination.childJobIds must not be empty when parent coordination reunifies child evidence.");
  }

  return coordination;
}

function normalizeGraphifyEvidence(raw: GraphifyEvidence | null | undefined): GraphifyEvidence | null {
  if (!raw || !isRecord(raw)) return null;
  const evidence: GraphifyEvidence = {};
  if (typeof raw.graphifyBackedClaim === "boolean") evidence.graphifyBackedClaim = raw.graphifyBackedClaim;
  if (["graphify_backed_claim", "architecture_review", "other"].includes(String(raw.claimScope))) evidence.claimScope = raw.claimScope as GraphifyEvidence["claimScope"];
  if (["optional_default", "required_for_graphify_backed_claims", "required_for_architecture_review", "disabled"].includes(String(raw.policy))) evidence.policy = raw.policy as GraphifyEvidence["policy"];
  if (typeof raw.required === "boolean") evidence.required = raw.required;
  if (typeof raw.latestRelevantGraphQueried === "boolean") evidence.latestRelevantGraphQueried = raw.latestRelevantGraphQueried;
  if (typeof raw.freshnessOrCadenceChecked === "boolean") evidence.freshnessOrCadenceChecked = raw.freshnessOrCadenceChecked;
  if (typeof raw.importantClaimsSourceVerified === "boolean") evidence.importantClaimsSourceVerified = raw.importantClaimsSourceVerified;
  if (typeof raw.graphifyValidationState === "string" && raw.graphifyValidationState.trim()) evidence.graphifyValidationState = raw.graphifyValidationState.trim();
  if (typeof raw.graphifyOrchestrationAction === "string" && raw.graphifyOrchestrationAction.trim()) evidence.graphifyOrchestrationAction = raw.graphifyOrchestrationAction.trim();
  if (typeof raw.graphifyAdapterAction === "string" && raw.graphifyAdapterAction.trim()) evidence.graphifyAdapterAction = raw.graphifyAdapterAction.trim();
  if (typeof raw.graphifyArtifactPath === "string" && raw.graphifyArtifactPath.trim()) evidence.graphifyArtifactPath = raw.graphifyArtifactPath.trim();
  evidence.sourceVerificationNotes = uniqueStrings(parseStringArray(raw.sourceVerificationNotes));
  if (evidence.sourceVerificationNotes.length === 0) delete evidence.sourceVerificationNotes;
  return Object.keys(evidence).length > 0 ? evidence : null;
}

function normalizeTddSlice(raw: TddSlice | null | undefined): TddSlice | null {
  if (!raw || !isRecord(raw)) return null;
  return {
    firstTracerBehavior: parseString(raw.firstTracerBehavior, "tddSlice.firstTracerBehavior"),
    publicInterface: parseString(raw.publicInterface, "tddSlice.publicInterface"),
    testSurface: parseRequiredStringArray(raw.testSurface, "tddSlice.testSurface"),
    boundaryDependencies: parseRequiredStringArray(raw.boundaryDependencies, "tddSlice.boundaryDependencies"),
    mockPlan: parseString(raw.mockPlan, "tddSlice.mockPlan"),
    outOfScopeBehaviors: parseRequiredStringArray(raw.outOfScopeBehaviors, "tddSlice.outOfScopeBehaviors"),
  };
}

function normalizePacketThinkingLevel(raw: string): PacketThinkingLevel {
  if (PACKET_THINKING_LEVELS.includes(raw as PacketThinkingLevel)) return raw as PacketThinkingLevel;
  throw new Error(`Invalid routing thinking level: ${raw}`);
}

function parseString(raw: unknown, fieldName: string): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return raw.trim();
}

function parseRequiredStringArray(raw: unknown, fieldName: string): string[] {
  const values = uniqueStrings(parseStringArray(raw));
  if (values.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string array.`);
  }
  return values;
}

function parseEnumString<T extends string>(raw: unknown, allowed: readonly T[], fieldName: string): T {
  const value = parseString(raw, fieldName);
  if (!allowed.includes(value as T)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function parseEnumStringArray<T extends string>(raw: unknown, allowed: readonly T[], fieldName: string): T[] {
  const values = uniqueStrings(parseStringArray(raw)).filter((value): value is T => allowed.includes(value as T));
  return values;
}

function sanitizeSlugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function generatePacketId(input: {
  assignedRole: HarnessRole;
  sourceGoalId: string;
  title: string;
  parentTaskId?: string | null;
}): string {
  const rolePart = sanitizeSlugPart(input.assignedRole);
  const goalPart = sanitizeSlugPart(input.sourceGoalId);
  const parentTaskPart = input.parentTaskId ? sanitizeSlugPart(input.parentTaskId) : "none";
  const titlePart = sanitizeSlugPart(input.title) || "task";
  return `packet-${rolePart}-${goalPart}-${parentTaskPart}-${titlePart}`;
}

export function parsePacketPolicy(raw: unknown): PacketPolicy {
  if (!isRecord(raw)) {
    throw new Error("Packet policy must be an object.");
  }
  const defaultsRaw = raw.defaults;
  const validationRaw = raw.team_validation_expectations;
  const wiringRaw = raw.team_wiring_checks;
  if (!isRecord(defaultsRaw) || !isRecord(validationRaw) || !isRecord(wiringRaw)) {
    throw new Error("Packet policy is missing required sections.");
  }

  const defaults: PacketPolicyDefaults = {
    disallowed_paths: uniqueStrings(parseStringArray(defaultsRaw.disallowed_paths)),
    discovery_summary: uniqueStrings(parseStringArray(defaultsRaw.discovery_summary)),
    cross_model_planning_note: parseString(defaultsRaw.cross_model_planning_note, "defaults.cross_model_planning_note"),
    non_goals: uniqueStrings(parseStringArray(defaultsRaw.non_goals)),
    files_to_inspect: uniqueStrings(parseStringArray(defaultsRaw.files_to_inspect)),
    expected_proof: uniqueStrings(parseStringArray(defaultsRaw.expected_proof)),
    migration_path_note: parseString(defaultsRaw.migration_path_note, "defaults.migration_path_note"),
    evidence_expectations: uniqueStrings(parseStringArray(defaultsRaw.evidence_expectations)),
    escalation_instructions: uniqueStrings(parseStringArray(defaultsRaw.escalation_instructions)),
  };

  if (
    defaults.disallowed_paths.length === 0 ||
    defaults.discovery_summary.length === 0 ||
    defaults.non_goals.length === 0 ||
    defaults.files_to_inspect.length === 0 ||
    defaults.expected_proof.length === 0 ||
    defaults.evidence_expectations.length === 0 ||
    defaults.escalation_instructions.length === 0
  ) {
    throw new Error("Packet policy defaults must not be empty.");
  }

  const team_validation_expectations = {} as Record<TeamId, string[]>;
  const team_wiring_checks = {} as Record<TeamId, string[]>;
  for (const team of TEAM_IDS) {
    team_validation_expectations[team] = uniqueStrings(parseStringArray(validationRaw[team]));
    team_wiring_checks[team] = uniqueStrings(parseStringArray(wiringRaw[team]));
    if (team_validation_expectations[team].length === 0) {
      throw new Error(`Packet policy team_validation_expectations.${team} must not be empty.`);
    }
  }

  return {
    notes: uniqueStrings(parseStringArray(raw.notes)),
    defaults,
    team_validation_expectations,
    team_wiring_checks,
  };
}

export async function loadPacketPolicy(cwd: string): Promise<PacketPolicy> {
  const raw = await readFile(resolve(cwd, PACKET_POLICY_PATH), "utf8");
  return parsePacketPolicy(JSON.parse(raw));
}

export async function loadTaskPacketSchema(cwd: string): Promise<unknown> {
  const raw = await readFile(resolve(cwd, PACKET_SCHEMA_PATH), "utf8");
  return JSON.parse(raw);
}

function teamContainsRole(team: TeamDefinition, role: HarnessRole): boolean {
  return team.lead === role || team.workers.includes(role);
}

export function validateTaskPacketShape(packet: TaskPacket): void {
  if (packet.version !== 1) throw new Error("Task packet version must be 1.");
  if (!packet.packetId.trim()) throw new Error("packetId is required.");
  if (!packet.source.goalId.trim()) throw new Error("source.goalId is required.");
  if (!packet.title.trim()) throw new Error("title is required.");
  if (!packet.goal.trim()) throw new Error("goal is required.");
  if (!packet.scope.trim()) throw new Error("scope is required.");
  if (packet.allowedPaths.length === 0 && packet.domains.length === 0) {
    throw new Error("Packet must include at least one allowed path or domain.");
  }
  if (packet.nonGoals.length === 0) throw new Error("nonGoals must not be empty.");
  if (packet.sliceCoordination) {
    if (!packet.sliceCoordination.verticalSliceId.trim()) throw new Error("sliceCoordination.verticalSliceId must not be empty.");
    if (!packet.sliceCoordination.parentSliceId.trim()) throw new Error("sliceCoordination.parentSliceId must not be empty.");
    if (packet.sliceCoordination.mode === "child") {
      if (!packet.sliceCoordination.laneId?.trim()) throw new Error("sliceCoordination.laneId must not be empty for child coordination.");
      if (!packet.sliceCoordination.laneKind) throw new Error("sliceCoordination.laneKind must be set for child coordination.");
    }
  }
  if (packet.discoverySummary.length === 0) throw new Error("discoverySummary must not be empty.");
  if (packet.filesToInspect.length === 0) throw new Error("filesToInspect must not be empty.");
  if (packet.acceptanceCriteria.length === 0) throw new Error("acceptanceCriteria must not be empty.");
  if (packet.evidenceExpectations.length === 0) throw new Error("evidenceExpectations must not be empty.");
  if (packet.validationExpectations.length === 0) throw new Error("validationExpectations must not be empty.");
  if (packet.expectedProof.length === 0) throw new Error("expectedProof must not be empty.");
  if (packet.workType === "implementation" && !packet.tddSlice) {
    throw new Error("Implementation packets require tddSlice.");
  }
  if (packet.tddSlice) {
    if (!packet.tddSlice.firstTracerBehavior.trim()) throw new Error("tddSlice.firstTracerBehavior must not be empty.");
    if (!packet.tddSlice.publicInterface.trim()) throw new Error("tddSlice.publicInterface must not be empty.");
    if (packet.tddSlice.testSurface.length === 0) throw new Error("tddSlice.testSurface must not be empty.");
    if (packet.tddSlice.boundaryDependencies.length === 0) throw new Error("tddSlice.boundaryDependencies must not be empty.");
    if (!packet.tddSlice.mockPlan.trim()) throw new Error("tddSlice.mockPlan must not be empty.");
    if (packet.tddSlice.outOfScopeBehaviors.length === 0) throw new Error("tddSlice.outOfScopeBehaviors must not be empty.");
  }
  if (packet.escalationInstructions.length === 0) throw new Error("escalationInstructions must not be empty.");
  if (packet.disallowedPaths.length === 0) throw new Error("disallowedPaths must not be empty.");
  if (!packet.migrationPathNote.trim()) throw new Error("migrationPathNote is required.");
  if (packet.assignedTeam === "build" && packet.workType !== "review_only" && packet.workType !== "research_only" && packet.filesToModify.length === 0) {
    throw new Error("filesToModify must not be empty for build packets that are expected to make changes.");
  }
  if (!packet.routing.selectedModelId.trim()) throw new Error("routing.selectedModelId is required.");
  if (!packet.routing.thinking.trim()) throw new Error("routing.thinking is required.");
}

function renderList(lines: string[]): string {
  if (lines.length === 0) return "- none";
  return lines.map((line) => `- ${line}`).join("\n");
}

export function renderGraphifyEvidence(evidence: GraphifyEvidence | null | undefined): string {
  if (!evidence) return "- none";
  const lines: string[] = [];
  if (typeof evidence.graphifyBackedClaim === "boolean") lines.push(`graphify backed claim: ${evidence.graphifyBackedClaim}`);
  if (evidence.claimScope) lines.push(`claim scope: ${evidence.claimScope}`);
  if (evidence.policy) lines.push(`policy: ${evidence.policy}`);
  if (typeof evidence.required === "boolean") lines.push(`required: ${evidence.required}`);
  if (typeof evidence.latestRelevantGraphQueried === "boolean") lines.push(`latest relevant graph queried: ${evidence.latestRelevantGraphQueried}`);
  if (typeof evidence.freshnessOrCadenceChecked === "boolean") lines.push(`freshness or cadence checked: ${evidence.freshnessOrCadenceChecked}`);
  if (typeof evidence.importantClaimsSourceVerified === "boolean") lines.push(`important claims source verified: ${evidence.importantClaimsSourceVerified}`);
  if (evidence.graphifyValidationState) lines.push(`graphify validation state: ${evidence.graphifyValidationState}`);
  if (evidence.graphifyOrchestrationAction) lines.push(`graphify orchestration action: ${evidence.graphifyOrchestrationAction}`);
  if (evidence.graphifyAdapterAction) lines.push(`graphify adapter action: ${evidence.graphifyAdapterAction}`);
  if (evidence.graphifyArtifactPath) lines.push(`graphify artifact path: ${evidence.graphifyArtifactPath}`);
  for (const note of evidence.sourceVerificationNotes ?? []) lines.push(`source verification note: ${note}`);
  return renderList(lines);
}

export function renderMixedDomainSliceCoordination(coordination: MixedDomainSliceCoordination | null | undefined): string {
  if (!coordination) return "- none";
  const lines: string[] = [
    `mode: ${coordination.mode}`,
    `vertical slice: ${coordination.verticalSliceId}`,
    `parent slice: ${coordination.parentSliceId}`,
    `parent job: ${coordination.parentJobId ?? "none"}`,
    `lane: ${coordination.laneId ?? "none"}`,
    `lane kind: ${coordination.laneKind ?? "none"}`,
    `reunify evidence into parent: ${coordination.reunifyEvidenceIntoParent === true}`,
    `conflict check: ${coordination.conflictCheckStatus ?? "none"}`,
    `conflict check source: ${coordination.conflictCheckSource ?? "none"}`,
  ];
  for (const jobId of coordination.childJobIds) lines.push(`child job: ${jobId}`);
  for (const lane of coordination.childLanes) lines.push(`child lane: ${lane.laneId} (${lane.laneKind})${lane.packetPath ? ` packet=${lane.packetPath}` : ""}`);
  return renderList(lines);
}

export function renderTddSlice(tddSlice: TddSlice | null | undefined): string {
  if (!tddSlice) return "- none";
  const lines: string[] = [
    `first tracer behavior: ${tddSlice.firstTracerBehavior}`,
    `public interface: ${tddSlice.publicInterface}`,
    `mock plan: ${tddSlice.mockPlan}`,
  ];
  for (const surface of tddSlice.testSurface) lines.push(`test surface: ${surface}`);
  for (const dependency of tddSlice.boundaryDependencies) lines.push(`boundary dependency: ${dependency}`);
  for (const behavior of tddSlice.outOfScopeBehaviors) lines.push(`out-of-scope behavior: ${behavior}`);
  return renderList(lines);
}

export function renderTaskPacket(packet: TaskPacket): string {
  return [
    "## Packet ID",
    `- ${packet.packetId}`,
    "",
    "## Source",
    `- goal: ${packet.source.goalId}`,
    `- parent task: ${packet.source.parentTaskId ?? "none"}`,
    `- parent packet: ${packet.source.parentPacketId ?? "none"}`,
    `- generated at: ${packet.source.generatedAt}`,
    "",
    "## Assigned Team",
    `- ${packet.assignedTeam}`,
    "",
    "## Assigned Role",
    `- ${packet.assignedRole}`,
    packet.domainOwnership
      ? [`- ownership: ${packet.domainOwnership.mode}`, `- owning domain: ${packet.domainOwnership.owningDomain}`, `- supporting domains: ${packet.domainOwnership.supportingDomains.length > 0 ? packet.domainOwnership.supportingDomains.join(", ") : "none"}`].join("\n")
      : "- ownership: none",
    "",
    "## Task",
    `- ${packet.title}`,
    "",
    "## Goal",
    `- ${packet.goal}`,
    "",
    "## Scope",
    `- ${packet.scope}`,
    "",
    "## Non-Goals",
    renderList(packet.nonGoals),
    "",
    "## Work Type",
    `- ${packet.workType}`,
    "",
    "## Slice Coordination",
    renderMixedDomainSliceCoordination(packet.sliceCoordination),
    "",
    "## Domains",
    renderList(packet.domains),
    "",
    "## Discovery Summary",
    renderList(packet.discoverySummary),
    "",
    "## Cross-Model Planning",
    `- ${packet.crossModelPlanningNote}`,
    "",
    "## Files to Inspect",
    renderList(packet.filesToInspect),
    "",
    "## Files to Modify",
    renderList(packet.filesToModify),
    "",
    "## Allowed Paths",
    renderList(packet.allowedPaths),
    "",
    "## Disallowed Paths",
    renderList(packet.disallowedPaths),
    "",
    "## Acceptance Criteria",
    renderList(packet.acceptanceCriteria),
    "",
    "## Evidence Expectations",
    renderList(packet.evidenceExpectations),
    "",
    "## Validation Expectations",
    renderList(packet.validationExpectations),
    "",
    "## Expected Proof",
    renderList(packet.expectedProof),
    "",
    "## TDD Slice",
    renderTddSlice(packet.tddSlice),
    "",
    "## Graphify Evidence",
    renderGraphifyEvidence(packet.graphifyEvidence),
    "",
    "## Wiring Checks",
    renderList(packet.wiringChecks),
    "",
    "## Migration Path Note",
    `- ${packet.migrationPathNote}`,
    "",
    "## Escalation Instructions",
    renderList(packet.escalationInstructions),
    "",
    "## Dependencies",
    renderList(packet.dependencies),
    "",
    "## Model Override",
    `- ${packet.modelOverride ?? "none"}`,
    "",
    "## Routing Summary",
    `- reason: ${packet.routing.reason}`,
    `- budget mode: ${packet.routing.budgetMode}`,
    `- selected model: ${packet.routing.selectedModelId}`,
    `- thinking: ${packet.routing.thinking}`,
    `- route source: ${packet.routing.source}`,
    `- phase lane: ${packet.routing.phaseLane ?? "none"}`,
    `- phase routing source: ${packet.routing.phaseRoutingSource ?? "none"}`,
    `- requested model verification: ${packet.routing.requestedModelVerificationStatus ?? "none"}`,
    `- requested model target: ${packet.routing.requestedModelTarget ?? "none"}`,
  ].join("\n");
}

export function generateTaskPacket(
  policy: PacketPolicy,
  teams: Record<TeamId, TeamDefinition>,
  routingConfig: Awaited<ReturnType<typeof loadHarnessRoutingConfig>>,
  input: TaskPacketInput,
  generatedAt = new Date().toISOString(),
): GeneratedTaskPacket {
  const team = teams[input.assignedTeam];
  if (!team) {
    throw new Error(`Unknown team: ${input.assignedTeam}`);
  }
  if (!teamContainsRole(team, input.assignedRole)) {
    throw new Error(`Assigned role ${input.assignedRole} does not belong to team ${input.assignedTeam}.`);
  }

  const allowedPaths = uniqueStrings(input.allowedPaths ?? []);
  const domains = uniqueStrings((input.domains ?? []) as string[]).filter((value): value is DomainId =>
    DOMAIN_IDS.includes(value as DomainId),
  );
  if (allowedPaths.length === 0 && domains.length === 0) {
    throw new Error("Task packet generation requires at least one allowed path or domain.");
  }

  const acceptanceCriteria = uniqueStrings(input.acceptanceCriteria);
  if (acceptanceCriteria.length === 0) {
    throw new Error("Task packet generation requires at least one acceptance criterion.");
  }

  const evidenceExpectations = uniqueStrings(input.evidenceExpectations ?? policy.defaults.evidence_expectations);
  const validationExpectations = uniqueStrings(input.validationExpectations ?? policy.team_validation_expectations[input.assignedTeam]);
  const domainInspectFallback = domains.map((domain) => `[inspect within ${domain}] confirm the concrete files before mutation`);
  const defaultFilesToInspect = allowedPaths.length > 0 ? allowedPaths : (domainInspectFallback.length > 0 ? domainInspectFallback : policy.defaults.files_to_inspect);
  const filesToInspect = uniqueStrings(input.filesToInspect ?? defaultFilesToInspect);
  const domainModifyFallback = domains.map((domain) => `[modify within ${domain}] confirm the concrete files before mutation`);
  const defaultFilesToModify = input.assignedTeam === "build" && input.workType !== "review_only" && input.workType !== "research_only"
    ? (allowedPaths.length > 0 ? allowedPaths : domainModifyFallback)
    : [];
  const filesToModify = uniqueStrings(input.filesToModify ?? defaultFilesToModify);
  const expectedProof = uniqueStrings(input.expectedProof ?? [...validationExpectations, ...evidenceExpectations, ...policy.defaults.expected_proof]);

  const domainGovernance = assessDomainGovernance(DEFAULT_DOMAIN_GOVERNANCE_POLICY, {
    domains,
    assignedRole: input.assignedRole,
    workType: input.workType,
    allowedPaths,
    filesToModify,
    escalationInstructions: input.escalationInstructions,
    migrationPathNote: input.migrationPathNote,
    mixedDomainJustification: input.crossModelPlanningNote,
  });
  if (!domainGovernance.pass) {
    throw new Error(`Domain governance failed: ${domainGovernance.blockReasons.join("; ")}`);
  }

  const route = resolveHarnessRoute(routingConfig, {
    role: input.assignedRole,
    reason: input.routeReason ?? "default",
    budgetMode: input.budgetMode ?? "default",
    failedModels: input.failedModels,
    modelOverride: input.modelOverride,
    phaseLane: input.phaseLane,
  });
  const defaultRoute = defaultModelId(routingConfig.routing_defaults[input.assignedRole]);
  const modelOverride = route.selectedModelId !== defaultRoute ? route.selectedModelId : null;

  const packet: TaskPacket = {
    version: 1,
    packetId: generatePacketId({
      assignedRole: input.assignedRole,
      sourceGoalId: input.sourceGoalId,
      title: input.title,
      parentTaskId: input.parentTaskId,
    }),
    source: {
      goalId: input.sourceGoalId.trim(),
      parentTaskId: input.parentTaskId ?? null,
      parentPacketId: input.parentPacketId ?? null,
      generatedAt,
    },
    assignedTeam: input.assignedTeam,
    assignedRole: input.assignedRole,
    title: input.title.trim(),
    goal: (input.goal ?? input.title).trim(),
    scope: input.scope.trim(),
    nonGoals: uniqueStrings(input.nonGoals ?? policy.defaults.non_goals),
    workType: input.workType,
    domains,
    domainOwnership: normalizeDomainOwnership(input.domainOwnership, domains, input.assignedRole),
    sliceCoordination: normalizeMixedDomainSliceCoordination(input.sliceCoordination),
    discoverySummary: uniqueStrings(input.discoverySummary ?? policy.defaults.discovery_summary),
    crossModelPlanningNote: (input.crossModelPlanningNote ?? policy.defaults.cross_model_planning_note).trim(),
    filesToInspect,
    filesToModify,
    allowedPaths,
    disallowedPaths: uniqueStrings([...policy.defaults.disallowed_paths, ...(input.disallowedPaths ?? [])]),
    acceptanceCriteria,
    evidenceExpectations,
    validationExpectations,
    expectedProof,
    tddSlice: normalizeTddSlice(input.tddSlice),
    graphifyEvidence: normalizeGraphifyEvidence(input.graphifyEvidence),
    wiringChecks: uniqueStrings(input.wiringChecks ?? policy.team_wiring_checks[input.assignedTeam]),
    migrationPathNote: (input.migrationPathNote ?? policy.defaults.migration_path_note).trim(),
    escalationInstructions: uniqueStrings(input.escalationInstructions ?? policy.defaults.escalation_instructions),
    dependencies: uniqueStrings(input.dependencies ?? []),
    modelOverride,
    routing: {
      reason: route.reason,
      budgetMode: route.budgetMode,
      selectedModelId: route.selectedModelId,
      selectedProvider: route.selectedProvider,
      selectedModel: route.selectedModel,
      thinking: normalizePacketThinkingLevel(route.thinking),
      source: route.source,
      phaseLane: route.phaseLane,
      phaseRoutingSource: route.phaseRoutingSource,
      requestedModelVerificationStatus: route.requestedModelVerificationStatus,
      requestedModelTarget: route.requestedModelTarget,
    },
  };

  validateTaskPacketShape(packet);

  return {
    packet,
    renderedPacket: renderTaskPacket(packet),
    policyNotes: [...policy.notes, ...domainGovernance.warnings, ...route.policyNotes, ...route.blockedAdjustments],
  };
}

export default function taskPackets(pi: ExtensionAPI) {
  pi.registerTool({
    name: "generate_task_packet",
    label: "Generate Task Packet",
    description: "Generate deterministic worker-scoped task packets for the repo-local harness.",
    promptSnippet: "Use deterministic task-packet generation instead of improvising worker packets.",
    promptGuidelines: [
      "Use this tool when an orchestrator or lead needs a stable, executable packet for a worker or lead role.",
      "Prefer this tool before writing free-form task packets by hand.",
      "Keep planning completeness explicit: goal, non-goals, files to inspect vs modify, expected proof, wiring checks, migration-path note when relevant, and concrete escalation instructions.",
    ],
    parameters: GenerateTaskPacketSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const [policy, teams, routingConfig] = await Promise.all([
          loadPacketPolicy(ctx.cwd),
          loadTeamDefinitions(ctx.cwd),
          loadHarnessRoutingConfig(ctx.cwd),
        ]);
        const result = generateTaskPacket(policy, teams, routingConfig, params);
        return {
          content: [{ type: "text", text: result.renderedPacket }],
          details: { ok: true, ...result },
        };
      } catch (error) {
        const message = `Task packet generation failed: ${String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: { ok: false, error: String(error) },
        };
      }
    },
  });
}
