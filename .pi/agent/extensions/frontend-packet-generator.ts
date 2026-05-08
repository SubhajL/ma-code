import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  generateTaskPacket,
  loadPacketPolicy,
  type GeneratedTaskPacket,
  type TddSlice,
} from "./task-packets.ts";
import { loadHarnessRoutingConfig } from "./harness-routing.ts";
import { loadTeamDefinitions } from "./team-activation.ts";

export interface FrontendPacketGeneratorInput {
  repoRoot?: string;
  initiativeId: string;
  sliceId: string;
  screenArtifactPath?: string;
  screenApprovalPath?: string;
  contractPath?: string;
  slicePlanPath?: string;
}

export interface FrontendPacketPreviewPaths {
  jsonPath: string;
  markdownPath: string;
}

export interface GeneratedFrontendImplementationPacket extends GeneratedTaskPacket {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  screenArtifactPath: string;
  screenApprovalPath: string;
  contractPath: string;
  slicePlanPath: string;
  screenArtifactHash: string;
  contractHash: string;
  previewPaths: FrontendPacketPreviewPaths;
}

export interface WrittenFrontendPacketPreview extends GeneratedFrontendImplementationPacket {
  createdFiles: string[];
}

type JsonRecord = Record<string, unknown>;

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function assertInitiativeSlug(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) throw new Error(`Invalid initiative slug: ${value}`);
  return trimmed;
}

function assertSliceId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("sliceId is required.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) throw new Error(`Invalid slice id: ${value}`);
  return trimmed;
}

function assertSafeRelativePath(pathValue: string, label: string): string {
  const trimmed = pathValue.trim();
  if (trimmed.length === 0) throw new Error(`${label} is required.`);
  if (trimmed.startsWith("/") || trimmed.includes("\\") || trimmed.split("/").includes("..")) {
    throw new Error(`${label} must be a repo-relative safe path.`);
  }
  return trimmed;
}

function defaultPaths(initiativeId: string, sliceId: string): Required<Pick<FrontendPacketGeneratorInput, "screenArtifactPath" | "screenApprovalPath" | "contractPath" | "slicePlanPath">> & FrontendPacketPreviewPaths {
  return {
    screenArtifactPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`,
    screenApprovalPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.approval.json`,
    contractPath: `docs/initiatives/${initiativeId}/contracts/${sliceId}.contract.json`,
    slicePlanPath: `docs/initiatives/${initiativeId}/slice-plan.json`,
    jsonPath: `docs/initiatives/${initiativeId}/packets/${sliceId}.frontend.packet.json`,
    markdownPath: `docs/initiatives/${initiativeId}/packets/${sliceId}.frontend.packet.md`,
  };
}

async function readRequired(repoRoot: string, relPath: string, label: string): Promise<string> {
  try {
    return await readFile(join(repoRoot, relPath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Missing ${label}: ${relPath}`);
    throw error;
  }
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${(error as Error).message}`);
  }
}

function normalizeScreenArtifact(value: unknown, expected: { initiativeId: string; sliceId: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid screen artifact: expected object.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid screen artifact: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid screen artifact: sliceId must be ${expected.sliceId}.`);
  if (value.mode !== "mock") throw new Error("Invalid screen artifact: mode must be mock.");
  if (value.nextAllowedPhase !== "screen_approval") throw new Error("Invalid screen artifact: nextAllowedPhase must be screen_approval.");
  if (!Array.isArray(value.screens) || value.screens.length === 0) throw new Error("Invalid screen artifact: screens must contain at least one screen.");
  const constraints = value.constraints;
  if (!isRecord(constraints) || constraints.taskPacketsCreated !== false || constraints.queueJobsCreated !== false) {
    throw new Error("Invalid screen artifact: constraints must prove no task packets or queue jobs were created.");
  }
  return value;
}

function normalizeApproval(value: unknown, expected: { initiativeId: string; sliceId: string; screenArtifactPath: string; screenArtifactHash: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid screen approval: expected object.");
  if (value.version !== 1) throw new Error("Invalid screen approval: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid screen approval: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid screen approval: sliceId must be ${expected.sliceId}.`);
  if (value.artifactPath !== expected.screenArtifactPath) throw new Error("Invalid screen approval: artifactPath does not match screen artifact path.");
  if (value.decision !== "approved") throw new Error("Screen artifact approval is not approved.");
  if (value.artifactHash !== expected.screenArtifactHash) throw new Error("Screen approval artifact hash does not match current screen artifact hash.");
  if (value.nextAllowedPhase !== "fe_implementation") throw new Error("Invalid screen approval: nextAllowedPhase must be fe_implementation.");
  return value;
}

function normalizeContract(value: unknown, expected: { initiativeId: string; sliceId: string; screenArtifactPath: string; screenApprovalPath: string; screenArtifactHash: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid slice contract: expected object.");
  if (value.version !== 1) throw new Error("Invalid slice contract: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid slice contract: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid slice contract: sliceId must be ${expected.sliceId}.`);
  if (value.nextAllowedPhase !== "fe_implementation") throw new Error("Invalid slice contract: nextAllowedPhase must be fe_implementation.");
  if (value.blockedReason !== null && value.blockedReason !== undefined) throw new Error("Invalid slice contract: blockedReason must be null before FE packet generation.");
  const source = value.sourceScreenArtifact;
  if (!isRecord(source)) throw new Error("Invalid slice contract: sourceScreenArtifact is required.");
  if (source.artifactPath !== expected.screenArtifactPath) throw new Error("Invalid slice contract: source screen artifact path does not match input.");
  if (source.approvalPath !== expected.screenApprovalPath) throw new Error("Invalid slice contract: source approval path does not match input.");
  if (source.artifactHash !== expected.screenArtifactHash) throw new Error("Invalid slice contract: source artifact hash does not match current screen artifact.");
  if (!Array.isArray(value.uiStateContract) || value.uiStateContract.length === 0) throw new Error("Invalid slice contract: uiStateContract must not be empty for frontend work.");
  const allowedPaths = extractAllowedPaths(value);
  if (allowedPaths.length === 0) throw new Error("Invalid slice contract: allowedPaths must include at least one frontend path boundary.");
  if (!Array.isArray(value.tddSeeds) || value.tddSeeds.length === 0) throw new Error("Invalid slice contract: tddSeeds must include frontend TDD seed data.");
  const mockPlan = value.mockPlan;
  if (!isRecord(mockPlan) || asStringArray(mockPlan.seedData).length === 0) throw new Error("Invalid slice contract: mockPlan.seedData must include contract fixture seed data.");
  return value;
}

function nestedAllowedPaths(value: unknown): string[] {
  return isRecord(value) ? asStringArray(value.allowedPaths) : [];
}

function extractAllowedPaths(contract: JsonRecord): string[] {
  return unique([
    ...asStringArray(contract.allowedPaths),
    ...nestedAllowedPaths(contract.frontend),
    ...nestedAllowedPaths(contract.frontendImplementation),
    ...nestedAllowedPaths(contract.implementation),
  ]).map((pathValue) => assertSafeRelativePath(pathValue, "contract allowedPaths entry"));
}

function normalizeSlicePlan(value: unknown, expected: { initiativeId: string; sliceId: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid slice plan: expected object.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid slice plan: initiativeId must be ${expected.initiativeId}.`);
  if (!Array.isArray(value.slices)) throw new Error("Invalid slice plan: slices must be an array.");
  const slice = value.slices.find((entry) => isRecord(entry) && entry.sliceId === expected.sliceId);
  if (!isRecord(slice)) throw new Error(`Invalid slice plan: missing slice ${expected.sliceId}.`);
  const domains = asStringArray(slice.domains);
  const phaseOrder = asStringArray(slice.phaseOrder);
  const uiFacing = slice.uiFacing;
  const explicitlyFrontend = domains.includes("frontend") || uiFacing === true;
  const inferredFrontend = uiFacing !== false && phaseOrder.includes("fe_implementation");
  if (!explicitlyFrontend && !inferredFrontend) throw new Error("Slice is not frontend/UI-facing; FE packet generation is blocked.");
  return slice;
}

function firstUiState(contract: JsonRecord): JsonRecord {
  const entries = Array.isArray(contract.uiStateContract) ? contract.uiStateContract : [];
  const first = entries.find(isRecord);
  if (!first) throw new Error("Invalid slice contract: uiStateContract must contain at least one object.");
  return first;
}

function firstTddSeed(contract: JsonRecord): JsonRecord {
  const entries = Array.isArray(contract.tddSeeds) ? contract.tddSeeds : [];
  const first = entries.find(isRecord);
  if (!first) throw new Error("Invalid slice contract: tddSeeds must contain at least one object.");
  return first;
}

function tddSliceFromContract(contract: JsonRecord, contractPath: string): TddSlice {
  const uiState = firstUiState(contract);
  const tddSeed = firstTddSeed(contract);
  const screenId = typeof uiState.screenId === "string" && uiState.screenId.trim() ? uiState.screenId.trim() : "primary approved screen";
  const scenario = typeof tddSeed.scenario === "string" && tddSeed.scenario.trim() ? tddSeed.scenario.trim() : "primary approved screen state";
  const frontendExpectation = typeof tddSeed.frontendExpectation === "string" && tddSeed.frontendExpectation.trim()
    ? tddSeed.frontendExpectation.trim()
    : "render contract-backed UI state";
  const seedData = isRecord(contract.mockPlan) ? asStringArray(contract.mockPlan.seedData) : [];
  return {
    firstTracerBehavior: `Render ${screenId} for ${scenario} from contract-backed mock data: ${frontendExpectation}.`,
    publicInterface: "Target route/component or public UI entrypoint declared by the FE worker before mutation.",
    testSurface: ["frontend behavior test through the public UI surface", "accessibility/state validation for approved screen states"],
    boundaryDependencies: unique([contractPath, ...seedData.map((entry) => `contract fixture seed: ${entry}`)]),
    mockPlan: "Mock backend boundary using the slice contract fixture only; do not call live backend services.",
    outOfScopeBehaviors: unique(["backend implementation", "schema migration", ...asStringArray(contract.outOfScope)]),
  };
}

function statesFromContract(contract: JsonRecord): string[] {
  const entries = Array.isArray(contract.uiStateContract) ? contract.uiStateContract : [];
  return unique(entries.flatMap((entry) => isRecord(entry) ? asStringArray(entry.states) : []));
}

function buildAcceptanceCriteria(states: string[]): string[] {
  return [
    "Implement frontend behavior matching the approved screen artifact and current slice contract.",
    states.length > 0
      ? `Cover required UI states from the contract: ${states.join(", ")}.`
      : "Cover loading, empty, error, and success states required by the contract.",
    "Do not change backend behavior.",
    "Use contract fixture data only for backend-boundary mocks.",
    "Record frontend validation, UI wiring, and accessibility/state proof before completion.",
  ];
}

function buildGeneratedInput(args: {
  initiativeId: string;
  sliceId: string;
  screenArtifactPath: string;
  screenApprovalPath: string;
  contractPath: string;
  slicePlanPath: string;
  contract: JsonRecord;
}) {
  const allowedPaths = extractAllowedPaths(args.contract);
  const states = statesFromContract(args.contract);
  return {
    sourceGoalId: `phase-8:${args.initiativeId}:${args.sliceId}:frontend`,
    assignedTeam: "build" as const,
    assignedRole: "frontend_worker" as const,
    title: `Implement frontend slice ${args.sliceId} for ${args.initiativeId}`,
    goal: "Provide an actionable frontend worker packet from the approved screen artifact and current slice contract.",
    scope: `Frontend implementation for ${args.initiativeId}/${args.sliceId}; inspect approved screen, approval sidecar, slice plan, and contract before mutation.`,
    nonGoals: ["Do not change backend behavior.", "Do not create queue jobs, runtime tasks, worker sessions, or backend packets.", "Do not widen beyond the contract-defined frontend path boundaries."],
    workType: "implementation" as const,
    domains: ["frontend" as const],
    filesToInspect: [args.screenArtifactPath, args.screenApprovalPath, args.contractPath, args.slicePlanPath],
    filesToModify: allowedPaths,
    allowedPaths,
    discoverySummary: [
      "Phase 8 frontend packet generator validated the approved screen artifact, approval sidecar, current slice contract, and UI-facing slice plan.",
      "Artifact references are carried through existing task-packet fields; no first-class sliceArtifacts schema was added.",
      "Phase 7 frontend_implementation routing lane was requested for this packet.",
    ],
    crossModelPlanningNote: "Phase 8 Draft A: additive FE packet helper reuses existing task-packet schema and Phase 7 routing fallback until requested frontend models are verified.",
    acceptanceCriteria: buildAcceptanceCriteria(states),
    evidenceExpectations: [
      "Frontend tests or validation command output.",
      "UI wiring proof through the public route/component entrypoint.",
      "Accessibility/state assumptions noted.",
      "Confirmation that backend behavior was not changed.",
    ],
    validationExpectations: [
      "Run targeted frontend behavior tests for the modified public UI surface.",
      "Run accessibility/state validation appropriate to the touched UI surface.",
      "Run static/type checks required by the frontend project surface.",
    ],
    expectedProof: [
      "Frontend tests or validation command output.",
      "UI wiring proof.",
      "Accessibility/state assumptions noted.",
      "Approved screen artifact and current contract paths cited in the worker evidence.",
    ],
    tddSlice: tddSliceFromContract(args.contract, args.contractPath),
    wiringChecks: [
      "Verify target route/component is wired through the public UI entrypoint.",
      "Verify backend boundary is mocked with contract fixture data only.",
      "Verify loading, empty, error, and success states required by the contract are covered or explicitly scoped.",
    ],
    migrationPathNote: "Phase 8 creates a preview task-packet artifact only; future scheduler consumption must add explicit queue gates before dispatch.",
    escalationInstructions: [
      "Escalate if contract paths are too broad or do not map to frontend-owned code.",
      "Escalate if the approved screen artifact and slice contract disagree.",
      "Escalate if backend, schema, auth, or deployment scope becomes necessary.",
    ],
    dependencies: [args.screenArtifactPath, args.screenApprovalPath, args.contractPath, args.slicePlanPath],
    routeReason: "task_harder" as const,
    budgetMode: "default" as const,
    phaseLane: "frontend_implementation" as const,
  };
}

export async function generateFrontendImplementationPacket(input: FrontendPacketGeneratorInput, generatedAt = new Date().toISOString()): Promise<GeneratedFrontendImplementationPacket> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(input.initiativeId);
  const sliceId = assertSliceId(input.sliceId);
  const defaults = defaultPaths(initiativeId, sliceId);
  const screenArtifactPath = assertSafeRelativePath(input.screenArtifactPath ?? defaults.screenArtifactPath, "screenArtifactPath");
  const screenApprovalPath = assertSafeRelativePath(input.screenApprovalPath ?? defaults.screenApprovalPath, "screenApprovalPath");
  const contractPath = assertSafeRelativePath(input.contractPath ?? defaults.contractPath, "contractPath");
  const slicePlanPath = assertSafeRelativePath(input.slicePlanPath ?? defaults.slicePlanPath, "slicePlanPath");
  const previewPaths = {
    jsonPath: defaults.jsonPath,
    markdownPath: defaults.markdownPath,
  };

  const screenArtifactText = await readRequired(repoRoot, screenArtifactPath, "screen artifact");
  const screenArtifactHash = sha256(screenArtifactText);
  normalizeScreenArtifact(parseJson(screenArtifactText, "screen artifact"), { initiativeId, sliceId });

  const approvalText = await readRequired(repoRoot, screenApprovalPath, "screen approval sidecar");
  normalizeApproval(parseJson(approvalText, "screen approval sidecar"), { initiativeId, sliceId, screenArtifactPath, screenArtifactHash });

  const contractText = await readRequired(repoRoot, contractPath, "slice contract");
  const contractHash = sha256(contractText);
  const contract = normalizeContract(parseJson(contractText, "slice contract"), { initiativeId, sliceId, screenArtifactPath, screenApprovalPath, screenArtifactHash });

  const slicePlanText = await readRequired(repoRoot, slicePlanPath, "slice plan");
  normalizeSlicePlan(parseJson(slicePlanText, "slice plan"), { initiativeId, sliceId });

  const [policy, teams, routingConfig] = await Promise.all([
    loadPacketPolicy(repoRoot),
    loadTeamDefinitions(repoRoot),
    loadHarnessRoutingConfig(repoRoot),
  ]);
  const generated = generateTaskPacket(
    policy,
    teams,
    routingConfig,
    buildGeneratedInput({ initiativeId, sliceId, screenArtifactPath, screenApprovalPath, contractPath, slicePlanPath, contract }),
    generatedAt,
  );
  return {
    ...generated,
    repoRoot,
    initiativeId,
    sliceId,
    screenArtifactPath,
    screenApprovalPath,
    contractPath,
    slicePlanPath,
    screenArtifactHash,
    contractHash,
    previewPaths,
  };
}

export async function writeFrontendPacketPreview(result: GeneratedFrontendImplementationPacket): Promise<WrittenFrontendPacketPreview> {
  const jsonPath = join(result.repoRoot, result.previewPaths.jsonPath);
  const markdownPath = join(result.repoRoot, result.previewPaths.markdownPath);
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(result.packet, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${result.renderedPacket.trimEnd()}\n`, "utf8");
  return {
    ...result,
    createdFiles: [result.previewPaths.jsonPath, result.previewPaths.markdownPath],
  };
}
