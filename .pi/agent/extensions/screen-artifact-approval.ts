import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type ScreenArtifactApprovalDecision = "pending" | "approved" | "rejected";
export type ScreenArtifactApprovalStatus = "missing" | "pending" | "approved" | "rejected";

export interface ScreenArtifactApprovalHistoryEntry {
  decision: ScreenArtifactApprovalDecision;
  decidedBy: string | null;
  decidedAt: string | null;
  artifactHash: string;
  blockedReason: string | null;
  note: string;
}

export interface ScreenArtifactApproval {
  version: 1;
  initiativeId: string;
  sliceId: string;
  artifactPath: string;
  artifactHash: string;
  decision: ScreenArtifactApprovalDecision;
  decidedBy: string | null;
  decidedAt: string | null;
  approvalRef: string;
  notes: string[];
  requiredBefore: "fe_implementation";
  nextAllowedPhase: "fe_implementation" | null;
  blockedReason: string | null;
  history?: ScreenArtifactApprovalHistoryEntry[];
}

export interface ScreenArtifactApprovalOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
}

export interface ScreenArtifactApprovalWriteOptions extends ScreenArtifactApprovalOptions {
  decidedBy: string;
  note?: string;
  reason?: string;
  allowReapproval?: boolean;
  now?: Date;
}

export interface ScreenArtifactApprovalResult {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  artifactPath: string;
  approvalPath: string;
  artifactHash: string;
  approval: ScreenArtifactApproval;
  createdFiles: string[];
}

export interface ScreenArtifactApprovalStatusResult {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  artifactPath: string;
  approvalPath: string;
  artifactExists: boolean;
  approvalExists: boolean;
  status: ScreenArtifactApprovalStatus;
  artifactHash: string | null;
  approvalDecision: ScreenArtifactApprovalDecision | null;
  staleApproval: boolean;
  approval: ScreenArtifactApproval | null;
}

interface LoadedArtifact {
  artifactPath: string;
  artifactHash: string;
  artifact: Record<string, unknown>;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function assertNonEmpty(value: string | undefined, label: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) throw new Error(`${label} is required.`);
  return trimmed;
}

function paths(initiativeId: string, sliceId: string): { artifactPath: string; approvalPath: string } {
  return {
    artifactPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.mock-screen.json`,
    approvalPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.approval.json`,
  };
}

async function readOptionalText(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function loadArtifact(repoRoot: string, initiativeId: string, sliceId: string): Promise<LoadedArtifact> {
  const { artifactPath } = paths(initiativeId, sliceId);
  const text = await readOptionalText(join(repoRoot, artifactPath));
  if (text === null) throw new Error(`Missing screen artifact: ${artifactPath}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid screen artifact JSON: ${(error as Error).message}`);
  }
  if (!isRecord(parsed)) throw new Error("Invalid screen artifact: expected object.");
  if (parsed.initiativeId !== initiativeId) throw new Error(`Invalid screen artifact: initiativeId must be ${initiativeId}.`);
  if (parsed.sliceId !== sliceId) throw new Error(`Invalid screen artifact: sliceId must be ${sliceId}.`);
  if (parsed.mode !== "mock") throw new Error("Invalid screen artifact: mode must be mock.");
  if (parsed.nextAllowedPhase !== "screen_approval") throw new Error("Invalid screen artifact: nextAllowedPhase must be screen_approval.");
  const constraints = parsed.constraints;
  if (!isRecord(constraints) || constraints.liveStitchCalled !== false || constraints.taskPacketsCreated !== false || constraints.queueJobsCreated !== false) {
    throw new Error("Invalid screen artifact: constraints must prove no live Stitch, task packets, or queue jobs were created.");
  }
  return { artifactPath, artifactHash: sha256(text), artifact: parsed };
}

function normalizeApproval(value: unknown, expected: { initiativeId: string; sliceId: string; approvalPath: string }): ScreenArtifactApproval {
  if (!isRecord(value)) throw new Error("Invalid screen artifact approval: expected object.");
  if (value.version !== 1) throw new Error("Invalid screen artifact approval: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid screen artifact approval: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid screen artifact approval: sliceId must be ${expected.sliceId}.`);
  if (typeof value.artifactPath !== "string" || value.artifactPath !== paths(expected.initiativeId, expected.sliceId).artifactPath) {
    throw new Error("Invalid screen artifact approval: artifactPath does not match initiative/slice.");
  }
  if (typeof value.artifactHash !== "string" || !/^[a-f0-9]{64}$/.test(value.artifactHash)) {
    throw new Error("Invalid screen artifact approval: artifactHash must be a sha256 hex string.");
  }
  if (value.decision !== "pending" && value.decision !== "approved" && value.decision !== "rejected") {
    throw new Error("Invalid screen artifact approval: decision must be pending, approved, or rejected.");
  }
  if (value.decidedBy !== null && typeof value.decidedBy !== "string") throw new Error("Invalid screen artifact approval: decidedBy must be a string or null.");
  if (value.decidedAt !== null && typeof value.decidedAt !== "string") throw new Error("Invalid screen artifact approval: decidedAt must be an ISO string or null.");
  if (typeof value.approvalRef !== "string" || value.approvalRef !== `screen-approval:${expected.initiativeId}:${expected.sliceId}:${value.artifactHash}`) {
    throw new Error("Invalid screen artifact approval: approvalRef does not match artifact hash.");
  }
  if (!Array.isArray(value.notes) || !value.notes.every((entry) => typeof entry === "string")) {
    throw new Error("Invalid screen artifact approval: notes must be an array of strings.");
  }
  if (value.requiredBefore !== "fe_implementation") throw new Error("Invalid screen artifact approval: requiredBefore must be fe_implementation.");
  if (value.nextAllowedPhase !== "fe_implementation" && value.nextAllowedPhase !== null) {
    throw new Error("Invalid screen artifact approval: nextAllowedPhase must be fe_implementation or null.");
  }
  if (value.blockedReason !== null && typeof value.blockedReason !== "string") throw new Error("Invalid screen artifact approval: blockedReason must be a string or null.");
  return value as unknown as ScreenArtifactApproval;
}

async function loadExistingApproval(repoRoot: string, initiativeId: string, sliceId: string): Promise<ScreenArtifactApproval | null> {
  const { approvalPath } = paths(initiativeId, sliceId);
  const text = await readOptionalText(join(repoRoot, approvalPath));
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid screen artifact approval JSON: ${(error as Error).message}`);
  }
  return normalizeApproval(parsed, { initiativeId, sliceId, approvalPath });
}

function historyFrom(existing: ScreenArtifactApproval | null, note: string): ScreenArtifactApprovalHistoryEntry[] | undefined {
  if (!existing) return undefined;
  return [
    ...(existing.history ?? []),
    {
      decision: existing.decision,
      decidedBy: existing.decidedBy,
      decidedAt: existing.decidedAt,
      artifactHash: existing.artifactHash,
      blockedReason: existing.blockedReason,
      note,
    },
  ];
}

function assertExistingDecisionAllowed(existing: ScreenArtifactApproval | null, artifactHash: string, allowReapproval: boolean): void {
  if (!existing) return;
  if (existing.artifactHash !== artifactHash && !allowReapproval) {
    throw new Error("Stale screen artifact approval: artifact hash changed; rerun with explicit --reapprove after reviewing the updated artifact.");
  }
  if (existing.decision === "rejected" && !allowReapproval) {
    throw new Error("Re-approval after rejection requires explicit --reapprove.");
  }
  if (existing.decision === "approved" && !allowReapproval) {
    throw new Error("Screen artifact is already approved; rerun with explicit --reapprove to replace the decision.");
  }
}

async function writeApproval(repoRoot: string, approvalPath: string, approval: ScreenArtifactApproval): Promise<string[]> {
  const absPath = join(repoRoot, approvalPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(approval, null, 2)}\n`, "utf8");
  return [approvalPath];
}

export async function getScreenArtifactApprovalStatus(options: ScreenArtifactApprovalOptions): Promise<ScreenArtifactApprovalStatusResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(options.initiative);
  const sliceId = assertSliceId(options.sliceId);
  const { artifactPath, approvalPath } = paths(initiativeId, sliceId);
  let artifactHash: string | null = null;
  let artifactExists = false;
  try {
    artifactHash = (await loadArtifact(repoRoot, initiativeId, sliceId)).artifactHash;
    artifactExists = true;
  } catch (error) {
    if (!String((error as Error).message).startsWith("Missing screen artifact:")) throw error;
  }
  const approval = await loadExistingApproval(repoRoot, initiativeId, sliceId);
  const approvalExists = approval !== null;
  const staleApproval = Boolean(approval && artifactHash && approval.artifactHash !== artifactHash);
  let status: ScreenArtifactApprovalStatus = "missing";
  if (artifactExists) {
    status = approval && !staleApproval ? approval.decision : "pending";
  }
  return {
    repoRoot,
    initiativeId,
    sliceId,
    artifactPath,
    approvalPath,
    artifactExists,
    approvalExists,
    status,
    artifactHash,
    approvalDecision: approval?.decision ?? null,
    staleApproval,
    approval,
  };
}

export async function approveScreenArtifact(options: ScreenArtifactApprovalWriteOptions): Promise<ScreenArtifactApprovalResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(options.initiative);
  const sliceId = assertSliceId(options.sliceId);
  const decidedBy = assertNonEmpty(options.decidedBy, "--by");
  const note = assertNonEmpty(options.note, "--note");
  const loaded = await loadArtifact(repoRoot, initiativeId, sliceId);
  const { approvalPath } = paths(initiativeId, sliceId);
  const existing = await loadExistingApproval(repoRoot, initiativeId, sliceId);
  assertExistingDecisionAllowed(existing, loaded.artifactHash, Boolean(options.allowReapproval));
  const approval: ScreenArtifactApproval = {
    version: 1,
    initiativeId,
    sliceId,
    artifactPath: loaded.artifactPath,
    artifactHash: loaded.artifactHash,
    decision: "approved",
    decidedBy,
    decidedAt: (options.now ?? new Date()).toISOString(),
    approvalRef: `screen-approval:${initiativeId}:${sliceId}:${loaded.artifactHash}`,
    notes: [
      ...(existing && options.allowReapproval ? [`Previous decision ${existing.decision} for artifact ${existing.artifactHash} recorded in history.`] : []),
      note,
    ],
    requiredBefore: "fe_implementation",
    nextAllowedPhase: "fe_implementation",
    blockedReason: null,
    history: historyFrom(existing, "Replaced by explicit approval."),
  };
  const createdFiles = await writeApproval(repoRoot, approvalPath, approval);
  return { repoRoot, initiativeId, sliceId, artifactPath: loaded.artifactPath, approvalPath, artifactHash: loaded.artifactHash, approval, createdFiles };
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function screenArtifactApprovalExtension(): void {}

export async function rejectScreenArtifact(options: ScreenArtifactApprovalWriteOptions): Promise<ScreenArtifactApprovalResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(options.initiative);
  const sliceId = assertSliceId(options.sliceId);
  const decidedBy = assertNonEmpty(options.decidedBy, "--by");
  const reason = assertNonEmpty(options.reason, "--reason");
  const loaded = await loadArtifact(repoRoot, initiativeId, sliceId);
  const { approvalPath } = paths(initiativeId, sliceId);
  const existing = await loadExistingApproval(repoRoot, initiativeId, sliceId);
  if (existing && !options.allowReapproval) {
    throw new Error("Replacing an existing screen artifact decision requires explicit --reapprove.");
  }
  const approval: ScreenArtifactApproval = {
    version: 1,
    initiativeId,
    sliceId,
    artifactPath: loaded.artifactPath,
    artifactHash: loaded.artifactHash,
    decision: "rejected",
    decidedBy,
    decidedAt: (options.now ?? new Date()).toISOString(),
    approvalRef: `screen-approval:${initiativeId}:${sliceId}:${loaded.artifactHash}`,
    notes: [
      ...(existing && options.allowReapproval ? [`Previous decision ${existing.decision} for artifact ${existing.artifactHash} recorded in history.`] : []),
      ...(options.note?.trim() ? [options.note.trim()] : []),
    ],
    requiredBefore: "fe_implementation",
    nextAllowedPhase: null,
    blockedReason: reason,
    history: historyFrom(existing, "Replaced by explicit rejection."),
  };
  const createdFiles = await writeApproval(repoRoot, approvalPath, approval);
  return { repoRoot, initiativeId, sliceId, artifactPath: loaded.artifactPath, approvalPath, artifactHash: loaded.artifactHash, approval, createdFiles };
}
