import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { parseProductSlicePlan, type ProductSlicePlan } from "./product-slice-lifecycle.ts";

export const REQUIRED_STITCH_PROMPT_SECTIONS = [
  "product_context",
  "slice_goal",
  "target_screens",
  "screen_states",
  "data_needs",
  "accessibility",
  "constraints",
  "out_of_scope",
] as const;

export type StitchPromptStatus = "draft" | "ready_for_review" | "blocked";

export interface StitchPromptSources {
  intakePath: string;
  prdPath: string;
  backlogPath: string;
  slicePlanPath: string;
}

export interface StitchPromptSourceHashes {
  intake: string;
  prd: string;
  backlog: string;
  slicePlan: string;
}

export interface StitchPromptMetadata {
  version: 1;
  initiativeId: string;
  sliceId: string;
  phase: "stitch_prompt";
  status: StitchPromptStatus;
  promptPath: string;
  promptHash: string;
  sources: StitchPromptSources;
  sourceHashes: StitchPromptSourceHashes;
  targetScreens: string[];
  requiredPromptSections: string[];
  nextAllowedPhase: "stitch_generation";
  nextBlockedUntil: "human_prompt_review";
}

export interface GenerateStitchPromptOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
  allowNonUi?: boolean;
}

export interface StitchPromptResult {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  promptPath: string;
  metadataPath: string;
  prompt: string;
  metadata: StitchPromptMetadata;
}

interface RawSlice {
  sliceId?: unknown;
  title?: unknown;
  type?: unknown;
  status?: unknown;
  currentPhase?: unknown;
  blockedReason?: unknown;
  dependencies?: unknown;
  userStories?: unknown;
  whatToBuild?: unknown;
  acceptanceCriteria?: unknown;
  validationProof?: unknown;
  likelyFilesOrDomains?: unknown;
  domains?: unknown;
  targetScreens?: unknown;
  screenStates?: unknown;
  dataNeeds?: unknown;
  accessibility?: unknown;
  constraints?: unknown;
  existingUiReuse?: unknown;
  outOfScope?: unknown;
  ui?: unknown;
  uiFacing?: unknown;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function relSources(initiative: string): StitchPromptSources {
  const base = `docs/initiatives/${initiative}`;
  return {
    intakePath: `${base}/intake.json`,
    prdPath: `${base}/prd.md`,
    backlogPath: `${base}/backlog.md`,
    slicePlanPath: `${base}/slice-plan.json`,
  };
}

async function readRequired(repoRoot: string, relPath: string): Promise<string> {
  try {
    return await readFile(join(repoRoot, relPath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing required Stitch prompt source: ${relPath}`);
    }
    throw error;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function firstLines(markdown: string, maxLines: number): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

function findRawSlice(rawPlan: unknown, sliceId: string): RawSlice {
  if (typeof rawPlan !== "object" || rawPlan === null || !Array.isArray((rawPlan as { slices?: unknown }).slices)) {
    throw new Error("Invalid product slice plan: slices must be an array.");
  }
  const found = (rawPlan as { slices: RawSlice[] }).slices.find((slice) => slice.sliceId === sliceId);
  if (!found) throw new Error(`Slice not found in slice-plan.json: ${sliceId}`);
  return found;
}

function isUiFacingSlice(rawSlice: RawSlice): boolean {
  if (rawSlice.ui === true || rawSlice.uiFacing === true) return true;
  if (stringArray(rawSlice.targetScreens).length > 0) return true;
  if (stringArray(rawSlice.domains).some((domain) => domain.toLowerCase() === "frontend")) return true;
  if (stringArray(rawSlice.likelyFilesOrDomains).some((entry) => /\b(ui|ux|frontend|screen|page|component)\b/i.test(entry))) return true;
  const title = optionalString(rawSlice.title) ?? "";
  return /\b(ui|ux|screen|page|frontend|component|view)\b/i.test(title);
}

function bulletList(values: string[], fallback: string): string[] {
  const source = values.length > 0 ? values : [fallback];
  return source.map((value) => `- ${value}`);
}

function screenStates(rawSlice: RawSlice): string[] {
  const custom = stringArray(rawSlice.screenStates);
  const states = custom.length > 0 ? custom : ["default", "loading", "empty", "error", "success"];
  return states.map((state) => `- ${state}`);
}

function renderPrompt(input: {
  initiativeId: string;
  rawSlice: RawSlice;
  targetScreens: string[];
  intake: string;
  prd: string;
  backlog: string;
}): string {
  const title = optionalString(input.rawSlice.title) ?? input.rawSlice.sliceId as string;
  const userStories = stringArray(input.rawSlice.userStories);
  const whatToBuild = optionalString(input.rawSlice.whatToBuild) ?? title;
  const dataNeeds = stringArray(input.rawSlice.dataNeeds);
  const accessibility = stringArray(input.rawSlice.accessibility);
  const constraints = stringArray(input.rawSlice.constraints);
  const existingUiReuse = stringArray(input.rawSlice.existingUiReuse);
  const outOfScope = stringArray(input.rawSlice.outOfScope);
  const acceptanceCriteria = stringArray(input.rawSlice.acceptanceCriteria);

  const lines = [
    `# Stitch Prompt: ${input.initiativeId} / ${input.rawSlice.sliceId}`,
    "",
    "## Product context",
    ...bulletList(firstLines(input.prd, 4), "Use the linked PRD and backlog as product context for this slice only."),
    ...bulletList(firstLines(input.backlog, 3), "Use the approved vertical-slice backlog as scope context."),
    "",
    "## Slice goal",
    `- ${whatToBuild}`,
    "",
    "## User stories covered",
    ...bulletList(userStories, "No explicit user stories were listed; derive only from this slice title and PRD context."),
    "",
    "## Target screens",
    ...bulletList(input.targetScreens, "One slice-scoped UI screen for this product slice."),
    "",
    "## Screen states",
    ...screenStates(input.rawSlice),
    "",
    "## Data needs and mocked data assumptions",
    ...bulletList(dataNeeds, "Use mocked data only for UI generation; do not invent backend behavior or persistence."),
    "",
    "## Accessibility expectations",
    ...bulletList(accessibility, "Include keyboard-accessible controls, visible focus states, semantic headings, and readable error text."),
    "",
    "## Visual/design constraints",
    ...bulletList(constraints, "Prefer existing product visual language and avoid introducing unrelated design systems."),
    "",
    "## Existing UI/design-system reuse notes",
    ...bulletList(existingUiReuse, "Reuse existing UI patterns when visible in supplied context; do not create implementation code."),
    "",
    "## Acceptance signals",
    ...bulletList(acceptanceCriteria, "The generated screen clearly demonstrates this slice goal and states."),
    "",
    "## Out-of-scope behaviors",
    ...bulletList(outOfScope, "Anything outside this slice, backend/API behavior, persistence, auth, deployment, and production code implementation."),
    "",
    "## Explicit Stitch instructions",
    "- Generate screens only for this slice.",
    "- Do not invent backend behavior.",
    "- Do not implement code.",
    "- Do not generate task packets or queue jobs.",
    "- Do not call live services from this prompt.",
    "",
  ];
  void input.intake;
  return `${lines.join("\n").replace(/[ \t]+$/gm, "")}\n`;
}

function assertPriorPhaseReady(plan: ProductSlicePlan, sliceId: string): void {
  if (plan.status !== "ready") throw new Error(`Product slice plan is not ready: status is ${plan.status}.`);
  const slice = plan.slices.find((entry) => entry.sliceId === sliceId);
  if (!slice) throw new Error(`Slice not found in validated slice plan: ${sliceId}`);
  if (slice.status === "blocked") throw new Error(`Slice is blocked: ${slice.blockedReason ?? sliceId}`);
  if (slice.currentPhase !== "stitch_prompt") throw new Error(`Slice is not ready for stitch_prompt: currentPhase is ${slice.currentPhase}.`);
}

export async function generateStitchPrompt(options: GenerateStitchPromptOptions): Promise<StitchPromptResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeId = options.initiative.trim();
  const sliceId = options.sliceId.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(initiativeId)) throw new Error(`Invalid initiative slug: ${options.initiative}`);
  if (sliceId.length === 0) throw new Error("--slice is required.");

  const sources = relSources(initiativeId);
  const [intake, prd, backlog, slicePlanText] = await Promise.all([
    readRequired(repoRoot, sources.intakePath),
    readRequired(repoRoot, sources.prdPath),
    readRequired(repoRoot, sources.backlogPath),
    readRequired(repoRoot, sources.slicePlanPath),
  ]);

  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(slicePlanText);
  } catch (error) {
    throw new Error(`Invalid product slice plan JSON: ${(error as Error).message}`);
  }
  const plan = parseProductSlicePlan(rawPlan);
  assertPriorPhaseReady(plan, sliceId);
  const rawSlice = findRawSlice(rawPlan, sliceId);
  if (!isUiFacingSlice(rawSlice) && !options.allowNonUi) {
    throw new Error(`Slice is not UI-facing: ${sliceId}. Pass --allow-non-ui to generate a prompt anyway.`);
  }

  const targetScreens = stringArray(rawSlice.targetScreens);
  const promptPath = `docs/initiatives/${initiativeId}/stitch-prompts/${sliceId}.prompt.md`;
  const metadataPath = `docs/initiatives/${initiativeId}/stitch-prompts/${sliceId}.prompt.json`;
  const prompt = renderPrompt({ initiativeId, rawSlice, targetScreens, intake, prd, backlog });
  const metadata: StitchPromptMetadata = {
    version: 1,
    initiativeId,
    sliceId,
    phase: "stitch_prompt",
    status: "draft",
    promptPath,
    promptHash: sha256(prompt),
    sources,
    sourceHashes: {
      intake: sha256(intake),
      prd: sha256(prd),
      backlog: sha256(backlog),
      slicePlan: sha256(slicePlanText),
    },
    targetScreens,
    requiredPromptSections: [...REQUIRED_STITCH_PROMPT_SECTIONS],
    nextAllowedPhase: "stitch_generation",
    nextBlockedUntil: "human_prompt_review",
  };

  return { repoRoot, initiativeId, sliceId, promptPath, metadataPath, prompt, metadata };
}

export async function writeStitchPromptArtifacts(result: StitchPromptResult): Promise<string[]> {
  const promptAbs = join(result.repoRoot, result.promptPath);
  const metadataAbs = join(result.repoRoot, result.metadataPath);
  await mkdir(dirname(promptAbs), { recursive: true });
  await writeFile(promptAbs, result.prompt, "utf8");
  await writeFile(metadataAbs, `${JSON.stringify(result.metadata, null, 2)}\n`, "utf8");
  return [result.promptPath, result.metadataPath];
}
