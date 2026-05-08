import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type SliceContractStatus = "draft" | "ready_for_review" | "approved" | "blocked";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SliceContractSourceScreenArtifact {
  artifactPath: string;
  approvalPath: string;
  artifactHash: string;
}

export interface SliceContractUiState {
  screenId: string;
  states: string[];
  requiredData: string[];
  userActions: string[];
}

export interface SliceContractApiEntry {
  name: string;
  method: HttpMethod;
  path: string;
  request: {
    params: string[];
    bodyShape: Record<string, unknown>;
  };
  response: {
    successShape: Record<string, unknown>;
    errorShape: Record<string, unknown>;
  };
  auth: {
    required: boolean;
    assumptions: string[];
  };
}

export interface SliceContractErrorEntry {
  code: string;
  userMessage: string;
  httpStatus: number;
  uiState: string;
}

export interface SliceContractMockPlan {
  frontendMockSource: "contract_fixture";
  backendFakePlan: "handler_or_service_fake";
  seedData: string[];
}

export interface SliceContractTddSeed {
  scenario: string;
  frontendExpectation: string;
  backendExpectation: string;
}

export interface SliceContract {
  version: 1;
  initiativeId: string;
  sliceId: string;
  status: SliceContractStatus;
  sourceScreenArtifact: SliceContractSourceScreenArtifact;
  uiStateContract: SliceContractUiState[];
  apiContract: SliceContractApiEntry[];
  errors: SliceContractErrorEntry[];
  mockPlan: SliceContractMockPlan;
  tddSeeds: SliceContractTddSeed[];
  outOfScope: string[];
  nextAllowedPhase: "fe_implementation";
  blockedReason: string | null;
}

export interface GenerateSliceContractOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
}

export interface SliceContractResult {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  jsonPath: string;
  markdownPath: string;
  contractHash: string;
  contract: SliceContract;
  markdown: string;
}

interface LoadedScreenArtifact {
  artifactPath: string;
  approvalPath: string;
  artifactHash: string;
  artifact: Record<string, unknown>;
  approval: Record<string, unknown>;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort((a, b) => a.localeCompare(b));
}

function assertInitiativeSlug(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) throw new Error(`Invalid initiative slug: ${value}`);
  return trimmed;
}

function assertSliceId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("--slice is required.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) throw new Error(`Invalid slice id: ${value}`);
  return trimmed;
}

function paths(initiativeId: string, sliceId: string): { artifactPath: string; approvalPath: string; jsonPath: string; markdownPath: string; prdPath: string; backlogPath: string; slicePlanPath: string } {
  return {
    artifactPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`,
    approvalPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.approval.json`,
    jsonPath: `docs/initiatives/${initiativeId}/contracts/${sliceId}.contract.json`,
    markdownPath: `docs/initiatives/${initiativeId}/contracts/${sliceId}.contract.md`,
    prdPath: `docs/initiatives/${initiativeId}/prd.md`,
    backlogPath: `docs/initiatives/${initiativeId}/backlog.md`,
    slicePlanPath: `docs/initiatives/${initiativeId}/slice-plan.json`,
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

function parseBulletsUnderHeading(markdown: string, heading: RegExp): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start === -1) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) break;
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1] && bullet[1].trim() !== "-") values.push(bullet[1].trim());
  }
  return values;
}

function normalizeScreenArtifact(value: unknown, expected: { initiativeId: string; sliceId: string }): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid screen artifact: expected object.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid screen artifact: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid screen artifact: sliceId must be ${expected.sliceId}.`);
  if (value.mode !== "mock") throw new Error("Invalid screen artifact: mode must be mock.");
  if (value.nextAllowedPhase !== "screen_approval") throw new Error("Invalid screen artifact: nextAllowedPhase must be screen_approval.");
  if (!Array.isArray(value.screens) || value.screens.length === 0) throw new Error("Invalid screen artifact: screens must contain at least one screen.");
  const constraints = value.constraints;
  if (!isRecord(constraints) || constraints.liveStitchCalled !== false || constraints.taskPacketsCreated !== false || constraints.queueJobsCreated !== false) {
    throw new Error("Invalid screen artifact: constraints must prove no live Stitch, task packets, or queue jobs were created.");
  }
  return value;
}

function normalizeApproval(value: unknown, expected: { initiativeId: string; sliceId: string; artifactPath: string; artifactHash: string }): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid screen artifact approval: expected object.");
  if (value.version !== 1) throw new Error("Invalid screen artifact approval: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid screen artifact approval: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid screen artifact approval: sliceId must be ${expected.sliceId}.`);
  if (value.artifactPath !== expected.artifactPath) throw new Error("Invalid screen artifact approval: artifactPath does not match initiative/slice.");
  if (value.decision !== "approved") throw new Error("Screen artifact approval is not approved.");
  if (value.artifactHash !== expected.artifactHash) throw new Error("Stale screen artifact approval: artifact hash differs from current artifact hash.");
  if (value.nextAllowedPhase !== "fe_implementation") throw new Error("Invalid screen artifact approval: nextAllowedPhase must be fe_implementation.");
  return value;
}

async function loadApprovedScreenArtifact(repoRoot: string, initiativeId: string, sliceId: string): Promise<LoadedScreenArtifact> {
  const { artifactPath, approvalPath } = paths(initiativeId, sliceId);
  const artifactText = await readRequired(repoRoot, artifactPath, "screen artifact");
  const artifactHash = sha256(artifactText);
  const artifact = normalizeScreenArtifact(parseJson(artifactText, "screen artifact"), { initiativeId, sliceId });
  const approvalText = await readRequired(repoRoot, approvalPath, "screen artifact approval");
  const approval = normalizeApproval(parseJson(approvalText, "screen artifact approval"), { initiativeId, sliceId, artifactPath, artifactHash });
  return { artifactPath, approvalPath, artifactHash, artifact, approval };
}

async function loadPlanningContext(repoRoot: string, initiativeId: string, sliceId: string): Promise<{ outOfScope: string[] }> {
  const { prdPath, backlogPath, slicePlanPath } = paths(initiativeId, sliceId);
  const prd = await readRequired(repoRoot, prdPath, "initiative PRD");
  await readRequired(repoRoot, backlogPath, "initiative backlog");
  const rawSlicePlan = parseJson(await readRequired(repoRoot, slicePlanPath, "initiative slice plan"), "slice plan");
  if (!isRecord(rawSlicePlan)) throw new Error("Invalid slice plan: expected object.");
  if (rawSlicePlan.initiativeId !== initiativeId) throw new Error(`Invalid slice plan: initiativeId must be ${initiativeId}.`);
  if (!Array.isArray(rawSlicePlan.slices)) throw new Error("Invalid slice plan: slices must be an array.");
  const matchingSlice = rawSlicePlan.slices.find((entry) => isRecord(entry) && entry.sliceId === sliceId);
  if (!matchingSlice) throw new Error(`Invalid slice plan: missing slice ${sliceId}.`);
  return { outOfScope: parseBulletsUnderHeading(prd, /^##\s+Out\s+Of\s+Scope$/i) };
}

function buildUiStateContract(artifact: Record<string, unknown>): SliceContractUiState[] {
  const screens = Array.isArray(artifact.screens) ? artifact.screens : [];
  return screens.map((screen, index) => {
    const record = isRecord(screen) ? screen : {};
    const screenId = typeof record.screenId === "string" && record.screenId.trim().length > 0 ? record.screenId.trim() : `${artifact.sliceId}-screen-${index + 1}`;
    const states = asStringArray(record.states);
    return {
      screenId,
      states: states.length > 0 ? states : ["default", "loading", "empty", "error"],
      requiredData: unique(asStringArray(record.dataNeeds)),
      userActions: unique(asStringArray(record.userActions)),
    };
  });
}

function buildApiContract(initiativeId: string, sliceId: string, requiredData: string[]): SliceContractApiEntry[] {
  return [
    {
      name: "sliceScopedEndpoint",
      method: "GET",
      path: `/api/initiatives/${initiativeId}/slices/${sliceId}`,
      request: {
        params: ["initiativeId", "sliceId"],
        bodyShape: {},
      },
      response: {
        successShape: {
          viewModel: "slice_scoped_view_model",
          requiredData,
        },
        errorShape: {
          code: "string",
          message: "string",
        },
      },
      auth: {
        required: false,
        assumptions: ["Auth requirements are unset by Phase 6 and must be confirmed before backend implementation if the slice handles protected data."],
      },
    },
  ];
}

export function renderSliceContractMarkdown(contract: SliceContract): string {
  const lines = [
    `# Slice Contract: ${contract.initiativeId} / ${contract.sliceId}`,
    "",
    `- Status: ${contract.status}`,
    `- Source artifact: ${contract.sourceScreenArtifact.artifactPath}`,
    `- Source approval: ${contract.sourceScreenArtifact.approvalPath}`,
    `- Source artifact hash: ${contract.sourceScreenArtifact.artifactHash}`,
    `- Next allowed phase: ${contract.nextAllowedPhase}`,
    `- Blocked reason: ${contract.blockedReason ?? "none"}`,
    "",
    "## UI State Contract",
  ];
  for (const entry of contract.uiStateContract) {
    lines.push("", `### ${entry.screenId}`, "- States:", ...entry.states.map((state) => `  - ${state}`), "- Required data:", ...(entry.requiredData.length > 0 ? entry.requiredData.map((data) => `  - ${data}`) : ["  - none"]), "- User actions:", ...(entry.userActions.length > 0 ? entry.userActions.map((action) => `  - ${action}`) : ["  - none"]));
  }
  lines.push("", "## API Contract");
  for (const entry of contract.apiContract) {
    lines.push("", `### ${entry.name}`, `- Method/path: ${entry.method} ${entry.path}`, `- Params: ${entry.request.params.join(", ") || "none"}`, `- Auth required: ${entry.auth.required}`, "- Auth assumptions:", ...entry.auth.assumptions.map((assumption) => `  - ${assumption}`));
  }
  lines.push("", "## Errors", ...contract.errors.map((entry) => `- ${entry.code} (${entry.httpStatus}, ${entry.uiState}): ${entry.userMessage}`));
  lines.push("", "## Mock Plan", `- Frontend mock source: ${contract.mockPlan.frontendMockSource}`, `- Backend fake plan: ${contract.mockPlan.backendFakePlan}`, "- Seed data:", ...(contract.mockPlan.seedData.length > 0 ? contract.mockPlan.seedData.map((seed) => `  - ${seed}`) : ["  - none"]));
  lines.push("", "## TDD Seeds", ...contract.tddSeeds.map((seed) => `- ${seed.scenario}: FE=${seed.frontendExpectation} BE=${seed.backendExpectation}`));
  lines.push("", "## Out of Scope", ...(contract.outOfScope.length > 0 ? contract.outOfScope.map((item) => `- ${item}`) : ["- none"]));
  return `${lines.join("\n")}\n`;
}

export async function generateSliceContract(options: GenerateSliceContractOptions): Promise<SliceContractResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(options.initiative);
  const sliceId = assertSliceId(options.sliceId);
  const loaded = await loadApprovedScreenArtifact(repoRoot, initiativeId, sliceId);
  const planningContext = await loadPlanningContext(repoRoot, initiativeId, sliceId);
  const { jsonPath, markdownPath } = paths(initiativeId, sliceId);
  const uiStateContract = buildUiStateContract(loaded.artifact);
  const requiredData = unique(uiStateContract.flatMap((entry) => entry.requiredData));
  const contract: SliceContract = {
    version: 1,
    initiativeId,
    sliceId,
    status: "ready_for_review",
    sourceScreenArtifact: {
      artifactPath: loaded.artifactPath,
      approvalPath: loaded.approvalPath,
      artifactHash: loaded.artifactHash,
    },
    uiStateContract,
    apiContract: buildApiContract(initiativeId, sliceId, requiredData),
    errors: [
      {
        code: "SLICE_CONTRACT_UNAVAILABLE",
        userMessage: "We could not load this screen. Please try again.",
        httpStatus: 500,
        uiState: "error",
      },
    ],
    mockPlan: {
      frontendMockSource: "contract_fixture",
      backendFakePlan: "handler_or_service_fake",
      seedData: requiredData,
    },
    tddSeeds: uiStateContract.map((entry) => ({
      scenario: `${entry.screenId} default state renders returned data`,
      frontendExpectation: `Render ${entry.screenId} default state using the contract fixture and handle loading, empty, and error states.`,
      backendExpectation: `Return data matching ${entry.screenId} requiredData from ${sliceId} handler/service fake.`,
    })),
    outOfScope: unique(planningContext.outOfScope),
    nextAllowedPhase: "fe_implementation",
    blockedReason: null,
  };
  const contractJson = `${JSON.stringify(contract, null, 2)}\n`;
  return {
    repoRoot,
    initiativeId,
    sliceId,
    jsonPath,
    markdownPath,
    contractHash: sha256(contractJson),
    contract,
    markdown: renderSliceContractMarkdown(contract),
  };
}

export async function writeSliceContractArtifacts(result: SliceContractResult): Promise<string[]> {
  const jsonAbs = join(result.repoRoot, result.jsonPath);
  const markdownAbs = join(result.repoRoot, result.markdownPath);
  await mkdir(dirname(jsonAbs), { recursive: true });
  await writeFile(jsonAbs, `${JSON.stringify(result.contract, null, 2)}\n`, "utf8");
  await writeFile(markdownAbs, result.markdown, "utf8");
  return [result.jsonPath, result.markdownPath];
}
