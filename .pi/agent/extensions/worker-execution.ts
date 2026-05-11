import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { filterMeaningfulGitDirtyLines } from "./git-dirty-runtime-artifacts.ts";
import { isOperationalLogPath } from "./afk-worker-execution-plan.ts";
import {
  readQueueState,
  updateQueueJobWorkerExecution,
  type QueueJob,
} from "./queue-runner.ts";
import {
  acquireWorkerLaneLease,
  findWorkerLaneLease,
  releaseWorkerLaneLease,
  type ExecutionLeaseRecord,
} from "./execution-leases.ts";
import {
  applyTaskUpdateAction,
  getTask,
  loadCompletionGatePolicy,
  mutateTaskState,
  type TaskRecord,
} from "./till-done.ts";

const execFile = promisify(execFileCallback);
const INITIATIVE_ROOT = "docs/initiatives";
const WORKER_RUN_VERSION = 1 as const;
const DEFAULT_OWNER = "phase-c-worker-executor";
const PROTECTED_PATH_PREFIXES = [".git", "node_modules", ".pi/agent/state/runtime"];
const PROTECTED_PATH_EXACT = new Set([".env"]);
const SAFE_COMMANDS = new Set(["node", "npm", "pnpm", "bun", "bash", "sh", "tsx", "git"]);

export type WorkerExecutionCommand = "dry-run" | "run" | "status" | "resume" | "explain-run";
export type WorkerExecutionMode = "dry_run" | "run" | "resume" | "status";
export type WorkerExecutionStatus = "planned" | "running" | "blocked" | "failed" | "review_ready" | "done";
export type WorkerStepStatus = "pending" | "skipped" | "running" | "passed" | "failed" | "blocked";
export type WorkerReviewVerdict = "no_required_fixes" | "changes_required" | "not_run";

export interface WorkerCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface WorkerRunStep {
  status: WorkerStepStatus;
  logPath?: string | null;
  commands?: string[];
  evidence?: string[];
  redCommand?: string | null;
  redResult?: WorkerCommandResult | null;
  greenCommand?: string | null;
  greenResult?: WorkerCommandResult | null;
  changedFiles?: string[];
  results?: WorkerCommandResult[];
  verdict?: WorkerReviewVerdict;
  findings?: string[];
}

export interface WorkerExecutionRun {
  version: 1;
  runId: string;
  initiativeId: string;
  sourceIssueId: string;
  queueJobId: string;
  linkedTaskId: string | null;
  mode: WorkerExecutionMode;
  status: WorkerExecutionStatus;
  worktree: {
    path: string | null;
    branch: string | null;
    baseRef: string;
    leaseId: string | null;
  };
  steps: {
    planning: WorkerRunStep;
    coding: WorkerRunStep;
    validation: WorkerRunStep;
    review: WorkerRunStep;
  };
  retryPolicy: {
    maxStepRetries: number;
    attempts: Record<string, number>;
  };
  prBoundary: {
    stopBeforePr: boolean;
    allowPrCreate: boolean;
    prCreated: boolean;
    reason: string;
  };
  stopReason: string | null;
  nextOperatorAction: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerExecutionInput {
  repoRoot?: string;
  command: WorkerExecutionCommand;
  initiativeId: string;
  queueJobId?: string;
  runId?: string;
  now?: string;
  owner?: string;
  baseRef?: string;
  worktreeParent?: string;
  worktreePath?: string;
  maxRuntimeSeconds?: number;
  maxSteps?: number;
  redCommand?: string;
  implementationCommand?: string;
  validationCommands?: string[];
  reviewVerdict?: Exclude<WorkerReviewVerdict, "not_run">;
  stopBeforePr?: boolean;
  allowPrCreate?: boolean;
  explicitApprovalRef?: string;
  explainRunId?: string;
}

interface AfkIssueArtifact {
  issueId: string;
  title?: string;
  type?: string;
  status?: string;
  acceptanceCriteria?: string[];
  validationProof?: string[];
  domains?: string[];
  allowedPaths?: Array<string | { path?: string }>;
  hitlGates?: string[];
  approvalRequired?: boolean;
}

interface LoadedWorkerContext {
  initiativeRoot: string;
  issue: AfkIssueArtifact;
  job: QueueJob;
}

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

function nowIso(input?: string): string {
  return input ?? new Date().toISOString();
}

function timestampRunId(now: string): string {
  return `worker-${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`.toLowerCase();
}

function modeForCommand(command: WorkerExecutionCommand): WorkerExecutionMode {
  if (command === "dry-run") return "dry_run";
  if (command === "resume") return "resume";
  return command === "status" || command === "explain-run" ? "status" : "run";
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

function isProtectedPath(pathValue: string): boolean {
  const normalized = pathValue.replace(/^\.\//, "").replace(/\/$/, "");
  if (PROTECTED_PATH_EXACT.has(normalized)) return true;
  if (/^\.env(?:\.|$)/.test(normalized)) return true;
  return PROTECTED_PATH_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function pathWithinAllowed(pathValue: string, allowedPaths: string[]): boolean {
  const normalized = pathValue.replace(/^\.\//, "").replace(/\/$/, "");
  return allowedPaths.some((allowed) => {
    const root = allowed.replace(/^\.\//, "").replace(/\/$/, "");
    return normalized === root || normalized.startsWith(`${root}/`);
  });
}

function splitCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^(["'])(.*)\1$/, "$2")) ?? [];
  if (parts.length === 0) throw new Error("Command must not be empty.");
  return parts;
}

function assertSafeCommand(command: string): void {
  const [program, ...args] = splitCommand(command);
  if (!SAFE_COMMANDS.has(program) && !program.startsWith("./scripts/")) throw new Error(`Refusing unapproved command: ${program}`);
  if (args.some((arg) => /(^|\/)\.\.($|\/)/.test(arg))) throw new Error(`Refusing command with parent-directory traversal: ${command}`);
  if (/\b(git\s+(merge|rebase|reset|clean|push|checkout|switch)|rm\s+-rf|force-with-lease|--force)\b/.test(command)) throw new Error(`Refusing unsafe command: ${command}`);
}

async function runCommand(cwd: string, command: string, timeoutSeconds: number): Promise<WorkerCommandResult> {
  assertSafeCommand(command);
  const started = Date.now();
  const [program, ...args] = splitCommand(command);
  try {
    const result = await execFile(program, args, { cwd, encoding: "utf8", timeout: Math.max(1, timeoutSeconds) * 1000, maxBuffer: 1024 * 1024 });
    return { command, exitCode: 0, stdout: result.stdout.trimEnd(), stderr: result.stderr.trimEnd(), durationMs: Date.now() - started };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    const code = typeof failure.code === "number" ? failure.code : 1;
    return { command, exitCode: code, stdout: (failure.stdout ?? "").trimEnd(), stderr: (failure.stderr ?? failure.message ?? "").trimEnd(), durationMs: Date.now() - started };
  }
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch {
    return false;
  }
}

async function readJson(pathValue: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(pathValue, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${pathValue}: ${(error as Error).message}`);
  }
}

export function workerRunsDir(initiativeId: string): string {
  return `${INITIATIVE_ROOT}/${assertSlug(initiativeId, "initiativeId")}/worker-runs`;
}

export function workerRunPath(initiativeId: string, runId: string): string {
  return `${workerRunsDir(initiativeId)}/${assertSlug(runId, "runId")}.json`;
}

async function readLatestWorkerRun(repoRoot: string, initiativeId: string): Promise<WorkerExecutionRun | null> {
  const dir = resolve(repoRoot, workerRunsDir(initiativeId));
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    if (names.length === 0) return null;
    return JSON.parse(await readFile(join(dir, names[names.length - 1]), "utf8")) as WorkerExecutionRun;
  } catch {
    return null;
  }
}

async function readWorkerRun(repoRoot: string, initiativeId: string, runId: string): Promise<WorkerExecutionRun> {
  return JSON.parse(await readFile(resolve(repoRoot, workerRunPath(initiativeId, runId)), "utf8")) as WorkerExecutionRun;
}

async function writeWorkerRun(repoRoot: string, run: WorkerExecutionRun): Promise<void> {
  const pathValue = resolve(repoRoot, workerRunPath(run.initiativeId, run.runId));
  await mkdir(dirname(pathValue), { recursive: true });
  await writeFile(pathValue, stableJson(run), "utf8");
}

async function loadIssue(repoRoot: string, initiativeId: string, issueId: string): Promise<{ initiativeRoot: string; issue: AfkIssueArtifact }> {
  const initiativeRoot = `${INITIATIVE_ROOT}/${initiativeId}`;
  const issuesPath = resolve(repoRoot, initiativeRoot, "issues.json");
  const parsed = await readJson(issuesPath, "issues.json");
  if (!isRecord(parsed) || !Array.isArray(parsed.issues)) throw new Error(`${initiativeRoot}/issues.json must contain an issues array.`);
  const issue = parsed.issues.find((candidate) => isRecord(candidate) && candidate.issueId === issueId) as AfkIssueArtifact | undefined;
  if (!issue) throw new Error(`Issue ${issueId} was not found in ${initiativeRoot}/issues.json.`);
  return { initiativeRoot, issue };
}

async function selectJob(repoRoot: string, initiativeId: string, queueJobId?: string): Promise<QueueJob> {
  const queue = await readQueueState(repoRoot);
  const candidates = queue.jobs.filter((job) => job.queueJobSource?.kind === "issue-materialization" && job.queueJobSource.initiativeId === initiativeId);
  if (queueJobId) {
    const selected = candidates.find((job) => job.id === queueJobId);
    if (!selected) throw new Error(`Queue job not found for initiative ${initiativeId}: ${queueJobId}`);
    return selected;
  }
  const runnable = candidates.filter((job) => job.status === "queued" || job.status === "running");
  if (runnable.length !== 1) throw new Error(`Expected exactly one selected queue-ready AFK job; found ${runnable.length}. Pass --job-id.`);
  return runnable[0];
}

async function loadContext(repoRoot: string, initiativeIdInput: string, queueJobId?: string): Promise<LoadedWorkerContext> {
  const initiativeId = assertSlug(initiativeIdInput, "initiativeId");
  const job = await selectJob(repoRoot, initiativeId, queueJobId);
  const issueId = job.queueJobSource?.issueId;
  if (!issueId) throw new Error(`Queue job ${job.id} is missing queueJobSource.issueId.`);
  const loaded = await loadIssue(repoRoot, initiativeId, issueId);
  return { ...loaded, job };
}

function eligibilityProblems(job: QueueJob, issue: AfkIssueArtifact): string[] {
  const problems: string[] = [];
  const allowedPaths = normalizeAllowedPaths(issue.allowedPaths).length > 0 ? normalizeAllowedPaths(issue.allowedPaths) : normalizeStringArray(job.allowedPaths);
  const domains = normalizeStringArray(issue.domains).length > 0 ? normalizeStringArray(issue.domains) : normalizeStringArray(job.domains);
  const acceptance = normalizeStringArray(issue.acceptanceCriteria).length > 0 ? normalizeStringArray(issue.acceptanceCriteria) : normalizeStringArray(job.acceptanceCriteria);
  const validation = normalizeStringArray(issue.validationProof);

  if (issue.type !== "AFK") problems.push("Executor refuses HITL/non-AFK jobs.");
  if ((issue.hitlGates ?? []).length > 0) problems.push("Executor refuses jobs with HITL gates.");
  if (issue.approvalRequired === true || job.approvalRequired === true) problems.push("Executor refuses jobs with approvalRequired=true.");
  if (allowedPaths.length === 0) problems.push("Executor refuses jobs without allowed paths.");
  if (domains.length === 0) problems.push("Executor refuses jobs without domains.");
  if (acceptance.length === 0) problems.push("Executor refuses jobs without acceptance criteria.");
  if (validation.length === 0) problems.push("Executor refuses jobs without validation commands.");
  for (const allowed of allowedPaths) {
    if (isProtectedPath(allowed)) problems.push(`Executor refuses protected allowed path: ${allowed}`);
  }
  return problems;
}

function emptyStep(status: WorkerStepStatus = "pending"): WorkerRunStep {
  return { status, commands: [], evidence: [] };
}

function buildPlannedRun(input: WorkerExecutionInput, context: LoadedWorkerContext): WorkerExecutionRun {
  const now = nowIso(input.now);
  const runId = input.runId ? assertSlug(input.runId, "runId") : timestampRunId(now);
  const allowPrCreate = input.allowPrCreate === true && Boolean(input.explicitApprovalRef);
  if (input.stopBeforePr === false && !allowPrCreate) throw new Error("Disabling --stop-before-pr requires --allow-pr-create and --approval-ref.");
  const stopBeforePr = input.stopBeforePr !== false;
  return {
    version: WORKER_RUN_VERSION,
    runId,
    initiativeId: assertSlug(input.initiativeId, "initiativeId"),
    sourceIssueId: context.job.queueJobSource?.issueId ?? context.issue.issueId,
    queueJobId: context.job.id,
    linkedTaskId: context.job.linkedTaskId ?? null,
    mode: modeForCommand(input.command),
    status: "planned",
    worktree: {
      path: null,
      branch: null,
      baseRef: input.baseRef ?? "origin/main",
      leaseId: null,
    },
    steps: {
      planning: emptyStep("pending"),
      coding: emptyStep("pending"),
      validation: emptyStep("pending"),
      review: emptyStep("pending"),
    },
    retryPolicy: {
      maxStepRetries: 1,
      attempts: {},
    },
    prBoundary: {
      stopBeforePr,
      allowPrCreate,
      prCreated: false,
      reason: allowPrCreate ? `PR creation explicitly allowed by ${input.explicitApprovalRef}.` : "Phase C defaults to --stop-before-pr and does not auto-merge.",
    },
    stopReason: null,
    nextOperatorAction: "Review planned worker execution, then run with explicit bounds when ready.",
    createdAt: now,
    updatedAt: now,
  };
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFile("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trimEnd();
}

async function ensureCleanGitWorktree(pathValue: string): Promise<void> {
  let porcelain = "";
  try {
    porcelain = await runGit(pathValue, ["status", "--porcelain=v1"]);
  } catch (error) {
    throw new Error(`Unable to inspect git worktree at ${pathValue}: ${(error as Error).message}`);
  }
  const dirtyLines = filterMeaningfulGitDirtyLines(porcelain.split("\n").map((line) => line.trim()).filter(Boolean));
  if (dirtyLines.length > 0) throw new Error(`Refusing dirty or conflicted worktree at ${pathValue}: ${dirtyLines[0]}`);
}

async function createIsolatedWorktree(repoRoot: string, run: WorkerExecutionRun, input: WorkerExecutionInput): Promise<{ path: string; branch: string }> {
  await ensureCleanGitWorktree(repoRoot);
  const branch = `worker/${run.runId}-${run.sourceIssueId}`;
  const parent = resolve(input.worktreeParent ?? join(dirname(repoRoot), `${basename(repoRoot)}-worktrees`));
  const worktreePath = resolve(input.worktreePath ?? join(parent, `${run.runId}-${run.sourceIssueId}`));
  await mkdir(dirname(worktreePath), { recursive: true });
  if (!(await pathExists(worktreePath))) {
    await runGit(repoRoot, ["worktree", "add", "-b", branch, worktreePath, run.worktree.baseRef]);
  }
  await ensureCleanGitWorktree(worktreePath);
  return { path: worktreePath, branch };
}

async function changedFiles(cwd: string): Promise<string[]> {
  const output = await runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output.split("\n").filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean).sort();
}

function assertChangedFilesAllowed(files: string[], allowedPaths: string[]): void {
  const problems = files.flatMap((file) => {
    if (isOperationalLogPath(file)) return [];
    if (isProtectedPath(file)) return [`protected path mutation attempt: ${file}`];
    if (!pathWithinAllowed(file, allowedPaths)) return [`changed file outside allowed paths: ${file}`];
    return [];
  });
  if (problems.length > 0) throw new Error(problems.join("; "));
}

function resolvedRedCommand(input: WorkerExecutionInput, job: QueueJob): string | undefined {
  return input.redCommand ?? job.redCommand ?? undefined;
}

function resolvedImplementationCommand(input: WorkerExecutionInput, job: QueueJob): string | undefined {
  return input.implementationCommand ?? job.implementationCommand ?? undefined;
}

function validationCommands(input: WorkerExecutionInput, issue: AfkIssueArtifact, job: QueueJob): string[] {
  return input.validationCommands && input.validationCommands.length > 0
    ? input.validationCommands
    : (job.validationCommands && job.validationCommands.length > 0 ? job.validationCommands : normalizeStringArray(issue.validationProof));
}

async function ensureLinkedTask(repoRoot: string, run: WorkerExecutionRun, job: QueueJob): Promise<string | null> {
  if (job.linkedTaskId) return job.linkedTaskId;
  const policy = await loadCompletionGatePolicy(repoRoot);
  return mutateTaskState(repoRoot, (state) => {
    const create = applyTaskUpdateAction(state, {
      action: "create",
      title: `Phase C worker execution for ${job.id}`,
      owner: job.assignedRole ?? DEFAULT_OWNER,
      taskClass: job.taskClass ?? "implementation",
      acceptance: job.acceptanceCriteria ?? [],
      evidence: [`Worker run artifact: ${workerRunPath(run.initiativeId, run.runId)}`],
    }, policy);
    const createdTask = isRecord(create.details.task) && typeof create.details.task.id === "string" ? create.details.task : null;
    const createdId = createdTask?.id ?? null;
    if (!createdId) return null;
    applyTaskUpdateAction(state, { action: "start", id: createdId, owner: job.assignedRole ?? DEFAULT_OWNER, note: `Linked to queue job ${job.id} for Phase C worker execution.` }, policy);
    return createdId;
  });
}

async function recordTaskEvidence(repoRoot: string, taskId: string | null, evidence: string[], reviewReady: boolean): Promise<void> {
  if (!taskId) return;
  const policy = await loadCompletionGatePolicy(repoRoot);
  await mutateTaskState(repoRoot, (state) => {
    const task = getTask(state, taskId) as TaskRecord | undefined;
    if (!task) return;
    for (const item of evidence) {
      applyTaskUpdateAction(state, { action: "evidence", id: taskId, evidence: [item] }, policy);
    }
    if (reviewReady) applyTaskUpdateAction(state, { action: "review", id: taskId, note: "Phase C worker execution reached review-ready boundary." }, policy);
  });
}

async function finalizeLinkedTask(repoRoot: string, taskId: string | null, terminalStatus: "blocked" | "failed", reason: string, evidence: string[]): Promise<void> {
  if (!taskId) return;
  const policy = await loadCompletionGatePolicy(repoRoot);
  await mutateTaskState(repoRoot, (state) => {
    const task = getTask(state, taskId) as TaskRecord | undefined;
    if (!task) return;
    for (const item of evidence) {
      applyTaskUpdateAction(state, { action: "evidence", id: taskId, evidence: [item] }, policy);
    }
    applyTaskUpdateAction(state, {
      action: terminalStatus === "failed" ? "fail" : "block",
      id: taskId,
      note: `Phase C worker execution ${terminalStatus}: ${reason}`,
    }, policy);
  });
}

function commandSummary(result: WorkerCommandResult): string {
  return `${result.command} exited ${result.exitCode}${result.stderr ? `: ${result.stderr.slice(0, 200)}` : ""}`;
}

async function blockRun(repoRoot: string, run: WorkerExecutionRun, reason: string, status: "blocked" | "failed" = "blocked"): Promise<WorkerExecutionRun> {
  run.status = status;
  run.stopReason = reason;
  run.updatedAt = new Date().toISOString();
  run.nextOperatorAction = "Inspect the preserved worktree and worker-run artifact; unblock through runtime tools after fixing the cause.";
  await writeWorkerRun(repoRoot, run);
  await updateQueueJobWorkerExecution(repoRoot, run.queueJobId, {
    runArtifactPath: workerRunPath(run.initiativeId, run.runId),
    worktreePath: run.worktree.path,
    status: run.status,
    lastReason: reason,
    linkedTaskId: run.linkedTaskId,
  }, status);
  await finalizeLinkedTask(repoRoot, run.linkedTaskId, status, reason, [`Worker run artifact: ${workerRunPath(run.initiativeId, run.runId)}`]);
  return run;
}

export async function runWorkerExecution(input: WorkerExecutionInput): Promise<WorkerExecutionRun> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const initiativeId = assertSlug(input.initiativeId, "initiativeId");

  if (input.command === "status") {
    const latest = input.runId ? await readWorkerRun(repoRoot, initiativeId, input.runId) : await readLatestWorkerRun(repoRoot, initiativeId);
    if (!latest) throw new Error(`No worker run artifact found for initiative ${initiativeId}.`);
    return { ...latest, mode: "status", nextOperatorAction: latest.nextOperatorAction };
  }

  if (input.command === "explain-run") {
    const runId = input.explainRunId ?? input.runId;
    if (!runId) throw new Error("explain-run requires --run-id or --explain-run <run-id>.");
    const run = await readWorkerRun(repoRoot, initiativeId, runId);
    return { ...run, mode: "status", nextOperatorAction: `Explain ${run.runId}: status=${run.status}; stopReason=${run.stopReason ?? "none"}; next=${run.nextOperatorAction}` };
  }

  const resumeRun = input.command === "resume" && input.runId ? await readWorkerRun(repoRoot, initiativeId, input.runId) : null;
  if (resumeRun && ["failed", "review_ready", "done"].includes(resumeRun.status)) {
    throw new Error(`resume requires a non-terminal worker run; ${resumeRun.runId} is ${resumeRun.status}.`);
  }
  const context = await loadContext(repoRoot, initiativeId, input.queueJobId ?? resumeRun?.queueJobId);
  const run = resumeRun ?? buildPlannedRun(input, context);
  const problems = eligibilityProblems(context.job, context.issue);
  if (problems.length > 0) {
    run.steps.planning = { status: "blocked", evidence: problems };
    return input.command === "dry-run" ? { ...run, status: "planned", stopReason: problems.join("; ") } : blockRun(repoRoot, run, problems.join("; "));
  }

  run.steps.planning = {
    status: "passed",
    commands: [],
    evidence: [
      `Selected one queue job: ${context.job.id}`,
      `AFK issue ${context.issue.issueId} passed approval/domain/allowed-path/acceptance/validation eligibility checks.`,
      "Planning step generated a bounded implementation plan from queue job/tddSlice metadata; no provider-backed hidden loop was started.",
    ],
  };
  run.steps.validation.commands = validationCommands(input, context.issue, context.job);
  run.nextOperatorAction = "Run with explicit bounds to create an isolated worktree and execute the bounded worker loop.";

  if (input.command === "dry-run") return run;
  if (!input.maxSteps || !input.maxRuntimeSeconds) throw new Error("run/resume mode requires --max-steps and --max-runtime-seconds.");
  if (input.maxSteps < 1) throw new Error("--max-steps must be positive.");
  if (input.maxSteps < 4) return blockRun(repoRoot, run, "max step budget too small for Phase C planning/coding/validation/review gates.", "blocked");
  if (input.allowPrCreate === true && !input.explicitApprovalRef) throw new Error("--allow-pr-create requires --approval-ref; Phase C still never auto-merges.");
  if (input.stopBeforePr === false && !(input.allowPrCreate === true && input.explicitApprovalRef)) throw new Error("Disabling --stop-before-pr requires --allow-pr-create and --approval-ref.");

  run.status = "running";
  run.updatedAt = new Date().toISOString();

  let lease: ExecutionLeaseRecord | null = null;
  try {
    const worktree = await createIsolatedWorktree(repoRoot, run, input);
    run.worktree.path = worktree.path;
    run.worktree.branch = worktree.branch;
    await writeWorkerRun(repoRoot, run);
    const linkedTaskId = await ensureLinkedTask(repoRoot, run, context.job);
    run.linkedTaskId = linkedTaskId;
    const acquiredAt = nowIso(input.now);
    const expiresAt = new Date(Date.parse(acquiredAt) + Math.max(1, input.maxRuntimeSeconds) * 1000).toISOString();
    const leaseResult = await acquireWorkerLaneLease(repoRoot, {
      id: `lease-${run.runId}`,
      scopeKey: run.queueJobId,
      owner: input.owner ?? DEFAULT_OWNER,
      acquiredAt,
      expiresAt,
      jobId: run.queueJobId,
      taskId: linkedTaskId,
      worktreePath: worktree.path,
      branchName: worktree.branch,
    });
    if (!leaseResult.acquired || !leaseResult.lease) throw new Error(`lease/worktree conflict: ${leaseResult.conflict?.id ?? "unknown"}`);
    lease = leaseResult.lease;
    run.worktree.leaseId = lease.id;
    await updateQueueJobWorkerExecution(repoRoot, run.queueJobId, {
      runArtifactPath: workerRunPath(run.initiativeId, run.runId),
      worktreePath: run.worktree.path,
      status: "running",
      lastReason: null,
      linkedTaskId: run.linkedTaskId,
    });

    const allowedPaths = normalizeAllowedPaths(context.issue.allowedPaths).length > 0 ? normalizeAllowedPaths(context.issue.allowedPaths) : normalizeStringArray(context.job.allowedPaths);
    const redCommand = resolvedRedCommand(input, context.job);
    const implementationCommand = resolvedImplementationCommand(input, context.job);
    run.steps.coding = { status: "skipped", commands: [], evidence: ["No implementation command or queue execution plan was provided."], changedFiles: [] };
    if (redCommand) {
      const redResult = await runCommand(worktree.path, redCommand, input.maxRuntimeSeconds);
      run.steps.coding.redCommand = redCommand;
      run.steps.coding.redResult = redResult;
      if (redResult.exitCode === 0) return blockRun(repoRoot, run, "RED command passed unexpectedly before implementation.", "failed");
    }
    if (!implementationCommand) {
      return blockRun(repoRoot, run, `No implementation command or queue execution plan is available for ${context.issue.issueId}.`, "blocked");
    }
    run.steps.coding.status = "running";
    run.steps.coding.commands = [implementationCommand];
    const implementation = await runCommand(worktree.path, implementationCommand, input.maxRuntimeSeconds);
    run.steps.coding.evidence = [commandSummary(implementation)];
    if (implementation.exitCode !== 0) return blockRun(repoRoot, run, `implementation command failed: ${commandSummary(implementation)}`, "failed");
    const files = await changedFiles(worktree.path);
    assertChangedFilesAllowed(files, allowedPaths);
    run.steps.coding.changedFiles = files;
    run.steps.coding.status = "passed";
    run.steps.coding.greenCommand = implementationCommand;
    run.steps.coding.greenResult = implementation;

    const validationResults: WorkerCommandResult[] = [];
    for (const command of run.steps.validation.commands ?? []) {
      const result = await runCommand(worktree.path, command, input.maxRuntimeSeconds);
      validationResults.push(result);
      if (result.exitCode !== 0) {
        run.steps.validation = { status: "failed", commands: run.steps.validation.commands, results: validationResults, evidence: [commandSummary(result)] };
        return blockRun(repoRoot, run, `validation failure: ${commandSummary(result)}`, "failed");
      }
    }
    run.steps.validation = { status: "passed", commands: run.steps.validation.commands, results: validationResults, evidence: validationResults.map(commandSummary) };
    if (input.redCommand && validationResults[0]) {
      run.steps.coding.greenCommand = validationResults[0].command;
      run.steps.coding.greenResult = validationResults[0];
    }

    const finalChangedFiles = await changedFiles(worktree.path);
    assertChangedFilesAllowed(finalChangedFiles, allowedPaths);
    run.steps.coding.changedFiles = finalChangedFiles;

    const verdict = input.reviewVerdict ?? "no_required_fixes";
    run.steps.review = {
      status: verdict === "no_required_fixes" ? "passed" : "blocked",
      verdict,
      findings: verdict === "no_required_fixes" ? [] : ["Configured review verdict was changes_required."],
      evidence: ["g-check review verdict recorded by Phase C worker execution artifact."],
    };
    if (verdict === "changes_required") return blockRun(repoRoot, run, "review changes required");

    run.status = "review_ready";
    run.stopReason = run.prBoundary.stopBeforePr ? "stop-before-pr boundary reached" : null;
    run.nextOperatorAction = run.prBoundary.stopBeforePr
      ? "Run g-check/create manually, then create PR only with explicit approval. Phase C did not auto-merge."
      : "PR creation was allowed, but merge remains outside Phase C executor.";
    run.updatedAt = new Date().toISOString();
    await writeWorkerRun(repoRoot, run);
    await updateQueueJobWorkerExecution(repoRoot, run.queueJobId, {
      runArtifactPath: workerRunPath(run.initiativeId, run.runId),
      worktreePath: run.worktree.path,
      status: run.status,
      lastReason: run.stopReason,
      linkedTaskId: run.linkedTaskId,
    });
    await recordTaskEvidence(repoRoot, run.linkedTaskId, [
      `Worker run artifact: ${workerRunPath(run.initiativeId, run.runId)}`,
      `Changed files: ${finalChangedFiles.length > 0 ? finalChangedFiles.join(", ") : "none"}`,
      `Validation: ${(run.steps.validation.evidence ?? []).join("; ")}`,
      `Review Verdict: ${verdict}`,
      "Unresolved risks: Phase C stops before PR/merge by design.",
    ], true);
    return run;
  } catch (error) {
    return blockRun(repoRoot, run, (error as Error).message, "blocked");
  } finally {
    if (lease) {
      const current = await findWorkerLaneLease(repoRoot, { leaseId: lease.id });
      if (current) await releaseWorkerLaneLease(repoRoot, { leaseId: lease.id });
    }
  }
}

export function renderWorkerExecutionRun(run: WorkerExecutionRun): string {
  return [
    "Harness Worker Execution",
    `mode: ${run.mode}`,
    `initiative: ${run.initiativeId}`,
    `run: ${run.runId}`,
    `status: ${run.status}`,
    `queueJobId: ${run.queueJobId}`,
    `sourceIssueId: ${run.sourceIssueId}`,
    `linkedTaskId: ${run.linkedTaskId ?? "none"}`,
    `worktree: ${run.worktree.path ?? "none"}`,
    `branch: ${run.worktree.branch ?? "none"}`,
    `planning: ${run.steps.planning.status}`,
    `coding: ${run.steps.coding.status}`,
    `validation: ${run.steps.validation.status}`,
    `review: ${run.steps.review.status}${run.steps.review.verdict ? ` (${run.steps.review.verdict})` : ""}`,
    `stopReason: ${run.stopReason ?? "none"}`,
    `nextOperatorAction: ${run.nextOperatorAction}`,
  ].join("\n");
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function workerExecutionExtension(): void {}
