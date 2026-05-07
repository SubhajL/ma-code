#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { assessSliceLifecycle, type SliceLifecycleAssessment } from "../.pi/agent/extensions/slice-lifecycle.ts";
import { buildPrGateSession, type CommandRunner, type PrGateSession } from "./harness-pr-gate.ts";
import { syncLocalMain, type SyncLocalMainResult } from "./harness-sync-main.ts";

const execFile = promisify(execFileCallback);
const DEFAULT_POLICY_PATH = ".pi/agent/release/merge-release-policy.json";

export type MergeMethod = "squash" | "merge" | "rebase";
export type MergeMode = "check" | "apply";

export interface MergeReleasePolicy {
  version: 1;
  policyName: string;
  description?: string;
  requiredLifecycleStage: "merge_ready";
  requiredPrGateState: "pass";
  allowedMergeMethods: MergeMethod[];
  defaultMergeMethod: MergeMethod;
  blockDraftPrs: boolean;
  blockRequestedChanges: boolean;
  blockBlockingComments: boolean;
  blockLocalDirtOnApply: boolean;
  allowAutoSyncMainByDefault: boolean;
  postMergeEvidenceExpectations: string[];
  outOfScope?: string[];
}

export const DEFAULT_MERGE_RELEASE_POLICY: MergeReleasePolicy = {
  version: 1,
  policyName: "merge-release-policy-phase-8",
  description: "Bounded merge readiness and apply policy. This is not deployment, tagging, changelog, or release automation.",
  requiredLifecycleStage: "merge_ready",
  requiredPrGateState: "pass",
  allowedMergeMethods: ["squash", "merge", "rebase"],
  defaultMergeMethod: "squash",
  blockDraftPrs: true,
  blockRequestedChanges: true,
  blockBlockingComments: true,
  blockLocalDirtOnApply: true,
  allowAutoSyncMainByDefault: false,
  postMergeEvidenceExpectations: ["merged proof", "optional sync-main proof"],
  outOfScope: ["deployment automation", "release tagging", "changelog publishing", "environment release orchestration"],
};

export interface MergePrDetails {
  number?: number;
  url?: string;
  state?: string;
  isDraft?: boolean;
  mergeStateStatus?: string;
  reviewDecision?: string;
  reviews?: Array<Record<string, unknown>>;
  comments?: Array<Record<string, unknown>>;
  headRefName?: string;
  baseRefName?: string;
}

export interface MergeRepoState {
  repoRoot: string;
  currentBranch: string;
  dirtyFiles: string[];
}

export interface MergeReadinessInput {
  policy: MergeReleasePolicy;
  mode: MergeMode;
  method: MergeMethod;
  lifecycle: Pick<SliceLifecycleAssessment, "currentStage" | "target" | "blockingGaps">;
  prGate: Pick<PrGateSession, "finalStatus" | "recommendedNextAction" | "commentSummary" | "reviewSummary">;
  pr: MergePrDetails;
  repo: MergeRepoState;
  syncMainRequested: boolean;
}

export interface MergeReadinessResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  mode: MergeMode;
  method: MergeMethod;
  syncMainPlanned: boolean;
  recommendedNextAction: "fix_blockers" | "wait_for_gate" | "apply_merge" | "apply_merge_then_sync_main" | "ready_for_manual_merge";
}

export interface BuildMergeReadinessOptions {
  pr: string;
  repoRoot?: string;
  method?: string;
  mode?: MergeMode;
  syncMain?: boolean;
}

export interface ApplyMergeOptions extends BuildMergeReadinessOptions {
  method?: string;
  syncMain?: boolean;
}

export interface MergeApplyResult {
  status: "blocked" | "merged";
  readiness: MergeReadinessResult;
  merge?: { stdout: string; stderr: string; code: number };
  syncMain?: SyncLocalMainResult;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function parseStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()) : [];
}

function isMergeMethod(value: string): value is MergeMethod {
  return value === "squash" || value === "merge" || value === "rebase";
}

export function parseMergeReleasePolicy(raw: unknown): MergeReleasePolicy {
  if (!isRecord(raw)) throw new Error("Merge/release policy must be an object.");
  if (raw.version !== 1) throw new Error("Merge/release policy version must be 1.");
  if (typeof raw.policyName !== "string" || raw.policyName.trim().length === 0) throw new Error("policyName is required.");
  if (raw.requiredLifecycleStage !== "merge_ready") throw new Error("requiredLifecycleStage must be merge_ready.");
  if (raw.requiredPrGateState !== "pass") throw new Error("requiredPrGateState must be pass.");
  const allowedMergeMethods = parseStringArray(raw.allowedMergeMethods).filter(isMergeMethod);
  if (allowedMergeMethods.length === 0) throw new Error("allowedMergeMethods must include at least one supported method.");
  const defaultMergeMethod = typeof raw.defaultMergeMethod === "string" && isMergeMethod(raw.defaultMergeMethod) ? raw.defaultMergeMethod : allowedMergeMethods[0]!;
  if (!allowedMergeMethods.includes(defaultMergeMethod)) throw new Error("defaultMergeMethod must be allowed by policy.");

  return {
    version: 1,
    policyName: raw.policyName.trim(),
    description: typeof raw.description === "string" ? raw.description.trim() : undefined,
    requiredLifecycleStage: "merge_ready",
    requiredPrGateState: "pass",
    allowedMergeMethods,
    defaultMergeMethod,
    blockDraftPrs: parseBoolean(raw.blockDraftPrs, true),
    blockRequestedChanges: parseBoolean(raw.blockRequestedChanges, true),
    blockBlockingComments: parseBoolean(raw.blockBlockingComments, true),
    blockLocalDirtOnApply: parseBoolean(raw.blockLocalDirtOnApply, true),
    allowAutoSyncMainByDefault: parseBoolean(raw.allowAutoSyncMainByDefault, false),
    postMergeEvidenceExpectations: parseStringArray(raw.postMergeEvidenceExpectations),
    outOfScope: parseStringArray(raw.outOfScope),
  };
}

export async function loadMergeReleasePolicy(repoRoot = process.cwd()): Promise<MergeReleasePolicy> {
  return parseMergeReleasePolicy(JSON.parse(await readFile(resolve(repoRoot, DEFAULT_POLICY_PATH), "utf8")));
}

export function normalizeMergeMethod(method: string | undefined, policy: MergeReleasePolicy): MergeMethod {
  const candidate = (method ?? policy.defaultMergeMethod).trim().toLowerCase();
  if (!isMergeMethod(candidate)) throw new Error(`Merge method ${candidate || "<empty>"} is not allowed by policy.`);
  if (!policy.allowedMergeMethods.includes(candidate)) throw new Error(`Merge method ${candidate} is not allowed by policy.`);
  return candidate;
}

function reviewChangesRequested(pr: MergePrDetails): number {
  const direct = String(pr.reviewDecision ?? "").toUpperCase() === "CHANGES_REQUESTED" ? 1 : 0;
  const reviewCount = (pr.reviews ?? []).filter((review) => String(review.state ?? "").toUpperCase() === "CHANGES_REQUESTED").length;
  return Math.max(direct, reviewCount);
}

function blockingCommentCount(pr: MergePrDetails): number {
  return (pr.comments ?? []).filter((comment) => {
    const author = isRecord(comment.author) ? String(comment.author.login ?? "") : String(comment.author ?? "");
    const body = String(comment.body ?? "").toLowerCase();
    return !(author.includes("github-actions") && (body.includes("no vulnerabilities") || body.includes("dependency-review")));
  }).length;
}

export function assessMergeReadiness(input: MergeReadinessInput): MergeReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.lifecycle.target?.ready !== true) {
    blockers.push(`lifecycle readiness is not ${input.policy.requiredLifecycleStage}; current stage is ${input.lifecycle.currentStage}.`);
    blockers.push(...(input.lifecycle.blockingGaps ?? []));
  }
  if (input.prGate.finalStatus !== input.policy.requiredPrGateState) {
    blockers.push(`PR gate must be ${input.policy.requiredPrGateState}; current gate status is ${input.prGate.finalStatus}.`);
  }
  if (input.prGate.recommendedNextAction === "wait_and_rerun") blockers.push("PR gate is not terminal; wait and rerun before merge.");
  if (input.prGate.recommendedNextAction === "fix_required") blockers.push("PR gate recommends fix_required; merge is blocked.");
  if (input.policy.blockBlockingComments && (input.prGate.commentSummary.blockingCommentCount > 0 || blockingCommentCount(input.pr) > 0)) {
    blockers.push("blocking comments are present.");
  }
  if (input.policy.blockRequestedChanges && (input.prGate.reviewSummary.changesRequestedCount > 0 || reviewChangesRequested(input.pr) > 0)) {
    blockers.push("requested changes block merge.");
  }
  if (String(input.pr.state ?? "").toUpperCase() !== "OPEN") blockers.push(`PR state must be OPEN; current state is ${input.pr.state ?? "unknown"}.`);
  if (input.policy.blockDraftPrs && input.pr.isDraft === true) blockers.push("draft PRs are blocked by merge policy.");
  if (String(input.pr.mergeStateStatus ?? "").toUpperCase() !== "CLEAN") blockers.push(`PR mergeStateStatus must be CLEAN; current value is ${input.pr.mergeStateStatus ?? "unknown"}.`);
  if (input.mode === "apply" && input.policy.blockLocalDirtOnApply && input.repo.dirtyFiles.length > 0) {
    blockers.push(`local repo dirty state blocks merge-helper apply: ${input.repo.dirtyFiles.join(", ")}`);
  } else if (input.repo.dirtyFiles.length > 0) {
    warnings.push(`local repo has dirty files: ${input.repo.dirtyFiles.join(", ")}`);
  }
  if (!input.syncMainRequested && input.policy.allowAutoSyncMainByDefault === false) warnings.push("sync-main will not run unless --sync-main is explicitly requested.");

  const ready = blockers.length === 0;
  let recommendedNextAction: MergeReadinessResult["recommendedNextAction"] = "fix_blockers";
  if (ready && input.mode === "check") recommendedNextAction = "ready_for_manual_merge";
  else if (ready && input.syncMainRequested) recommendedNextAction = "apply_merge_then_sync_main";
  else if (ready) recommendedNextAction = "apply_merge";
  else if (input.prGate.recommendedNextAction === "wait_and_rerun") recommendedNextAction = "wait_for_gate";

  return {
    ready,
    blockers: [...new Set(blockers.filter(Boolean))],
    warnings,
    mode: input.mode,
    method: input.method,
    syncMainPlanned: ready && input.mode === "apply" && input.syncMainRequested,
    recommendedNextAction,
  };
}

async function defaultRunner(command: string, args: string[], cwd?: string): Promise<CommandResult> {
  try {
    const result = await execFile(command, args, { cwd, encoding: "utf8" });
    return { stdout: result.stdout.trimEnd(), stderr: result.stderr.trimEnd(), code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: (failure.stdout ?? "").trimEnd(), stderr: (failure.stderr ?? "").trimEnd(), code: failure.code ?? 1 };
  }
}

async function runGit(repoRoot: string, args: string[]): Promise<string> {
  const result = await defaultRunner("git", ["-C", repoRoot, ...args]);
  if (result.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function resolveRepoRoot(inputRoot?: string): Promise<string> {
  const cwd = resolve(inputRoot ?? process.cwd());
  return runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

async function readRepoState(repoRoot: string): Promise<MergeRepoState> {
  const [currentBranch, porcelain] = await Promise.all([
    runGit(repoRoot, ["branch", "--show-current"]),
    runGit(repoRoot, ["status", "--porcelain"]),
  ]);
  const dirtyFiles = porcelain.split("\n").map((line) => line.trimEnd()).filter(Boolean).map((line) => line.slice(3).replace(/^"|"$/g, ""));
  return { repoRoot, currentBranch, dirtyFiles };
}

function normalizeGhPrDetails(raw: unknown): MergePrDetails {
  const record = isRecord(raw) ? raw : {};
  return {
    number: typeof record.number === "number" ? record.number : undefined,
    url: typeof record.url === "string" ? record.url : undefined,
    state: typeof record.state === "string" ? record.state : undefined,
    isDraft: typeof record.isDraft === "boolean" ? record.isDraft : undefined,
    mergeStateStatus: typeof record.mergeStateStatus === "string" ? record.mergeStateStatus : undefined,
    reviewDecision: typeof record.reviewDecision === "string" ? record.reviewDecision : undefined,
    reviews: Array.isArray(record.reviews) ? record.reviews.filter(isRecord) : [],
    comments: Array.isArray(record.comments) ? record.comments.filter(isRecord) : [],
    headRefName: typeof record.headRefName === "string" ? record.headRefName : undefined,
    baseRefName: typeof record.baseRefName === "string" ? record.baseRefName : undefined,
  };
}

async function readPrDetails(pr: string, runner: CommandRunner): Promise<MergePrDetails> {
  const result = await runner("gh", ["pr", "view", pr, "--json", "number,url,state,isDraft,mergeStateStatus,reviewDecision,reviews,comments,headRefName,baseRefName"]);
  if (result.code !== 0) throw new Error(`gh pr view ${pr} failed: ${result.stderr || result.stdout}`);
  return normalizeGhPrDetails(JSON.parse(result.stdout || "{}"));
}

export async function buildMergeReadiness(
  options: BuildMergeReadinessOptions,
  deps: {
    runner?: CommandRunner;
    lifecycle?: Pick<SliceLifecycleAssessment, "currentStage" | "target" | "blockingGaps">;
    prGate?: Pick<PrGateSession, "finalStatus" | "recommendedNextAction" | "commentSummary" | "reviewSummary">;
    syncLocalMainFn?: typeof syncLocalMain;
  } = {},
): Promise<{ readiness: MergeReadinessResult; policy: MergeReleasePolicy; pr: MergePrDetails; repo: MergeRepoState; lifecycle: unknown; prGate: unknown }> {
  if (!options.pr) throw new Error("--pr is required.");
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const policy = await loadMergeReleasePolicy(repoRoot);
  const method = normalizeMergeMethod(options.method, policy);
  const runner = deps.runner ?? ((command, args) => defaultRunner(command, args, repoRoot));
  const [repo, lifecycle, prGate, pr] = await Promise.all([
    readRepoState(repoRoot),
    deps.lifecycle ?? assessSliceLifecycle({ cwd: repoRoot, targetStage: policy.requiredLifecycleStage }),
    deps.prGate ?? buildPrGateSession({ pr: options.pr, maxAttempts: 1 }, { runner }),
    readPrDetails(options.pr, runner),
  ]);
  const readiness = assessMergeReadiness({
    policy,
    mode: options.mode ?? "check",
    method,
    lifecycle,
    prGate,
    pr,
    repo,
    syncMainRequested: options.syncMain === true,
  });
  return { readiness, policy, pr, repo, lifecycle, prGate };
}

function mergeArgsFor(method: MergeMethod): string[] {
  if (method === "squash") return ["--squash"];
  if (method === "rebase") return ["--rebase"];
  return ["--merge"];
}

export async function applyMerge(
  options: ApplyMergeOptions,
  deps: { runner?: CommandRunner; syncLocalMainFn?: typeof syncLocalMain } = {},
): Promise<MergeApplyResult> {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const runner = deps.runner ?? ((command, args) => defaultRunner(command, args, repoRoot));
  const built = await buildMergeReadiness({ ...options, repoRoot, mode: "apply" }, { runner });
  if (!built.readiness.ready) return { status: "blocked", readiness: built.readiness };

  const merge = await runner("gh", ["pr", "merge", options.pr, ...mergeArgsFor(built.readiness.method)]);
  if (merge.code !== 0) throw new Error(`gh pr merge ${options.pr} failed: ${merge.stderr || merge.stdout}`);
  const syncMainResult = options.syncMain ? await (deps.syncLocalMainFn ?? syncLocalMain)({ repoRoot }) : undefined;
  return { status: "merged", readiness: built.readiness, merge, syncMain: syncMainResult };
}

export function renderMergeReadiness(payload: Awaited<ReturnType<typeof buildMergeReadiness>>): string {
  const { readiness, pr, repo } = payload;
  const lines = [
    "Harness Merge Readiness",
    `pr: ${pr.url ?? pr.number ?? "unknown"}`,
    `base: ${pr.baseRefName ?? "unknown"}`,
    `head: ${pr.headRefName ?? "unknown"}`,
    `repo: ${repo.repoRoot}`,
    `branch: ${repo.currentBranch || "<detached>"}`,
    `mode: ${readiness.mode}`,
    `method: ${readiness.method}`,
    `ready: ${readiness.ready ? "yes" : "no"}`,
    `recommended next action: ${readiness.recommendedNextAction}`,
  ];
  if (readiness.blockers.length > 0) {
    lines.push("blockers:", ...readiness.blockers.map((blocker) => `- ${blocker}`));
  } else {
    lines.push("blockers: none");
  }
  if (readiness.warnings.length > 0) lines.push("warnings:", ...readiness.warnings.map((warning) => `- ${warning}`));
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): { command: "check" | "apply" | "help"; pr: string; method?: string; syncMain: boolean; json: boolean; repoRoot?: string } {
  const [commandRaw = "help", ...rest] = argv;
  const command = commandRaw === "check" || commandRaw === "apply" ? commandRaw : "help";
  let pr = "";
  let method: string | undefined;
  let syncMain = false;
  let json = false;
  let repoRoot: string | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--json") { json = true; continue; }
    if (arg === "--sync-main") { syncMain = true; continue; }
    if (arg === "--pr") { pr = rest[++i] ?? ""; continue; }
    if (arg === "--method") { method = rest[++i]; continue; }
    if (arg === "--repo") { repoRoot = rest[++i]; continue; }
    if (!arg.startsWith("-") && !pr) { pr = arg; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { command, pr, method, syncMain, json, repoRoot };
}

function usage(): string {
  return `Usage: harness-merge <check|apply> --pr <number> [options]\n\nOptions:\n  --method <squash|merge|rebase>  Merge method (default from policy)\n  --sync-main                     After apply, explicitly run sync-main\n  --repo <path>                    Repo root or worktree path\n  --json                           Emit JSON\n  -h, --help                       Show help\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    process.stdout.write(usage());
    return;
  }
  if (!args.pr) throw new Error("--pr is required.");
  if (args.command === "check") {
    const payload = await buildMergeReadiness({ pr: args.pr, method: args.method, mode: "check", syncMain: args.syncMain, repoRoot: args.repoRoot });
    if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else process.stdout.write(renderMergeReadiness(payload));
    if (!payload.readiness.ready) process.exitCode = 1;
    return;
  }
  const result = await applyMerge({ pr: args.pr, method: args.method, syncMain: args.syncMain, repoRoot: args.repoRoot });
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(result.status === "merged" ? "Harness merge applied\n" : "Harness merge blocked\n");
    process.stdout.write(`ready: ${result.readiness.ready ? "yes" : "no"}\n`);
    if (result.readiness.blockers.length > 0) process.stdout.write(result.readiness.blockers.map((blocker) => `- ${blocker}`).join("\n") + "\n");
    if (result.syncMain) process.stdout.write(`sync-main: ${result.syncMain.status}\n`);
  }
  if (result.status !== "merged") process.exitCode = 1;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) {
  main().catch((error) => {
    console.error(`harness-merge failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
