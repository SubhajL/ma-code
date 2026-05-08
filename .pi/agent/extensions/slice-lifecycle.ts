import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const SLICE_LIFECYCLE_STAGES = [
  "intake_required",
  "planning_ready",
  "task_ready",
  "coding_red",
  "coding_green",
  "review_ready",
  "checked",
  "create_ready",
  "created",
  "submitted",
  "pr_gate_clean",
  "merge_ready",
  "merged",
  "local_main_synced",
] as const;

export type SliceLifecycleStage = (typeof SLICE_LIFECYCLE_STAGES)[number];
export type LifecycleEnforcement = "mandatory" | "optional" | "future";

export interface SliceLifecycleCheckpoint {
  name: SliceLifecycleStage;
  requiredPredecessors: SliceLifecycleStage[];
  enforcement: LifecycleEnforcement;
  acceptedEvidence: string[];
}

export interface SliceLifecyclePolicy {
  version: number;
  policyName: string;
  description?: string;
  defaultMode: string;
  allowedSkips?: Array<{ stage: SliceLifecycleStage; exemption: string; reason: string }>;
  acceptedEvidenceTypes: string[];
  checkpoints: SliceLifecycleCheckpoint[];
}

export interface SliceLifecycleEvidenceBundle {
  version: 1;
  taskId?: string;
  directImplementationExemption?: boolean;
  planning?: {
    acceptanceCriteria?: string[];
    tddSlice?: string;
  };
  task?: {
    acceptanceCriteria?: string[];
    status?: string;
    validationDecision?: string;
  };
  redGreenEvidence?: { red?: boolean; green?: boolean };
  review?: { verdict?: "no_required_fixes" | "changes_required" };
  creation?: { branch?: string; commit?: string };
  pr?: { url?: string; state?: string };
  prGate?: { status?: string; mergeStateStatus?: string };
  merged?: { merged?: boolean; mergeCommit?: string };
  localMainSynced?: { synced?: boolean; aheadBehind?: string };
}

export interface SliceLifecycleAssessmentInput {
  cwd?: string;
  targetStage?: SliceLifecycleStage;
  explicitEvidence?: string[];
  evidenceFile?: string;
  evidenceBundle?: SliceLifecycleEvidenceBundle;
}

export interface SliceLifecycleEvidence {
  currentLogPath?: string;
  planningLogPath?: string;
  codingLogPath?: string;
  hasPlanningArtifact: boolean;
  taskReady: boolean;
  taskValidated: boolean;
  redGreenEvidence: { red: boolean; green: boolean };
  reviewVerdict?: "no_required_fixes" | "changes_required";
  branch?: string;
  cleanBranch?: boolean;
  created: boolean;
  pr: { submitted: boolean; url?: string; state?: string };
  prGateClean: boolean;
  merged: boolean;
  localMainSynced: boolean;
  lifecycleEvidencePath?: string;
}

export interface SliceLifecycleAssessment {
  currentStage: SliceLifecycleStage;
  target?: { stage: SliceLifecycleStage; ready: boolean };
  achievedStages: SliceLifecycleStage[];
  missingPrerequisites: SliceLifecycleStage[];
  blockingGaps: string[];
  nextAllowedActions: string[];
  evidence: SliceLifecycleEvidence;
  policyPath: string;
}

const DEFAULT_POLICY_PATH = ".pi/agent/lifecycle/slice-lifecycle-policy.json";

function stageIndex(stage: SliceLifecycleStage): number {
  return SLICE_LIFECYCLE_STAGES.indexOf(stage);
}

export function stageMeetsOrExceeds(current: SliceLifecycleStage, target: SliceLifecycleStage): boolean {
  return stageIndex(current) >= stageIndex(target);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(path: string): Promise<string> {
  if (!(await fileExists(path))) return "";
  return readFile(path, "utf8");
}

function extractBacktickedPath(markdown: string, heading: RegExp): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => heading.test(line));
  if (headingIndex < 0) return undefined;
  for (const line of lines.slice(headingIndex + 1, headingIndex + 8)) {
    const match = line.match(/`([^`]+)`/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function parseReviewVerdict(text: string): SliceLifecycleEvidence["reviewVerdict"] | undefined {
  const verdict = text.match(/Review Verdict:\s*(changes_required|no_required_fixes)/i)?.[1]?.toLowerCase();
  if (verdict === "changes_required" || verdict === "no_required_fixes") return verdict;
  if (/## Review\b/i.test(text) && /CRITICAL\s*\n-\s*none/i.test(text) && /HIGH\s*\n-\s*none/i.test(text)) {
    return "no_required_fixes";
  }
  return undefined;
}

function parsePrUrl(text: string): string | undefined {
  return text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/i)?.[0];
}

function parsePrState(text: string): string | undefined {
  return text.match(/(?:PR #\d+:|State:)\s*(MERGED|OPEN|CLOSED)/i)?.[1]?.toUpperCase();
}

function parseStringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()) : [];
}

function normalizeLifecycleEvidenceBundle(raw: unknown): SliceLifecycleEvidenceBundle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Lifecycle evidence bundle must be an object.");
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) throw new Error("Lifecycle evidence bundle version must be 1.");
  const planning = record.planning && typeof record.planning === "object" && !Array.isArray(record.planning) ? record.planning as Record<string, unknown> : undefined;
  const task = record.task && typeof record.task === "object" && !Array.isArray(record.task) ? record.task as Record<string, unknown> : undefined;
  const redGreenEvidence = record.redGreenEvidence && typeof record.redGreenEvidence === "object" && !Array.isArray(record.redGreenEvidence) ? record.redGreenEvidence as Record<string, unknown> : undefined;
  const review = record.review && typeof record.review === "object" && !Array.isArray(record.review) ? record.review as Record<string, unknown> : undefined;
  const creation = record.creation && typeof record.creation === "object" && !Array.isArray(record.creation) ? record.creation as Record<string, unknown> : undefined;
  const pr = record.pr && typeof record.pr === "object" && !Array.isArray(record.pr) ? record.pr as Record<string, unknown> : undefined;
  const prGate = record.prGate && typeof record.prGate === "object" && !Array.isArray(record.prGate) ? record.prGate as Record<string, unknown> : undefined;
  const merged = record.merged && typeof record.merged === "object" && !Array.isArray(record.merged) ? record.merged as Record<string, unknown> : undefined;
  const localMainSynced = record.localMainSynced && typeof record.localMainSynced === "object" && !Array.isArray(record.localMainSynced) ? record.localMainSynced as Record<string, unknown> : undefined;
  const verdict = review?.verdict;
  if (verdict !== undefined && verdict !== "no_required_fixes" && verdict !== "changes_required") throw new Error("Lifecycle evidence review.verdict must be no_required_fixes or changes_required.");
  return {
    version: 1,
    taskId: typeof record.taskId === "string" ? record.taskId : undefined,
    directImplementationExemption: record.directImplementationExemption === true,
    planning: planning ? {
      acceptanceCriteria: parseStringArrayValue(planning.acceptanceCriteria),
      tddSlice: typeof planning.tddSlice === "string" ? planning.tddSlice : undefined,
    } : undefined,
    task: task ? {
      acceptanceCriteria: parseStringArrayValue(task.acceptanceCriteria),
      status: typeof task.status === "string" ? task.status : undefined,
      validationDecision: typeof task.validationDecision === "string" ? task.validationDecision : undefined,
    } : undefined,
    redGreenEvidence: redGreenEvidence ? { red: redGreenEvidence.red === true, green: redGreenEvidence.green === true } : undefined,
    review: review ? { verdict: verdict as SliceLifecycleEvidence["reviewVerdict"] } : undefined,
    creation: creation ? { branch: typeof creation.branch === "string" ? creation.branch : undefined, commit: typeof creation.commit === "string" ? creation.commit : undefined } : undefined,
    pr: pr ? { url: typeof pr.url === "string" ? pr.url : undefined, state: typeof pr.state === "string" ? pr.state : undefined } : undefined,
    prGate: prGate ? { status: typeof prGate.status === "string" ? prGate.status : undefined, mergeStateStatus: typeof prGate.mergeStateStatus === "string" ? prGate.mergeStateStatus : undefined } : undefined,
    merged: merged ? { merged: merged.merged === true, mergeCommit: typeof merged.mergeCommit === "string" ? merged.mergeCommit : undefined } : undefined,
    localMainSynced: localMainSynced ? { synced: localMainSynced.synced === true, aheadBehind: typeof localMainSynced.aheadBehind === "string" ? localMainSynced.aheadBehind : undefined } : undefined,
  };
}

function resolveLifecycleEvidencePath(cwd: string, evidenceFile: string): string {
  const normalized = evidenceFile.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || normalized.includes("..") || !normalized.startsWith("reports/lifecycle/") || !normalized.endsWith(".json")) {
    throw new Error("Lifecycle evidence file must be a repo-local JSON file under reports/lifecycle/.");
  }
  return resolve(cwd, normalized);
}

async function loadLifecycleEvidenceBundle(cwd: string, evidenceFile?: string, evidenceBundle?: SliceLifecycleEvidenceBundle): Promise<{ bundle?: SliceLifecycleEvidenceBundle; path?: string }> {
  if (evidenceBundle) return { bundle: normalizeLifecycleEvidenceBundle(evidenceBundle), path: undefined };
  if (!evidenceFile) return {};
  const path = resolveLifecycleEvidencePath(cwd, evidenceFile);
  return { bundle: normalizeLifecycleEvidenceBundle(JSON.parse(await readFile(path, "utf8"))), path };
}

async function loadTaskEvidence(cwd: string): Promise<{ taskReady: boolean; taskValidated: boolean }> {
  const statePath = join(cwd, ".pi", "agent", "state", "runtime", "tasks.json");
  const raw = await readTextIfExists(statePath);
  if (!raw.trim()) return { taskReady: false, taskValidated: false };
  try {
    const parsed = JSON.parse(raw) as { activeTaskId?: string | null; tasks?: Array<Record<string, unknown>> };
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const active = tasks.find((task) => parsed.activeTaskId && task.id === parsed.activeTaskId) ?? tasks[0];
    if (!active) return { taskReady: false, taskValidated: false };
    const acceptance = active.acceptance ?? active.acceptanceCriteria;
    const hasAcceptance = Array.isArray(acceptance) && acceptance.length > 0;
    const status = String(active.status ?? "");
    const validation = active.validation as { decision?: unknown } | undefined;
    const validationDecision = String(validation?.decision ?? active.validationDecision ?? "");
    return {
      taskReady: hasAcceptance || ["in_progress", "review", "done"].includes(status),
      taskValidated: validationDecision === "pass" || status === "done" || status === "review",
    };
  } catch {
    return { taskReady: false, taskValidated: false };
  }
}

function readGitState(cwd: string): { branch?: string; cleanBranch?: boolean } {
  const branch = spawnSync("git", ["-C", cwd, "branch", "--show-current"], { encoding: "utf8" });
  const status = spawnSync("git", ["-C", cwd, "status", "--porcelain"], { encoding: "utf8" });
  return {
    branch: branch.status === 0 ? branch.stdout.trim() || undefined : undefined,
    cleanBranch: status.status === 0 ? status.stdout.trim().length === 0 : undefined,
  };
}

export async function loadLifecyclePolicy(cwd = process.cwd()): Promise<SliceLifecyclePolicy> {
  const policyPath = join(cwd, DEFAULT_POLICY_PATH);
  const parsed = JSON.parse(await readFile(policyPath, "utf8")) as SliceLifecyclePolicy;
  const policyStages = parsed.checkpoints.map((checkpoint) => checkpoint.name);
  const missing = SLICE_LIFECYCLE_STAGES.filter((stage) => !policyStages.includes(stage));
  if (missing.length > 0) throw new Error(`Lifecycle policy missing checkpoints: ${missing.join(", ")}`);
  return parsed;
}

function stageGapMessage(stage: SliceLifecycleStage): string {
  switch (stage) {
    case "planning_ready": return "planning_ready requires an active planning log with acceptance/TDD planning evidence.";
    case "task_ready": return "task_ready requires task state with acceptance criteria or an active/reviewable task.";
    case "coding_red": return "coding_red requires RED evidence in the active coding log.";
    case "coding_green": return "coding_green requires GREEN evidence in the active coding log.";
    case "checked": return "checked requires g-check review evidence and Review Verdict: no_required_fixes.";
    case "created": return "created requires branch/commit create evidence.";
    case "submitted": return "submitted requires PR URL/state evidence.";
    case "pr_gate_clean": return "pr_gate_clean requires PR gate clean/pass evidence.";
    case "merged": return "merged requires explicit merged PR evidence.";
    case "local_main_synced": return "local_main_synced requires explicit local main equals origin/main evidence.";
    default: return `${stage} prerequisite is missing.`;
  }
}

function nextActionsFor(stage: SliceLifecycleStage): string[] {
  const next = SLICE_LIFECYCLE_STAGES[stageIndex(stage) + 1];
  if (!next) return ["Lifecycle complete; keep evidence available for audit."];
  return [`Collect evidence for ${next}.`, `Run harness-slice-lifecycle check --stage ${next} before claiming ${next}.`];
}

export async function assessSliceLifecycle(input: SliceLifecycleAssessmentInput = {}): Promise<SliceLifecycleAssessment> {
  const cwd = resolve(input.cwd ?? process.cwd());
  await loadLifecyclePolicy(cwd);
  const currentLogPath = join(cwd, "logs", "CURRENT.md");
  const currentLog = await readTextIfExists(currentLogPath);
  const codingRel = extractBacktickedPath(currentLog, /current coding log/i);
  const planningRel = extractBacktickedPath(currentLog, /current planning log/i);
  const codingLogPath = codingRel ? join(cwd, codingRel) : undefined;
  const planningLogPath = planningRel ? join(cwd, planningRel) : undefined;
  const codingText = codingLogPath ? await readTextIfExists(codingLogPath) : "";
  const planningText = planningLogPath ? await readTextIfExists(planningLogPath) : "";
  const explicitText = (input.explicitEvidence ?? []).join("\n");
  const combinedText = [currentLog, planningText, codingText, explicitText].join("\n");
  const taskEvidence = await loadTaskEvidence(cwd);
  const git = readGitState(cwd);
  const lifecycleEvidence = await loadLifecycleEvidenceBundle(cwd, input.evidenceFile, input.evidenceBundle);
  const bundle = lifecycleEvidence.bundle;
  const bundlePlanningReady = Boolean(
    bundle?.directImplementationExemption === true ||
    (bundle?.planning?.acceptanceCriteria && bundle.planning.acceptanceCriteria.length > 0) ||
    (bundle?.planning?.tddSlice && bundle.planning.tddSlice.trim().length > 0),
  );
  const bundleTaskReady = Boolean(bundle?.task?.acceptanceCriteria && bundle.task.acceptanceCriteria.length > 0);
  const bundleTaskValidated = bundle?.task?.validationDecision === "pass" || bundle?.task?.status === "review" || bundle?.task?.status === "done";
  const bundlePrGateClean = Boolean(
    bundle?.prGate?.status && /^(pass|passing|success)$/i.test(bundle.prGate.status) &&
    (!bundle.prGate.mergeStateStatus || /^(CLEAN|pass|passing|success)$/i.test(bundle.prGate.mergeStateStatus)),
  );

  const hasPlanningArtifact = Boolean(planningRel && planningText.trim() && /(acceptance criteria|tdd|implementation plan|planning)/i.test(planningText)) || bundlePlanningReady;
  const red = /RED Evidence|\bRED\b/i.test(codingText) || bundle?.redGreenEvidence?.red === true;
  const green = /GREEN Evidence|\bGREEN\b/i.test(codingText) || bundle?.redGreenEvidence?.green === true;
  const reviewVerdict = parseReviewVerdict(codingText) ?? bundle?.review?.verdict;
  const prUrl = parsePrUrl(combinedText) ?? bundle?.pr?.url;
  const prState = parsePrState(combinedText) ?? bundle?.pr?.state?.toUpperCase();
  const created = /(## Creation|Creation \(g-create\)|branch\/commit artifact|Commit:)/i.test(combinedText) || Boolean(bundle?.creation?.commit);
  const submitted = Boolean(prUrl) || /(## Submission|Submission \(g-submit\)|submitted)/i.test(combinedText);
  const prGateClean = /(pr[- ]?gate|mergeStateStatus|merge state|Checks:).*?(CLEAN|pass|passing|success)/is.test(combinedText) || bundlePrGateClean;
  const merged = /\bMERGED\b|mergedAt|merge commit/i.test(combinedText) || bundle?.merged?.merged === true || Boolean(bundle?.merged?.mergeCommit);
  const localMainSynced = /(local main equals origin\/main|local_main_synced|ahead\/behind:\s*0\s+0|0\s+0)/i.test(combinedText) || bundle?.localMainSynced?.synced === true || bundle?.localMainSynced?.aheadBehind === "0 0";

  const evidence: SliceLifecycleEvidence = {
    currentLogPath: (await fileExists(currentLogPath)) ? currentLogPath : undefined,
    planningLogPath,
    codingLogPath,
    hasPlanningArtifact,
    taskReady: taskEvidence.taskReady || bundleTaskReady,
    taskValidated: taskEvidence.taskValidated || bundleTaskValidated,
    redGreenEvidence: { red, green },
    reviewVerdict,
    branch: git.branch,
    cleanBranch: git.cleanBranch,
    created,
    pr: { submitted, url: prUrl, state: prState },
    prGateClean,
    merged,
    localMainSynced,
    lifecycleEvidencePath: lifecycleEvidence.path,
  };

  const achieved = new Set<SliceLifecycleStage>();
  if (hasPlanningArtifact) {
    achieved.add("intake_required");
    achieved.add("planning_ready");
  }
  if (hasPlanningArtifact && (taskEvidence.taskReady || bundleTaskReady)) achieved.add("task_ready");
  if (achieved.has("task_ready") && red) achieved.add("coding_red");
  if (achieved.has("coding_red") && green) achieved.add("coding_green");
  if (achieved.has("coding_green") && (taskEvidence.taskValidated || bundleTaskValidated)) achieved.add("review_ready");
  if (achieved.has("review_ready") && reviewVerdict === "no_required_fixes") achieved.add("checked");
  if (achieved.has("checked")) achieved.add("create_ready");
  if (achieved.has("create_ready") && created) achieved.add("created");
  if (achieved.has("created") && submitted) achieved.add("submitted");
  if (achieved.has("submitted") && prGateClean) achieved.add("pr_gate_clean");
  if (achieved.has("pr_gate_clean")) achieved.add("merge_ready");
  if (achieved.has("merge_ready") && merged) achieved.add("merged");
  if (achieved.has("merged") && localMainSynced) achieved.add("local_main_synced");

  const achievedStages = SLICE_LIFECYCLE_STAGES.filter((stage) => achieved.has(stage));
  const currentStage = achievedStages.at(-1) ?? "intake_required";
  const targetStage = input.targetStage;
  const missingPrerequisites = targetStage
    ? SLICE_LIFECYCLE_STAGES.slice(0, stageIndex(targetStage) + 1).filter((stage) => !achieved.has(stage))
    : [];
  const blockingGaps = missingPrerequisites.map(stageGapMessage);

  return {
    currentStage,
    target: targetStage ? { stage: targetStage, ready: stageMeetsOrExceeds(currentStage, targetStage) } : undefined,
    achievedStages,
    missingPrerequisites,
    blockingGaps,
    nextAllowedActions: blockingGaps.length > 0 ? [stageGapMessage(missingPrerequisites[0]!)] : nextActionsFor(currentStage),
    evidence,
    policyPath: join(cwd, DEFAULT_POLICY_PATH),
  };
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function sliceLifecycleExtension(): void {}
