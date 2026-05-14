import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { buildPrGateSession, type PrGateSession } from "../../../scripts/harness-pr-gate.ts";
import { applyMerge, type MergeApplyResult, type MergeMethod } from "../../../scripts/harness-merge.ts";
import { syncLocalMain, type SyncLocalMainResult } from "../../../scripts/harness-sync-main.ts";

const execFile = promisify(execFileCallback);
const INITIATIVE_ROOT = "docs/initiatives";
const VERSION = 1 as const;
const ALLOWED_MERGE_METHODS = new Set(["squash", "merge", "rebase"]);
const PROTECTED_PATH_PREFIXES = [".git", "node_modules", ".pi/agent/state/runtime"];
const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "trunk"]);

function isStackedBaseRef(baseRef: string | null | undefined): boolean {
  return Boolean(baseRef) && !PROTECTED_BRANCH_NAMES.has(String(baseRef));
}

export type PrLifecycleCommand = "dry-run" | "create" | "gate" | "merge-ready" | "merge" | "sync-main" | "status";
export type PrLifecycleMode = "dry_run" | "create" | "gate" | "merge_ready" | "merge" | "sync_main" | "status";
export type PrLifecycleStatus = "planned" | "pr_created" | "gate_pending" | "gate_passed" | "blocked" | "merged" | "synced" | "failed";
export type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string; code: number }>;

export interface PrLifecycleInput {
  repoRoot?: string;
  command: PrLifecycleCommand;
  initiativeId: string;
  runId?: string;
  workerRunId?: string;
  title?: string;
  body?: string;
  baseRef?: string;
  method?: MergeMethod;
  allowMerge?: boolean;
  approvalRef?: string;
  stopBeforeMerge?: boolean;
  closeSuperseded?: boolean;
  closeApprovalRef?: string;
  pr?: string;
  lifecycleEvidenceFile?: string;
}

interface WorkerRunArtifact {
  runId: string;
  initiativeId: string;
  sourceIssueId: string;
  queueJobId: string;
  linkedTaskId: string | null;
  status: string;
  worktree: { path: string | null; branch: string | null; baseRef: string; leaseId?: string | null };
  steps: {
    planning?: { status?: string; evidence?: string[] };
    coding?: { status?: string; changedFiles?: string[]; redCommand?: string | null; redResult?: { exitCode?: number } | null; greenCommand?: string | null; greenResult?: { exitCode?: number } | null };
    validation?: { status?: string; evidence?: string[]; results?: Array<{ command?: string; exitCode?: number }> };
    review?: { status?: string; verdict?: string; evidence?: string[]; findings?: string[] };
  };
}

export interface PrLifecycleRun {
  version: 1;
  runId: string;
  initiativeId: string;
  sourceIssueId: string;
  queueJobId: string;
  linkedTaskId: string | null;
  workerRunId: string;
  worktree: { path: string | null; branch: string | null; baseRef: string; headSha: string | null };
  mode: PrLifecycleMode;
  status: PrLifecycleStatus;
  lifecycle: {
    planningReady: boolean;
    taskReady: boolean;
    redGreenEvidence: boolean;
    reviewVerdict: "no_required_fixes" | "changes_required" | null;
    validationDecision: "pass" | "fail" | "pending";
    createReady: boolean;
    mergeReady: boolean;
  };
  pr: {
    number: number | null;
    url: string | null;
    headRef: string | null;
    baseRef: string | null;
    reviewDecision: string | null;
    mergeStateStatus: string | null;
    checks: Array<{ name: string; state: string; workflow?: string }>;
  };
  merge: { method: MergeMethod | null; approvalRef: string | null; mergeCommit: string | null; syncedMainSha: string | null };
  blockers: string[];
  commandsRun: string[];
  evidence: string[];
  nextOperatorAction: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrLifecycleDeps {
  runner?: CommandRunner;
  prGate?: (pr: string) => Promise<PrGateSession>;
  mergeApply?: (input: { pr: string; method: MergeMethod; repoRoot: string; lifecycleEvidenceFile?: string }) => Promise<MergeApplyResult>;
  syncMain?: typeof syncLocalMain;
  dirtyFiles?: (repoRoot: string) => Promise<string[]>;
}

function assertSlug(value: string, label: string): string {
  const slug = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid ${label}: ${value}`);
  return slug;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function modeFor(command: PrLifecycleCommand): PrLifecycleMode {
  if (command === "dry-run") return "dry_run";
  if (command === "merge-ready") return "merge_ready";
  if (command === "sync-main") return "sync_main";
  return command;
}

function prRunsDir(initiativeId: string): string {
  return `${INITIATIVE_ROOT}/${assertSlug(initiativeId, "initiativeId")}/pr-runs`;
}

export function prRunPath(initiativeId: string, runId: string): string {
  return `${prRunsDir(initiativeId)}/${assertSlug(runId, "runId")}.json`;
}

export function prRunSummaryPath(initiativeId: string, runId: string): string {
  return `${prRunsDir(initiativeId)}/${assertSlug(runId, "runId")}.md`;
}

function workerRunPath(initiativeId: string, workerRunId: string): string {
  return `${INITIATIVE_ROOT}/${assertSlug(initiativeId, "initiativeId")}/worker-runs/${assertSlug(workerRunId, "workerRunId")}.json`;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function latestPrRun(repoRoot: string, initiativeId: string): Promise<PrLifecycleRun | null> {
  const dir = resolve(repoRoot, prRunsDir(initiativeId));
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    if (names.length === 0) return null;
    return JSON.parse(await readFile(join(dir, names[names.length - 1]), "utf8")) as PrLifecycleRun;
  } catch { return null; }
}

async function readPrRun(repoRoot: string, initiativeId: string, runId?: string): Promise<PrLifecycleRun> {
  const run = runId ? JSON.parse(await readFile(resolve(repoRoot, prRunPath(initiativeId, runId)), "utf8")) as PrLifecycleRun : await latestPrRun(repoRoot, initiativeId);
  if (!run) throw new Error(`No PR lifecycle run artifact found for initiative ${initiativeId}.`);
  return run;
}

async function writePrRun(repoRoot: string, run: PrLifecycleRun): Promise<void> {
  const jsonPath = resolve(repoRoot, prRunPath(run.initiativeId, run.runId));
  const mdPath = resolve(repoRoot, prRunSummaryPath(run.initiativeId, run.runId));
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, stableJson(run), "utf8");
  await writeFile(mdPath, renderPrLifecycleMarkdown(run), "utf8");
}

async function defaultRunner(command: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFile(command, args, { cwd, encoding: "utf8" });
    return { stdout: result.stdout.trimEnd(), stderr: result.stderr.trimEnd(), code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return { stdout: (failure.stdout ?? "").trimEnd(), stderr: (failure.stderr ?? failure.message ?? "").trimEnd(), code: failure.code ?? 1 };
  }
}

async function runChecked(runner: CommandRunner, commandsRun: string[], command: string, args: string[], cwd?: string): Promise<string> {
  commandsRun.push(`${command} ${args.join(" ")}`);
  const result = await runner(command, args, cwd);
  if (result.code !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function runObserved(runner: CommandRunner, commandsRun: string[], command: string, args: string[], cwd?: string): ReturnType<CommandRunner> {
  commandsRun.push(`${command} ${args.join(" ")}`);
  return runner(command, args, cwd);
}

function normalizeDirtyFiles(porcelain: string): string[] {
  return porcelain.split("\n").map((line) => line.trimEnd()).filter(Boolean).map((line) => line.slice(3).replace(/^"|"$/g, "")).sort();
}

async function readDirtyFiles(repoRoot: string, runner: CommandRunner, commandsRun: string[]): Promise<string[]> {
  commandsRun.push("git status --porcelain=v1");
  const result = await runner("git", ["status", "--porcelain=v1"], repoRoot);
  if (result.code !== 0) throw new Error(`git status failed: ${result.stderr || result.stdout}`);
  return normalizeDirtyFiles(result.stdout);
}

function isProtectedPath(path: string): boolean {
  const normalized = path.replace(/^\.\//, "").replace(/\/$/, "");
  if (/^\.env(?:\.|$)/.test(normalized)) return true;
  return PROTECTED_PATH_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function dirtyPathMatchesExpected(file: string, expected: string[]): boolean {
  const normalized = file.replace(/\/$/, "");
  return expected.some((candidate) => {
    const expectedPath = candidate.replace(/\/$/, "");
    return expectedPath === normalized || expectedPath.startsWith(`${normalized}/`) || normalized.startsWith(`${expectedPath}/`);
  });
}

function unexpectedDirtyFiles(dirty: string[], expected: string[]): string[] {
  return dirty.filter((file) => !dirtyPathMatchesExpected(file, expected) || isProtectedPath(file));
}

function isInitiativeRuntimeArtifactPath(file: string): boolean {
  return /^docs\/initiatives\/[^/]+\/(?:pipeline-runs|afk-runs|worker-runs|pr-runs)(?:\/|$)/.test(file);
}

function isOwnLifecycleBookkeeping(run: PrLifecycleRun, file: string): boolean {
  return file === prRunPath(run.initiativeId, run.runId) || file === prRunSummaryPath(run.initiativeId, run.runId) || isInitiativeRuntimeArtifactPath(file);
}

async function readTaskReady(repoRoot: string, linkedTaskId: string | null, worktreePath?: string | null): Promise<boolean> {
  if (!linkedTaskId) return false;
  const candidateRoots = [repoRoot, worktreePath ? resolve(repoRoot, worktreePath) : null].filter((value): value is string => Boolean(value));
  const seen = new Set<string>();
  for (const candidateRoot of candidateRoots) {
    const path = resolve(candidateRoot, ".pi/agent/state/runtime/tasks.json");
    if (seen.has(path)) continue;
    seen.add(path);
    if (!(await exists(path))) continue;
    const parsed = JSON.parse(await readFile(path, "utf8")) as { tasks?: Array<Record<string, unknown>> };
    const task = (parsed.tasks ?? []).find((entry) => entry.id === linkedTaskId);
    if (!task) continue;
    const evidence = Array.isArray(task.evidence) ? task.evidence.map(String).join("\n") : "";
    const acceptance = Array.isArray(task.acceptance) ? task.acceptance : [];
    const validation = task.validation && typeof task.validation === "object" ? task.validation as Record<string, unknown> : {};
    if (acceptance.length > 0 && /Changed files:/i.test(evidence) && /Validation:/i.test(evidence) && /Review Verdict:\s*no_required_fixes/i.test(evidence) && validation.decision === "pass") return true;
  }
  return false;
}

function lifecycleFromWorker(worker: WorkerRunArtifact, taskReady: boolean): PrLifecycleRun["lifecycle"] {
  const changedFiles = worker.steps.coding?.changedFiles ?? [];
  const validationPassed = worker.steps.validation?.status === "passed" && ((worker.steps.validation.results?.length ?? 0) > 0 || (worker.steps.validation.evidence?.length ?? 0) > 0);
  const reviewVerdict = worker.steps.review?.verdict === "no_required_fixes" ? "no_required_fixes" : worker.steps.review?.verdict === "changes_required" ? "changes_required" : null;
  const redGreenEvidence = Boolean(worker.steps.coding?.redResult || worker.steps.coding?.greenResult || worker.steps.coding?.redCommand || worker.steps.coding?.greenCommand);
  const planningReady = worker.steps.planning?.status === "passed";
  const createReady = worker.status === "review_ready" && planningReady && taskReady && redGreenEvidence && changedFiles.length > 0 && validationPassed && reviewVerdict === "no_required_fixes";
  return {
    planningReady,
    taskReady,
    redGreenEvidence,
    reviewVerdict,
    validationDecision: validationPassed ? "pass" : "fail",
    createReady,
    mergeReady: false,
  };
}

function blockersForCreate(worker: WorkerRunArtifact, lifecycle: PrLifecycleRun["lifecycle"]): string[] {
  const blockers: string[] = [];
  if (worker.status !== "review_ready") blockers.push("Phase C worker run is not review_ready/create-ready.");
  if (!lifecycle.planningReady) blockers.push("planning evidence is missing.");
  if (!lifecycle.taskReady) blockers.push("active task evidence is missing or validation did not pass.");
  if (!lifecycle.redGreenEvidence) blockers.push("RED/GREEN evidence is missing.");
  if ((worker.steps.coding?.changedFiles ?? []).length === 0) blockers.push("changed files evidence is missing.");
  if (lifecycle.validationDecision !== "pass") blockers.push("validation output is missing or failed.");
  if (lifecycle.reviewVerdict !== "no_required_fixes") blockers.push("g-check verdict no_required_fixes is missing.");
  return blockers;
}

async function buildFromWorker(repoRoot: string, input: PrLifecycleInput, runner: CommandRunner): Promise<PrLifecycleRun> {
  if (!input.workerRunId) throw new Error(`${input.command} requires --worker-run-id.`);
  const worker = JSON.parse(await readFile(resolve(repoRoot, workerRunPath(input.initiativeId, input.workerRunId)), "utf8")) as WorkerRunArtifact;
  const commandsRun: string[] = [];
  const headSha = worker.worktree.path ? await runChecked(runner, commandsRun, "git", ["rev-parse", "HEAD"], worker.worktree.path) : null;
  const taskReady = await readTaskReady(repoRoot, worker.linkedTaskId, worker.worktree.path);
  const lifecycle = lifecycleFromWorker(worker, taskReady);
  const now = nowIso();
  const runId = input.runId ?? `pr-${worker.runId}`;
  return {
    version: VERSION,
    runId,
    initiativeId: input.initiativeId,
    sourceIssueId: worker.sourceIssueId,
    queueJobId: worker.queueJobId,
    linkedTaskId: worker.linkedTaskId,
    workerRunId: worker.runId,
    worktree: { path: worker.worktree.path, branch: worker.worktree.branch, baseRef: input.baseRef ?? worker.worktree.baseRef, headSha },
    mode: modeFor(input.command),
    status: "planned",
    lifecycle,
    pr: { number: null, url: null, headRef: worker.worktree.branch, baseRef: input.baseRef ?? worker.worktree.baseRef, reviewDecision: null, mergeStateStatus: null, checks: [] },
    merge: { method: null, approvalRef: null, mergeCommit: null, syncedMainSha: null },
    blockers: blockersForCreate(worker, lifecycle),
    commandsRun,
    evidence: [
      `Worker run artifact: ${workerRunPath(input.initiativeId, worker.runId)}`,
      `Changed files: ${(worker.steps.coding?.changedFiles ?? []).join(", ") || "none"}`,
      `Validation: ${(worker.steps.validation?.evidence ?? []).join("; ") || worker.steps.validation?.status || "missing"}`,
      `Review Verdict: ${worker.steps.review?.verdict ?? "missing"}`,
    ],
    nextOperatorAction: lifecycle.createReady ? "Run create to commit/push/create PR, or keep stopped before merge." : "Resolve lifecycle blockers before PR creation.",
    createdAt: now,
    updatedAt: now,
  };
}

function parsePrNumber(urlOrNumber: string): number | null {
  const match = urlOrNumber.match(/(?:pull\/|^)(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function readPrDetails(run: PrLifecycleRun, runner: CommandRunner): Promise<void> {
  const pr = String(run.pr.number ?? run.pr.url ?? "");
  if (!pr) return;
  const raw = await runChecked(runner, run.commandsRun, "gh", ["pr", "view", pr, "--json", "number,url,headRefName,baseRefName,reviewDecision,mergeStateStatus"], run.worktree.path ?? undefined);
  const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  run.pr.number = typeof parsed.number === "number" ? parsed.number : run.pr.number;
  run.pr.url = typeof parsed.url === "string" ? parsed.url : run.pr.url;
  run.pr.headRef = typeof parsed.headRefName === "string" ? parsed.headRefName : run.pr.headRef;
  run.pr.baseRef = typeof parsed.baseRefName === "string" ? parsed.baseRefName : run.pr.baseRef;
  run.pr.reviewDecision = typeof parsed.reviewDecision === "string" ? parsed.reviewDecision : run.pr.reviewDecision;
  run.pr.mergeStateStatus = typeof parsed.mergeStateStatus === "string" ? parsed.mergeStateStatus : run.pr.mergeStateStatus;
}

function allowedMethod(method: unknown): MergeMethod {
  const value = String(method ?? "squash").toLowerCase();
  if (!ALLOWED_MERGE_METHODS.has(value)) throw new Error(`Merge method ${value} is not allowed by policy.`);
  return value as MergeMethod;
}

async function ensureRemoteBaseBranch(run: PrLifecycleRun, runner: CommandRunner): Promise<void> {
  const baseRef = run.pr.baseRef ?? run.worktree.baseRef ?? null;
  if (!baseRef || PROTECTED_BRANCH_NAMES.has(baseRef) || !run.worktree.path) return;
  const remote = await runObserved(runner, run.commandsRun, "git", ["ls-remote", "--heads", "origin", baseRef], run.worktree.path);
  if (remote.code !== 0) throw new Error(`git ls-remote --heads origin ${baseRef} failed: ${remote.stderr || remote.stdout}`);
  if (remote.stdout.trim()) return;
  const local = await runObserved(runner, run.commandsRun, "git", ["rev-parse", "--verify", `refs/heads/${baseRef}`], run.worktree.path);
  if (local.code !== 0) throw new Error(`base ref ${baseRef} is not available locally for PR creation.`);
  await runChecked(runner, run.commandsRun, "git", ["push", "-u", "origin", baseRef], run.worktree.path);
}

async function createPr(repoRoot: string, run: PrLifecycleRun, input: PrLifecycleInput, deps: PrLifecycleDeps, runner: CommandRunner): Promise<PrLifecycleRun> {
  if (input.closeSuperseded && !input.closeApprovalRef) throw new Error("--close-superseded requires --close-approval-ref.");
  if (!run.lifecycle.createReady || run.blockers.length > 0) return block(run, run.blockers);
  if (!run.worktree.path) return block(run, ["worker worktree path is missing."]);
  if (!run.worktree.branch || PROTECTED_BRANCH_NAMES.has(run.worktree.branch)) return block(run, [`refusing protected or missing branch for PR creation: ${run.worktree.branch ?? "<missing>"}`]);
  const changedFiles = run.evidence.find((item) => item.startsWith("Changed files:"))?.replace(/^Changed files:\s*/, "").split(/,\s*/).filter((item) => item && item !== "none") ?? [];
  const dirty = deps.dirtyFiles ? await deps.dirtyFiles(run.worktree.path) : await readDirtyFiles(run.worktree.path, runner, run.commandsRun);
  const unexpected = unexpectedDirtyFiles(dirty, changedFiles);
  if (unexpected.length > 0) return block(run, [`unexpected dirty or protected worktree files: ${unexpected.join(", ")}`]);
  if (dirty.length > 0) {
    await runChecked(runner, run.commandsRun, "git", ["add", "--", ...dirty], run.worktree.path);
    await runChecked(runner, run.commandsRun, "git", ["commit", "-m", input.title ?? `Phase D PR lifecycle for ${run.sourceIssueId}`], run.worktree.path);
  }
  await ensureRemoteBaseBranch(run, runner);
  await runChecked(runner, run.commandsRun, "git", ["push", "-u", "origin", run.worktree.branch ?? "HEAD"], run.worktree.path);
  if (input.closeSuperseded) {
    run.evidence.push(`close-superseded explicitly approved by ${input.closeApprovalRef}`);
    if (input.pr) await runChecked(runner, run.commandsRun, "gh", ["pr", "close", input.pr, "--comment", `Superseded by Phase D PR lifecycle run ${run.runId}; approvalRef=${input.closeApprovalRef}`], run.worktree.path);
  }
  const prUrl = await runChecked(runner, run.commandsRun, "gh", ["pr", "create", "--base", run.pr.baseRef ?? "main", "--head", run.worktree.branch ?? "HEAD", "--title", input.title ?? `Phase D PR lifecycle for ${run.sourceIssueId}`, "--body", input.body ?? buildPrBody(run)], run.worktree.path);
  run.pr.url = prUrl.trim().split(/\s+/).find((part) => part.includes("/pull/")) ?? prUrl.trim();
  run.pr.number = parsePrNumber(run.pr.url);
  await readPrDetails(run, runner).catch(() => undefined);
  run.status = "pr_created";
  run.nextOperatorAction = "Run gate, then merge-ready. Merge remains blocked by --stop-before-merge unless explicitly approved.";
  run.updatedAt = nowIso();
  return run;
}

function block(run: PrLifecycleRun, blockers: string[]): PrLifecycleRun {
  run.status = "blocked";
  run.blockers = [...new Set(blockers.filter(Boolean))];
  run.nextOperatorAction = "Resolve blockers and rerun the PR lifecycle command; failed/blocked state remains visible in pr-runs.";
  run.updatedAt = nowIso();
  return run;
}

function buildPrBody(run: PrLifecycleRun): string {
  return [
    "## Summary",
    `- Phase D PR lifecycle for ${run.sourceIssueId}`,
    "",
    "## Evidence",
    ...run.evidence.map((entry) => `- ${entry}`),
    "",
    "## Safety",
    "- stop-before-merge remains the default; merge requires explicit approval.",
  ].join("\n");
}

async function gateRun(run: PrLifecycleRun, deps: PrLifecycleDeps): Promise<PrLifecycleRun> {
  const pr = String(run.pr.number ?? run.pr.url ?? "");
  if (!pr) return block(run, ["PR is missing; create PR before gate."]);
  const session = deps.prGate ? await deps.prGate(pr) : await buildPrGateSession({ pr, maxAttempts: 1, includeComments: true });
  const latest = session.attempts[session.attempts.length - 1];
  run.pr.checks = (latest?.checks ?? []).map((check) => ({ name: check.name, state: check.state, workflow: check.workflow }));
  run.pr.reviewDecision = session.reviewSummary.reviewDecision || run.pr.reviewDecision;
  run.pr.mergeStateStatus = session.prContext.mergeStateStatus ?? run.pr.mergeStateStatus;
  run.evidence.push(`PR gate finalStatus: ${session.finalStatus}; ${session.recommendedNextActionReason}`);
  const noChecksReported = (latest?.summary.totalCount ?? 0) === 0;
  const stackedNoCheckPass = noChecksReported
    && isStackedBaseRef(run.pr.baseRef)
    && session.commentSummary.blockingCommentCount === 0
    && session.reviewSummary.changesRequestedCount === 0
    && String(session.prContext.mergeStateStatus ?? run.pr.mergeStateStatus ?? "").toUpperCase() === "CLEAN";
  if ((session.finalStatus === "pass" || stackedNoCheckPass) && session.commentSummary.blockingCommentCount === 0 && session.reviewSummary.changesRequestedCount === 0) {
    run.status = "gate_passed";
    if (stackedNoCheckPass && session.finalStatus !== "pass") run.evidence.push(`PR gate accepted zero-check stacked PR against ${run.pr.baseRef}; local worker validation evidence remains authoritative for this bounded merge.`);
    run.nextOperatorAction = "Run merge-ready; merge still requires explicit --allow-merge --approval-ref.";
  } else if (session.finalStatus === "pending" || session.finalStatus === "timeout") {
    run.status = "gate_pending";
    run.blockers = ["PR gate pending; rerun gate after checks complete."];
    run.nextOperatorAction = "Wait for PR checks and rerun gate.";
  } else {
    return block(run, [`PR gate failed or blocking comments/reviews exist; status=${session.finalStatus}.`]);
  }
  run.updatedAt = nowIso();
  return run;
}

async function mergeReadyRun(run: PrLifecycleRun, deps: PrLifecycleDeps, runner: CommandRunner, repoRoot: string): Promise<PrLifecycleRun> {
  await readPrDetails(run, runner).catch(() => undefined);
  const dirty = deps.dirtyFiles ? await deps.dirtyFiles(repoRoot) : await readDirtyFiles(repoRoot, runner, run.commandsRun);
  const blockers: string[] = [];
  const stackedNoCheckPass = run.pr.checks.length === 0 && isStackedBaseRef(run.pr.baseRef) && String(run.pr.mergeStateStatus ?? "").toUpperCase() === "CLEAN";
  if (run.status !== "gate_passed") blockers.push(`PR gate must be gate_passed; current status is ${run.status}.`);
  if (run.pr.checks.length === 0 && !stackedNoCheckPass) blockers.push("PR gate checks are missing.");
  if (run.pr.checks.some((check) => !["SUCCESS", "SKIPPED", "NEUTRAL"].includes(String(check.state).toUpperCase()))) blockers.push("failing or pending checks block merge-ready.");
  if (String(run.pr.reviewDecision ?? "").toUpperCase() === "CHANGES_REQUESTED") blockers.push("requested changes block merge-ready.");
  if (String(run.pr.mergeStateStatus ?? "").toUpperCase() !== "CLEAN") blockers.push(`mergeStateStatus must be CLEAN; current value is ${run.pr.mergeStateStatus ?? "unknown"}.`);
  const blockingDirty = dirty.filter((file) => !isOwnLifecycleBookkeeping(run, file));
  if (blockingDirty.length > 0) blockers.push(`dirty repo state blocks merge-ready: ${blockingDirty.join(", ")}`);
  if (!run.lifecycle.createReady) blockers.push("missing create-ready lifecycle evidence.");
  if (blockers.length > 0) return block(run, blockers);
  run.lifecycle.mergeReady = true;
  run.status = "gate_passed";
  if (stackedNoCheckPass) run.evidence.push(`merge-ready accepted zero-check stacked PR against ${run.pr.baseRef}; mergeStateStatus CLEAN and local worker validation evidence remain authoritative.`);
  run.nextOperatorAction = "Merge-ready. To merge, rerun with --allow-merge --approval-ref; default remains stop-before-merge.";
  run.updatedAt = nowIso();
  return run;
}

async function mergeRun(run: PrLifecycleRun, input: PrLifecycleInput, deps: PrLifecycleDeps, repoRoot: string): Promise<PrLifecycleRun> {
  if (!input.allowMerge || !input.approvalRef) throw new Error("merge requires --allow-merge and --approval-ref.");
  const method = allowedMethod(input.method);
  if (input.stopBeforeMerge !== false && !input.allowMerge) return block(run, ["stop-before-merge boundary is active."]);
  if (!run.lifecycle.mergeReady) return block(run, ["missing merge-ready lifecycle evidence."]);
  const pr = String(run.pr.number ?? run.pr.url ?? "");
  if (!pr) return block(run, ["PR is missing; cannot merge."]);
  const result = deps.mergeApply
    ? await deps.mergeApply({ pr, method, repoRoot, lifecycleEvidenceFile: input.lifecycleEvidenceFile })
    : await applyMerge({ pr, method, repoRoot, lifecycleEvidenceFile: input.lifecycleEvidenceFile });
  if (result.status !== "merged") return block(run, result.readiness?.blockers ?? ["bounded merge helper blocked merge."]);
  run.status = "merged";
  run.merge.method = method;
  run.merge.approvalRef = input.approvalRef;
  run.merge.mergeCommit = result.merge?.stdout?.match(/[a-f0-9]{7,40}/i)?.[0] ?? null;
  run.evidence.push(`Merge applied with ${method}; approvalRef=${input.approvalRef}`);
  run.nextOperatorAction = "Run sync-main to fast-forward local main and record synced SHA.";
  run.updatedAt = nowIso();
  return run;
}

async function syncRun(run: PrLifecycleRun, deps: PrLifecycleDeps, repoRoot: string): Promise<PrLifecycleRun> {
  if (run.status !== "merged" && !run.merge.mergeCommit) return block(run, ["merge evidence is missing; sync-main requires merged state."]);
  const result = await (deps.syncMain ?? syncLocalMain)({ repoRoot });
  run.status = "synced";
  run.merge.syncedMainSha = result.afterHead;
  run.evidence.push(`sync-main: ${result.status}; afterHead=${result.afterHead}`);
  run.nextOperatorAction = "Final bookkeeping complete; record PR URL, merge commit, synced SHA, validation evidence, and risks in task evidence.";
  run.updatedAt = nowIso();
  return run;
}

export async function runPrLifecycle(input: PrLifecycleInput, deps: PrLifecycleDeps = {}): Promise<PrLifecycleRun> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const initiativeId = assertSlug(input.initiativeId, "initiativeId");
  const runner = deps.runner ?? defaultRunner;
  if (input.closeSuperseded && !input.closeApprovalRef) throw new Error("--close-superseded requires --close-approval-ref.");

  if (input.command === "status") {
    const existing = await readPrRun(repoRoot, initiativeId, input.runId);
    return { ...existing, mode: "status" };
  }

  let run = input.command === "dry-run" || input.command === "create"
    ? await buildFromWorker(repoRoot, { ...input, initiativeId }, runner)
    : await readPrRun(repoRoot, initiativeId, input.runId);
  run.mode = modeFor(input.command);

  if (input.command === "dry-run") return run;
  if (input.command === "create") run = await createPr(repoRoot, run, input, deps, runner);
  else if (input.command === "gate") run = await gateRun(run, deps);
  else if (input.command === "merge-ready") run = await mergeReadyRun(run, deps, runner, repoRoot);
  else if (input.command === "merge") run = await mergeRun(run, input, deps, repoRoot);
  else if (input.command === "sync-main") run = await syncRun(run, deps, repoRoot);

  await writePrRun(repoRoot, run);
  return run;
}

export function renderPrLifecycleRun(run: PrLifecycleRun): string {
  return [
    "Harness PR Lifecycle",
    `mode: ${run.mode}`,
    `initiative: ${run.initiativeId}`,
    `run: ${run.runId}`,
    `status: ${run.status}`,
    `workerRunId: ${run.workerRunId}`,
    `pr: ${run.pr.url ?? run.pr.number ?? "none"}`,
    `mergeReady: ${run.lifecycle.mergeReady ? "yes" : "no"}`,
    `blockers: ${run.blockers.length}`,
    `nextOperatorAction: ${run.nextOperatorAction}`,
  ].join("\n");
}

export function renderPrLifecycleMarkdown(run: PrLifecycleRun): string {
  return [
    `# PR Lifecycle Run — ${run.runId}`,
    "",
    `- Status: ${run.status}`,
    `- Worker run: ${run.workerRunId}`,
    `- PR: ${run.pr.url ?? run.pr.number ?? "none"}`,
    `- Merge method: ${run.merge.method ?? "none"}`,
    `- Merge commit: ${run.merge.mergeCommit ?? "none"}`,
    `- Synced main SHA: ${run.merge.syncedMainSha ?? "none"}`,
    "",
    "## Evidence",
    ...(run.evidence.length > 0 ? run.evidence.map((entry) => `- ${entry}`) : ["- none"]),
    "",
    "## Blockers",
    ...(run.blockers.length > 0 ? run.blockers.map((entry) => `- ${entry}`) : ["- none"]),
    "",
    `Next: ${run.nextOperatorAction}`,
    "",
  ].join("\n");
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function prLifecycleExtension(): void {}
