import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  classifyOrchestratorGoal,
  type OrchestratorClassification,
  type OrchestratorGitState,
  type OrchestratorInitiativeCandidate,
} from "../.pi/agent/extensions/orchestrator-classifier.ts";
import { planOrchestratorDryRun, type OrchestratorDryRunPlan } from "../.pi/agent/extensions/orchestrator-dry-run.ts";
import {
  rejectUnsafeApplyVerb,
  runOrchestratorApply,
  type OrchestratorApplyMaterializationResult,
  type OrchestratorApplyPath,
  type OrchestratorApplyRequest,
} from "../.pi/agent/extensions/orchestrator-apply-policy.ts";
import {
  runOrchestratorRun,
  type OrchestratorRunLane,
  type OrchestratorRunRequest,
  type OrchestratorRunSessionResult,
} from "../.pi/agent/extensions/orchestrator-run.ts";
import {
  collectOrchestratorEvidence,
  runOrchestratorMergeApply,
  runOrchestratorMergeCheck,
  type OrchestratorEvidenceSummary,
  type OrchestratorMergeOptions,
} from "../.pi/agent/extensions/orchestrator-evidence.ts";
import {
  analyzeOrchestratorContext,
  collectOrchestratorContextSignals,
  type OrchestratorContextAssessment,
} from "../.pi/agent/extensions/orchestrator-context.ts";

const execFile = promisify(execFileCallback);

export type HarnessOrchestrateOptions =
  | { command: "classify" | "dry-run"; goal: string; json?: boolean; repoRoot?: string }
  | { command: "context"; goal?: string; initiative?: string; json?: boolean; repoRoot?: string }
  | ({ command: "apply"; json?: boolean; repoRoot?: string } & OrchestratorApplyRequest)
  | ({ command: "run"; json?: boolean; repoRoot?: string } & OrchestratorRunRequest)
  | { command: "evidence"; initiative: string; runId?: string; lifecycleEvidence?: string; codingLog?: string; writeReport?: boolean; json?: boolean; repoRoot?: string }
  | ({ command: "merge-check" | "merge-apply"; json?: boolean; repoRoot?: string } & OrchestratorMergeOptions);

function usage(): string {
  return [
    "Usage:",
    "  harness-orchestrate classify --goal <human-goal> [--json]",
    "  harness-orchestrate context [--goal <human-goal>] [--initiative <slug>] [--json]",
    "  harness-orchestrate dry-run --goal <human-goal> [--json]",
    "  harness-orchestrate apply --path <apply-path> [target args] [--json]",
    "  harness-orchestrate run --initiative <slug> --max-steps <n> --max-runtime-seconds <n> [--json]",
    "  harness-orchestrate run --initiative <slug> --job-id <id> --max-steps <n> --max-runtime-seconds <n> [--allow-pr-create --approval-ref <ref>] [--json]",
    "  harness-orchestrate run --lane parallel_lanes --initiative <slug> --max-steps <n> --max-runtime-seconds <n> --max-parallel <n> --worker-command <cmd> [--json]",
    "  harness-orchestrate evidence --initiative <slug> [--run-id <id>] [--lifecycle-evidence <path>] [--write-report] [--json]",
    "  harness-orchestrate merge-check --pr <number> [--method squash|merge|rebase] [--lifecycle-evidence <path>] [--json]",
    "  harness-orchestrate merge-apply --pr <number> --approval-ref <ref> [--method squash|merge|rebase] [--lifecycle-evidence <path>] [--json]",
    "",
    "Apply paths:",
    "  product_intake --initiative <slug> --description <text>",
    "  issue_materialization --source <approved-g-issues.json>",
    "  product_pipeline --initiative <slug>",
    "  stitch_prompt --initiative <slug> --slice <slice-id>",
    "  stitch_artifact --initiative <slug> --slice <slice-id>",
    "  screen_approval --action approve --initiative <slug> --slice <slice-id> --approval-ref <ref> --by <name> --note <text>",
    "  screen_approval --action reject --initiative <slug> --slice <slice-id> --approval-ref <ref> --by <name> --reason <text>",
    "  slice_contract --initiative <slug> --slice <slice-id>",
    "  frontend_packet --initiative <slug> --slice <slice-id>",
    "  backend_packet --initiative <slug> --slice <slice-id>",
    "  afk_queue_materialization --initiative <slug>",
    "",
    "Rules:",
    "  - classify is read-only and writes no files",
    "  - dry-run classifies, invokes at most one allowlisted dry-run/status/check helper, and writes no orchestrator files",
    "  - apply delegates exactly one allowlisted materialization helper and verifies reported createdFiles against explicit write-path allowlists",
    "  - apply does not run workers, create PRs, merge, sync main, or accept generic command strings",
    "  - run delegates exactly one bounded execution lane, requires max limits, defaults to stop-before-merge, and never merges",
    "  - evidence consumes existing run/lifecycle/log artifacts first; optional reports are explicit",
    "  - merge-check and merge-apply delegate only to harness:merge; merge-apply requires --approval-ref",
  ].join("\n");
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function isApplyPath(value: string): value is OrchestratorApplyPath {
  return [
    "product_intake",
    "issue_materialization",
    "product_pipeline",
    "stitch_prompt",
    "stitch_artifact",
    "screen_approval",
    "slice_contract",
    "frontend_packet",
    "backend_packet",
    "afk_queue_materialization",
  ].includes(value);
}

function normalizeSliceArg(arg: string): "sliceId" | null {
  return arg === "--slice" ? "sliceId" : null;
}

function isRunLane(value: string): value is OrchestratorRunLane {
  return value === "queue_level" || value === "worker_job" || value === "parallel_lanes";
}

function positiveInteger(value: string | undefined, flag: string): number {
  if (!value) throw new Error(`${flag} requires a value.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

export function parseHarnessOrchestrateArgs(argv: string[]): HarnessOrchestrateOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (["create", "merge", "sync-main", "git"].includes(commandValue)) rejectUnsafeApplyVerb(commandValue);
  if (!["classify", "context", "dry-run", "apply", "run", "evidence", "merge-check", "merge-apply"].includes(commandValue)) throw new Error(`Unknown or unsupported command: ${commandValue}\n${usage()}`);

  let goal: string | undefined;
  let json = false;

  if (commandValue === "context") {
    let initiative: string | undefined;
    for (let index = 0; index < rest.length; index += 1) {
      const arg = rest[index];
      if (arg === "--goal") goal = requireValue(rest[++index], "--goal");
      else if (arg === "--initiative" || arg === "--slug") initiative = requireValue(rest[++index], arg);
      else if (arg === "--json") json = true;
      else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
    return { command: "context", goal, initiative, json };
  }

  if (commandValue === "evidence") {
    let initiative: string | undefined;
    let runId: string | undefined;
    let lifecycleEvidence: string | undefined;
    let codingLog: string | undefined;
    let writeReport = false;
    for (let index = 0; index < rest.length; index += 1) {
      const arg = rest[index];
      if (arg === "--initiative" || arg === "--slug") initiative = requireValue(rest[++index], arg);
      else if (arg === "--run-id") runId = requireValue(rest[++index], "--run-id");
      else if (arg === "--lifecycle-evidence" || arg === "--evidence-file") lifecycleEvidence = requireValue(rest[++index], arg);
      else if (arg === "--coding-log") codingLog = requireValue(rest[++index], "--coding-log");
      else if (arg === "--write-report") writeReport = true;
      else if (arg === "--json") json = true;
      else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
    if (!initiative) throw new Error("--initiative is required for evidence.");
    return { command: "evidence", initiative, runId, lifecycleEvidence, codingLog, writeReport, json };
  }

  if (commandValue === "merge-check" || commandValue === "merge-apply") {
    let pr: string | undefined;
    let method: OrchestratorMergeOptions["method"] | undefined;
    let lifecycleEvidence: string | undefined;
    let approvalRef: string | undefined;
    for (let index = 0; index < rest.length; index += 1) {
      const arg = rest[index];
      if (arg === "--pr") pr = requireValue(rest[++index], "--pr");
      else if (arg === "--method") {
        const raw = requireValue(rest[++index], "--method");
        if (raw !== "squash" && raw !== "merge" && raw !== "rebase") throw new Error("--method must be squash, merge, or rebase.");
        method = raw;
      } else if (arg === "--lifecycle-evidence" || arg === "--evidence-file") lifecycleEvidence = requireValue(rest[++index], arg);
      else if (arg === "--approval-ref") approvalRef = requireValue(rest[++index], "--approval-ref");
      else if (arg === "--json") json = true;
      else if (["--sync-main", "--git", "--raw-merge"].includes(arg)) throw new Error(`${arg} is not supported by harness-orchestrate ${commandValue}.`);
      else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
    if (!pr) throw new Error("--pr is required.");
    return { command: commandValue, pr, method, lifecycleEvidence, approvalRef, json };
  }

  if (commandValue === "apply") {
    let path: OrchestratorApplyPath | undefined;
    let initiative: string | undefined;
    let sliceId: string | undefined;
    let source: string | undefined;
    let description: string | undefined;
    let action: "approve" | "reject" | undefined;
    let approvalRef: string | undefined;
    let by: string | undefined;
    let note: string | undefined;
    let reason: string | undefined;
    let command: string | undefined;

    for (let index = 0; index < rest.length; index += 1) {
      const arg = rest[index];
      const sliceKey = normalizeSliceArg(arg);
      if (arg === "--path") {
        const rawPath = requireValue(rest[++index], "--path");
        if (!isApplyPath(rawPath)) throw new Error(`Unknown apply path: ${rawPath}`);
        path = rawPath;
      } else if (arg === "--initiative" || arg === "--slug") {
        initiative = requireValue(rest[++index], arg);
      } else if (sliceKey) {
        sliceId = requireValue(rest[++index], arg);
      } else if (arg === "--source") {
        source = requireValue(rest[++index], "--source");
      } else if (arg === "--description") {
        description = requireValue(rest[++index], "--description");
      } else if (arg === "--action") {
        const rawAction = requireValue(rest[++index], "--action");
        if (rawAction !== "approve" && rawAction !== "reject") throw new Error("--action must be approve or reject.");
        action = rawAction;
      } else if (arg === "--approval-ref") {
        approvalRef = requireValue(rest[++index], "--approval-ref");
      } else if (arg === "--by") {
        by = requireValue(rest[++index], "--by");
      } else if (arg === "--note") {
        note = requireValue(rest[++index], "--note");
      } else if (arg === "--reason") {
        reason = requireValue(rest[++index], "--reason");
      } else if (arg === "--command") {
        command = requireValue(rest[++index], "--command");
      } else if (arg === "--json") {
        json = true;
      } else if (["--run", "--create", "--merge", "--sync-main", "--allow-merge"].includes(arg)) {
        throw new Error(`${arg} is not supported by harness-orchestrate apply.`);
      } else {
        throw new Error(`Unknown argument: ${arg}\n${usage()}`);
      }
    }

    if (!path) throw new Error("--path is required for apply.");
    return { command: "apply", path, initiative, sliceId, source, description, action, approvalRef, by, note, reason, command, json };
  }

  if (commandValue === "run") {
    let lane: OrchestratorRunLane | undefined;
    let initiative: string | undefined;
    let jobId: string | undefined;
    let maxSteps: number | undefined;
    let maxRuntimeSeconds: number | undefined;
    let maxParallel: number | undefined;
    let workerCommand: string | undefined;
    let allowPrCreate = false;
    let approvalRef: string | undefined;

    for (let index = 0; index < rest.length; index += 1) {
      const arg = rest[index];
      if (arg === "--lane") {
        const rawLane = requireValue(rest[++index], "--lane");
        if (!isRunLane(rawLane)) throw new Error("--lane must be queue_level, worker_job, or parallel_lanes.");
        lane = rawLane;
      } else if (arg === "--initiative" || arg === "--slug") {
        initiative = requireValue(rest[++index], arg);
      } else if (arg === "--job-id") {
        jobId = requireValue(rest[++index], "--job-id");
      } else if (arg === "--max-steps") {
        maxSteps = positiveInteger(rest[++index], "--max-steps");
      } else if (arg === "--max-runtime-seconds") {
        maxRuntimeSeconds = positiveInteger(rest[++index], "--max-runtime-seconds");
      } else if (arg === "--max-parallel") {
        maxParallel = positiveInteger(rest[++index], "--max-parallel");
      } else if (arg === "--worker-command") {
        workerCommand = requireValue(rest[++index], "--worker-command");
      } else if (arg === "--allow-pr-create") {
        allowPrCreate = true;
      } else if (arg === "--approval-ref") {
        approvalRef = requireValue(rest[++index], "--approval-ref");
      } else if (arg === "--json") {
        json = true;
      } else if (["--apply", "--create", "--merge", "--sync-main", "--allow-merge"].includes(arg)) {
        throw new Error(`${arg} is not supported by harness-orchestrate run.`);
      } else {
        throw new Error(`Unknown argument: ${arg}\n${usage()}`);
      }
    }

    return { command: "run", lane, initiative, jobId, maxSteps, maxRuntimeSeconds, maxParallel, workerCommand, allowPrCreate, approvalRef, json };
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--goal") goal = requireValue(rest[++index], "--goal");
    else if (arg === "--json") json = true;
    else if (["--apply", "--run", "--create", "--merge", "--allow-merge"].includes(arg)) throw new Error(`${arg} is not supported by harness-orchestrate ${commandValue}.`);
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }

  if (!goal || goal.trim().length === 0) throw new Error("--goal is required.");
  return { command: commandValue, goal, json };
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readPackageScripts(repoRoot: string): Promise<string[]> {
  try {
    const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    const scripts = packageJson && typeof packageJson === "object" ? (packageJson as { scripts?: unknown }).scripts : undefined;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return [];
    return Object.keys(scripts).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readInitiativeCandidates(repoRoot: string): Promise<OrchestratorInitiativeCandidate[]> {
  const initiativesRoot = join(repoRoot, "docs", "initiatives");
  if (!(await pathExists(initiativesRoot))) return [];
  const entries = await readdir(initiativesRoot, { withFileTypes: true });
  const candidates: OrchestratorInitiativeCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "TEMPLATE") continue;
    const base = join(initiativesRoot, entry.name);
    candidates.push({
      slug: entry.name,
      hasPipeline: await pathExists(join(base, "pipeline.json")),
      hasIssues: await pathExists(join(base, "issues.json")),
      hasSlices: await pathExists(join(base, "slices")),
    });
  }
  return candidates.sort((left, right) => left.slug.localeCompare(right.slug));
}

async function readGitState(repoRoot: string): Promise<OrchestratorGitState> {
  try {
    const branchResult = await execFile("git", ["-C", repoRoot, "branch", "--show-current"], { encoding: "utf8" });
    const statusResult = await execFile("git", ["-C", repoRoot, "status", "--porcelain"], { encoding: "utf8" });
    return { branch: branchResult.stdout.trim() || "detached", dirty: statusResult.stdout.trim().length > 0 };
  } catch {
    return { branch: "unknown", dirty: false };
  }
}

export async function runHarnessOrchestrate(options: Extract<HarnessOrchestrateOptions, { command: "classify" | "dry-run" }>): Promise<OrchestratorClassification> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  return classifyOrchestratorGoal({
    goal: options.goal,
    packageScripts: await readPackageScripts(repoRoot),
    initiativeCandidates: await readInitiativeCandidates(repoRoot),
    git: await readGitState(repoRoot),
  });
}

export async function runHarnessOrchestrateContext(options: Extract<HarnessOrchestrateOptions, { command: "context" }>): Promise<OrchestratorContextAssessment> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const signals = await collectOrchestratorContextSignals({ repoRoot, initiativeSlug: options.initiative, goal: options.goal });
  return analyzeOrchestratorContext(signals);
}

export async function runHarnessOrchestrateDryRun(options: Extract<HarnessOrchestrateOptions, { command: "classify" | "dry-run" }>): Promise<OrchestratorDryRunPlan> {
  const classification = await runHarnessOrchestrate(options);
  return planOrchestratorDryRun({ classification });
}

export async function runHarnessOrchestrateApply(options: Extract<HarnessOrchestrateOptions, { command: "apply" }>): Promise<OrchestratorApplyMaterializationResult> {
  return runOrchestratorApply(options);
}

export async function runHarnessOrchestrateRun(options: Extract<HarnessOrchestrateOptions, { command: "run" }>): Promise<OrchestratorRunSessionResult> {
  return runOrchestratorRun({ ...options, repoRoot: resolve(options.repoRoot ?? process.cwd()) });
}

export async function runHarnessOrchestrateEvidence(options: Extract<HarnessOrchestrateOptions, { command: "evidence" }>): Promise<OrchestratorEvidenceSummary> {
  return collectOrchestratorEvidence({ ...options, repoRoot: resolve(options.repoRoot ?? process.cwd()) });
}

export async function runHarnessOrchestrateMergeCheck(options: Extract<HarnessOrchestrateOptions, { command: "merge-check" }>): Promise<OrchestratorEvidenceSummary> {
  return runOrchestratorMergeCheck({ ...options, repoRoot: resolve(options.repoRoot ?? process.cwd()) });
}

export async function runHarnessOrchestrateMergeApply(options: Extract<HarnessOrchestrateOptions, { command: "merge-apply" }>): Promise<OrchestratorEvidenceSummary> {
  return runOrchestratorMergeApply({ ...options, repoRoot: resolve(options.repoRoot ?? process.cwd()) });
}

function renderClassificationText(result: OrchestratorClassification): string {
  return [
    "Harness Orchestrate Phase 1 Classification",
    `goal: ${result.goal}`,
    `selectedPath: ${result.selectedPath}`,
    `confidence: ${result.confidence}`,
    `nextDryRunCommand: ${result.nextDryRunCommand ?? "none"}`,
    "blockedReasons:",
    ...(result.blockedReasons.length > 0 ? result.blockedReasons.map((entry) => `- ${entry}`) : ["- none"]),
  ].join("\n");
}

function renderContextText(result: OrchestratorContextAssessment): string {
  return [
    "Harness Orchestrate repo context",
    `repoContext: ${result.repoContext}`,
    `initiativeMaturity: ${result.initiativeMaturity}`,
    `greenfieldEligible: ${result.greenfieldEligible}`,
    "safeNextModes:",
    ...(result.safeNextModes.length > 0 ? result.safeNextModes.map((entry) => `- ${entry}`) : ["- none"]),
    "blockedModes:",
    ...(result.blockedModes.length > 0 ? result.blockedModes.map((entry) => `- ${entry}`) : ["- none"]),
    "reasoning:",
    ...(result.reasoning.length > 0 ? result.reasoning.map((entry) => `- ${entry}`) : ["- none"]),
  ].join("\n");
}

function renderDryRunText(result: OrchestratorDryRunPlan): string {
  return [
    "Harness Orchestrate Phase 2 Dry Run",
    `selectedPath: ${result.selectedPath}`,
    `confidence: ${result.confidence}`,
    `status: ${result.status}`,
    `delegatedCommand: ${result.delegatedCommand ?? "none"}`,
    "blockers:",
    ...(result.blockers.length > 0 ? result.blockers.map((entry) => `- ${entry}`) : ["- none"]),
    "nextSafeActions:",
    ...(result.nextSafeActions.length > 0 ? result.nextSafeActions.map((entry) => `- ${entry}`) : ["- none"]),
  ].join("\n");
}

function renderApplyText(result: OrchestratorApplyMaterializationResult): string {
  return [
    "Harness Orchestrate Phase 3 Apply",
    `selectedPath: ${result.selectedPath}`,
    `status: ${result.status}`,
    `delegatedCommand: ${result.delegatedCommand}`,
    `approvalRef: ${result.approvalRef ?? "none"}`,
    "createdFiles:",
    ...(result.createdFiles.length > 0 ? result.createdFiles.map((entry) => `- ${entry}`) : ["- none"]),
    "allowedWritePaths:",
    ...(result.allowedWritePaths.length > 0 ? result.allowedWritePaths.map((entry) => `- ${entry}`) : ["- none"]),
    "blockers:",
    ...(result.blockers.length > 0 ? result.blockers.map((entry) => `- ${entry}`) : ["- none"]),
    "nextSafeActions:",
    ...(result.nextSafeActions.length > 0 ? result.nextSafeActions.map((entry) => `- ${entry}`) : ["- none"]),
  ].join("\n");
}

function renderEvidenceText(result: OrchestratorEvidenceSummary): string {
  return [
    `Harness Orchestrate Phase 5 ${result.mode}`,
    `runId: ${result.runId}`,
    `selectedPath: ${result.selectedPath ?? "none"}`,
    `status: ${result.status}`,
    `approvalRef: ${result.approval.approvalRef ?? "none"}`,
    `mergeAttempted: ${result.merge.attempted}`,
    "delegatedCommands:",
    ...(result.delegatedCommands.length > 0 ? result.delegatedCommands.map((entry) => `- ${entry.command} (${entry.status})`) : ["- none"]),
    "blockers:",
    ...(result.blockers.length > 0 ? result.blockers.map((entry) => `- ${entry}`) : ["- none"]),
    `nextSafeAction: ${result.nextSafeAction}`,
  ].join("\n");
}

function renderRunText(result: OrchestratorRunSessionResult): string {
  return [
    "Harness Orchestrate Phase 4 Run",
    `selectedLane: ${result.selectedLane ?? "none"}`,
    `status: ${result.status}`,
    `delegatedCommand: ${result.delegatedCommand ?? "none"}`,
    `stopReason: ${result.stopReason}`,
    `mergeAttempted: ${result.merge.attempted}`,
    "startedWork:",
    ...(result.startedWork.length > 0 ? result.startedWork.map((entry) => `- ${entry}`) : ["- none"]),
    "completedWork:",
    ...(result.completedWork.length > 0 ? result.completedWork.map((entry) => `- ${entry}`) : ["- none"]),
    "blockers:",
    ...(result.blockers.length > 0 ? result.blockers.map((entry) => `- ${entry}`) : ["- none"]),
    "nextSafeActions:",
    ...(result.nextSafeActions.length > 0 ? result.nextSafeActions.map((entry) => `- ${entry}`) : ["- none"]),
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseHarnessOrchestrateArgs(argv);
  if (options.command === "classify") {
    const result = await runHarnessOrchestrate(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderClassificationText(result)}\n`);
    return;
  }
  if (options.command === "context") {
    const result = await runHarnessOrchestrateContext(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderContextText(result)}\n`);
    return;
  }
  if (options.command === "dry-run") {
    const result = await runHarnessOrchestrateDryRun(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderDryRunText(result)}\n`);
    return;
  }
  if (options.command === "run") {
    const result = await runHarnessOrchestrateRun(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderRunText(result)}\n`);
    if (result.status === "blocked" || result.status === "failed") process.exitCode = 1;
    return;
  }
  if (options.command === "evidence") {
    const result = await runHarnessOrchestrateEvidence(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderEvidenceText(result)}\n`);
    if (result.status === "blocked") process.exitCode = 1;
    return;
  }
  if (options.command === "merge-check") {
    const result = await runHarnessOrchestrateMergeCheck(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderEvidenceText(result)}\n`);
    if (result.status === "blocked") process.exitCode = 1;
    return;
  }
  if (options.command === "merge-apply") {
    const result = await runHarnessOrchestrateMergeApply(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderEvidenceText(result)}\n`);
    if (result.status !== "merged") process.exitCode = 1;
    return;
  }
  const result = await runHarnessOrchestrateApply(options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderApplyText(result)}\n`);
  if (result.status !== "materialized") process.exitCode = 1;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = (error as Error).message;
    if (message.startsWith("Usage:")) {
      process.stdout.write(`${message}\n`);
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`harness-orchestrate failed: ${message}\n`);
    process.exitCode = 1;
  });
}
