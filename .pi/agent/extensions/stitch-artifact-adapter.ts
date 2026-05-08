import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type StitchScreenArtifactStatus = "generated_mock" | "blocked";

export interface StitchScreenArtifactSourcePrompt {
  promptPath: string;
  promptMetadataPath: string;
  promptHash: string;
}

export interface StitchScreenArtifactScreen {
  screenId: string;
  name: string;
  purpose: string;
  states: string[];
  dataNeeds: string[];
  accessibilityNotes: string[];
  mockOnly: true;
}

export interface StitchScreenArtifact {
  version: 1;
  initiativeId: string;
  sliceId: string;
  artifactId: string;
  mode: "mock";
  phase: "stitch_generation";
  status: StitchScreenArtifactStatus;
  sourcePrompt: StitchScreenArtifactSourcePrompt;
  screens: StitchScreenArtifactScreen[];
  constraints: {
    liveStitchCalled: false;
    taskPacketsCreated: false;
    queueJobsCreated: false;
  };
  nextAllowedPhase: "screen_approval";
  nextBlockedUntil: "human_artifact_review";
}

export interface GenerateMockStitchArtifactOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
}

export interface MockStitchArtifactResult {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  jsonPath: string;
  markdownPath: string;
  artifact: StitchScreenArtifact;
  markdown: string;
}

interface PromptMetadata {
  version?: unknown;
  initiativeId?: unknown;
  sliceId?: unknown;
  phase?: unknown;
  promptPath?: unknown;
  promptHash?: unknown;
  sources?: unknown;
  sourceHashes?: unknown;
  targetScreens?: unknown;
}

type PromptSourceKey = "intake" | "prd" | "backlog" | "slicePlan";

const SOURCE_PATH_KEYS: Record<PromptSourceKey, string> = {
  intake: "intakePath",
  prd: "prdPath",
  backlog: "backlogPath",
  slicePlan: "slicePlanPath",
};

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
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

async function readRequired(repoRoot: string, relPath: string, label: string): Promise<string> {
  try {
    return await readFile(join(repoRoot, relPath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing required Stitch artifact ${label}: ${relPath}`);
    }
    throw error;
  }
}

function normalizeMetadata(value: unknown, expected: { initiativeId: string; sliceId: string; metadataPath: string }): Required<Pick<PromptMetadata, "promptPath" | "promptHash" | "sources" | "sourceHashes">> & { targetScreens: string[] } {
  if (!isRecord(value)) throw new Error("Invalid Stitch prompt metadata: expected object.");
  if (value.version !== 1) throw new Error("Invalid Stitch prompt metadata: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid Stitch prompt metadata: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid Stitch prompt metadata: sliceId must be ${expected.sliceId}.`);
  if (value.phase !== "stitch_prompt") throw new Error("Invalid Stitch prompt metadata: phase must be stitch_prompt.");
  if (typeof value.promptPath !== "string" || value.promptPath.trim().length === 0) {
    throw new Error("Invalid Stitch prompt metadata: promptPath is required.");
  }
  if (typeof value.promptHash !== "string" || !/^[a-f0-9]{64}$/.test(value.promptHash)) {
    throw new Error("Invalid Stitch prompt metadata: promptHash is required.");
  }
  if (!isRecord(value.sources)) throw new Error("Invalid Stitch prompt metadata: sources is required.");
  if (!isRecord(value.sourceHashes)) throw new Error("Invalid Stitch prompt metadata: sourceHashes is required.");

  return {
    promptPath: value.promptPath,
    promptHash: value.promptHash,
    sources: value.sources,
    sourceHashes: value.sourceHashes,
    targetScreens: stringArray(value.targetScreens),
  };
}

async function assertSourceHashesFresh(repoRoot: string, metadata: { sources: unknown; sourceHashes: unknown }): Promise<void> {
  if (!isRecord(metadata.sources) || !isRecord(metadata.sourceHashes)) throw new Error("Invalid Stitch prompt metadata: sources/sourceHashes are required.");

  for (const key of Object.keys(SOURCE_PATH_KEYS) as PromptSourceKey[]) {
    const pathKey = SOURCE_PATH_KEYS[key];
    const relPath = metadata.sources[pathKey];
    const expectedHash = metadata.sourceHashes[key];
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
      throw new Error(`Invalid Stitch prompt metadata: sources.${pathKey} is required.`);
    }
    if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw new Error(`Invalid Stitch prompt metadata: sourceHashes.${key} is required.`);
    }
    const actualHash = sha256(await readRequired(repoRoot, relPath, `source file for ${key}`));
    if (actualHash !== expectedHash) {
      throw new Error(`Stale Stitch prompt source hash for ${key}: expected ${expectedHash}, actual ${actualHash}.`);
    }
  }
}

function parsePromptSection(prompt: string, heading: RegExp): string[] {
  const lines = prompt.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start === -1) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) break;
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) values.push(bullet[1].trim());
  }
  return values;
}

function slugifyScreenId(value: string, fallback: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : fallback;
}

function buildScreens(sliceId: string, targetScreens: string[], prompt: string): StitchScreenArtifactScreen[] {
  const names = targetScreens.length > 0 ? targetScreens : parsePromptSection(prompt, /^##\s+Target screens$/i);
  const screenNames = names.length > 0 ? names : ["Primary screen"];
  const states = parsePromptSection(prompt, /^##\s+Screen states$/i);
  const dataNeeds = parsePromptSection(prompt, /^##\s+Data needs and mocked data assumptions$/i);
  const accessibilityNotes = parsePromptSection(prompt, /^##\s+Accessibility expectations$/i);

  return screenNames.map((name, index) => ({
    screenId: screenNames.length === 1 && index === 0 ? `${sliceId}-primary` : `${sliceId}-${slugifyScreenId(name, `screen-${index + 1}`)}`,
    name,
    purpose: "Derived from Phase 3 Stitch prompt target screens.",
    states: states.length > 0 ? states : ["default", "loading", "empty", "error"],
    dataNeeds,
    accessibilityNotes,
    mockOnly: true,
  }));
}

export function renderMockStitchArtifactMarkdown(artifact: StitchScreenArtifact): string {
  const lines = [
    `# Mock Screen Artifact: ${artifact.initiativeId} / ${artifact.sliceId}`,
    "",
    `- Artifact ID: ${artifact.artifactId}`,
    `- Mode: ${artifact.mode}`,
    `- Status: ${artifact.status}`,
    `- Source prompt: ${artifact.sourcePrompt.promptPath}`,
    `- Source prompt hash: ${artifact.sourcePrompt.promptHash}`,
    `- Live Stitch called: ${artifact.constraints.liveStitchCalled}`,
    `- Task packets created: ${artifact.constraints.taskPacketsCreated}`,
    `- Queue jobs created: ${artifact.constraints.queueJobsCreated}`,
    `- Next allowed phase: ${artifact.nextAllowedPhase}`,
    `- Next blocked until: ${artifact.nextBlockedUntil}`,
    "",
    "## Screens",
  ];
  for (const screen of artifact.screens) {
    lines.push("", `### ${screen.name}`, `- Screen ID: ${screen.screenId}`, `- Purpose: ${screen.purpose}`, `- Mock only: ${screen.mockOnly}`, "- States:");
    lines.push(...screen.states.map((state) => `  - ${state}`));
    lines.push("- Data needs:");
    lines.push(...(screen.dataNeeds.length > 0 ? screen.dataNeeds.map((need) => `  - ${need}`) : ["  - none"]));
    lines.push("- Accessibility notes:");
    lines.push(...(screen.accessibilityNotes.length > 0 ? screen.accessibilityNotes.map((note) => `  - ${note}`) : ["  - none"]));
  }
  return `${lines.join("\n")}\n`;
}

export async function generateMockStitchArtifact(options: GenerateMockStitchArtifactOptions): Promise<MockStitchArtifactResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(options.initiative);
  const sliceId = assertSliceId(options.sliceId);
  const promptMetadataPath = `docs/initiatives/${initiativeId}/stitch-prompts/${sliceId}.prompt.json`;
  const metadataText = await readRequired(repoRoot, promptMetadataPath, "prompt metadata");
  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(metadataText);
  } catch (error) {
    throw new Error(`Invalid Stitch prompt metadata JSON: ${(error as Error).message}`);
  }
  const metadata = normalizeMetadata(rawMetadata, { initiativeId, sliceId, metadataPath: promptMetadataPath });
  await assertSourceHashesFresh(repoRoot, metadata);

  const promptPath = metadata.promptPath;
  const expectedPromptPath = `docs/initiatives/${initiativeId}/stitch-prompts/${sliceId}.prompt.md`;
  if (promptPath !== expectedPromptPath) {
    throw new Error(`Invalid Stitch prompt metadata: promptPath must be ${expectedPromptPath}.`);
  }
  const prompt = await readRequired(repoRoot, promptPath, "prompt markdown");
  const promptHash = sha256(prompt);
  if (promptHash !== metadata.promptHash) {
    throw new Error(`Stale Stitch prompt hash: expected ${metadata.promptHash}, actual ${promptHash}.`);
  }
  const jsonPath = `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`;
  const markdownPath = `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.md`;
  const artifact: StitchScreenArtifact = {
    version: 1,
    initiativeId,
    sliceId,
    artifactId: `mock-screen-${sliceId}-v1`,
    mode: "mock",
    phase: "stitch_generation",
    status: "generated_mock",
    sourcePrompt: {
      promptPath,
      promptMetadataPath,
      promptHash,
    },
    screens: buildScreens(sliceId, metadata.targetScreens, prompt),
    constraints: {
      liveStitchCalled: false,
      taskPacketsCreated: false,
      queueJobsCreated: false,
    },
    nextAllowedPhase: "screen_approval",
    nextBlockedUntil: "human_artifact_review",
  };
  return {
    repoRoot,
    initiativeId,
    sliceId,
    jsonPath,
    markdownPath,
    artifact,
    markdown: renderMockStitchArtifactMarkdown(artifact),
  };
}

export async function writeMockStitchArtifactArtifacts(result: MockStitchArtifactResult): Promise<string[]> {
  const jsonAbs = join(result.repoRoot, result.jsonPath);
  const markdownAbs = join(result.repoRoot, result.markdownPath);
  await mkdir(dirname(jsonAbs), { recursive: true });
  await writeFile(jsonAbs, `${JSON.stringify(result.artifact, null, 2)}\n`, "utf8");
  await writeFile(markdownAbs, result.markdown, "utf8");
  return [result.jsonPath, result.markdownPath];
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function stitchArtifactAdapterExtension(): void {}
