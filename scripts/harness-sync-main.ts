import { execFile as execFileCallback } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const DEFAULT_REMOTE = "origin";
const DEFAULT_BRANCH = "main";

export type SyncMainStatus = "synced" | "already_current";

export interface SyncLocalMainOptions {
  repoRoot?: string;
  remote?: string;
  branch?: string;
  json?: boolean;
}

export interface SyncLocalMainResult {
  repoRoot: string;
  remote: string;
  branch: string;
  status: SyncMainStatus;
  beforeHead: string;
  remoteHead: string;
  afterHead: string;
  dirtyTrackedFiles: string[];
  preservedLocalBookkeeping: string[];
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<CommandResult> {
  try {
    const result = await execFile(command, args, { cwd, encoding: "utf8" });
    return {
      stdout: result.stdout.trimEnd(),
      stderr: result.stderr.trimEnd(),
    };
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

async function normalizeExistingPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function resolveRepoRoot(inputRoot?: string): Promise<string> {
  const cwd = resolve(inputRoot ?? process.cwd());
  const repoRoot = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return normalizeExistingPath(repoRoot);
}

function parseDirtyTrackedFiles(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/g, ""));
}

export function isAllowedBookkeepingPath(path: string): boolean {
  return (
    /^\.pi\/agent\/state\/runtime\/[^/]+\.json$/.test(path) ||
    /^\.pi\/agent\/state\/runtime\/[^/]+\.lock$/.test(path) ||
    path === "logs/harness-actions.jsonl"
  );
}

export async function readDirtyTrackedFiles(repoRoot: string): Promise<string[]> {
  const porcelain = await runGit(repoRoot, ["status", "--porcelain", "--untracked-files=no"]);
  return parseDirtyTrackedFiles(porcelain);
}

export async function listPreservedLocalBookkeeping(repoRoot: string): Promise<string[]> {
  const ignored = await runGit(repoRoot, [
    "status",
    "--porcelain",
    "--ignored=matching",
    "--untracked-files=all",
    "--",
    ".pi/agent/state/runtime",
    "logs/harness-actions.jsonl",
  ]);
  return ignored
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => line.startsWith("!! ") || line.startsWith("?? "))
    .map((line) => line.slice(3).replace(/^"|"$/g, ""));
}

export async function syncLocalMain(options: SyncLocalMainOptions = {}): Promise<SyncLocalMainResult> {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const remote = options.remote ?? DEFAULT_REMOTE;
  const branch = options.branch ?? DEFAULT_BRANCH;
  const currentBranch = await runGit(repoRoot, ["branch", "--show-current"]);

  if (currentBranch !== branch) {
    throw new Error(`Refusing to sync local ${branch} while current branch is ${currentBranch || "<detached>"}. Switch to ${branch} first.`);
  }

  const dirtyTrackedFiles = await readDirtyTrackedFiles(repoRoot);
  const nonBookkeepingDirty = dirtyTrackedFiles.filter((path) => !isAllowedBookkeepingPath(path));
  if (nonBookkeepingDirty.length > 0) {
    throw new Error(`Refusing to sync: non-bookkeeping tracked dirt is present: ${nonBookkeepingDirty.join(", ")}`);
  }

  const beforeHead = await runGit(repoRoot, ["rev-parse", "HEAD"]);
  await runGit(repoRoot, ["fetch", remote, branch]);
  const remoteRef = `${remote}/${branch}`;
  const remoteHead = await runGit(repoRoot, ["rev-parse", remoteRef]);

  if (beforeHead !== remoteHead) {
    await runGit(repoRoot, ["merge", "--ff-only", remoteRef]);
  }

  const afterHead = await runGit(repoRoot, ["rev-parse", "HEAD"]);
  return {
    repoRoot,
    remote,
    branch,
    status: beforeHead === afterHead ? "already_current" : "synced",
    beforeHead,
    remoteHead,
    afterHead,
    dirtyTrackedFiles,
    preservedLocalBookkeeping: await listPreservedLocalBookkeeping(repoRoot),
  };
}

export function renderSyncLocalMainResult(result: SyncLocalMainResult): string {
  const lines = [
    `repo: ${result.repoRoot}`,
    `branch: ${result.branch}`,
    `remote: ${result.remote}`,
    `status: ${result.status}`,
    `before: ${result.beforeHead}`,
    `remote_head: ${result.remoteHead}`,
    `after: ${result.afterHead}`,
    `tracked_dirt_allowed: ${result.dirtyTrackedFiles.length}`,
    `preserved_local_bookkeeping: ${result.preservedLocalBookkeeping.length}`,
  ];
  for (const path of result.preservedLocalBookkeeping) {
    lines.push(`- ${path}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): SyncLocalMainOptions {
  const options: SyncLocalMainOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--repo") {
      options.repoRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--remote") {
      options.remote = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--branch") {
      options.branch = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log("Usage: harness-sync-main [--json] [--repo <path>] [--remote origin] [--branch main]");
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await syncLocalMain(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    process.stdout.write(renderSyncLocalMainResult(result));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`harness-sync-main failed: ${message}`);
    process.exit(1);
  });
}
