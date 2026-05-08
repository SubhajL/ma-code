import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { PRODUCT_SLICE_PHASE_ORDER, type ProductSlicePhase } from "./product-slice-lifecycle.ts";

const execFile = promisify(execFileCallback);

export const PRODUCT_PIPELINE_PHASE_ORDER = [...PRODUCT_SLICE_PHASE_ORDER] as const;

export type ProductPipelineMode = "dry_run" | "apply";
export type ProductPipelineAction = "dry_run" | "apply" | "status" | "approve" | "reject";
export type ProductPipelineStatus = "planned" | "blocked" | "waiting_for_human" | "materialized" | "in_progress" | "done" | "failed";
export type ProductPipelineSliceStatus = "planned" | "blocked" | "ready" | "materialized" | "in_progress" | "done" | "failed";

export interface ProductPipelineHitlGate {
  type: string;
  status: "waiting_for_human" | "approved" | "rejected" | "resolved" | "blocked" | string;
  summary: string;
  artifactPath?: string;
  approvalRef?: string | null;
}

export interface ProductPipelineSliceArtifacts {
  screenApproval?: string;
  contract?: string;
  frontendPacket?: string;
  backendPacket?: string;
  [key: string]: string | undefined;
}

export interface ProductPipelineSlicePlan {
  sliceId: string;
  title?: string;
  status: ProductPipelineSliceStatus;
  currentPhase: ProductSlicePhase;
  phaseOrder: ProductSlicePhase[];
  artifacts: ProductPipelineSliceArtifacts;
  hitlGate: ProductPipelineHitlGate | null;
  blockers: string[];
}

export interface ProductPipelineParallelDecision {
  sliceIds: string[];
  parallelAllowed: boolean;
  blockers: string[];
  source?: string;
}

export interface ProductPipelinePlan {
  version: 1;
  initiativeId: string;
  maxParallelSlices?: number;
  slices: ProductPipelineSlicePlan[];
  parallelDecisions?: ProductPipelineParallelDecision[];
}

export interface ProductPipelineDagEdge {
  from: ProductSlicePhase;
  to: ProductSlicePhase;
}

export interface ProductPipelineSliceDag {
  sliceId: string;
  currentPhase: ProductSlicePhase;
  nodes: ProductSlicePhase[];
  edges: ProductPipelineDagEdge[];
}

export interface ProductPipelineMaterializedWork {
  queueJobIds: string[];
  workerSessionIds: string[];
  worktreePaths: string[];
}

export interface ProductPipelineLastAction {
  action: ProductPipelineAction;
  at: string;
  summary: string;
}

export interface ProductPipelineRun {
  version: 1;
  runId: string;
  initiativeId: string;
  mode: ProductPipelineMode;
  status: ProductPipelineStatus;
  maxParallelSlices: number;
  slices: ProductPipelineSlicePlan[];
  sliceDag: ProductPipelineSliceDag[];
  parallelDecisions: ProductPipelineParallelDecision[];
  materializedWork: ProductPipelineMaterializedWork;
  blockedSlices: Array<{ sliceId: string; blockers: string[] }>;
  activeLanes: string[];
  nextOperatorAction: string;
  lastAction: ProductPipelineLastAction;
}

export interface BuildProductPipelineRunInput {
  plan: ProductPipelinePlan;
  mode: ProductPipelineMode;
  runId?: string;
  now?: string;
  maxParallelSlices?: number;
}

export interface LoadProductPipelinePlanInput {
  repoRoot?: string;
  initiativeId: string;
}

export interface WriteProductPipelineRunInput {
  repoRoot?: string;
  run: ProductPipelineRun;
}

export interface ComputeNextReadySlicesResult {
  readySliceIds: string[];
  blockers: string[];
  activeSliceIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function assertInitiativeSlug(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) throw new Error(`Invalid initiative slug: ${value}`);
  return trimmed;
}

function assertSafeRelativePath(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("\\") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe repo-relative path: ${pathValue}`);
  }
  return trimmed;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${(error as Error).message}`);
  }
}

function isPhase(value: unknown): value is ProductSlicePhase {
  return typeof value === "string" && (PRODUCT_PIPELINE_PHASE_ORDER as readonly string[]).includes(value);
}

function normalizeHitlGate(value: unknown): ProductPipelineHitlGate | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return { type: "human_approval", status: "waiting_for_human", summary: value };
  if (!isRecord(value)) throw new Error("hitlGate must be null, string, or object.");
  const type = typeof value.type === "string" && value.type.trim() ? value.type.trim() : "human_approval";
  const status = typeof value.status === "string" && value.status.trim() ? value.status.trim() : "waiting_for_human";
  const summary = typeof value.summary === "string" && value.summary.trim() ? value.summary.trim() : `Awaiting ${type}`;
  const artifactPath = typeof value.artifactPath === "string" ? assertSafeRelativePath(value.artifactPath) : undefined;
  const approvalRef = value.approvalRef === null || typeof value.approvalRef === "string" ? value.approvalRef as string | null : undefined;
  return { type, status, summary, artifactPath, approvalRef };
}

function normalizeArtifacts(value: unknown): ProductPipelineSliceArtifacts {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new Error("slice artifacts must be an object.");
  const artifacts: ProductPipelineSliceArtifacts = {};
  for (const [key, artifactPath] of Object.entries(value)) {
    if (artifactPath === undefined || artifactPath === null) continue;
    if (typeof artifactPath !== "string") throw new Error(`Artifact path ${key} must be a string.`);
    artifacts[key] = assertSafeRelativePath(artifactPath);
  }
  return artifacts;
}

function normalizeSlice(value: unknown, index: number): ProductPipelineSlicePlan {
  if (!isRecord(value)) throw new Error(`slices[${index}] must be an object.`);
  if (typeof value.sliceId !== "string" || value.sliceId.trim().length === 0) throw new Error(`slices[${index}].sliceId is required.`);
  const status = typeof value.status === "string" ? value.status : "planned";
  if (!["planned", "blocked", "ready", "materialized", "in_progress", "done", "failed"].includes(status)) throw new Error(`slices[${index}].status is invalid.`);
  if (!isPhase(value.currentPhase)) throw new Error(`slices[${index}].currentPhase is invalid.`);
  const phaseOrder = Array.isArray(value.phaseOrder) ? value.phaseOrder : PRODUCT_PIPELINE_PHASE_ORDER;
  if (phaseOrder.length !== PRODUCT_PIPELINE_PHASE_ORDER.length || !phaseOrder.every((phase, phaseIndex) => phase === PRODUCT_PIPELINE_PHASE_ORDER[phaseIndex])) {
    throw new Error(`slices[${index}].phaseOrder must match the required product pipeline phase order.`);
  }
  return {
    sliceId: value.sliceId.trim(),
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : undefined,
    status: status as ProductPipelineSliceStatus,
    currentPhase: value.currentPhase,
    phaseOrder: [...PRODUCT_PIPELINE_PHASE_ORDER],
    artifacts: normalizeArtifacts(value.artifacts),
    hitlGate: normalizeHitlGate(value.hitlGate),
    blockers: asStringArray(value.blockers),
  };
}

function normalizeParallelDecision(value: unknown, index: number): ProductPipelineParallelDecision {
  if (!isRecord(value)) throw new Error(`parallelDecisions[${index}] must be an object.`);
  const sliceIds = asStringArray(value.sliceIds).sort();
  if (sliceIds.length < 2) throw new Error(`parallelDecisions[${index}].sliceIds must include at least two slices.`);
  if (typeof value.parallelAllowed !== "boolean") throw new Error(`parallelDecisions[${index}].parallelAllowed must be boolean.`);
  return {
    sliceIds,
    parallelAllowed: value.parallelAllowed,
    blockers: asStringArray(value.blockers),
    source: typeof value.source === "string" && value.source.trim() ? value.source.trim() : undefined,
  };
}

export function parseProductPipelinePlan(value: unknown): ProductPipelinePlan {
  if (!isRecord(value)) throw new Error("Product pipeline plan must be an object.");
  if (value.version !== 1) throw new Error("Product pipeline plan version must be 1.");
  if (typeof value.initiativeId !== "string") throw new Error("initiativeId is required.");
  const initiativeId = assertInitiativeSlug(value.initiativeId);
  if (!Array.isArray(value.slices) || value.slices.length === 0) throw new Error("slices must be a non-empty array.");
  const maxParallelSlices = value.maxParallelSlices === undefined ? undefined : Number(value.maxParallelSlices);
  if (maxParallelSlices !== undefined && (!Number.isInteger(maxParallelSlices) || maxParallelSlices < 1)) throw new Error("maxParallelSlices must be a positive integer.");
  return {
    version: 1,
    initiativeId,
    maxParallelSlices,
    slices: value.slices.map(normalizeSlice),
    parallelDecisions: Array.isArray(value.parallelDecisions) ? value.parallelDecisions.map(normalizeParallelDecision) : [],
  };
}

export function pipelinePlanPath(initiativeId: string): string {
  return `docs/initiatives/${assertInitiativeSlug(initiativeId)}/pipeline.json`;
}

export function pipelineRunsDir(initiativeId: string): string {
  return `docs/initiatives/${assertInitiativeSlug(initiativeId)}/pipeline-runs`;
}

export async function loadProductPipelinePlan(input: LoadProductPipelinePlanInput): Promise<ProductPipelinePlan> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(input.initiativeId);
  const relPath = pipelinePlanPath(initiativeId);
  const text = await readFile(join(repoRoot, relPath), "utf8");
  const plan = parseProductPipelinePlan(parseJson(text, relPath));
  if (plan.initiativeId !== initiativeId) throw new Error(`Pipeline initiativeId ${plan.initiativeId} does not match requested ${initiativeId}.`);
  return plan;
}

function buildDag(slice: ProductPipelineSlicePlan): ProductPipelineSliceDag {
  const nodes = [...slice.phaseOrder];
  return {
    sliceId: slice.sliceId,
    currentPhase: slice.currentPhase,
    nodes,
    edges: nodes.slice(0, -1).map((from, index) => ({ from, to: nodes[index + 1] })),
  };
}

export function detectHitlGate(slice: ProductPipelineSlicePlan): ProductPipelineHitlGate | null {
  const gate = slice.hitlGate;
  if (!gate) return null;
  if (["approved", "resolved"].includes(gate.status)) return null;
  return gate;
}

function pairKey(sliceIds: string[]): string {
  return [...sliceIds].sort().join("|");
}

function explicitDecisionFor(plan: ProductPipelinePlan, left: string, right: string): ProductPipelineParallelDecision | null {
  const key = pairKey([left, right]);
  return (plan.parallelDecisions ?? []).find((decision) => pairKey(decision.sliceIds) === key) ?? null;
}

function pairDecision(plan: ProductPipelinePlan, left: string, right: string): ProductPipelineParallelDecision {
  const explicit = explicitDecisionFor(plan, left, right);
  if (explicit) return explicit;
  return {
    sliceIds: [left, right].sort(),
    parallelAllowed: false,
    blockers: [`Missing Phase 10 parallelAllowed proof for ${left} + ${right}.`],
    source: "missing_phase_10_proof",
  };
}

function planParallelDecisions(plan: ProductPipelinePlan): ProductPipelineParallelDecision[] {
  const decisions = new Map<string, ProductPipelineParallelDecision>();
  for (const decision of plan.parallelDecisions ?? []) decisions.set(pairKey(decision.sliceIds), decision);
  for (let i = 0; i < plan.slices.length; i += 1) {
    for (let j = i + 1; j < plan.slices.length; j += 1) {
      const left = plan.slices[i].sliceId;
      const right = plan.slices[j].sliceId;
      const key = pairKey([left, right]);
      if (!decisions.has(key)) decisions.set(key, pairDecision(plan, left, right));
    }
  }
  return [...decisions.values()].sort((a, b) => pairKey(a.sliceIds).localeCompare(pairKey(b.sliceIds)));
}

function activeSlices(plan: ProductPipelinePlan): ProductPipelineSlicePlan[] {
  return plan.slices.filter((slice) => ["materialized", "in_progress"].includes(slice.status));
}

function candidateSlices(plan: ProductPipelinePlan): ProductPipelineSlicePlan[] {
  return plan.slices.filter((slice) => ["planned", "ready"].includes(slice.status) && slice.blockers.length === 0 && !detectHitlGate(slice));
}

function slicesCanRunTogether(plan: ProductPipelinePlan, selected: string[], candidate: string): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  for (const sliceId of selected) {
    if (sliceId === candidate) {
      blockers.push(`Same-slice phase parallelism is forbidden for ${candidate}.`);
      continue;
    }
    const decision = pairDecision(plan, sliceId, candidate);
    if (!decision.parallelAllowed) blockers.push(...(decision.blockers.length > 0 ? decision.blockers : [`Cross-slice parallelism is not allowed for ${sliceId} + ${candidate}.`]));
  }
  return { allowed: blockers.length === 0, blockers };
}

export function computeNextReadySlices(plan: ProductPipelinePlan, maxParallelSlices = plan.maxParallelSlices ?? 1): ComputeNextReadySlicesResult {
  const max = Math.max(1, Math.floor(maxParallelSlices));
  const active = activeSlices(plan).map((slice) => slice.sliceId);
  const slots = Math.max(0, max - active.length);
  const readySliceIds: string[] = [];
  const blockers: string[] = [];
  if (slots === 0) return { readySliceIds, blockers: [`maxParallelSlices=${max} already reached by active slices: ${active.join(", ") || "none"}.`], activeSliceIds: active };

  for (const slice of candidateSlices(plan)) {
    if (readySliceIds.length >= slots) break;
    const decision = slicesCanRunTogether(plan, [...active, ...readySliceIds], slice.sliceId);
    if (!decision.allowed) {
      blockers.push(...decision.blockers);
      continue;
    }
    readySliceIds.push(slice.sliceId);
  }

  return { readySliceIds, blockers: [...new Set(blockers)], activeSliceIds: active };
}

function materializedQueueJobId(initiativeId: string, slice: ProductPipelineSlicePlan): string {
  return `preview:${initiativeId}:${slice.sliceId}:${slice.currentPhase}`;
}

function blockedSlices(plan: ProductPipelinePlan): Array<{ sliceId: string; blockers: string[] }> {
  return plan.slices.flatMap((slice) => {
    const blockers = [...slice.blockers];
    const gate = detectHitlGate(slice);
    if (gate) blockers.push(`HITL gate unresolved: ${gate.summary}`);
    if (slice.status === "blocked" && blockers.length === 0) blockers.push("slice status is blocked");
    return blockers.length > 0 ? [{ sliceId: slice.sliceId, blockers }] : [];
  });
}

function nextOperatorAction(status: ProductPipelineStatus, ready: ComputeNextReadySlicesResult, blocked: Array<{ sliceId: string; blockers: string[] }>): string {
  if (status === "waiting_for_human") return "Approve HITL gate or reject/update the blocked slice artifact.";
  if (status === "materialized") return "Review materialized preview work, then run the next explicit apply step when ready.";
  if (status === "blocked") return blocked.length > 0 ? "Resolve blockers before applying the product pipeline." : "Resolve blockers or provide Phase 10 parallel proof.";
  if (ready.readySliceIds.length > 0) return "Run apply for one bounded materialization step.";
  if (status === "done") return "No next action; pipeline is done.";
  return "Review pipeline status and update initiative artifacts.";
}

function runIdFromNow(now: string): string {
  return `run-${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace(/[^0-9TZ]/g, "")}`;
}

export function buildProductPipelineRun(input: BuildProductPipelineRunInput): ProductPipelineRun {
  const now = input.now ?? new Date().toISOString();
  const maxParallelSlices = Math.max(1, Math.floor(input.maxParallelSlices ?? input.plan.maxParallelSlices ?? 1));
  const ready = computeNextReadySlices(input.plan, maxParallelSlices);
  const blocked = blockedSlices(input.plan);
  const hasHitlGate = input.plan.slices.some((slice) => !!detectHitlGate(slice));
  const materializedSlices = input.mode === "apply" && !hasHitlGate ? input.plan.slices.filter((slice) => ready.readySliceIds.includes(slice.sliceId)) : [];
  const missingParallelProof = ready.blockers.some((blocker) => blocker.includes("Missing Phase 10"));
  const status: ProductPipelineStatus = input.mode === "dry_run"
    ? (blocked.length > 0 || missingParallelProof ? "planned" : "planned")
    : hasHitlGate
      ? "waiting_for_human"
      : materializedSlices.length > 0
        ? "materialized"
        : blocked.length > 0 || ready.blockers.length > 0
          ? "blocked"
          : "planned";

  const materializedWork: ProductPipelineMaterializedWork = {
    queueJobIds: materializedSlices.map((slice) => materializedQueueJobId(input.plan.initiativeId, slice)),
    workerSessionIds: [],
    worktreePaths: [],
  };

  return {
    version: 1,
    runId: input.runId ?? runIdFromNow(now),
    initiativeId: input.plan.initiativeId,
    mode: input.mode,
    status,
    maxParallelSlices,
    slices: input.plan.slices.map((slice) => materializedSlices.some((entry) => entry.sliceId === slice.sliceId) ? { ...slice, status: "materialized" } : slice),
    sliceDag: input.plan.slices.map(buildDag),
    parallelDecisions: planParallelDecisions(input.plan),
    materializedWork,
    blockedSlices: blocked,
    activeLanes: [...ready.activeSliceIds, ...materializedSlices.map((slice) => slice.sliceId)],
    nextOperatorAction: nextOperatorAction(status, ready, blocked),
    lastAction: {
      action: input.mode,
      at: now,
      summary: input.mode === "dry_run" ? "Computed product pipeline DAG and gates without writing files." : "Applied one bounded product pipeline materialization step.",
    },
  };
}

export async function writeProductPipelineRun(input: WriteProductPipelineRunInput): Promise<string> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const relDir = pipelineRunsDir(input.run.initiativeId);
  const relPath = `${relDir}/${input.run.runId}.json`;
  await mkdir(join(repoRoot, relDir), { recursive: true });
  await writeFile(join(repoRoot, relPath), `${JSON.stringify(input.run, null, 2)}\n`, "utf8");
  return relPath;
}

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

export async function latestProductPipelineRun(repoRoot: string, initiativeId: string): Promise<{ path: string; run: ProductPipelineRun } | null> {
  const root = resolve(repoRoot);
  const relDir = pipelineRunsDir(initiativeId);
  const absDir = join(root, relDir);
  if (!(await exists(absDir))) return null;
  const files = (await readdir(absDir)).filter((file) => /^run-.*\.json$/.test(file)).sort();
  if (files.length === 0) return null;
  const file = files[files.length - 1];
  const relPath = `${relDir}/${file}`;
  const run = parseProductPipelineRun(parseJson(await readFile(join(root, relPath), "utf8"), relPath));
  return { path: relPath, run };
}

function parseProductPipelineRun(value: unknown): ProductPipelineRun {
  if (!isRecord(value)) throw new Error("Product pipeline run must be an object.");
  if (value.version !== 1) throw new Error("Product pipeline run version must be 1.");
  if (typeof value.runId !== "string") throw new Error("Product pipeline runId is required.");
  if (typeof value.initiativeId !== "string") throw new Error("Product pipeline initiativeId is required.");
  if (value.mode !== "dry_run" && value.mode !== "apply") throw new Error("Product pipeline run mode is invalid.");
  const plan = parseProductPipelinePlan({ version: 1, initiativeId: value.initiativeId, slices: value.slices, parallelDecisions: value.parallelDecisions, maxParallelSlices: value.maxParallelSlices });
  const rebuilt = buildProductPipelineRun({ plan, mode: value.mode, runId: value.runId, now: isRecord(value.lastAction) && typeof value.lastAction.at === "string" ? value.lastAction.at : new Date(0).toISOString(), maxParallelSlices: Number(value.maxParallelSlices) || 1 });
  return { ...rebuilt, status: value.status as ProductPipelineStatus, materializedWork: isRecord(value.materializedWork) ? { queueJobIds: asStringArray(value.materializedWork.queueJobIds), workerSessionIds: asStringArray(value.materializedWork.workerSessionIds), worktreePaths: asStringArray(value.materializedWork.worktreePaths) } : rebuilt.materializedWork, nextOperatorAction: typeof value.nextOperatorAction === "string" ? value.nextOperatorAction : rebuilt.nextOperatorAction };
}

export async function assertApplyRepoPreflight(repoRoot: string): Promise<void> {
  const root = resolve(repoRoot);
  if (!(await exists(join(root, ".git")))) return;
  const { stdout } = await execFile("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
  const dirty = stdout.split(/\r?\n/).filter(Boolean).filter((line) => {
    const pathValue = line.slice(3).trim();
    return pathValue !== "" && !pathValue.startsWith("docs/initiatives/");
  });
  if (dirty.length > 0) throw new Error(`Refusing apply with dirty repo state outside docs/initiatives: ${dirty.join("; ")}`);
  const runtimePath = join(root, ".pi", "agent", "state", "runtime");
  if (await exists(runtimePath)) {
    const runtimeStat = await stat(runtimePath);
    if (!runtimeStat.isDirectory()) throw new Error("Protected runtime path is not a directory.");
  }
}

export function renderProductPipelineRun(run: ProductPipelineRun): string {
  const lines: string[] = [
    "Harness Product Pipeline",
    `mode: ${run.mode}`,
    `status: ${run.status}`,
    `initiative: ${run.initiativeId}`,
    `run: ${run.runId}`,
    `max parallel slices: ${run.maxParallelSlices}`,
    "slice DAG:",
  ];
  for (const dag of run.sliceDag) {
    lines.push(`- ${dag.sliceId}: ${dag.nodes.join(" -> ")}`);
  }
  lines.push("HITL gates:");
  const gates = run.slices.map((slice) => ({ slice, gate: detectHitlGate(slice) })).filter((entry) => entry.gate);
  lines.push(...(gates.length > 0 ? gates.map(({ slice, gate }) => `- ${slice.sliceId}: ${gate!.summary} (${gate!.status})`) : ["- none"]));
  lines.push("parallel decisions:");
  lines.push(...(run.parallelDecisions.length > 0 ? run.parallelDecisions.map((decision) => `- ${decision.sliceIds.join(" + ")}: ${decision.parallelAllowed ? "allowed" : "blocked"}${decision.blockers.length > 0 ? ` — ${decision.blockers.join("; ")}` : ""}`) : ["- none"]));
  lines.push("materialized work:");
  lines.push(...(run.materializedWork.queueJobIds.length > 0 ? run.materializedWork.queueJobIds.map((id) => `- queue preview: ${id}`) : ["- none"]));
  lines.push(`next operator action: ${run.nextOperatorAction}`);
  return lines.join("\n");
}

export function repoRelativePath(repoRoot: string, absPath: string): string {
  return relative(resolve(repoRoot), resolve(absPath)).replace(/\\/g, "/");
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function productPipelineExtension(): void {}
