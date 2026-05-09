import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  PRODUCT_PIPELINE_PHASE_ORDER,
  detectHitlGate,
  pipelineRunsDir,
  type ProductPipelineParallelDecision,
  type ProductPipelinePlan,
  type ProductPipelineSlicePlan,
} from "./product-pipeline.ts";
import {
  WORKER_LANE_LEASE_TYPE,
  isExecutionLeaseStale,
  type ExecutionLeaseRecord,
} from "./execution-leases.ts";

export type ParallelWorkerLaneMode = "dry_run" | "apply" | "run" | "status";
export type ParallelWorkerLaneRunStatus = "planned" | "materialized" | "running" | "blocked" | "done" | "failed";
export type ParallelWorkerLaneStatus = "planned" | "leased" | "running" | "blocked" | "done" | "failed";
export type ParallelProofDecision = "allowed" | "blocked" | "missing";

export interface ParallelWorkerLane {
  laneId: string;
  sliceId: string;
  phase: string;
  packetPath: string;
  dependencyDecisionRef: string;
  workerSessionScope: string;
  leaseId: string;
  branchName: string;
  worktreePath: string;
  status: ParallelWorkerLaneStatus;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  blockers: string[];
  cleanupPolicy: "preserve_on_failure";
}

export interface ParallelWorkerLaneManifest {
  version: 1;
  initiativeId: string;
  runId: string;
  status: ParallelWorkerLaneRunStatus;
  maxParallelSlices: number;
  mode: ParallelWorkerLaneMode;
  orchestrationLeaseId: string;
  lanes: ParallelWorkerLane[];
  blockers: string[];
  parallelProof: {
    phase10Decision: ParallelProofDecision;
    sameSliceParallelism: false;
    leaseConflicts: string[];
  };
  lastAction: {
    action: ParallelWorkerLaneMode;
    summary: string;
    at: string;
  };
}

export interface PlanParallelWorkerLanesInput {
  plan: ProductPipelinePlan;
  maxParallelSlices?: number;
  activeLeaseScopes?: string[];
  runId?: string;
  now?: string;
}

export interface PlanParallelWorkerLanesResult {
  lanes: ParallelWorkerLane[];
  selectedSliceIds: string[];
  blockers: string[];
  parallelProof: ParallelWorkerLaneManifest["parallelProof"];
}

export interface BuildParallelWorkerLaneManifestInput extends PlanParallelWorkerLanesInput {
  mode: ParallelWorkerLaneMode;
  status?: ParallelWorkerLaneRunStatus;
}

export interface WriteParallelWorkerLaneManifestInput {
  repoRoot?: string;
  manifest: ParallelWorkerLaneManifest;
}

export interface LatestParallelWorkerLaneManifestResult {
  path: string;
  manifest: ParallelWorkerLaneManifest;
}

function assertInitiativeSlug(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) throw new Error(`Invalid initiative slug: ${value}`);
  return trimmed;
}

function nowIso(): string {
  return new Date().toISOString();
}

function runIdFromNow(now: string): string {
  return `run-${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace(/[^0-9TZ]/g, "")}`;
}

function slugifySegment(input: string): string {
  const value = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!value) throw new Error(`Cannot build lane identifier from empty value: ${input}`);
  return value;
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

function workerLaneScope(sliceId: string): string {
  return `${WORKER_LANE_LEASE_TYPE}:${slugifySegment(sliceId)}`;
}

function activeWorkerLaneScopes(activeLeaseScopes: string[] = []): Set<string> {
  return new Set(activeLeaseScopes.filter((scope) => scope.startsWith(`${WORKER_LANE_LEASE_TYPE}:`)));
}

function requiredPacketPath(slice: ProductPipelineSlicePlan): string | null {
  const phase = slice.currentPhase;
  if (phase.startsWith("fe_")) return slice.artifacts.frontendPacket ?? null;
  if (phase.startsWith("be_")) return slice.artifacts.backendPacket ?? null;
  if (phase === "slice_contract") return slice.artifacts.contract ?? null;
  if (phase === "screen_approval") return slice.artifacts.screenApproval ?? null;
  return slice.artifacts.frontendPacket ?? slice.artifacts.backendPacket ?? slice.artifacts.contract ?? slice.artifacts.screenApproval ?? null;
}

function laneForSlice(input: { initiativeId: string; slice: ProductPipelineSlicePlan; decisionRef: string }): ParallelWorkerLane {
  const scope = slugifySegment(input.slice.sliceId);
  return {
    laneId: `lane-${scope}`,
    sliceId: input.slice.sliceId,
    phase: input.slice.currentPhase,
    packetPath: requiredPacketPath(input.slice) ?? "",
    dependencyDecisionRef: input.decisionRef,
    workerSessionScope: scope,
    leaseId: `worker_lane-${scope}`,
    branchName: `worker/${scope}-parallel-lane`,
    worktreePath: `../ma-code-worktrees/${input.initiativeId}-${scope}`,
    status: "planned",
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    blockers: [],
    cleanupPolicy: "preserve_on_failure",
  };
}

function candidateBlockers(slice: ProductPipelineSlicePlan, activeScopes: Set<string>): string[] {
  const blockers = [...slice.blockers];
  if (!["planned", "ready"].includes(slice.status)) blockers.push(`slice status ${slice.status} is not runnable.`);
  const gate = detectHitlGate(slice);
  if (gate) blockers.push(`HITL gate unresolved for ${slice.sliceId}: ${gate.summary}`);
  if (!requiredPacketPath(slice)) blockers.push(`Missing packet artifact for ${slice.sliceId} at phase ${slice.currentPhase}.`);
  if (activeScopes.has(workerLaneScope(slice.sliceId))) blockers.push(`Active worker-lane lease conflict for ${slice.sliceId}.`);
  return blockers;
}

function decisionRefFor(plan: ProductPipelinePlan, selected: string[], candidate: string): { ref: string; blockers: string[]; sawMissing: boolean } {
  const blockers: string[] = [];
  const refs: string[] = [];
  let sawMissing = false;
  for (const sliceId of selected) {
    if (sliceId === candidate) {
      blockers.push(`Same-slice phase parallelism is forbidden for ${candidate}.`);
      continue;
    }
    const decision = pairDecision(plan, sliceId, candidate);
    refs.push(decision.source ?? `phase10:${pairKey(decision.sliceIds)}`);
    if (!decision.parallelAllowed) {
      if (decision.source === "missing_phase_10_proof") sawMissing = true;
      blockers.push(...(decision.blockers.length > 0 ? decision.blockers : [`Cross-slice parallelism is not allowed for ${sliceId} + ${candidate}.`]));
    }
  }
  return { ref: refs.length > 0 ? refs.join(",") : "phase10:not_required_single_lane", blockers, sawMissing };
}

export function planParallelWorkerLanes(input: PlanParallelWorkerLanesInput): PlanParallelWorkerLanesResult {
  const maxParallelSlices = Math.max(1, Math.floor(input.maxParallelSlices ?? input.plan.maxParallelSlices ?? 1));
  const activeScopes = activeWorkerLaneScopes(input.activeLeaseScopes);
  const blockers: string[] = [];
  const selected: string[] = [];
  const lanes: ParallelWorkerLane[] = [];
  const leaseConflicts: string[] = [];
  let sawBlockedDecision = false;
  let sawMissingDecision = false;

  const failed = input.plan.slices.filter((slice) => slice.status === "failed");
  if (failed.length > 0) {
    blockers.push(...failed.map((slice) => `Failed slice ${slice.sliceId} prevents dependent slice launch until inspected.`));
  }

  const seenSlices = new Set<string>();
  for (const slice of input.plan.slices) {
    if (seenSlices.has(slice.sliceId)) blockers.push(`Same-slice phase parallelism is forbidden for ${slice.sliceId}.`);
    seenSlices.add(slice.sliceId);

    if (selected.length >= maxParallelSlices) {
      if (["planned", "ready"].includes(slice.status)) blockers.push(`maxParallelSlices=${maxParallelSlices} reached before ${slice.sliceId}.`);
      continue;
    }

    const candidateIssues = candidateBlockers(slice, activeScopes);
    const leaseIssue = candidateIssues.find((issue) => issue.includes("worker-lane lease conflict"));
    if (leaseIssue) leaseConflicts.push(leaseIssue);
    if (candidateIssues.length > 0) {
      blockers.push(...candidateIssues);
      continue;
    }

    const decision = decisionRefFor(input.plan, selected, slice.sliceId);
    if (decision.blockers.length > 0) {
      blockers.push(...decision.blockers);
      sawBlockedDecision = true;
      sawMissingDecision ||= decision.sawMissing;
      continue;
    }

    selected.push(slice.sliceId);
    lanes.push(laneForSlice({ initiativeId: input.plan.initiativeId, slice, decisionRef: decision.ref }));
  }

  return {
    lanes,
    selectedSliceIds: selected,
    blockers: [...new Set(blockers)],
    parallelProof: {
      phase10Decision: sawMissingDecision ? "missing" : sawBlockedDecision ? "blocked" : "allowed",
      sameSliceParallelism: false,
      leaseConflicts: [...new Set(leaseConflicts)],
    },
  };
}

export function parallelWorkerLaneRunsDir(initiativeId: string): string {
  return pipelineRunsDir(assertInitiativeSlug(initiativeId));
}

export function parallelWorkerLaneManifestPath(initiativeId: string, runId: string): string {
  return `${parallelWorkerLaneRunsDir(initiativeId)}/${runId}.parallel-lanes.json`;
}

export function buildParallelWorkerLaneManifest(input: BuildParallelWorkerLaneManifestInput): ParallelWorkerLaneManifest {
  const now = input.now ?? nowIso();
  const runId = input.runId ?? runIdFromNow(now);
  const planned = planParallelWorkerLanes(input);
  const status = input.status ?? (input.mode === "apply" ? (planned.lanes.length > 0 && planned.blockers.length === 0 ? "materialized" : "blocked") : input.mode === "run" ? "running" : input.mode === "status" ? "planned" : "planned");
  return {
    version: 1,
    initiativeId: input.plan.initiativeId,
    runId,
    status,
    maxParallelSlices: Math.max(1, Math.floor(input.maxParallelSlices ?? input.plan.maxParallelSlices ?? 1)),
    mode: input.mode,
    orchestrationLeaseId: `parallel-run:${input.plan.initiativeId}:${runId}`,
    lanes: planned.lanes,
    blockers: planned.blockers,
    parallelProof: planned.parallelProof,
    lastAction: {
      action: input.mode,
      summary: input.mode === "dry_run"
        ? "Planned parallel worker lanes without writing files."
        : input.mode === "apply"
          ? "Materialized bounded worker lane sessions and durable manifest."
          : input.mode === "run"
            ? "Ran foreground bounded worker lane commands."
            : "Read parallel worker lane status.",
      at: now,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeLane(value: unknown): ParallelWorkerLane {
  if (!isRecord(value)) throw new Error("Parallel worker lane must be an object.");
  const status = typeof value.status === "string" && ["planned", "leased", "running", "blocked", "done", "failed"].includes(value.status) ? value.status as ParallelWorkerLaneStatus : "blocked";
  return {
    laneId: typeof value.laneId === "string" ? value.laneId : "lane-unknown",
    sliceId: typeof value.sliceId === "string" ? value.sliceId : "unknown",
    phase: typeof value.phase === "string" ? value.phase : PRODUCT_PIPELINE_PHASE_ORDER[0],
    packetPath: typeof value.packetPath === "string" ? value.packetPath : "",
    dependencyDecisionRef: typeof value.dependencyDecisionRef === "string" ? value.dependencyDecisionRef : "unknown",
    workerSessionScope: typeof value.workerSessionScope === "string" ? value.workerSessionScope : "unknown",
    leaseId: typeof value.leaseId === "string" ? value.leaseId : "",
    branchName: typeof value.branchName === "string" ? value.branchName : "",
    worktreePath: typeof value.worktreePath === "string" ? value.worktreePath : "",
    status,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
    finishedAt: typeof value.finishedAt === "string" ? value.finishedAt : null,
    exitCode: typeof value.exitCode === "number" ? value.exitCode : null,
    blockers: asStringArray(value.blockers),
    cleanupPolicy: "preserve_on_failure",
  };
}

export function normalizeParallelWorkerLaneManifest(value: unknown): ParallelWorkerLaneManifest {
  if (!isRecord(value)) throw new Error("Parallel worker lane manifest must be an object.");
  if (value.version !== 1) throw new Error("Parallel worker lane manifest version must be 1.");
  const mode = typeof value.mode === "string" && ["dry_run", "apply", "run", "status"].includes(value.mode) ? value.mode as ParallelWorkerLaneMode : "status";
  const status = typeof value.status === "string" && ["planned", "materialized", "running", "blocked", "done", "failed"].includes(value.status) ? value.status as ParallelWorkerLaneRunStatus : "blocked";
  const proof = isRecord(value.parallelProof) ? value.parallelProof : {};
  const lastAction = isRecord(value.lastAction) ? value.lastAction : {};
  return {
    version: 1,
    initiativeId: assertInitiativeSlug(typeof value.initiativeId === "string" ? value.initiativeId : "unknown"),
    runId: typeof value.runId === "string" ? value.runId : "run-unknown",
    status,
    maxParallelSlices: Math.max(1, Math.floor(Number(value.maxParallelSlices) || 1)),
    mode,
    orchestrationLeaseId: typeof value.orchestrationLeaseId === "string" ? value.orchestrationLeaseId : "parallel-run:unknown:run-unknown",
    lanes: Array.isArray(value.lanes) ? value.lanes.map(normalizeLane) : [],
    blockers: asStringArray(value.blockers),
    parallelProof: {
      phase10Decision: proof.phase10Decision === "allowed" || proof.phase10Decision === "blocked" || proof.phase10Decision === "missing" ? proof.phase10Decision : "blocked",
      sameSliceParallelism: false,
      leaseConflicts: asStringArray(proof.leaseConflicts),
    },
    lastAction: {
      action: lastAction.action === "dry_run" || lastAction.action === "apply" || lastAction.action === "run" || lastAction.action === "status" ? lastAction.action : mode,
      summary: typeof lastAction.summary === "string" ? lastAction.summary : "Normalized parallel worker lane manifest.",
      at: typeof lastAction.at === "string" ? lastAction.at : new Date(0).toISOString(),
    },
  };
}

export async function writeParallelWorkerLaneManifest(input: WriteParallelWorkerLaneManifestInput): Promise<string> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const relPath = parallelWorkerLaneManifestPath(input.manifest.initiativeId, input.manifest.runId);
  await mkdir(join(repoRoot, parallelWorkerLaneRunsDir(input.manifest.initiativeId)), { recursive: true });
  await writeFile(join(repoRoot, relPath), `${JSON.stringify(input.manifest, null, 2)}\n`, "utf8");
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

export async function latestParallelWorkerLaneManifest(repoRoot: string, initiativeId: string): Promise<LatestParallelWorkerLaneManifestResult | null> {
  const root = resolve(repoRoot);
  const relDir = parallelWorkerLaneRunsDir(initiativeId);
  const absDir = join(root, relDir);
  if (!(await exists(absDir))) return null;
  const files = (await readdir(absDir)).filter((file) => /^run-.*\.parallel-lanes\.json$/.test(file)).sort();
  if (files.length === 0) return null;
  const file = files[files.length - 1];
  const relPath = `${relDir}/${file}`;
  const manifest = normalizeParallelWorkerLaneManifest(JSON.parse(await readFile(join(root, relPath), "utf8")));
  return { path: relPath, manifest };
}

export function activeLeaseScopesFromRecords(leases: ExecutionLeaseRecord[], now: string = nowIso()): string[] {
  return leases.filter((lease) => !isExecutionLeaseStale(lease, now)).map((lease) => lease.scope);
}

export function renderParallelWorkerLaneManifest(manifest: ParallelWorkerLaneManifest, writtenPath: string | null = null): string {
  const lines: string[] = [
    "Harness Parallel Worker Lanes",
    `mode: ${manifest.mode}`,
    `status: ${manifest.status}`,
    `initiative: ${manifest.initiativeId}`,
    `run: ${manifest.runId}`,
    `max parallel slices: ${manifest.maxParallelSlices}`,
    `orchestration lease: ${manifest.orchestrationLeaseId}`,
    "parallel proof:",
    `- phase10Decision: ${manifest.parallelProof.phase10Decision}`,
    `- sameSliceParallelism: ${manifest.parallelProof.sameSliceParallelism}`,
    `- leaseConflicts: ${manifest.parallelProof.leaseConflicts.length > 0 ? manifest.parallelProof.leaseConflicts.join("; ") : "none"}`,
    "lanes:",
  ];
  lines.push(...(manifest.lanes.length > 0 ? manifest.lanes.map((lane) => `- ${lane.laneId}: slice=${lane.sliceId} phase=${lane.phase} status=${lane.status} worktree=${lane.worktreePath || "pending"}`) : ["- none"]));
  lines.push("blockers:");
  lines.push(...(manifest.blockers.length > 0 ? manifest.blockers.map((blocker) => `- ${blocker}`) : ["- none"]));
  lines.push(`written manifest path: ${writtenPath ?? "none"}`);
  return lines.join("\n");
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function parallelWorkerLanesExtension(): void {}
