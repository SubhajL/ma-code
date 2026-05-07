import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import {
  LOCAL_MAIN_INTEGRATION_LEASE_SCOPE,
  acquireLocalMainIntegrationLease,
  releaseLocalMainIntegrationLease,
} from "../.pi/agent/extensions/execution-leases.ts";
import { buildHarnessWorktreeReviewPrep } from "./harness-worktree.ts";
import { isAllowedBookkeepingPath, listPreservedLocalBookkeeping, readDirtyTrackedFiles } from "./harness-sync-main.ts";

const execFile = promisify(execFileCallback);
const DEFAULT_BRANCH = "main";
const DEFAULT_OWNER = "assistant";
const DEFAULT_VALIDATOR = "scripts/validate-core-workflows.sh";

export type IntegrateWorktreeStatus = "merged" | "already_current";

export interface IntegrateWorktreeOptions {
  repoRoot?: string;
  sourceWorktreePath: string;
  branch?: string;
  owner?: string;
  runPostMergeValidation?: boolean;
  validatorScript?: string;
}

export interface IntegrateWorktreeResult {
  repoRoot: string;
  branch: string;
  sourceWorktreePath: string;
  sourceBranch: string;
  sourceHead: string;
  beforeHead: string;
  afterHead: string;
  status: IntegrateWorktreeStatus;
  integrationLeaseId: string;
  dirtyTrackedFiles: string[];
  preservedLocalBookkeeping: string[];
  toleratedUntrackedArtifacts: string[];
  postMergeValidation: {
    attempted: boolean;
    passed: boolean;
    reportPath: string | null;
    summaryJsonPath: string | null;
    skippedReason: string | null;
  };
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<CommandResult> {
  try {
    const result = await execFile(command, args, { cwd, encoding: "utf8" });
    return { stdout: result.stdout.trimEnd(), stderr: result.stderr.trimEnd() };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    const detail = (failure.stderr ?? failure.stdout ?? failure.message ?? "command failed").trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
}

async function runGit(repoRoot: string, args: string[]): Promise<string> {
  const result = await runCommand("git", ["-C", repoRoot, ...args]);
  return result.stdout;
}

async function resolveRepoRoot(inputRoot?: string): Promise<string> {
  const cwd = resolve(inputRoot ?? process.cwd());
  return runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

function parseUntrackedFiles(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).replace(/^"|"$/g, ""));
}

function isAllowedGeneratedArtifactPath(path: string): boolean {
  return /^reports\/validation\/\d{4}-\d{2}-\d{2}_.+-validation-script\.(md|json)$/.test(path);
}

async function readToleratedUntrackedArtifacts(repoRoot: string): Promise<string[]> {
  const porcelain = await runGit(repoRoot, ["status", "--porcelain", "--untracked-files=all"]);
  const untracked = parseUntrackedFiles(porcelain);
  const disallowed = untracked.filter((path) => !isAllowedGeneratedArtifactPath(path));
  if (disallowed.length > 0) {
    throw new Error(`Refusing to integrate: unexpected untracked files are present: ${disallowed.join(", ")}`);
  }
  return untracked;
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutesIso(timestamp: string, minutes: number): string {
  return new Date(Date.parse(timestamp) + minutes * 60 * 1000).toISOString();
}

async function runPostMergeValidator(repoRoot: string, validatorScript: string): Promise<IntegrateWorktreeResult["postMergeValidation"]> {
  const scriptPath = resolve(repoRoot, validatorScript);
  const tempDir = await mkdtemp(join(tmpdir(), "harness-integrate-"));
  const reportPath = join(tempDir, "core-workflows-validation.md");
  const summaryJsonPath = join(tempDir, "core-workflows-validation.json");
  await runCommand(scriptPath, ["--report", reportPath, "--summary-json", summaryJsonPath], repoRoot);
  return {
    attempted: true,
    passed: true,
    reportPath,
    summaryJsonPath,
    skippedReason: null,
  };
}

export async function integrateHarnessWorktree(options: IntegrateWorktreeOptions): Promise<IntegrateWorktreeResult> {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const branch = options.branch ?? DEFAULT_BRANCH;
  const owner = options.owner?.trim() || DEFAULT_OWNER;
  const sourceWorktreePath = resolve(options.sourceWorktreePath);
  const runValidation = options.runPostMergeValidation ?? true;
  const validatorScript = options.validatorScript ?? DEFAULT_VALIDATOR;

  const currentBranch = await runGit(repoRoot, ["branch", "--show-current"]);
  if (currentBranch !== branch) {
    throw new Error(`Refusing to integrate while current branch is ${currentBranch || "<detached>"}. Switch to ${branch} first.`);
  }

  const dirtyTrackedFiles = await readDirtyTrackedFiles(repoRoot);
  const nonBookkeepingDirty = dirtyTrackedFiles.filter((path) => !isAllowedBookkeepingPath(path));
  if (nonBookkeepingDirty.length > 0) {
    throw new Error(`Refusing to integrate: non-bookkeeping tracked dirt is present: ${nonBookkeepingDirty.join(", ")}`);
  }

  const toleratedUntrackedArtifacts = await readToleratedUntrackedArtifacts(repoRoot);
  const reviewPrep = await buildHarnessWorktreeReviewPrep({ repoRoot, worktreePath: sourceWorktreePath, baseRef: branch });
  if (!reviewPrep.branch) {
    throw new Error(`Source worktree is not merge-ready: ${reviewPrep.warnings.join(" | ") || "unknown reason"}`);
  }

  const beforeHead = await runGit(repoRoot, ["rev-parse", "HEAD"]);
  const sourceHead = await runGit(sourceWorktreePath, ["rev-parse", "HEAD"]);
  const alreadyCurrent = beforeHead === sourceHead;
  const blockingWarnings = reviewPrep.warnings.filter((warning) => {
    if (alreadyCurrent && (warning.includes("no commits ahead") || warning.includes("No changed files"))) return false;
    return true;
  });
  if (blockingWarnings.length > 0) {
    throw new Error(`Source worktree is not merge-ready: ${blockingWarnings.join(" | ")}`);
  }
  const mergeBase = await runGit(repoRoot, ["merge-base", beforeHead, reviewPrep.branch]);
  if (beforeHead !== sourceHead && mergeBase !== beforeHead) {
    throw new Error(`Refusing to integrate: ${reviewPrep.branch} is not a fast-forward of ${branch}.`);
  }
  const acquiredAt = nowIso();
  const integrationLeaseId = `integration-${randomUUID()}`;
  const lease = await acquireLocalMainIntegrationLease(repoRoot, {
    id: integrationLeaseId,
    owner,
    acquiredAt,
    expiresAt: addMinutesIso(acquiredAt, 30),
  });
  if (!lease.acquired || !lease.lease) {
    throw new Error(`Another integration already holds the ${LOCAL_MAIN_INTEGRATION_LEASE_SCOPE} lease.`);
  }

  let postMergeValidation: IntegrateWorktreeResult["postMergeValidation"] = {
    attempted: false,
    passed: false,
    reportPath: null,
    summaryJsonPath: null,
    skippedReason: "post-merge validation disabled",
  };

  try {
    if (beforeHead !== sourceHead) {
      await runGit(repoRoot, ["merge", "--ff-only", reviewPrep.branch]);
    }
    const afterHead = await runGit(repoRoot, ["rev-parse", "HEAD"]);

    if (runValidation) {
      try {
        postMergeValidation = await runPostMergeValidator(repoRoot, validatorScript);
      } catch (error) {
        postMergeValidation = {
          attempted: true,
          passed: false,
          reportPath: null,
          summaryJsonPath: null,
          skippedReason: String(error),
        };
        throw new Error(`Post-merge validation failed: ${String(error)}`);
      }
    }

    return {
      repoRoot,
      branch,
      sourceWorktreePath,
      sourceBranch: reviewPrep.branch,
      sourceHead,
      beforeHead,
      afterHead,
      status: beforeHead === afterHead ? "already_current" : "merged",
      integrationLeaseId,
      dirtyTrackedFiles,
      preservedLocalBookkeeping: await listPreservedLocalBookkeeping(repoRoot),
      toleratedUntrackedArtifacts,
      postMergeValidation,
    };
  } finally {
    await releaseLocalMainIntegrationLease(repoRoot, integrationLeaseId);
  }
}

export function renderIntegrateHarnessWorktreeResult(result: IntegrateWorktreeResult): string {
  const lines = [
    "Harness Integrate Worktree",
    `repo: ${result.repoRoot}`,
    `branch: ${result.branch}`,
    `source branch: ${result.sourceBranch}`,
    `source worktree: ${result.sourceWorktreePath}`,
    `status: ${result.status}`,
    `before: ${result.beforeHead}`,
    `source_head: ${result.sourceHead}`,
    `after: ${result.afterHead}`,
    `integration lease: ${result.integrationLeaseId}`,
    `tracked dirt allowed: ${result.dirtyTrackedFiles.length}`,
    `tolerated untracked artifacts: ${result.toleratedUntrackedArtifacts.length}`,
    `preserved local bookkeeping: ${result.preservedLocalBookkeeping.length}`,
    `post-merge validation: ${result.postMergeValidation.attempted ? (result.postMergeValidation.passed ? "passed" : "failed") : `skipped (${result.postMergeValidation.skippedReason})`}`,
  ];
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): IntegrateWorktreeOptions & { json?: boolean } {
  const options: IntegrateWorktreeOptions & { json?: boolean } = { sourceWorktreePath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--skip-validation") {
      options.runPostMergeValidation = false;
      continue;
    }
    if (["--repo", "--worktree", "--branch", "--owner", "--validator-script"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      if (arg === "--repo") options.repoRoot = value;
      if (arg === "--worktree") options.sourceWorktreePath = value;
      if (arg === "--branch") options.branch = value;
      if (arg === "--owner") options.owner = value;
      if (arg === "--validator-script") options.validatorScript = value;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log("Usage: harness-integrate [--json] [--repo <path>] --worktree <path> [--branch main] [--owner assistant] [--skip-validation] [--validator-script scripts/validate-core-workflows.sh]");
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.sourceWorktreePath) throw new Error("--worktree is required.");
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await integrateHarnessWorktree(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    process.stdout.write(renderIntegrateHarnessWorktreeResult(result));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`harness-integrate failed: ${message}`);
    process.exit(1);
  });
}
