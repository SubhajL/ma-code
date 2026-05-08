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

export interface BackendPacketGeneratorInput {
  repoRoot?: string;
  initiativeId: string;
  sliceId: string;
  frontendPacketPath?: string;
  frontendEvidencePath?: string;
  contractPath?: string;
  slicePlanPath?: string;
}

export interface BackendPacketPreviewPaths {
  jsonPath: string;
  markdownPath: string;
}

export interface GeneratedBackendImplementationPacket extends GeneratedTaskPacket {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  frontendPacketPath: string;
  frontendEvidencePath: string;
  contractPath: string;
  slicePlanPath: string;
  contractHash: string;
  previewPaths: BackendPacketPreviewPaths;
}

export interface WrittenBackendPacketPreview extends GeneratedBackendImplementationPacket {
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

function defaultPaths(initiativeId: string, sliceId: string): Required<Pick<BackendPacketGeneratorInput, "frontendPacketPath" | "frontendEvidencePath" | "contractPath" | "slicePlanPath">> & BackendPacketPreviewPaths {
  return {
    frontendPacketPath: `docs/initiatives/${initiativeId}/packets/${sliceId}.frontend.packet.json`,
    frontendEvidencePath: `docs/initiatives/${initiativeId}/evidence/${sliceId}.frontend.validation.json`,
    contractPath: `docs/initiatives/${initiativeId}/contracts/${sliceId}.contract.json`,
    slicePlanPath: `docs/initiatives/${initiativeId}/slice-plan.json`,
    jsonPath: `docs/initiatives/${initiativeId}/packets/${sliceId}.backend.packet.json`,
    markdownPath: `docs/initiatives/${initiativeId}/packets/${sliceId}.backend.packet.md`,
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

function normalizeFrontendPacket(value: unknown, expected: { initiativeId: string; sliceId: string; contractPath: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid frontend packet: expected object.");
  if (value.assignedTeam !== "build") throw new Error("Invalid frontend packet: assignedTeam must be build.");
  if (value.assignedRole !== "frontend_worker") throw new Error("Invalid frontend packet: assignedRole must be frontend_worker.");
  if (value.workType !== "implementation") throw new Error("Invalid frontend packet: workType must be implementation.");
  const domains = asStringArray(value.domains);
  if (!domains.includes("frontend")) throw new Error("Invalid frontend packet: domains must include frontend.");
  const refs = [...asStringArray(value.filesToInspect), ...asStringArray(value.dependencies)];
  if (!refs.includes(expected.contractPath)) throw new Error("Invalid frontend packet: it must reference the current slice contract.");
  return value;
}

function normalizeFrontendEvidence(value: unknown, expected: { initiativeId: string; sliceId: string; frontendPacketPath: string; contractHash: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid frontend validation evidence: expected object.");
  if (value.version !== 1) throw new Error("Invalid frontend validation evidence: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid frontend validation evidence: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid frontend validation evidence: sliceId must be ${expected.sliceId}.`);
  if (value.phase !== "fe_validation") throw new Error("Invalid frontend validation evidence: phase must be fe_validation.");
  if (value.status !== "passed") throw new Error("FE validation evidence status is not passed.");
  if (value.frontendPacketPath !== expected.frontendPacketPath) throw new Error("Invalid frontend validation evidence: frontendPacketPath does not match input.");
  if (value.contractHash !== expected.contractHash) throw new Error("FE validation evidence contract hash does not match current contract.");
  if (asStringArray(value.validatedBehaviors).length === 0) throw new Error("Invalid frontend validation evidence: validatedBehaviors must not be empty.");
  if (asStringArray(value.commandsRun).length === 0) throw new Error("Invalid frontend validation evidence: commandsRun must not be empty.");
  if (!Array.isArray(value.knownGaps)) throw new Error("Invalid frontend validation evidence: knownGaps must be an array.");
  if (typeof value.completedAt !== "string" || Number.isNaN(Date.parse(value.completedAt))) throw new Error("Invalid frontend validation evidence: completedAt must be an ISO-8601 timestamp.");
  return value;
}

function nestedAllowedPaths(value: unknown): string[] {
  return isRecord(value) ? asStringArray(value.allowedPaths) : [];
}

function extractBackendAllowedPaths(contract: JsonRecord): string[] {
  return unique([
    ...asStringArray(contract.backendAllowedPaths),
    ...nestedAllowedPaths(contract.backend),
    ...nestedAllowedPaths(contract.backendImplementation),
    ...nestedAllowedPaths(contract.implementation),
  ]).map((pathValue) => assertSafeRelativePath(pathValue, "backend allowedPaths entry"));
}

function normalizeContract(value: unknown, expected: { initiativeId: string; sliceId: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid slice contract: expected object.");
  if (value.version !== 1) throw new Error("Invalid slice contract: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid slice contract: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid slice contract: sliceId must be ${expected.sliceId}.`);
  if (value.blockedReason !== null && value.blockedReason !== undefined) throw new Error("Invalid slice contract: blockedReason must be null before BE packet generation.");
  if (!Array.isArray(value.apiContract) || value.apiContract.length === 0) throw new Error("Invalid slice contract: apiContract must include backend API/data expectations.");
  if (!Array.isArray(value.errors) || value.errors.length === 0) throw new Error("Invalid slice contract: errors must include backend error expectations.");
  if (extractBackendAllowedPaths(value).length === 0) throw new Error("Invalid slice contract: backend allowedPaths must include at least one backend path boundary.");
  if (!Array.isArray(value.tddSeeds) || value.tddSeeds.length === 0) throw new Error("Invalid slice contract: tddSeeds must include backend TDD seed data.");
  const tddSeeds = value.tddSeeds.filter(isRecord);
  if (!tddSeeds.some((seed) => typeof seed.backendExpectation === "string" && seed.backendExpectation.trim().length > 0)) {
    throw new Error("Invalid slice contract: tddSeeds must include backendExpectation.");
  }
  const mockPlan = value.mockPlan;
  if (!isRecord(mockPlan) || asStringArray(mockPlan.seedData).length === 0) throw new Error("Invalid slice contract: mockPlan.seedData must include contract fixture seed data.");
  return value;
}

function normalizeSlicePlan(value: unknown, expected: { initiativeId: string; sliceId: string }): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid slice plan: expected object.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid slice plan: initiativeId must be ${expected.initiativeId}.`);
  if (!Array.isArray(value.slices)) throw new Error("Invalid slice plan: slices must be an array.");
  const slice = value.slices.find((entry) => isRecord(entry) && entry.sliceId === expected.sliceId);
  if (!isRecord(slice)) throw new Error(`Invalid slice plan: missing slice ${expected.sliceId}.`);
  const domains = asStringArray(slice.domains);
  const phaseOrder = asStringArray(slice.phaseOrder);
  const backendApplicable = slice.backendApplicable;
  const explicitlyBackend = domains.includes("backend") || backendApplicable === true;
  const inferredBackend = backendApplicable !== false && phaseOrder.includes("be_implementation");
  if (!explicitlyBackend && !inferredBackend) throw new Error("Slice is not backend-applicable; BE packet generation is blocked.");
  return slice;
}

function firstApiContract(contract: JsonRecord): JsonRecord {
  const entries = Array.isArray(contract.apiContract) ? contract.apiContract : [];
  const first = entries.find(isRecord);
  if (!first) throw new Error("Invalid slice contract: apiContract must contain at least one object.");
  return first;
}

function firstTddSeed(contract: JsonRecord): JsonRecord {
  const entries = Array.isArray(contract.tddSeeds) ? contract.tddSeeds : [];
  const first = entries.find(isRecord);
  if (!first) throw new Error("Invalid slice contract: tddSeeds must contain at least one object.");
  return first;
}

function tddSliceFromContract(contract: JsonRecord, contractPath: string, frontendEvidencePath: string): TddSlice {
  const api = firstApiContract(contract);
  const tddSeed = firstTddSeed(contract);
  const apiName = typeof api.name === "string" && api.name.trim() ? api.name.trim() : "slice backend API";
  const apiPath = typeof api.path === "string" && api.path.trim() ? api.path.trim() : "target backend boundary";
  const scenario = typeof tddSeed.scenario === "string" && tddSeed.scenario.trim() ? tddSeed.scenario.trim() : "FE-validated default scenario";
  const backendExpectation = typeof tddSeed.backendExpectation === "string" && tddSeed.backendExpectation.trim()
    ? tddSeed.backendExpectation.trim()
    : "return a contract-compliant response";
  const seedData = isRecord(contract.mockPlan) ? asStringArray(contract.mockPlan.seedData) : [];
  return {
    firstTracerBehavior: `Backend ${apiName} at ${apiPath} returns contract-compliant response for ${scenario}: ${backendExpectation}.`,
    publicInterface: "Target API endpoint, service method, handler, or module boundary declared by the BE worker before mutation.",
    testSurface: ["backend behavior test through public API/service boundary", "contract success/error behavior test"],
    boundaryDependencies: unique([contractPath, frontendEvidencePath, ...seedData.map((entry) => `contract fixture seed: ${entry}`)]),
    mockPlan: "Mock external systems only; use contract fixtures for request/response data.",
    outOfScopeBehaviors: unique(["frontend implementation", "screen design changes", ...asStringArray(contract.outOfScope)]),
  };
}

function errorCodesFromContract(contract: JsonRecord): string[] {
  const entries = Array.isArray(contract.errors) ? contract.errors : [];
  return unique(entries.flatMap((entry) => isRecord(entry) && typeof entry.code === "string" ? [entry.code] : []));
}

function authAssumptions(contract: JsonRecord): string[] {
  const entries = Array.isArray(contract.apiContract) ? contract.apiContract : [];
  return unique(entries.flatMap((entry) => isRecord(entry) && isRecord(entry.auth) ? asStringArray(entry.auth.assumptions) : []));
}

function buildAcceptanceCriteria(contract: JsonRecord): string[] {
  const errors = errorCodesFromContract(contract);
  return [
    "Implement backend behavior matching the current slice contract.",
    "Preserve frontend-validated contract expectations from FE validation evidence.",
    errors.length > 0 ? `Cover success and contract error cases, including: ${errors.join(", ")}.` : "Cover success and error cases defined by the contract.",
    "Do not change unrelated frontend behavior.",
    "Record API/handler wiring, auth/data/side-effect assumptions, and rollback or migration notes before completion.",
  ];
}

function buildGeneratedInput(args: {
  initiativeId: string;
  sliceId: string;
  frontendPacketPath: string;
  frontendEvidencePath: string;
  contractPath: string;
  slicePlanPath: string;
  contract: JsonRecord;
}) {
  const allowedPaths = extractBackendAllowedPaths(args.contract);
  const authNotes = authAssumptions(args.contract);
  return {
    sourceGoalId: `phase-9:${args.initiativeId}:${args.sliceId}:backend`,
    assignedTeam: "build" as const,
    assignedRole: "backend_worker" as const,
    title: `Implement backend slice ${args.sliceId} for ${args.initiativeId}`,
    goal: "Provide an actionable backend worker packet from FE validation evidence and the current slice contract.",
    scope: `Backend implementation for ${args.initiativeId}/${args.sliceId}; inspect FE packet, FE validation evidence, slice plan, and contract before mutation.`,
    nonGoals: ["Do not change unrelated frontend behavior.", "Do not create queue jobs, runtime tasks, worker sessions, or frontend packets.", "Do not widen beyond the contract-defined backend path boundaries."],
    workType: "implementation" as const,
    domains: ["backend" as const],
    filesToInspect: [args.contractPath, args.frontendPacketPath, args.frontendEvidencePath, args.slicePlanPath],
    filesToModify: allowedPaths,
    allowedPaths,
    discoverySummary: [
      "Phase 9 backend packet generator validated passed FE validation evidence, the Phase 8 frontend packet artifact, current slice contract, and backend-applicable slice plan.",
      "Artifact references are carried through existing task-packet fields; no first-class sliceArtifacts schema was added.",
      "Phase 7 backend_implementation routing lane was requested for this packet.",
    ],
    crossModelPlanningNote: "Phase 9 Draft A: additive BE packet helper reuses existing task-packet schema and Phase 7 routing fallback until requested backend models are verified.",
    acceptanceCriteria: buildAcceptanceCriteria(args.contract),
    evidenceExpectations: [
      "Backend unit/integration test output.",
      "API/handler wiring proof.",
      "Auth/data/side-effect assumptions noted.",
      "Migration or rollback note when applicable.",
      "Confirmation that unrelated frontend behavior was not changed.",
    ],
    validationExpectations: [
      "Run targeted backend behavior tests for the modified public API/service boundary.",
      "Run contract success/error tests for the slice API/data behavior.",
      "Run static/type checks required by the backend project surface.",
    ],
    expectedProof: [
      "Backend unit/integration test output.",
      "API/handler wiring proof.",
      "Auth/data/side-effect assumptions noted.",
      "Migration or rollback note when applicable.",
      authNotes.length > 0 ? `Auth assumptions from contract reviewed: ${authNotes.join("; ")}.` : "Auth assumptions reviewed and explicitly noted.",
    ],
    tddSlice: tddSliceFromContract(args.contract, args.contractPath, args.frontendEvidencePath),
    wiringChecks: [
      "Verify target API endpoint, service method, handler, or module boundary is wired through the public backend entrypoint.",
      "Verify frontend-validated request/response expectations are preserved.",
      "Verify success and error cases required by the contract are covered or explicitly scoped.",
      "Verify auth, data, side-effect, migration, and rollback assumptions are recorded.",
    ],
    migrationPathNote: "Phase 9 creates a preview task-packet artifact only; future scheduler consumption must add explicit queue gates before backend dispatch.",
    escalationInstructions: [
      "Escalate if contract backend paths are too broad or do not map to backend-owned code.",
      "Escalate if FE validation evidence and the current slice contract disagree.",
      "Escalate if frontend, schema, auth, migration, infra, or deployment scope expands unexpectedly.",
    ],
    dependencies: [args.contractPath, args.frontendPacketPath, args.frontendEvidencePath, args.slicePlanPath],
    routeReason: "task_harder" as const,
    budgetMode: "default" as const,
    phaseLane: "backend_implementation" as const,
  };
}

export async function generateBackendImplementationPacket(input: BackendPacketGeneratorInput, generatedAt = new Date().toISOString()): Promise<GeneratedBackendImplementationPacket> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(input.initiativeId);
  const sliceId = assertSliceId(input.sliceId);
  const defaults = defaultPaths(initiativeId, sliceId);
  const frontendPacketPath = assertSafeRelativePath(input.frontendPacketPath ?? defaults.frontendPacketPath, "frontendPacketPath");
  const frontendEvidencePath = assertSafeRelativePath(input.frontendEvidencePath ?? defaults.frontendEvidencePath, "frontendEvidencePath");
  const contractPath = assertSafeRelativePath(input.contractPath ?? defaults.contractPath, "contractPath");
  const slicePlanPath = assertSafeRelativePath(input.slicePlanPath ?? defaults.slicePlanPath, "slicePlanPath");
  const previewPaths = { jsonPath: defaults.jsonPath, markdownPath: defaults.markdownPath };

  const contractText = await readRequired(repoRoot, contractPath, "slice contract");
  const contractHash = sha256(contractText);
  const contract = normalizeContract(parseJson(contractText, "slice contract"), { initiativeId, sliceId });

  const frontendPacketText = await readRequired(repoRoot, frontendPacketPath, "frontend packet");
  normalizeFrontendPacket(parseJson(frontendPacketText, "frontend packet"), { initiativeId, sliceId, contractPath });

  const frontendEvidenceText = await readRequired(repoRoot, frontendEvidencePath, "frontend validation evidence");
  normalizeFrontendEvidence(parseJson(frontendEvidenceText, "frontend validation evidence"), { initiativeId, sliceId, frontendPacketPath, contractHash });

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
    buildGeneratedInput({ initiativeId, sliceId, frontendPacketPath, frontendEvidencePath, contractPath, slicePlanPath, contract }),
    generatedAt,
  );
  return {
    ...generated,
    repoRoot,
    initiativeId,
    sliceId,
    frontendPacketPath,
    frontendEvidencePath,
    contractPath,
    slicePlanPath,
    contractHash,
    previewPaths,
  };
}

export async function writeBackendPacketPreview(result: GeneratedBackendImplementationPacket): Promise<WrittenBackendPacketPreview> {
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
