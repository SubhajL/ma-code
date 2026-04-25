import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ROLE_IDS,
  type HarnessRole,
} from "./harness-routing.ts";
import {
  TaskPacket,
  validateTaskPacketShape,
} from "./task-packets.ts";

export const HANDOFF_TYPES = [
  "build_to_worker",
  "worker_to_quality",
  "quality_to_reviewer",
  "quality_to_validator",
  "recovery_to_orchestrator_or_lead",
] as const;

export const RECOVERY_ACTIONS = [
  "retry_same_lane",
  "retry_stronger_model",
  "switch_provider",
  "rollback",
  "stop",
  "escalate",
] as const;

const BUILD_WORKER_ROLES = ["frontend_worker", "backend_worker", "infra_worker"] as const;
const QUALITY_SOURCE_WORKER_ROLES = [
  "research_worker",
  "frontend_worker",
  "backend_worker",
  "infra_worker",
  "docs_worker",
] as const;
const RECOVERY_TARGET_ROLES = ["orchestrator", "planning_lead", "build_lead", "quality_lead"] as const;

export type HandoffType = (typeof HANDOFF_TYPES)[number];
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

export interface HandoffDefaults {
  preserve_packet_scope: boolean;
  preserve_evidence_expectations: boolean;
  preserve_escalation_instructions: boolean;
  default_none_token: string;
}

export interface HandoffRule {
  from_roles: HarnessRole[];
  to_roles: HarnessRole[];
  required_headers: string[];
  required_detail_fields: string[];
  required_packet_fields: string[];
}

export interface HandoffPolicy {
  notes: string[];
  defaults: HandoffDefaults;
  handoff_rules: Record<HandoffType, HandoffRule>;
}

export interface PreservedPacketSummary {
  packetId: string;
  title: string;
  goal: string;
  scope: string;
  nonGoals: string[];
  domains: string[];
  discoverySummary: string[];
  filesToInspect: string[];
  filesToModify: string[];
  allowedPaths: string[];
  disallowedPaths: string[];
  acceptanceCriteria: string[];
  evidenceExpectations: string[];
  validationExpectations: string[];
  expectedProof: string[];
  wiringChecks: string[];
  migrationPathNote: string;
  escalationInstructions: string[];
  modelOverride: string | null;
}

export interface HandoffDetails {
  changedFiles: string[];
  unchangedInspected: string[];
  acceptanceCoverage: string[];
  evidence: string[];
  commandsRun: string[];
  wiringVerification: string[];
  knownGaps: string[];
  blockers: string[];
  reviewScope: string[];
  claimedCompletionStatus: string | null;
  filesToInspect: string[];
  risksToChallenge: string[];
  questionsForReviewer: string[];
  validationScope: string[];
  expectedProof: string[];
  openQuestions: string[];
  validationQuestions: string[];
  failureType: string | null;
  likelyCauses: string[];
  recoveryOptions: string[];
  recommendedAction: RecoveryAction | null;
  migrationPathNote: string | null;
  stopThreshold: string | null;
}

export interface StructuredHandoff {
  version: 1;
  handoffId: string;
  handoffType: HandoffType;
  sourcePacketId: string;
  sourceGoalId: string;
  fromRole: HarnessRole;
  toRole: HarnessRole;
  requiredHeaders: string[];
  preservedPacket: PreservedPacketSummary;
  details: HandoffDetails;
}

export interface GenerateHandoffInput {
  handoffType: HandoffType;
  sourcePacket: TaskPacket;
  fromRole: HarnessRole;
  toRole: HarnessRole;
  changedFiles?: string[];
  unchangedInspected?: string[];
  acceptanceCoverage?: string[];
  evidence?: string[];
  commandsRun?: string[];
  wiringVerification?: string[];
  knownGaps?: string[];
  blockers?: string[];
  reviewScope?: string[];
  claimedCompletionStatus?: string;
  filesToInspect?: string[];
  risksToChallenge?: string[];
  questionsForReviewer?: string[];
  validationScope?: string[];
  expectedProof?: string[];
  openQuestions?: string[];
  validationQuestions?: string[];
  failureType?: string;
  likelyCauses?: string[];
  recoveryOptions?: string[];
  recommendedAction?: RecoveryAction;
  migrationPathNote?: string;
  stopThreshold?: string;
}

export interface GeneratedHandoff {
  handoff: StructuredHandoff;
  renderedHandoff: string;
  policyNotes: string[];
}

interface HandoffToolDetails {
  ok: boolean;
  handoff: StructuredHandoff | null;
  renderedHandoff: string;
  policyNotes: string[];
  error: string | null;
}

const POLICY_PATH = ".pi/agent/handoffs/handoff-policy.json";
const HandoffInputSchema = Type.Object({
  handoffType: StringEnum(HANDOFF_TYPES),
  sourcePacket: Type.Any(),
  fromRole: StringEnum(ROLE_IDS),
  toRole: StringEnum(ROLE_IDS),
  changedFiles: Type.Optional(Type.Array(Type.String())),
  unchangedInspected: Type.Optional(Type.Array(Type.String())),
  acceptanceCoverage: Type.Optional(Type.Array(Type.String())),
  evidence: Type.Optional(Type.Array(Type.String())),
  commandsRun: Type.Optional(Type.Array(Type.String())),
  wiringVerification: Type.Optional(Type.Array(Type.String())),
  knownGaps: Type.Optional(Type.Array(Type.String())),
  blockers: Type.Optional(Type.Array(Type.String())),
  reviewScope: Type.Optional(Type.Array(Type.String())),
  claimedCompletionStatus: Type.Optional(Type.String()),
  filesToInspect: Type.Optional(Type.Array(Type.String())),
  risksToChallenge: Type.Optional(Type.Array(Type.String())),
  questionsForReviewer: Type.Optional(Type.Array(Type.String())),
  validationScope: Type.Optional(Type.Array(Type.String())),
  expectedProof: Type.Optional(Type.Array(Type.String())),
  openQuestions: Type.Optional(Type.Array(Type.String())),
  validationQuestions: Type.Optional(Type.Array(Type.String())),
  failureType: Type.Optional(Type.String()),
  likelyCauses: Type.Optional(Type.Array(Type.String())),
  recoveryOptions: Type.Optional(Type.Array(Type.String())),
  recommendedAction: Type.Optional(StringEnum(RECOVERY_ACTIONS)),
  migrationPathNote: Type.Optional(Type.String()),
  stopThreshold: Type.Optional(Type.String()),
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

function parseRoleArray(raw: unknown, fieldName: string): HarnessRole[] {
  const values = uniqueStrings(parseStringArray(raw)).filter((value): value is HarnessRole =>
    ROLE_IDS.includes(value as HarnessRole),
  );
  if (values.length === 0) {
    throw new Error(`${fieldName} must contain at least one valid role.`);
  }
  return values;
}

export function parseHandoffPolicy(raw: unknown): HandoffPolicy {
  if (!isRecord(raw)) {
    throw new Error("Handoff policy must be an object.");
  }
  const defaultsRaw = raw.defaults;
  const rulesRaw = raw.handoff_rules;
  if (!isRecord(defaultsRaw) || !isRecord(rulesRaw)) {
    throw new Error("Handoff policy is missing required sections.");
  }

  const defaults: HandoffDefaults = {
    preserve_packet_scope: parseBoolean(defaultsRaw.preserve_packet_scope, "defaults.preserve_packet_scope"),
    preserve_evidence_expectations: parseBoolean(
      defaultsRaw.preserve_evidence_expectations,
      "defaults.preserve_evidence_expectations",
    ),
    preserve_escalation_instructions: parseBoolean(
      defaultsRaw.preserve_escalation_instructions,
      "defaults.preserve_escalation_instructions",
    ),
    default_none_token: parseString(defaultsRaw.default_none_token, "defaults.default_none_token"),
  };

  const handoff_rules = {} as Record<HandoffType, HandoffRule>;
  for (const handoffType of HANDOFF_TYPES) {
    const ruleRaw = rulesRaw[handoffType];
    if (!isRecord(ruleRaw)) {
      throw new Error(`Missing handoff rule for ${handoffType}.`);
    }
    const required_headers = uniqueStrings(parseStringArray(ruleRaw.required_headers));
    const required_detail_fields = uniqueStrings(parseStringArray(ruleRaw.required_detail_fields));
    const required_packet_fields = uniqueStrings(parseStringArray(ruleRaw.required_packet_fields));
    if (required_headers.length === 0) {
      throw new Error(`Handoff rule ${handoffType} must include required headers.`);
    }
    handoff_rules[handoffType] = {
      from_roles: parseRoleArray(ruleRaw.from_roles, `${handoffType}.from_roles`),
      to_roles: parseRoleArray(ruleRaw.to_roles, `${handoffType}.to_roles`),
      required_headers,
      required_detail_fields,
      required_packet_fields,
    };
  }

  return {
    notes: uniqueStrings(parseStringArray(raw.notes)),
    defaults,
    handoff_rules,
  };
}

export async function loadHandoffPolicy(cwd: string): Promise<HandoffPolicy> {
  const raw = await readFile(resolve(cwd, POLICY_PATH), "utf8");
  return parseHandoffPolicy(JSON.parse(raw));
}

function sanitizeSlugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function generateHandoffId(input: {
  handoffType: HandoffType;
  sourcePacketId: string;
  fromRole: HarnessRole;
  toRole: HarnessRole;
}): string {
  return [
    "handoff",
    sanitizeSlugPart(input.handoffType),
    sanitizeSlugPart(input.sourcePacketId),
    sanitizeSlugPart(input.fromRole),
    sanitizeSlugPart(input.toRole),
  ].join("-");
}

function renderList(lines: string[]): string {
  if (lines.length === 0) return "- none";
  return lines.map((line) => `- ${line}`).join("\n");
}

function nonEmptyOrNone(lines: string[], noneToken: string): string[] {
  return lines.length > 0 ? lines : [noneToken];
}

function preservePacket(packet: TaskPacket): PreservedPacketSummary {
  return {
    packetId: packet.packetId,
    title: packet.title,
    goal: packet.goal,
    scope: packet.scope,
    nonGoals: packet.nonGoals,
    domains: packet.domains,
    discoverySummary: packet.discoverySummary,
    filesToInspect: packet.filesToInspect,
    filesToModify: packet.filesToModify,
    allowedPaths: packet.allowedPaths,
    disallowedPaths: packet.disallowedPaths,
    acceptanceCriteria: packet.acceptanceCriteria,
    evidenceExpectations: packet.evidenceExpectations,
    validationExpectations: packet.validationExpectations,
    expectedProof: packet.expectedProof,
    wiringChecks: packet.wiringChecks,
    migrationPathNote: packet.migrationPathNote,
    escalationInstructions: packet.escalationInstructions,
    modelOverride: packet.modelOverride,
  };
}

function buildDetails(input: GenerateHandoffInput, packet: TaskPacket, noneToken: string): HandoffDetails {
  const validationQuestions = uniqueStrings(input.validationQuestions ?? input.openQuestions ?? []);
  return {
    changedFiles: nonEmptyOrNone(uniqueStrings(input.changedFiles ?? []), noneToken),
    unchangedInspected: nonEmptyOrNone(uniqueStrings(input.unchangedInspected ?? []), noneToken),
    acceptanceCoverage: nonEmptyOrNone(uniqueStrings(input.acceptanceCoverage ?? []), noneToken),
    evidence: nonEmptyOrNone(uniqueStrings(input.evidence ?? []), noneToken),
    commandsRun: nonEmptyOrNone(uniqueStrings(input.commandsRun ?? []), noneToken),
    wiringVerification: nonEmptyOrNone(uniqueStrings(input.wiringVerification ?? []), noneToken),
    knownGaps: nonEmptyOrNone(uniqueStrings(input.knownGaps ?? []), noneToken),
    blockers: nonEmptyOrNone(uniqueStrings(input.blockers ?? []), noneToken),
    reviewScope: nonEmptyOrNone(uniqueStrings(input.reviewScope ?? []), noneToken),
    claimedCompletionStatus: input.claimedCompletionStatus?.trim() || null,
    filesToInspect: nonEmptyOrNone(uniqueStrings(input.filesToInspect ?? []), noneToken),
    risksToChallenge: nonEmptyOrNone(uniqueStrings(input.risksToChallenge ?? []), noneToken),
    questionsForReviewer: nonEmptyOrNone(uniqueStrings(input.questionsForReviewer ?? []), noneToken),
    validationScope: nonEmptyOrNone(uniqueStrings(input.validationScope ?? []), noneToken),
    expectedProof: nonEmptyOrNone(uniqueStrings(input.expectedProof ?? []), noneToken),
    openQuestions: nonEmptyOrNone(uniqueStrings(input.openQuestions ?? validationQuestions), noneToken),
    validationQuestions: nonEmptyOrNone(validationQuestions, noneToken),
    failureType: input.failureType?.trim() || null,
    likelyCauses: nonEmptyOrNone(uniqueStrings(input.likelyCauses ?? []), noneToken),
    recoveryOptions: nonEmptyOrNone(uniqueStrings(input.recoveryOptions ?? []), noneToken),
    recommendedAction: input.recommendedAction ?? null,
    migrationPathNote: (input.migrationPathNote ?? packet.migrationPathNote).trim() || null,
    stopThreshold: input.stopThreshold?.trim() || null,
  };
}

function validateRolePair(handoffType: HandoffType, fromRole: HarnessRole, toRole: HarnessRole, packet: TaskPacket): void {
  switch (handoffType) {
    case "build_to_worker":
      if (fromRole !== "build_lead") throw new Error("build_to_worker must come from build_lead.");
      if (!(BUILD_WORKER_ROLES as readonly string[]).includes(toRole)) {
        throw new Error("build_to_worker must target a build worker role.");
      }
      if (toRole !== packet.assignedRole) {
        throw new Error("build_to_worker toRole must match the source packet assignedRole.");
      }
      return;
    case "worker_to_quality":
      if (!(QUALITY_SOURCE_WORKER_ROLES as readonly string[]).includes(fromRole)) {
        throw new Error("worker_to_quality must come from a worker role.");
      }
      if (toRole !== "quality_lead") throw new Error("worker_to_quality must target quality_lead.");
      if (fromRole !== packet.assignedRole) {
        throw new Error("worker_to_quality fromRole must match the source packet assignedRole.");
      }
      return;
    case "quality_to_reviewer":
      if (fromRole !== "quality_lead") throw new Error("quality_to_reviewer must come from quality_lead.");
      if (toRole !== "reviewer_worker") throw new Error("quality_to_reviewer must target reviewer_worker.");
      return;
    case "quality_to_validator":
      if (fromRole !== "quality_lead") throw new Error("quality_to_validator must come from quality_lead.");
      if (toRole !== "validator_worker") throw new Error("quality_to_validator must target validator_worker.");
      return;
    case "recovery_to_orchestrator_or_lead":
      if (fromRole !== "recovery_worker") {
        throw new Error("recovery_to_orchestrator_or_lead must come from recovery_worker.");
      }
      if (!(RECOVERY_TARGET_ROLES as readonly string[]).includes(toRole)) {
        throw new Error("recovery_to_orchestrator_or_lead must target orchestrator or a lead role.");
      }
      return;
  }
}

function requireNonNone(lines: string[], fieldName: string, noneToken: string): void {
  if (lines.length === 0 || (lines.length === 1 && lines[0] === noneToken)) {
    throw new Error(`${fieldName} is required for this handoff type.`);
  }
}

function validateRequiredDetails(handoffType: HandoffType, rule: HandoffRule, details: HandoffDetails, noneToken: string): void {
  const detailChecks: Record<string, () => void> = {
    changed_files: () => requireNonNone(details.changedFiles, "changedFiles", noneToken),
    acceptance_coverage: () => requireNonNone(details.acceptanceCoverage, "acceptanceCoverage", noneToken),
    evidence: () => requireNonNone(details.evidence, "evidence", noneToken),
    commands_run: () => requireNonNone(details.commandsRun, "commandsRun", noneToken),
    wiring_verification: () => requireNonNone(details.wiringVerification, "wiringVerification", noneToken),
    review_scope: () => requireNonNone(details.reviewScope, "reviewScope", noneToken),
    claimed_completion_status: () => {
      if (!details.claimedCompletionStatus) throw new Error("claimedCompletionStatus is required for this handoff type.");
    },
    files_to_inspect: () => requireNonNone(details.filesToInspect, "filesToInspect", noneToken),
    risks_to_challenge: () => requireNonNone(details.risksToChallenge, "risksToChallenge", noneToken),
    questions_for_reviewer: () => requireNonNone(details.questionsForReviewer, "questionsForReviewer", noneToken),
    validation_scope: () => requireNonNone(details.validationScope, "validationScope", noneToken),
    expected_proof: () => requireNonNone(details.expectedProof, "expectedProof", noneToken),
    open_questions: () => requireNonNone(details.openQuestions, "openQuestions", noneToken),
    validation_questions: () => requireNonNone(details.validationQuestions, "validationQuestions", noneToken),
    known_gaps: () => requireNonNone(details.knownGaps, "knownGaps", noneToken),
    failure_type: () => {
      if (!details.failureType) throw new Error("failureType is required for this handoff type.");
    },
    likely_causes: () => requireNonNone(details.likelyCauses, "likelyCauses", noneToken),
    recovery_options: () => requireNonNone(details.recoveryOptions, "recoveryOptions", noneToken),
    recommended_action: () => {
      if (!details.recommendedAction) throw new Error("recommendedAction is required for this handoff type.");
    },
    migration_path_note: () => {
      if (!details.migrationPathNote) throw new Error("migrationPathNote is required for this handoff type.");
    },
    stop_threshold: () => {
      if (!details.stopThreshold) throw new Error("stopThreshold is required for this handoff type.");
    },
  };

  for (const field of rule.required_detail_fields) {
    const check = detailChecks[field];
    if (!check) {
      throw new Error(`Unsupported required detail field in handoff policy: ${field}`);
    }
    check();
  }

  if (handoffType === "recovery_to_orchestrator_or_lead" && details.recommendedAction === "escalate" && (!details.migrationPathNote || details.migrationPathNote.toLowerCase() === noneToken)) {
    throw new Error("migrationPathNote is required when recovery recommends escalation.");
  }
}

function validateRequiredPacketFields(rule: HandoffRule, packet: PreservedPacketSummary): void {
  const packetChecks: Record<string, () => void> = {
    goal: () => {
      if (!packet.goal.trim()) throw new Error("preserved packet goal is required for this handoff type.");
    },
    discovery_summary: () => {
      if (packet.discoverySummary.length === 0) throw new Error("preserved packet discovery summary is required for this handoff type.");
    },
    scope_boundaries: () => {
      if (!packet.scope.trim()) throw new Error("preserved packet scope is required for this handoff type.");
      if (packet.nonGoals.length === 0) throw new Error("preserved packet nonGoals are required for this handoff type.");
      if (packet.filesToInspect.length === 0) throw new Error("preserved packet filesToInspect are required for this handoff type.");
    },
    evidence_expectations: () => {
      if (packet.evidenceExpectations.length === 0) throw new Error("preserved packet evidenceExpectations are required for this handoff type.");
    },
    wiring_checks: () => {
      if (packet.wiringChecks.length === 0) throw new Error("preserved packet wiringChecks are required for this handoff type.");
    },
    expected_proof: () => {
      if (packet.expectedProof.length === 0) throw new Error("preserved packet expectedProof is required for this handoff type.");
    },
  };

  for (const field of rule.required_packet_fields) {
    const check = packetChecks[field];
    if (!check) {
      throw new Error(`Unsupported required packet field in handoff policy: ${field}`);
    }
    check();
  }
}

export function validateStructuredHandoff(handoff: StructuredHandoff): void {
  if (handoff.version !== 1) throw new Error("handoff version must be 1.");
  if (!handoff.handoffId.trim()) throw new Error("handoffId is required.");
  if (!handoff.sourcePacketId.trim()) throw new Error("sourcePacketId is required.");
  if (!handoff.sourceGoalId.trim()) throw new Error("sourceGoalId is required.");
  if (handoff.requiredHeaders.length === 0) throw new Error("requiredHeaders must not be empty.");
  if (!handoff.preservedPacket.packetId.trim()) throw new Error("preservedPacket.packetId is required.");
  if (!handoff.preservedPacket.goal.trim()) throw new Error("preservedPacket.goal is required.");
  if (!handoff.preservedPacket.scope.trim()) throw new Error("preservedPacket.scope is required.");
  if (handoff.preservedPacket.nonGoals.length === 0) throw new Error("preserved packet nonGoals are required.");
  if (handoff.preservedPacket.discoverySummary.length === 0) throw new Error("preserved packet discovery summary is required.");
  if (handoff.preservedPacket.filesToInspect.length === 0) throw new Error("preserved packet filesToInspect are required.");
  if (handoff.preservedPacket.acceptanceCriteria.length === 0) throw new Error("preserved acceptance criteria are required.");
  if (handoff.preservedPacket.evidenceExpectations.length === 0) throw new Error("preserved evidence expectations are required.");
  if (handoff.preservedPacket.expectedProof.length === 0) throw new Error("preserved expected proof is required.");
  if (!handoff.preservedPacket.migrationPathNote.trim()) throw new Error("preserved migrationPathNote is required.");
  if (handoff.preservedPacket.escalationInstructions.length === 0) throw new Error("preserved escalation instructions are required.");
  if (handoff.details.validationQuestions.length === 0) throw new Error("handoff details validationQuestions must be present.");
  if (handoff.details.openQuestions.length === 0) throw new Error("handoff details openQuestions must be present.");
}

function renderHandoff(handoff: StructuredHandoff, noneToken: string): string {
  const packet = handoff.preservedPacket;
  const d = handoff.details;
  switch (handoff.handoffType) {
    case "build_to_worker":
      return [
        "## Worker Assignment",
        `- role: ${handoff.toRole}`,
        `- packet: ${packet.packetId}`,
        `- goal: ${packet.goal}`,
        "",
        "## Scope Boundaries",
        `- title: ${packet.title}`,
        `- scope: ${packet.scope}`,
        `- non-goals:\n${renderList(packet.nonGoals)}`,
        `- files to inspect:\n${renderList(packet.filesToInspect)}`,
        `- files to modify:\n${renderList(packet.filesToModify)}`,
        ...packet.allowedPaths.length > 0 ? [renderList(packet.allowedPaths)] : ["- allowed paths: none"],
        ...packet.domains.length > 0 ? [renderList(packet.domains)] : ["- domains: none"],
        `- disallowed paths:\n${renderList(packet.disallowedPaths)}`,
        "",
        "## Discovery Summary",
        renderList(packet.discoverySummary),
        "",
        "## Acceptance Criteria",
        renderList(packet.acceptanceCriteria),
        "",
        "## Evidence Expectations",
        renderList([...packet.evidenceExpectations, ...packet.expectedProof.map((line) => `expected proof: ${line}`)]),
        "",
        "## Wiring Checks",
        renderList([...packet.wiringChecks, `migration path note: ${packet.migrationPathNote}`]),
        "",
        "## Escalations",
        renderList(packet.escalationInstructions),
      ].join("\n");
    case "worker_to_quality":
      return [
        "## Work Summary",
        `- source packet: ${packet.packetId}`,
        `- changed files:\n${renderList(d.changedFiles)}`,
        `- unchanged but inspected:\n${renderList(d.unchangedInspected)}`,
        "",
        "## Discovery Summary",
        renderList(packet.discoverySummary),
        "",
        "## Scope Boundaries",
        `- goal: ${packet.goal}`,
        `- scope: ${packet.scope}`,
        `- non-goals:\n${renderList(packet.nonGoals)}`,
        `- files to inspect:\n${renderList(packet.filesToInspect)}`,
        `- files to modify:\n${renderList(packet.filesToModify)}`,
        "",
        "## Acceptance Coverage",
        renderList(d.acceptanceCoverage),
        "",
        "## Evidence",
        renderList(d.evidence),
        "",
        "## Evidence Expectations",
        renderList([...packet.evidenceExpectations, ...packet.expectedProof.map((line) => `expected proof: ${line}`)]),
        "",
        "## Validation Commands",
        renderList(d.commandsRun),
        "",
        "## Wiring Checks",
        renderList(packet.wiringChecks),
        "",
        "## Wiring Verification",
        renderList(d.wiringVerification),
        "",
        "## Known Gaps",
        renderList(d.knownGaps),
        "",
        "## Blockers",
        renderList(d.blockers),
      ].join("\n");
    case "quality_to_reviewer":
      return [
        "## Review Scope",
        renderList(d.reviewScope),
        "",
        "## Claimed Completion Status",
        `- ${d.claimedCompletionStatus ?? noneToken}`,
        "",
        "## Scope Boundaries",
        `- goal: ${packet.goal}`,
        `- scope: ${packet.scope}`,
        `- non-goals:\n${renderList(packet.nonGoals)}`,
        `- files to inspect:\n${renderList(packet.filesToInspect)}`,
        `- files to modify:\n${renderList(packet.filesToModify)}`,
        "",
        "## Files To Inspect",
        renderList(d.filesToInspect),
        "",
        "## Risks To Challenge",
        renderList(d.risksToChallenge),
        "",
        "## Questions For Reviewer",
        renderList(d.questionsForReviewer),
      ].join("\n");
    case "quality_to_validator":
      return [
        "## Validation Scope",
        renderList(d.validationScope),
        "",
        "## Scope Boundaries",
        `- goal: ${packet.goal}`,
        `- scope: ${packet.scope}`,
        `- files to inspect:\n${renderList(packet.filesToInspect)}`,
        `- files to modify:\n${renderList(packet.filesToModify)}`,
        "",
        "## Acceptance Criteria",
        renderList(packet.acceptanceCriteria),
        "",
        "## Expected Proof",
        renderList(d.expectedProof),
        "",
        "## Validation Questions",
        renderList(d.validationQuestions),
        "",
        "## Wiring Checks",
        renderList([...packet.wiringChecks, `migration path note: ${packet.migrationPathNote}`]),
        "",
        "## Risks",
        renderList(d.knownGaps),
      ].join("\n");
    case "recovery_to_orchestrator_or_lead":
      return [
        "## Failure Type",
        `- ${d.failureType ?? noneToken}`,
        "",
        "## Likely Causes",
        renderList(d.likelyCauses),
        "",
        "## Recovery Options",
        renderList(d.recoveryOptions),
        "",
        "## Recommended Action",
        `- ${d.recommendedAction ?? noneToken}`,
        "",
        "## Migration Path Note",
        `- ${d.migrationPathNote ?? noneToken}`,
        "",
        "## Stop Threshold",
        `- ${d.stopThreshold ?? noneToken}`,
      ].join("\n");
  }
}

export function generateHandoff(policy: HandoffPolicy, input: GenerateHandoffInput): GeneratedHandoff {
  validateTaskPacketShape(input.sourcePacket);
  const rule = policy.handoff_rules[input.handoffType];
  if (!rule) {
    throw new Error(`Unsupported handoff type: ${input.handoffType}`);
  }
  if (!rule.from_roles.includes(input.fromRole)) {
    throw new Error(`${input.handoffType} does not allow fromRole ${input.fromRole}.`);
  }
  if (!rule.to_roles.includes(input.toRole)) {
    throw new Error(`${input.handoffType} does not allow toRole ${input.toRole}.`);
  }

  validateRolePair(input.handoffType, input.fromRole, input.toRole, input.sourcePacket);
  const details = buildDetails(input, input.sourcePacket, policy.defaults.default_none_token);
  validateRequiredDetails(input.handoffType, rule, details, policy.defaults.default_none_token);

  const handoff: StructuredHandoff = {
    version: 1,
    handoffId: generateHandoffId({
      handoffType: input.handoffType,
      sourcePacketId: input.sourcePacket.packetId,
      fromRole: input.fromRole,
      toRole: input.toRole,
    }),
    handoffType: input.handoffType,
    sourcePacketId: input.sourcePacket.packetId,
    sourceGoalId: input.sourcePacket.source.goalId,
    fromRole: input.fromRole,
    toRole: input.toRole,
    requiredHeaders: rule.required_headers,
    preservedPacket: preservePacket(input.sourcePacket),
    details,
  };

  validateRequiredPacketFields(rule, handoff.preservedPacket);
  validateStructuredHandoff(handoff);

  const policyNotes = [...policy.notes];
  if (policy.defaults.preserve_packet_scope) policyNotes.push("Packet scope and allowed/disallowed boundaries are preserved in the handoff contract.");
  if (policy.defaults.preserve_evidence_expectations) policyNotes.push("Packet evidence expectations are preserved in the handoff contract.");
  if (policy.defaults.preserve_escalation_instructions) policyNotes.push("Packet escalation instructions are preserved in the handoff contract.");

  return {
    handoff,
    renderedHandoff: renderHandoff(handoff, policy.defaults.default_none_token),
    policyNotes,
  };
}

export default function handoffs(pi: ExtensionAPI) {
  pi.registerTool({
    name: "generate_handoff",
    label: "Generate Handoff",
    description: "Generate deterministic structured handoffs for the repo-local harness.",
    promptSnippet: "Use deterministic handoff generation instead of free-form role handoffs.",
    promptGuidelines: [
      "Use this tool when a worker, lead, or recovery lane needs to pass structured work to another role.",
      "Prefer this tool before writing ad hoc handoff summaries by hand.",
    ],
    parameters: HandoffInputSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const policy = await loadHandoffPolicy(ctx.cwd);
        const result = generateHandoff(policy, params as GenerateHandoffInput);
        const details: HandoffToolDetails = {
          ok: true,
          handoff: result.handoff,
          renderedHandoff: result.renderedHandoff,
          policyNotes: result.policyNotes,
          error: null,
        };
        return {
          content: [{ type: "text", text: result.renderedHandoff }],
          details,
        };
      } catch (error) {
        const message = `Handoff generation failed: ${String(error)}`;
        const details: HandoffToolDetails = {
          ok: false,
          handoff: null,
          renderedHandoff: "",
          policyNotes: [],
          error: String(error),
        };
        return {
          content: [{ type: "text", text: message }],
          details,
        };
      }
    },
  });
}
