import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  materializeQueueJobs,
  runBoundedQueueSession,
  type QueueJob,
  type QueueJobStatus,
} from "./queue-runner.ts";

export type AfkOrchestrationCommand = "dry-run" | "apply" | "run" | "status";
export type AfkOrchestrationMode = "dry_run" | "apply" | "run" | "status";
export type AfkIssueDisposition = "eligible" | "blocked" | "deferred" | "skipped" | "done";
export type AfkParallelDecisionStatus = "single" | "parallel_candidate" | "forced_sequential" | "sequential_default";

export interface AfkIssueArtifact {
  issueId: string;
  title: string;
  type: "HITL" | "AFK" | string;
  status?: string;
  dependencies?: string[];
  acceptanceCriteria?: string[];
  validationProof?: string[];
  domains?: string[];
  filesToModify?: string[];
  allowedPaths?: Array<string | { path?: string; access?: string; mutating?: boolean }>;
  hitlGates?: string[];
  whatToBuild?: string;
  approvalRequired?: boolean;
}

export interface AfkIssueRecord {
  issueId: string;
  title: string;
  disposition: AfkIssueDisposition;
  reasons: string[];
  dependencies: string[];
  queueJobId?: string;
}

export interface AfkParallelDecision {
  issueIds: string[];
  status: AfkParallelDecisionStatus;
  reason: string;
  sharedPaths: string[];
}

export interface AfkMaterializedQueueJob {
  id: string;
  title: string;
  status: "queued";
  sourceIssueId: string;
  sourceInitiativeId: string;
  taskClass: "implementation";
  assignedTeam: "build";
  assignedRole: string;
  acceptanceCriteria: string[];
  domains: string[];
  allowedPaths: string[];
  dependencies: string[];
  budget: NonNullable<QueueJob["budget"]>;
  approvalRequired: false;
  stop_conditions: string[];
  sourceArtifactPaths: string[];
  queueJobSource: NonNullable<QueueJob["queueJobSource"]>;
}

export interface AfkSourceArtifacts {
  issues: string;
  slicePlan: string;
  pipeline: string;
  summaries: string[];
}

export interface AfkOrchestrationRun {
  version: 1;
  runId: string;
  initiativeId: string;
  mode: AfkOrchestrationMode;
  maxParallel: number;
  sourceArtifacts: AfkSourceArtifacts;
  eligibleIssues: AfkIssueRecord[];
  blockedIssues: AfkIssueRecord[];
  deferredIssues: AfkIssueRecord[];
  skippedIssues: AfkIssueRecord[];
  doneIssues: AfkIssueRecord[];
  parallelDecisions: AfkParallelDecision[];
  materializedQueueJobs: AfkMaterializedQueueJob[];
  startedQueueJobs: string[];
  lastAction: string;
  nextOperatorAction: string;
  explainIssue: AfkIssueRecord | null;
}

export interface AfkOrchestrationInput {
  repoRoot?: string;
  command: AfkOrchestrationCommand;
  initiativeId: string;
  runId?: string;
  now?: string;
  maxParallel?: number;
  maxSteps?: number;
  maxRuntimeSeconds?: number;
  explainIssueId?: string;
  queueOnly?: boolean;
  runRequested?: boolean;
  owner?: string;
}

interface LoadedArtifacts {
  initiativeRoot: string;
  sourceArtifacts: AfkSourceArtifacts;
  issues: AfkIssueArtifact[];
}

const INITIATIVE_ROOT = "docs/initiatives";
const VALID_DOMAINS = ["frontend", "backend", "infra", "docs", "research"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSlug(value: string, label: string): string {
  const slug = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid ${label}: ${value}`);
  return slug;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function timestampRunId(now: string): string {
  return `afk-${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`.toLowerCase();
}

function modeForCommand(command: AfkOrchestrationCommand): AfkOrchestrationMode {
  return command === "dry-run" ? "dry_run" : command;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()) : [];
}

function normalizeAllowedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim().replace(/^\.\//, "").replace(/\/$/, "")];
    if (isRecord(entry) && typeof entry.path === "string" && entry.path.trim()) return [entry.path.trim().replace(/^\.\//, "").replace(/\/$/, "")];
    return [];
  });
}

function normalizeIssue(value: unknown, index: number): AfkIssueArtifact {
  if (!isRecord(value)) throw new Error(`issues[${index}] must be an object.`);
  const issueId = typeof value.issueId === "string" ? assertSlug(value.issueId, `issues[${index}].issueId`) : "";
  if (!issueId) throw new Error(`issues[${index}].issueId is required.`);
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : issueId;
  return {
    issueId,
    title,
    type: typeof value.type === "string" ? value.type : "",
    status: typeof value.status === "string" ? value.status : "planned",
    dependencies: normalizeStringArray(value.dependencies),
    acceptanceCriteria: normalizeStringArray(value.acceptanceCriteria),
    validationProof: normalizeStringArray(value.validationProof),
    domains: normalizeStringArray(value.domains),
    filesToModify: normalizeStringArray(value.filesToModify),
    allowedPaths: Array.isArray(value.allowedPaths) ? value.allowedPaths as AfkIssueArtifact["allowedPaths"] : [],
    hitlGates: normalizeStringArray(value.hitlGates),
    whatToBuild: typeof value.whatToBuild === "string" ? value.whatToBuild.trim() : undefined,
    approvalRequired: value.approvalRequired === true,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${path}: ${(error as Error).message}`);
  }
}

export function afkRunsDir(initiativeId: string): string {
  return `${INITIATIVE_ROOT}/${assertSlug(initiativeId, "initiativeId")}/afk-runs`;
}

export function afkRunPath(initiativeId: string, runId: string): string {
  return `${afkRunsDir(initiativeId)}/${assertSlug(runId, "runId")}.json`;
}

async function loadArtifacts(repoRoot: string, initiativeId: string): Promise<LoadedArtifacts> {
  const slug = assertSlug(initiativeId, "initiativeId");
  const initiativeRoot = `${INITIATIVE_ROOT}/${slug}`;
  const issuesPath = `${initiativeRoot}/issues.json`;
  const slicePlanPath = `${initiativeRoot}/slice-plan.json`;
  const pipelinePath = `${initiativeRoot}/pipeline.json`;
  for (const artifactPath of [issuesPath, slicePlanPath, pipelinePath]) {
    if (!(await exists(resolve(repoRoot, artifactPath)))) throw new Error(`Missing Phase A artifact: ${artifactPath}`);
  }

  const issuesJson = await readJson(resolve(repoRoot, issuesPath), "issues.json");
  if (!isRecord(issuesJson) || !Array.isArray(issuesJson.issues)) throw new Error(`${issuesPath} must contain an issues array.`);
  const issues = issuesJson.issues.map(normalizeIssue);
  const summaries: string[] = [];
  for (const issue of issues) {
    const summaryPath = `${initiativeRoot}/slices/${issue.issueId}.summary.json`;
    if (await exists(resolve(repoRoot, summaryPath))) summaries.push(summaryPath);
  }
  return {
    initiativeRoot,
    sourceArtifacts: {
      issues: issuesPath,
      slicePlan: slicePlanPath,
      pipeline: pipelinePath,
      summaries,
    },
    issues,
  };
}

function statusDoneOrApproved(issue: AfkIssueArtifact | undefined): boolean {
  return issue?.status === "done" || issue?.status === "approved";
}

function assignedRoleForDomains(domains: string[]): QueueJob["assignedRole"] {
  if (domains.includes("frontend")) return "frontend_worker";
  if (domains.includes("backend")) return "backend_worker";
  if (domains.includes("infra")) return "infra_worker";
  if (domains.includes("docs")) return "docs_worker";
  if (domains.includes("research")) return "research_worker";
  return "backend_worker";
}

function queueJobId(initiativeId: string, issueId: string): string {
  return `afk-${initiativeId}-${issueId}`;
}

function pathsOverlap(left: string, right: string): boolean {
  const a = left.replace(/\/$/, "");
  const b = right.replace(/\/$/, "");
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function sharedPaths(left: AfkIssueArtifact, right: AfkIssueArtifact): string[] {
  const leftPaths = [...normalizeStringArray(left.filesToModify), ...normalizeAllowedPaths(left.allowedPaths)];
  const rightPaths = [...normalizeStringArray(right.filesToModify), ...normalizeAllowedPaths(right.allowedPaths)];
  const shared = new Set<string>();
  for (const leftPath of leftPaths) {
    for (const rightPath of rightPaths) {
      if (pathsOverlap(leftPath, rightPath)) shared.add(`${leftPath} ↔ ${rightPath}`);
    }
  }
  return [...shared].sort();
}

function buildParallelDecisions(eligibleIssues: AfkIssueArtifact[], maxParallel: number): AfkParallelDecision[] {
  if (eligibleIssues.length < 2) {
    return [{ issueIds: eligibleIssues.map((issue) => issue.issueId), status: "single", reason: "Fewer than two eligible AFK issues.", sharedPaths: [] }];
  }
  const decisions: AfkParallelDecision[] = [];
  for (let leftIndex = 0; leftIndex < eligibleIssues.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < eligibleIssues.length; rightIndex += 1) {
      const left = eligibleIssues[leftIndex];
      const right = eligibleIssues[rightIndex];
      const shared = sharedPaths(left, right);
      if (shared.length > 0) {
        decisions.push({
          issueIds: [left.issueId, right.issueId],
          status: "forced_sequential",
          reason: "Eligible issues share files or mutating allowed path roots, so Phase B will not mark them as parallel candidates.",
          sharedPaths: shared,
        });
      } else if (maxParallel > 1) {
        decisions.push({ issueIds: [left.issueId, right.issueId], status: "parallel_candidate", reason: "Eligible issues have disjoint files and allowed paths.", sharedPaths: [] });
      } else {
        decisions.push({ issueIds: [left.issueId, right.issueId], status: "sequential_default", reason: "maxParallel is 1; eligible issues stay sequential by default.", sharedPaths: [] });
      }
    }
  }
  return decisions;
}

function evaluateIssues(artifacts: LoadedArtifacts): {
  eligible: AfkIssueArtifact[];
  eligibleIssues: AfkIssueRecord[];
  blockedIssues: AfkIssueRecord[];
  deferredIssues: AfkIssueRecord[];
  skippedIssues: AfkIssueRecord[];
  doneIssues: AfkIssueRecord[];
} {
  const byId = new Map(artifacts.issues.map((issue) => [issue.issueId, issue]));
  const summarySet = new Set(artifacts.sourceArtifacts.summaries);
  const eligible: AfkIssueArtifact[] = [];
  const eligibleIssues: AfkIssueRecord[] = [];
  const blockedIssues: AfkIssueRecord[] = [];
  const deferredIssues: AfkIssueRecord[] = [];
  const skippedIssues: AfkIssueRecord[] = [];
  const doneIssues: AfkIssueRecord[] = [];

  for (const issue of artifacts.issues) {
    const dependencies = normalizeStringArray(issue.dependencies);
    const recordBase = { issueId: issue.issueId, title: issue.title, dependencies, queueJobId: queueJobId(artifacts.sourceArtifacts.issues.split("/")[2] ?? "initiative", issue.issueId) };
    const reasons: string[] = [];
    if (statusDoneOrApproved(issue)) {
      doneIssues.push({ ...recordBase, disposition: "done", reasons: [`Issue status is ${issue.status}.`] });
      continue;
    }
    if (issue.type === "HITL") {
      skippedIssues.push({ ...recordBase, disposition: "skipped", reasons: ["HITL issues are never queued automatically."] });
      continue;
    }
    if (issue.type !== "AFK") reasons.push(`Unsupported issue type: ${issue.type || "missing"}.`);
    const unresolved = dependencies.filter((dependencyId) => !statusDoneOrApproved(byId.get(dependencyId)));
    if (unresolved.length > 0) {
      deferredIssues.push({ ...recordBase, disposition: "deferred", reasons: [`Unresolved dependencies: ${unresolved.join(", ")}.`] });
      continue;
    }
    if ((issue.hitlGates ?? []).length > 0) reasons.push(`HITL gates are present: ${(issue.hitlGates ?? []).join("; ")}.`);
    if (issue.approvalRequired) reasons.push("approvalRequired is true; AFK auto-queue is not allowed.");
    if ((issue.acceptanceCriteria ?? []).length === 0) reasons.push("Missing acceptance criteria.");
    if ((issue.validationProof ?? []).length === 0) reasons.push("Missing validation proof.");
    if ((issue.domains ?? []).filter((domain) => (VALID_DOMAINS as readonly string[]).includes(domain)).length === 0) reasons.push("Missing valid domains.");
    if (normalizeAllowedPaths(issue.allowedPaths).length === 0) reasons.push("Missing allowedPaths.");
    const summaryPath = `${artifacts.initiativeRoot}/slices/${issue.issueId}.summary.json`;
    if (!summarySet.has(summaryPath)) reasons.push(`Missing per-slice summary: ${summaryPath}.`);

    if (reasons.length > 0) {
      blockedIssues.push({ ...recordBase, disposition: "blocked", reasons });
      continue;
    }
    eligible.push(issue);
    eligibleIssues.push({ ...recordBase, disposition: "eligible", reasons: ["AFK issue is queueable."] });
  }

  return { eligible, eligibleIssues, blockedIssues, deferredIssues, skippedIssues, doneIssues };
}

function buildTddSlice(issue: AfkIssueArtifact): NonNullable<QueueJob["tddSlice"]> {
  return {
    firstTracerBehavior: issue.acceptanceCriteria?.[0] ?? `Implement ${issue.issueId} tracer behavior.`,
    publicInterface: normalizeStringArray(issue.filesToModify)[0] ?? normalizeAllowedPaths(issue.allowedPaths)[0] ?? issue.issueId,
    testSurface: (issue.validationProof && issue.validationProof.length > 0) ? issue.validationProof : [`Add or update focused tests for ${issue.issueId}.`],
    boundaryDependencies: ["Phase B creates queue-ready jobs only; worker implementation dependencies must be identified in the worker task."],
    mockPlan: "Mock only external system boundaries needed by the worker slice; do not add live provider calls by default.",
    outOfScopeBehaviors: ["Phase B AFK orchestration does not perform product code edits or claim implementation completion."],
  };
}

function buildQueueJob(initiativeId: string, issue: AfkIssueArtifact, runId: string, sourceArtifactPaths: string[]): QueueJob {
  const domains = normalizeStringArray(issue.domains).filter((domain) => (VALID_DOMAINS as readonly string[]).includes(domain)) as QueueJob["domains"];
  const allowedPaths = normalizeAllowedPaths(issue.allowedPaths);
  const jobId = queueJobId(initiativeId, issue.issueId);
  return {
    id: jobId,
    goal: issue.whatToBuild || issue.title,
    priority: "medium",
    status: "queued",
    scope: `AFK issue ${issue.issueId} from initiative ${initiativeId}`,
    team: "build",
    dependencies: [],
    budget: {
      maxRetries: 1,
      maxRuntimeMinutes: 60,
      maxFailedValidations: 1,
      maxUnresolvedBlockers: 0,
    },
    stop_conditions: ["approval_boundary_hit"],
    approvalRequired: false,
    acceptanceCriteria: issue.acceptanceCriteria ?? [],
    taskClass: "implementation",
    workType: "implementation",
    domains,
    allowedPaths,
    assignedRole: assignedRoleForDomains(domains ?? []),
    routeReason: "default",
    budgetMode: "balanced",
    tddSlice: buildTddSlice(issue),
    queueJobSource: {
      kind: "issue-materialization",
      initiativeId,
      issueId: issue.issueId,
      runId,
      sourceArtifactPaths,
    },
    notes: [
      "queueJobSource: issue-materialization",
      "Phase B queued this job from durable issue artifacts only; worker execution remains bounded by queue runner/operator controls.",
      `Validation proof expected: ${(issue.validationProof ?? []).join("; ")}`,
    ],
  };
}

function summarizeQueueJob(job: QueueJob, issue: AfkIssueArtifact, initiativeId: string, sourceArtifactPaths: string[]): AfkMaterializedQueueJob {
  return {
    id: job.id,
    title: issue.title,
    status: "queued",
    sourceIssueId: issue.issueId,
    sourceInitiativeId: initiativeId,
    taskClass: "implementation",
    assignedTeam: "build",
    assignedRole: job.assignedRole ?? "backend_worker",
    acceptanceCriteria: job.acceptanceCriteria ?? [],
    domains: job.domains ?? [],
    allowedPaths: job.allowedPaths ?? [],
    dependencies: job.dependencies ?? [],
    budget: job.budget ?? {},
    approvalRequired: false,
    stop_conditions: job.stop_conditions ?? [],
    sourceArtifactPaths,
    queueJobSource: job.queueJobSource!,
  };
}

async function readIssueQueueStatuses(repoRoot: string, initiativeId: string): Promise<Map<string, QueueJobStatus>> {
  const queuePath = resolve(repoRoot, ".pi/agent/state/runtime/queue.json");
  try {
    const parsed = JSON.parse(await readFile(queuePath, "utf8")) as { jobs?: QueueJob[] };
    return new Map((parsed.jobs ?? [])
      .filter((job) => job.queueJobSource?.initiativeId === initiativeId)
      .map((job) => [job.id, job.status]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
}

async function latestAfkRun(repoRoot: string, initiativeId: string): Promise<AfkOrchestrationRun | null> {
  const dir = resolve(repoRoot, afkRunsDir(initiativeId));
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    if (names.length === 0) return null;
    return JSON.parse(await readFile(join(dir, names[names.length - 1]), "utf8")) as AfkOrchestrationRun;
  } catch {
    return null;
  }
}

function buildRun(input: AfkOrchestrationInput, artifacts: LoadedArtifacts, existingStatuses?: Map<string, QueueJobStatus>): AfkOrchestrationRun {
  const now = input.now ?? new Date().toISOString();
  const runId = input.runId ? assertSlug(input.runId, "runId") : timestampRunId(now);
  const maxParallel = Math.max(1, input.maxParallel ?? 1);
  const evaluated = evaluateIssues(artifacts);
  const sourceArtifactPaths = [artifacts.sourceArtifacts.issues, artifacts.sourceArtifacts.slicePlan, artifacts.sourceArtifacts.pipeline, ...artifacts.sourceArtifacts.summaries];
  const queueJobs = evaluated.eligible.map((issue) => buildQueueJob(input.initiativeId, issue, runId, sourceArtifactPaths));
  const materializedQueueJobs = queueJobs.map((job, index) => summarizeQueueJob(job, evaluated.eligible[index], input.initiativeId, sourceArtifactPaths));
  const explainIssue = input.explainIssueId
    ? [...evaluated.eligibleIssues, ...evaluated.blockedIssues, ...evaluated.deferredIssues, ...evaluated.skippedIssues, ...evaluated.doneIssues]
      .find((issue) => issue.issueId === input.explainIssueId) ?? null
    : null;

  if (existingStatuses) {
    for (const record of [...evaluated.eligibleIssues, ...evaluated.blockedIssues, ...evaluated.deferredIssues, ...evaluated.skippedIssues, ...evaluated.doneIssues]) {
      const status = existingStatuses.get(record.queueJobId ?? "");
      if (status) record.reasons.push(`Current queue job status: ${status}.`);
    }
  }

  return {
    version: 1,
    runId,
    initiativeId: input.initiativeId,
    mode: modeForCommand(input.command),
    maxParallel,
    sourceArtifacts: artifacts.sourceArtifacts,
    eligibleIssues: evaluated.eligibleIssues,
    blockedIssues: evaluated.blockedIssues,
    deferredIssues: evaluated.deferredIssues,
    skippedIssues: evaluated.skippedIssues,
    doneIssues: evaluated.doneIssues,
    parallelDecisions: buildParallelDecisions(evaluated.eligible, maxParallel),
    materializedQueueJobs,
    startedQueueJobs: [],
    lastAction: input.command === "dry-run" ? "Computed AFK queue orchestration plan without writing files." : "Computed AFK queue orchestration plan.",
    nextOperatorAction: evaluated.eligible.length > 0 ? "Run apply --queue-only to materialize queue jobs, or run --run with explicit bounds to start a bounded queue session." : "Resolve blockers/dependencies/HITL gates, then rerun dry-run.",
    explainIssue,
  };
}

async function writeRunArtifact(repoRoot: string, run: AfkOrchestrationRun): Promise<void> {
  const path = resolve(repoRoot, afkRunPath(run.initiativeId, run.runId));
  await mkdir(resolve(repoRoot, afkRunsDir(run.initiativeId)), { recursive: true });
  await writeFile(path, stableJson(run), "utf8");
}

export async function runAfkOrchestration(input: AfkOrchestrationInput): Promise<AfkOrchestrationRun> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const initiativeId = assertSlug(input.initiativeId, "initiativeId");
  const maxParallel = Math.max(1, input.maxParallel ?? 1);
  const artifacts = await loadArtifacts(repoRoot, initiativeId);

  if (input.command === "status") {
    const statuses = await readIssueQueueStatuses(repoRoot, initiativeId);
    const run = buildRun({ ...input, initiativeId, maxParallel }, artifacts, statuses);
    const latest = await latestAfkRun(repoRoot, initiativeId);
    run.lastAction = latest ? `Latest AFK run artifact: ${afkRunPath(initiativeId, latest.runId)}` : "No AFK run artifact found.";
    run.nextOperatorAction = run.eligibleIssues.length > 0 ? "Run dry-run or apply --queue-only after reviewing current queue state." : "Resolve visible blockers before queue materialization.";
    return run;
  }

  const run = buildRun({ ...input, initiativeId, maxParallel }, artifacts);
  const queueJobs = run.materializedQueueJobs.map((summary) => {
    const issue = artifacts.issues.find((candidate) => candidate.issueId === summary.sourceIssueId)!;
    return buildQueueJob(initiativeId, issue, run.runId, summary.sourceArtifactPaths);
  });

  if (input.command === "dry-run") return run;

  if (input.command === "apply" && input.runRequested) throw new Error("apply is queue-only; use the run command with --run to start a bounded queue session.");
  if (input.command === "run" && input.queueOnly) throw new Error("run mode cannot use --queue-only; use apply --queue-only to materialize without session execution.");
  if (input.command === "run" && (!input.maxSteps || !input.maxRuntimeSeconds)) throw new Error("run mode requires explicit --max-steps and --max-runtime-seconds.");

  const materialization = await materializeQueueJobs(repoRoot, queueJobs);
  run.lastAction = materialization.createdJobs.length > 0
    ? `Materialized ${materialization.createdJobs.length} queue job(s) through queue-runner materializeQueueJobs.`
    : "No new queue jobs materialized; matching queue jobs already exist.";
  run.nextOperatorAction = input.command === "apply" ? "Review queue status, then run a bounded queue session explicitly if desired." : "Bounded queue session completed or stopped; inspect startedQueueJobs and queue status.";

  if (input.command === "run") {
    const session = await runBoundedQueueSession(repoRoot, {
      owner: input.owner ?? "afk-orchestrator",
      maxSteps: input.maxSteps,
      maxRuntimeSeconds: input.maxRuntimeSeconds,
      recentLimit: 5,
    });
    run.startedQueueJobs = session.steps.flatMap((step) => step.startedJobId ? [step.startedJobId] : []);
    run.lastAction = `Materialized ${materialization.createdJobs.length} queue job(s), then delegated to runBoundedQueueSession; stopReason=${session.stopReason}.`;
  }

  await writeRunArtifact(repoRoot, run);
  return run;
}

export function renderAfkOrchestrationRun(run: AfkOrchestrationRun): string {
  const lines = [
    "Harness AFK Orchestration",
    `mode: ${run.mode}`,
    `initiative: ${run.initiativeId}`,
    `run: ${run.runId}`,
    `maxParallel: ${run.maxParallel}`,
    `eligible: ${run.eligibleIssues.length}`,
    `blocked: ${run.blockedIssues.length}`,
    `deferred: ${run.deferredIssues.length}`,
    `skipped: ${run.skippedIssues.length}`,
    "materialized queue jobs:",
    ...(run.materializedQueueJobs.length > 0 ? run.materializedQueueJobs.map((job) => `- ${job.id} (${job.assignedRole})`) : ["- none"]),
    "parallel decisions:",
    ...(run.parallelDecisions.length > 0 ? run.parallelDecisions.map((decision) => `- ${decision.issueIds.join(" + ")}: ${decision.status} — ${decision.reason}`) : ["- none"]),
  ];
  if (run.explainIssue) {
    lines.push("explain:", `- ${run.explainIssue.issueId}: ${run.explainIssue.disposition}: ${run.explainIssue.reasons.join("; ")}`);
  }
  lines.push(`lastAction: ${run.lastAction}`, `nextOperatorAction: ${run.nextOperatorAction}`);
  return lines.join("\n");
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function afkOrchestrationExtension(): void {}
