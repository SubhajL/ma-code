import { execFile as execFileCallback } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  type AfkIssueRecord,
  type AfkMaterializedQueueJob,
  type AfkOrchestrationInput,
  type AfkOrchestrationRun,
} from "./afk-orchestration.ts";
import {
  runOrchestratorRun,
  type OrchestratorMergeMethod,
  type OrchestratorRunRequest,
  type OrchestratorRunSessionResult,
  type OrchestratorRunStatus,
} from "./orchestrator-run.ts";

const execFile = promisify(execFileCallback);

export interface OrchestratorContinueRequest {
  repoRoot?: string;
  initiative: string;
  maxSlices?: number;
  maxParallel?: number;
  maxSteps?: number;
  maxRuntimeSeconds?: number;
  autoLand?: boolean;
  disableAutoLand?: boolean;
  syncMain?: boolean;
  mergeMethod?: OrchestratorMergeMethod;
  approvalRef?: string;
}

export interface OrchestratorContinueFrontier {
  eligibleIssues: string[];
  deferredIssues: string[];
  blockedIssues: string[];
  doneIssues: string[];
}

export interface OrchestratorContinueSliceResult {
  sliceNumber: number;
  selectedIssueId: string;
  selectedQueueJobId: string;
  dryRunCommand: string;
  applyCommand: string;
  preRunFrontier: OrchestratorContinueFrontier;
  postRunFrontier: OrchestratorContinueFrontier;
  workerRun: OrchestratorRunSessionResult;
}

export interface OrchestratorContinueResult {
  version: 1;
  mode: "continue";
  initiativeId: string;
  status: OrchestratorRunStatus;
  stopReason: string;
  maxSlices: number;
  completedSlices: number;
  selectedIssues: string[];
  selectedQueueJobIds: string[];
  delegatedCommands: string[];
  startedWork: string[];
  completedWork: string[];
  blockers: string[];
  nextSafeActions: string[];
  currentFrontier: OrchestratorContinueFrontier;
  slices: OrchestratorContinueSliceResult[];
}

export type OrchestratorContinueAfkExecutor = (input: AfkOrchestrationInput) => Promise<AfkOrchestrationRun>;
export type OrchestratorContinueRunExecutor = (input: OrchestratorRunRequest) => Promise<OrchestratorRunSessionResult>;

function positiveInteger(value: number | undefined, label: string, fallback?: number): number {
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label} is required.`);
  }
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function normalizeSlug(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) throw new Error(`${label} must be a lowercase slug.`);
  return normalized;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function summarizeFrontier(run: AfkOrchestrationRun): OrchestratorContinueFrontier {
  return {
    eligibleIssues: run.eligibleIssues.map((issue) => issue.issueId),
    deferredIssues: run.deferredIssues.map((issue) => issue.issueId),
    blockedIssues: run.blockedIssues.map((issue) => issue.issueId),
    doneIssues: run.doneIssues.map((issue) => issue.issueId),
  };
}

function issueReasons(records: AfkIssueRecord[]): string[] {
  return records.flatMap((issue) =>
    issue.reasons.length > 0 ? issue.reasons.map((reason) => `${issue.issueId}: ${reason}`) : [`${issue.issueId}: unresolved AFK frontier blocker.`],
  );
}

function selectEligibleIssue(run: AfkOrchestrationRun): AfkIssueRecord | null {
  return run.eligibleIssues[0] ?? null;
}

function findQueueJob(run: AfkOrchestrationRun, issueId: string): AfkMaterializedQueueJob | null {
  return run.materializedQueueJobs.find((job) => job.sourceIssueId === issueId) ?? null;
}

function dryRunCommand(initiativeId: string, maxParallel: number): string {
  return `npm run harness:afk-orchestrate -- dry-run --initiative ${initiativeId} --max-parallel ${maxParallel} --json`;
}

function applyCommand(initiativeId: string, maxParallel: number): string {
  return `npm run harness:afk-orchestrate -- apply --queue-only --initiative ${initiativeId} --max-parallel ${maxParallel} --json`;
}

function baseResult(initiativeId: string, maxSlices: number): OrchestratorContinueResult {
  return {
    version: 1,
    mode: "continue",
    initiativeId,
    status: "stopped",
    stopReason: "none",
    maxSlices,
    completedSlices: 0,
    selectedIssues: [],
    selectedQueueJobIds: [],
    delegatedCommands: [],
    startedWork: [],
    completedWork: [],
    blockers: [],
    nextSafeActions: [],
    currentFrontier: { eligibleIssues: [], deferredIssues: [], blockedIssues: [], doneIssues: [] },
    slices: [],
  };
}

async function defaultAfkExecutor(input: AfkOrchestrationInput): Promise<AfkOrchestrationRun> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const args = ["--silent", "run", "harness:afk-orchestrate", "--", input.command, "--initiative", input.initiativeId];
  if (input.queueOnly) args.push("--queue-only");
  if (input.maxParallel !== undefined) args.push("--max-parallel", String(input.maxParallel));
  if (input.maxSteps !== undefined) args.push("--max-steps", String(input.maxSteps));
  if (input.maxRuntimeSeconds !== undefined) args.push("--max-runtime-seconds", String(input.maxRuntimeSeconds));
  args.push("--json");
  const result = await execFile("npm", args, { cwd: repoRoot, encoding: "utf8" });
  return JSON.parse(result.stdout) as AfkOrchestrationRun;
}

function workerRunInput(input: OrchestratorContinueRequest, queueJobId: string): OrchestratorRunRequest {
  return {
    repoRoot: input.repoRoot,
    lane: "worker_job",
    initiative: input.initiative,
    jobId: queueJobId,
    maxSteps: input.maxSteps,
    maxRuntimeSeconds: input.maxRuntimeSeconds,
    autoLand: input.autoLand,
    disableAutoLand: input.disableAutoLand,
    syncMain: input.syncMain,
    mergeMethod: input.mergeMethod,
    approvalRef: input.approvalRef,
  };
}

export async function runOrchestratorContinue(
  input: OrchestratorContinueRequest,
  afkExecutor: OrchestratorContinueAfkExecutor = defaultAfkExecutor,
  runExecutor: OrchestratorContinueRunExecutor = runOrchestratorRun,
): Promise<OrchestratorContinueResult> {
  const initiativeId = normalizeSlug(input.initiative, "--initiative");
  const maxSlices = positiveInteger(input.maxSlices, "--max-slices", 1);
  const maxParallel = positiveInteger(input.maxParallel, "--max-parallel", 1);
  positiveInteger(input.maxSteps, "--max-steps");
  positiveInteger(input.maxRuntimeSeconds, "--max-runtime-seconds");

  const result = baseResult(initiativeId, maxSlices);

  for (let sliceNumber = 1; sliceNumber <= maxSlices; sliceNumber += 1) {
    const preDryRunCommand = dryRunCommand(initiativeId, maxParallel);
    result.delegatedCommands.push(preDryRunCommand);
    const preDryRun = await afkExecutor({
      repoRoot: input.repoRoot,
      command: "dry-run",
      initiativeId,
      maxParallel,
    });
    result.currentFrontier = summarizeFrontier(preDryRun);

    const selectedIssue = selectEligibleIssue(preDryRun);
    if (!selectedIssue) {
      result.status = "stopped";
      result.stopReason = "no_eligible_issues";
      result.blockers = unique([...issueReasons(preDryRun.blockedIssues), ...issueReasons(preDryRun.deferredIssues)]);
      result.nextSafeActions = unique([preDryRun.nextOperatorAction]);
      return result;
    }

    const selectedPreviewJob = findQueueJob(preDryRun, selectedIssue.issueId);
    if (!selectedPreviewJob) {
      result.status = "blocked";
      result.stopReason = "validation_failure";
      result.blockers = [`${selectedIssue.issueId} was eligible in AFK dry-run but no materialized queue job was reported.`];
      result.nextSafeActions = ["Inspect AFK dry-run queue planning before retrying continuation."];
      return result;
    }

    const materializeCommand = applyCommand(initiativeId, maxParallel);
    result.delegatedCommands.push(materializeCommand);
    const applyResult = await afkExecutor({
      repoRoot: input.repoRoot,
      command: "apply",
      initiativeId,
      maxParallel,
      queueOnly: true,
    });

    const selectedQueueJob = findQueueJob(applyResult, selectedIssue.issueId);
    if (!selectedQueueJob) {
      result.status = "blocked";
      result.stopReason = "validation_failure";
      result.blockers = [`${selectedIssue.issueId} was not materialized during AFK apply --queue-only.`];
      result.nextSafeActions = ["Inspect AFK apply queue-only output before retrying continuation."];
      result.currentFrontier = summarizeFrontier(applyResult);
      return result;
    }

    const runResult = await runExecutor(workerRunInput({ ...input, initiative: initiativeId }, selectedQueueJob.id));
    if (runResult.delegatedCommand) result.delegatedCommands.push(runResult.delegatedCommand);
    result.selectedIssues.push(selectedIssue.issueId);
    result.selectedQueueJobIds.push(selectedQueueJob.id);
    result.startedWork = unique([...result.startedWork, selectedQueueJob.id, ...runResult.startedWork]);
    result.completedWork = unique([...result.completedWork, ...runResult.completedWork]);

    const postDryRunCommand = dryRunCommand(initiativeId, maxParallel);
    result.delegatedCommands.push(postDryRunCommand);
    const postDryRun = await afkExecutor({
      repoRoot: input.repoRoot,
      command: "dry-run",
      initiativeId,
      maxParallel,
    });
    result.currentFrontier = summarizeFrontier(postDryRun);

    result.slices.push({
      sliceNumber,
      selectedIssueId: selectedIssue.issueId,
      selectedQueueJobId: selectedQueueJob.id,
      dryRunCommand: preDryRunCommand,
      applyCommand: materializeCommand,
      preRunFrontier: summarizeFrontier(preDryRun),
      postRunFrontier: summarizeFrontier(postDryRun),
      workerRun: runResult,
    });
    result.completedSlices = result.slices.length;

    if (runResult.status !== "completed") {
      result.status = runResult.status;
      result.stopReason = runResult.stopReason;
      result.blockers = unique([...runResult.blockers, ...issueReasons(postDryRun.blockedIssues)]);
      result.nextSafeActions = unique(runResult.nextSafeActions.length > 0 ? runResult.nextSafeActions : [postDryRun.nextOperatorAction]);
      return result;
    }
  }

  result.status = "stopped";
  result.stopReason = "max_slices";
  result.nextSafeActions = ["Increase --max-slices or rerun continue to process the next eligible AFK issue."];
  return result;
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function orchestratorContinueExtension(): void {}
