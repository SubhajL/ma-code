import { execFile as execFileCallback } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const DEFAULT_STREAM = "split";
const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "trunk"]);

export interface BranchNameOptions {
  id: string;
  slug?: string;
  stream?: string;
}

export interface CreateWorktreeOptions extends BranchNameOptions {
  repoRoot?: string;
  parentDir?: string;
  branchName?: string;
  worktreePath?: string;
  baseRef?: string;
}

export interface InspectWorktreesOptions {
  repoRoot?: string;
}

export interface ReviewPrepOptions {
  repoRoot?: string;
  worktreePath: string;
  baseRef?: string;
}

export interface CleanupWorktreeOptions {
  repoRoot?: string;
  worktreePath: string;
}

export interface WorktreeStatusEntry {
  path: string;
  branch: string | null;
  head: string | null;
  clean: boolean;
  dirtyEntries: number;
  isRepoRoot: boolean;
}

export interface WorktreeStatusView {
  repoRoot: string;
  worktreeParent: string;
  worktrees: WorktreeStatusEntry[];
}

export interface CreateWorktreeResult {
  repoRoot: string;
  baseRef: string;
  branchName: string;
  worktreePath: string;
}

export interface ReviewPrepView {
  repoRoot: string;
  worktreePath: string;
  branch: string | null;
  baseRef: string;
  clean: boolean;
  dirtyEntries: number;
  aheadCommitCount: number;
  changedFiles: string[];
  commitsAhead: string[];
  mergeReady: boolean;
  warnings: string[];
}

export interface CleanupWorktreeResult {
  repoRoot: string;
  worktreePath: string;
  removed: true;
}

function slugifySegment(input: string): string {
  const value = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!value) throw new Error(`Cannot build helper output from empty value: ${input}`);
  return value;
}

function buildScopedName(id: string, slug?: string): string {
  const safeId = slugifySegment(id);
  const safeSlug = slug ? slugifySegment(slug) : "";
  return safeSlug ? `${safeId}-${safeSlug}` : safeId;
}

export function buildHarnessBranchName(options: BranchNameOptions): string {
  const stream = slugifySegment(options.stream ?? DEFAULT_STREAM);
  return `${stream}/${buildScopedName(options.id, options.slug)}`;
}

export function resolveHarnessWorktreeParent(repoRoot: string, parentDir?: string): string {
  if (parentDir) return resolve(parentDir);
  const resolvedRepoRoot = resolve(repoRoot);
  return join(dirname(resolvedRepoRoot), `${basename(resolvedRepoRoot)}-worktrees`);
}

export function buildHarnessWorktreePath(options: { repoRoot: string; id: string; slug?: string; parentDir?: string }): string {
  const parent = resolveHarnessWorktreeParent(options.repoRoot, options.parentDir);
  return join(parent, buildScopedName(options.id, options.slug));
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
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

async function refExists(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await runGit(repoRoot, ["rev-parse", "--verify", ref]);
    return true;
  } catch {
    return false;
  }
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

async function resolveDefaultBaseRef(repoRoot: string): Promise<string> {
  for (const candidate of ["origin/main", "main"]) {
    if (await refExists(repoRoot, candidate)) return candidate;
  }
  throw new Error("Could not resolve a default base ref. Expected origin/main or main.");
}

function parseWorktreeList(output: string): Array<{ path: string; head: string | null; branchRef: string | null }> {
  const entries: Array<{ path: string; head: string | null; branchRef: string | null }> = [];
  let current: { path: string; head: string | null; branchRef: string | null } | null = null;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (current) entries.push(current);
      current = null;
      continue;
    }

    const spaceIndex = line.indexOf(" ");
    const key = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
    const value = spaceIndex === -1 ? "" : line.slice(spaceIndex + 1);

    if (key === "worktree") {
      if (current) entries.push(current);
      current = { path: value, head: null, branchRef: null };
      continue;
    }

    if (!current) continue;
    if (key === "HEAD") current.head = value;
    if (key === "branch") current.branchRef = value;
  }

  if (current) entries.push(current);
  return entries;
}

async function readDirtyEntriesCount(cwd: string): Promise<number> {
  const porcelain = await runGit(cwd, ["status", "--porcelain"]);
  return porcelain ? porcelain.split("\n").filter((line) => line.trim().length > 0).length : 0;
}

async function readCurrentBranch(cwd: string): Promise<string | null> {
  const branch = await runGit(cwd, ["branch", "--show-current"]);
  return branch || null;
}

async function ensureListedWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  const resolvedTarget = await normalizeExistingPath(worktreePath);
  const listed = await inspectHarnessWorktrees({ repoRoot });
  const match = listed.worktrees.find((entry) => entry.path === resolvedTarget);
  if (!match) {
    throw new Error(`Path is not a registered worktree for this repo: ${resolvedTarget}`);
  }
}

export async function inspectHarnessWorktrees(options: InspectWorktreesOptions = {}): Promise<WorktreeStatusView> {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const worktreeParent = resolveHarnessWorktreeParent(repoRoot);
  const worktreeOutput = await runGit(repoRoot, ["worktree", "list", "--porcelain"]);
  const parsed = parseWorktreeList(worktreeOutput);

  const worktrees: WorktreeStatusEntry[] = [];
  for (const entry of parsed) {
    const path = await normalizeExistingPath(entry.path);
    const dirtyEntries = await readDirtyEntriesCount(path);
    worktrees.push({
      path,
      branch: await readCurrentBranch(path),
      head: entry.head,
      clean: dirtyEntries === 0,
      dirtyEntries,
      isRepoRoot: path === repoRoot,
    });
  }

  return { repoRoot, worktreeParent, worktrees };
}

export async function createHarnessWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult> {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const branchName = options.branchName ?? buildHarnessBranchName(options);
  if (PROTECTED_BRANCH_NAMES.has(branchName)) {
    throw new Error(`Refusing to create protected branch name: ${branchName}`);
  }

  const baseRef = options.baseRef ?? (await resolveDefaultBaseRef(repoRoot));
  if (!(await refExists(repoRoot, baseRef))) {
    throw new Error(`Base ref does not exist: ${baseRef}`);
  }

  const worktreePath = resolve(options.worktreePath ?? buildHarnessWorktreePath({
    repoRoot,
    id: options.id,
    slug: options.slug,
    parentDir: options.parentDir,
  }));

  await mkdir(dirname(worktreePath), { recursive: true });
  await runGit(repoRoot, ["worktree", "add", "-b", branchName, worktreePath, baseRef]);

  return {
    repoRoot,
    baseRef,
    branchName,
    worktreePath: await normalizeExistingPath(worktreePath),
  };
}

export async function buildHarnessWorktreeReviewPrep(options: ReviewPrepOptions): Promise<ReviewPrepView> {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const worktreePath = await normalizeExistingPath(options.worktreePath);
  await ensureListedWorktree(repoRoot, worktreePath);

  const branch = await readCurrentBranch(worktreePath);
  const baseRef = options.baseRef ?? (await resolveDefaultBaseRef(repoRoot));
  if (!(await refExists(repoRoot, baseRef))) {
    throw new Error(`Base ref does not exist: ${baseRef}`);
  }

  const dirtyEntries = await readDirtyEntriesCount(worktreePath);
  const changedFilesRaw = await runGit(worktreePath, ["diff", "--name-only", `${baseRef}...HEAD`]);
  const commitsAheadRaw = await runGit(worktreePath, ["log", "--oneline", `${baseRef}..HEAD`]);
  const aheadCountRaw = await runGit(worktreePath, ["rev-list", "--count", `${baseRef}..HEAD`]);

  const changedFiles = changedFilesRaw ? changedFilesRaw.split("\n").filter(Boolean) : [];
  const commitsAhead = commitsAheadRaw ? commitsAheadRaw.split("\n").filter(Boolean) : [];
  const aheadCommitCount = Number.parseInt(aheadCountRaw, 10) || 0;

  const warnings: string[] = [];
  if (!branch) warnings.push("Could not resolve the current branch for the selected worktree.");
  if (branch === "main") warnings.push("Current worktree is on main; review prep should come from a bounded branch.");
  if (dirtyEntries > 0) warnings.push(`Worktree has ${dirtyEntries} uncommitted status entr${dirtyEntries === 1 ? "y" : "ies"}.`);
  if (aheadCommitCount === 0) warnings.push(`Branch has no commits ahead of ${baseRef}.`);
  if (changedFiles.length === 0) warnings.push(`No changed files were found relative to ${baseRef}.`);

  return {
    repoRoot,
    worktreePath,
    branch,
    baseRef,
    clean: dirtyEntries === 0,
    dirtyEntries,
    aheadCommitCount,
    changedFiles,
    commitsAhead,
    mergeReady: warnings.length === 0,
    warnings,
  };
}

export async function cleanupHarnessWorktree(options: CleanupWorktreeOptions): Promise<CleanupWorktreeResult> {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const worktreePath = await normalizeExistingPath(options.worktreePath);
  if (worktreePath === repoRoot) {
    throw new Error("Refusing to remove the repo root worktree.");
  }

  await ensureListedWorktree(repoRoot, worktreePath);
  const dirtyEntries = await readDirtyEntriesCount(worktreePath);
  if (dirtyEntries > 0) {
    throw new Error(`Refusing to remove a dirty worktree with ${dirtyEntries} status entries: ${worktreePath}`);
  }

  await runGit(repoRoot, ["worktree", "remove", worktreePath]);
  return { repoRoot, worktreePath, removed: true };
}

export function renderHarnessWorktreeStatus(view: WorktreeStatusView): string {
  const lines = [
    "Harness Worktree Status",
    `repo root: ${view.repoRoot}`,
    `worktree parent: ${view.worktreeParent}`,
    `tracked worktrees: ${view.worktrees.length}`,
  ];

  for (const worktree of view.worktrees) {
    lines.push(
      `- ${worktree.path} :: branch=${worktree.branch ?? "detached"} :: ${worktree.clean ? "clean" : `dirty(${worktree.dirtyEntries})`} :: ${worktree.isRepoRoot ? "repo-root" : "linked"}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function renderHarnessWorktreeReviewPrep(view: ReviewPrepView): string {
  const lines = [
    "Harness Worktree Review Prep",
    `repo root: ${view.repoRoot}`,
    `worktree: ${view.worktreePath}`,
    `branch: ${view.branch ?? "detached"}`,
    `base ref: ${view.baseRef}`,
    `status: ${view.clean ? "clean" : `dirty(${view.dirtyEntries})`}`,
    `ahead commits: ${view.aheadCommitCount}`,
    `changed files: ${view.changedFiles.length > 0 ? view.changedFiles.join(", ") : "none"}`,
    `merge ready: ${view.mergeReady ? "yes" : "no"}`,
  ];

  if (view.commitsAhead.length > 0) {
    lines.push(`commits ahead: ${view.commitsAhead.join(" | ")}`);
  }
  if (view.warnings.length > 0) {
    lines.push(`warnings: ${view.warnings.join(" | ")}`);
  }

  return `${lines.join("\n")}\n`;
}

export function renderHarnessWorktreeCreated(result: CreateWorktreeResult): string {
  return [
    "Harness Worktree Created",
    `repo root: ${result.repoRoot}`,
    `base ref: ${result.baseRef}`,
    `branch: ${result.branchName}`,
    `path: ${result.worktreePath}`,
  ].join("\n") + "\n";
}

export function renderHarnessWorktreeCleanup(result: CleanupWorktreeResult): string {
  return [
    "Harness Worktree Removed",
    `repo root: ${result.repoRoot}`,
    `path: ${result.worktreePath}`,
  ].join("\n") + "\n";
}

function printUsage(): void {
  process.stdout.write(`Usage: node --import tsx scripts/harness-worktree.ts <command> [options]\n\nCommands:\n  branch-name      Print a predictable bounded branch name\n  create           Create a new worktree on a bounded branch\n  status           Inspect registered worktrees for the current repo\n  review-prep      Summarize merge/review readiness for one worktree\n  cleanup          Remove a clean linked worktree\n\nCommon options:\n  --repo-root <path>   Use a specific repo root or any path inside the repo\n  --json               Emit machine-readable JSON when supported\n  -h, --help           Show this help text\n\nbranch-name/create options:\n  --id <value>         Bounded task/job identifier (required for branch-name/create)\n  --slug <value>       Short slug describing the work (required for create unless --branch/--path supplied)\n  --stream <value>     Branch stream/prefix (default: split)\n\ncreate options:\n  --base-ref <ref>     Base ref for the new worktree (default: origin/main, fallback main)\n  --parent-dir <path>  Override the default sibling worktree parent directory\n  --path <path>        Override the computed worktree path\n  --branch <name>      Override the computed branch name\n\nreview-prep/cleanup options:\n  --path <path>        Worktree path to inspect or remove\n  --base-ref <ref>     Override the review-prep comparison ref\n`);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseCommandLine(argv: string[]) {
  const [command, ...rest] = argv;
  const options: Record<string, string | boolean> = {
    json: false,
    help: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (["--repo-root", "--id", "--slug", "--stream", "--base-ref", "--parent-dir", "--path", "--branch"].includes(arg)) {
      options[arg.slice(2)] = requireValue(rest, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { command, options };
}

async function main(): Promise<void> {
  const parsed = parseCommandLine(process.argv.slice(2));
  if (parsed.options.help || !parsed.command) {
    printUsage();
    return;
  }

  const repoRoot = typeof parsed.options["repo-root"] === "string" ? (parsed.options["repo-root"] as string) : undefined;
  const json = parsed.options.json === true;

  if (parsed.command === "branch-name") {
    const id = parsed.options.id;
    if (typeof id !== "string") throw new Error("branch-name requires --id.");
    const result = {
      branchName: buildHarnessBranchName({
        id,
        slug: typeof parsed.options.slug === "string" ? (parsed.options.slug as string) : undefined,
        stream: typeof parsed.options.stream === "string" ? (parsed.options.stream as string) : undefined,
      }),
    };
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${result.branchName}\n`);
    return;
  }

  if (parsed.command === "create") {
    const id = parsed.options.id;
    if (typeof id !== "string") throw new Error("create requires --id.");
    const slug = typeof parsed.options.slug === "string" ? (parsed.options.slug as string) : undefined;
    if (!slug && typeof parsed.options.path !== "string") throw new Error("create requires --slug unless --path is provided explicitly.");
    const result = await createHarnessWorktree({
      repoRoot,
      id,
      slug,
      stream: typeof parsed.options.stream === "string" ? (parsed.options.stream as string) : undefined,
      baseRef: typeof parsed.options["base-ref"] === "string" ? (parsed.options["base-ref"] as string) : undefined,
      parentDir: typeof parsed.options["parent-dir"] === "string" ? (parsed.options["parent-dir"] as string) : undefined,
      worktreePath: typeof parsed.options.path === "string" ? (parsed.options.path as string) : undefined,
      branchName: typeof parsed.options.branch === "string" ? (parsed.options.branch as string) : undefined,
    });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : renderHarnessWorktreeCreated(result));
    return;
  }

  if (parsed.command === "status") {
    const result = await inspectHarnessWorktrees({ repoRoot });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : renderHarnessWorktreeStatus(result));
    return;
  }

  if (parsed.command === "review-prep") {
    const worktreePath = parsed.options.path;
    if (typeof worktreePath !== "string") throw new Error("review-prep requires --path.");
    const result = await buildHarnessWorktreeReviewPrep({
      repoRoot,
      worktreePath,
      baseRef: typeof parsed.options["base-ref"] === "string" ? (parsed.options["base-ref"] as string) : undefined,
    });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : renderHarnessWorktreeReviewPrep(result));
    return;
  }

  if (parsed.command === "cleanup") {
    const worktreePath = parsed.options.path;
    if (typeof worktreePath !== "string") throw new Error("cleanup requires --path.");
    const result = await cleanupHarnessWorktree({ repoRoot, worktreePath });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : renderHarnessWorktreeCleanup(result));
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`harness-worktree failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
