import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BUDGET_MODES,
  ROLE_IDS,
  ROUTE_REASONS,
  defaultModelId,
  loadHarnessRoutingConfig,
  resolveHarnessRoute,
  type BudgetMode,
  type HarnessRole,
  type RouteReason,
} from "./harness-routing.ts";
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

export interface PacketRoutingSummary {
  reason: RouteReason;
  budgetMode: BudgetMode;
  selectedModelId: string;
  selectedProvider: string;
  selectedModel: string;
  source: string;
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
  wiringChecks?: string[];
  migrationPathNote?: string;
  escalationInstructions?: string[];
  dependencies?: string[];
  routeReason?: RouteReason;
  budgetMode?: BudgetMode;
  failedModels?: string[];
  modelOverride?: string;
}

export interface GeneratedTaskPacket {
  packet: TaskPacket;
  renderedPacket: string;
  policyNotes: string[];
}

const PACKET_POLICY_PATH = ".pi/agent/packets/packet-policy.json";
const PACKET_SCHEMA_PATH = ".pi/agent/state/schemas/task-packet.schema.json";

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
  wiringChecks: Type.Optional(Type.Array(Type.String())),
  migrationPathNote: Type.Optional(Type.String()),
  escalationInstructions: Type.Optional(Type.Array(Type.String())),
  dependencies: Type.Optional(Type.Array(Type.String())),
  routeReason: Type.Optional(StringEnum(ROUTE_REASONS)),
  budgetMode: Type.Optional(StringEnum(BUDGET_MODES)),
  failedModels: Type.Optional(Type.Array(Type.String())),
  modelOverride: Type.Optional(Type.String()),
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
  if (packet.discoverySummary.length === 0) throw new Error("discoverySummary must not be empty.");
  if (packet.filesToInspect.length === 0) throw new Error("filesToInspect must not be empty.");
  if (packet.acceptanceCriteria.length === 0) throw new Error("acceptanceCriteria must not be empty.");
  if (packet.evidenceExpectations.length === 0) throw new Error("evidenceExpectations must not be empty.");
  if (packet.validationExpectations.length === 0) throw new Error("validationExpectations must not be empty.");
  if (packet.expectedProof.length === 0) throw new Error("expectedProof must not be empty.");
  if (packet.escalationInstructions.length === 0) throw new Error("escalationInstructions must not be empty.");
  if (packet.disallowedPaths.length === 0) throw new Error("disallowedPaths must not be empty.");
  if (!packet.migrationPathNote.trim()) throw new Error("migrationPathNote is required.");
  if (packet.assignedTeam === "build" && packet.workType !== "review_only" && packet.workType !== "research_only" && packet.filesToModify.length === 0) {
    throw new Error("filesToModify must not be empty for build packets that are expected to make changes.");
  }
  if (!packet.routing.selectedModelId.trim()) throw new Error("routing.selectedModelId is required.");
}

function renderList(lines: string[]): string {
  if (lines.length === 0) return "- none";
  return lines.map((line) => `- ${line}`).join("\n");
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
    `- route source: ${packet.routing.source}`,
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

  const route = resolveHarnessRoute(routingConfig, {
    role: input.assignedRole,
    reason: input.routeReason ?? "default",
    budgetMode: input.budgetMode ?? "default",
    failedModels: input.failedModels,
    modelOverride: input.modelOverride,
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
      source: route.source,
    },
  };

  validateTaskPacketShape(packet);

  return {
    packet,
    renderedPacket: renderTaskPacket(packet),
    policyNotes: [...policy.notes, ...route.policyNotes, ...route.blockedAdjustments],
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
