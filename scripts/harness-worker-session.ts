import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  acquireWorkerLaneLease,
  findWorkerLaneLease,
  releaseWorkerLaneLease,
  type ExecutionLeaseRecord,
} from "../.pi/agent/extensions/execution-leases.ts";
import {
  cleanupHarnessWorktree,
  createHarnessWorktree,
  inspectHarnessWorktrees,
  type WorktreeStatusEntry,
} from "./harness-worktree.ts";

export type WorkerSessionAction = "started" | "status" | "released";

export interface WorkerSessionStartOptions {
  repoRoot?: string;
  id: string;
  slug: string;
  owner?: string;
  jobId?: string | null;
  taskId?: string | null;
  baseRef?: string;
  parentDir?: string;
  expiresInMinutes?: number;
}

export interface WorkerSessionLookupOptions {
  repoRoot?: string;
  scopeKey?: string;
  leaseId?: string;
  owner?: string;
  cleanup?: boolean;
}

export interface WorkerSessionView {
  action: WorkerSessionAction;
  repoRoot: string;
  scopeKey: string;
  leaseId: string | null;
  owner: string | null;
  jobId: string | null;
  taskId: string | null;
  branchName: string | null;
  worktreePath: string | null;
  lease: ExecutionLeaseRecord | null;
  worktree: WorktreeStatusEntry | null;
  released?: boolean;
  cleanup?: {
    requested: boolean;
    removed: boolean;
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutesIso(timestamp: string, minutes: number): string {
  return new Date(Date.parse(timestamp) + minutes * 60 * 1000).toISOString();
}

function slugifySegment(input: string): string {
  const value = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!value) throw new Error(`Cannot build worker-session identifier from empty value: ${input}`);
  return value;
}

function defaultScopeKey(id: string): string {
  return slugifySegment(id);
}

function leaseMetadata(lease: ExecutionLeaseRecord | null): Record<string, string | null> {
  return lease?.metadata ?? {};
}

function viewFromLease(input: {
  action: WorkerSessionAction;
  repoRoot: string;
  scopeKey: string;
  lease: ExecutionLeaseRecord | null;
  worktree: WorktreeStatusEntry | null;
  released?: boolean;
  cleanup?: { requested: boolean; removed: boolean };
}): WorkerSessionView {
  const metadata = leaseMetadata(input.lease);
  return {
    action: input.action,
    repoRoot: input.repoRoot,
    scopeKey: input.scopeKey,
    leaseId: input.lease?.id ?? null,
    owner: input.lease?.owner ?? null,
    jobId: metadata.jobId ?? null,
    taskId: metadata.taskId ?? null,
    branchName: metadata.branchName ?? input.worktree?.branch ?? null,
    worktreePath: metadata.worktreePath ?? input.worktree?.path ?? null,
    lease: input.lease,
    worktree: input.worktree,
    released: input.released,
    cleanup: input.cleanup,
  };
}

async function findWorktree(repoRoot: string, worktreePath: string | null): Promise<WorktreeStatusEntry | null> {
  if (!worktreePath) return null;
  const inspected = await inspectHarnessWorktrees({ repoRoot });
  return inspected.worktrees.find((entry) => entry.path === worktreePath) ?? null;
}

async function requireWorkerLease(options: WorkerSessionLookupOptions): Promise<{ repoRoot: string; lease: ExecutionLeaseRecord; scopeKey: string }> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const scopeKey = options.scopeKey ? slugifySegment(options.scopeKey) : undefined;
  const lease = await findWorkerLaneLease(repoRoot, {
    leaseId: options.leaseId,
    scopeKey,
    owner: options.owner,
  });
  if (!lease) throw new Error("No matching worker-lane lease was found.");
  return { repoRoot, lease, scopeKey: lease.metadata?.scopeKey ?? scopeKey ?? lease.scope.replace(/^worker_lane:/, "") };
}

export async function startHarnessWorkerSession(options: WorkerSessionStartOptions): Promise<WorkerSessionView> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const owner = options.owner?.trim() || "assistant";
  const scopeKey = defaultScopeKey(options.id);

  const created = await createHarnessWorktree({
    repoRoot,
    id: options.id,
    slug: options.slug,
    stream: "worker",
    baseRef: options.baseRef,
    parentDir: options.parentDir,
  });

  const acquiredAt = nowIso();
  const leaseId = `worker_lane-${scopeKey}`;
  const acquired = await acquireWorkerLaneLease(repoRoot, {
    id: leaseId,
    scopeKey,
    owner,
    jobId: options.jobId ?? null,
    taskId: options.taskId ?? null,
    worktreePath: created.worktreePath,
    branchName: created.branchName,
    acquiredAt,
    expiresAt: addMinutesIso(acquiredAt, options.expiresInMinutes ?? 24 * 60),
  });

  if (!acquired.acquired || !acquired.lease) {
    await cleanupHarnessWorktree({ repoRoot, worktreePath: created.worktreePath }).catch(() => undefined);
    throw new Error(`Worker lane lease conflict for scope ${scopeKey}.`);
  }

  const worktree = await findWorktree(repoRoot, created.worktreePath);
  return viewFromLease({ action: "started", repoRoot, scopeKey, lease: acquired.lease, worktree });
}

export async function statusHarnessWorkerSession(options: WorkerSessionLookupOptions): Promise<WorkerSessionView> {
  const { repoRoot, lease, scopeKey } = await requireWorkerLease(options);
  const worktree = await findWorktree(repoRoot, lease.metadata?.worktreePath ?? null);
  return viewFromLease({ action: "status", repoRoot, scopeKey, lease, worktree });
}

export async function releaseHarnessWorkerSession(options: WorkerSessionLookupOptions): Promise<WorkerSessionView> {
  const { repoRoot, lease, scopeKey } = await requireWorkerLease(options);
  const worktreePath = lease.metadata?.worktreePath ?? null;

  if (options.cleanup && worktreePath) {
    const worktree = await findWorktree(repoRoot, worktreePath);
    if (worktree && !worktree.clean) {
      throw new Error(`Refusing worker-session cleanup for dirty worktree with ${worktree.dirtyEntries} status entries: ${worktreePath}`);
    }
  }

  const released = await releaseWorkerLaneLease(repoRoot, { leaseId: lease.id });
  let cleanupRemoved = false;
  if (options.cleanup && worktreePath) {
    const cleanup = await cleanupHarnessWorktree({ repoRoot, worktreePath });
    cleanupRemoved = cleanup.removed;
  }
  const worktree = cleanupRemoved ? null : await findWorktree(repoRoot, worktreePath);

  return viewFromLease({
    action: "released",
    repoRoot,
    scopeKey,
    lease: released.releasedLease ?? lease,
    worktree,
    released: released.released,
    cleanup: { requested: options.cleanup === true, removed: cleanupRemoved },
  });
}

export function renderHarnessWorkerSession(view: WorkerSessionView): string {
  const title = view.action === "started"
    ? "Harness Worker Session Started"
    : view.action === "released"
      ? "Harness Worker Session Released"
      : "Harness Worker Session Status";
  const lines = [
    title,
    `repo root: ${view.repoRoot}`,
    `scope key: ${view.scopeKey}`,
    `lease id: ${view.leaseId ?? "none"}`,
    `owner: ${view.owner ?? "none"}`,
    `branch: ${view.branchName ?? "none"}`,
    `worktree: ${view.worktreePath ?? "none"}`,
    `worktree status: ${view.worktree ? (view.worktree.clean ? "clean" : `dirty(${view.worktree.dirtyEntries})`) : "not-found"}`,
  ];
  if (view.jobId) lines.push(`job id: ${view.jobId}`);
  if (view.taskId) lines.push(`task id: ${view.taskId}`);
  if (view.released !== undefined) lines.push(`released: ${view.released ? "yes" : "no"}`);
  if (view.cleanup) lines.push(`cleanup: ${view.cleanup.requested ? (view.cleanup.removed ? "removed" : "not-removed") : "not-requested"}`);
  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(`Usage: node --import tsx scripts/harness-worker-session.ts <command> [options]\n\nCommands:\n  start      Create a worker-lane worktree and acquire its worker_lane lease\n  status     Inspect an existing worker-lane lease and worktree\n  release    Release a worker-lane lease; cleanup is opt-in\n\nCommon options:\n  --repo-root <path>   Use a specific repo root or path inside the repo\n  --owner <value>      Worker/session owner filter or owner for start\n  --scope <value>      Worker lane scope key for status/release\n  --lease-id <value>   Worker lane lease id for status/release\n  --json               Emit machine-readable JSON\n  -h, --help           Show this help text\n\nstart options:\n  --id <value>         Bounded identifier used for branch/path/scope (required)\n  --slug <value>       Short worktree slug (required)\n  --job-id <value>     Optional linked queue job id\n  --task-id <value>    Optional linked task id\n  --base-ref <ref>     Base ref for worktree creation\n  --parent-dir <path>  Override worktree parent directory\n\nrelease options:\n  --cleanup            Remove the clean linked worktree after releasing the lease\n`);
}

function parseArgs(argv: string[]): { command?: string; options: Record<string, string | boolean> } {
  let command: string | undefined;
  const options: Record<string, string | boolean> = { json: false, help: false, cleanup: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["start", "status", "release"].includes(arg) && !command) {
      command = arg;
      continue;
    }
    if (["--json", "--cleanup", "--help"].includes(arg)) {
      options[arg.slice(2)] = true;
      continue;
    }
    if (arg === "-h") {
      options.help = true;
      continue;
    }
    if (["--repo-root", "--owner", "--scope", "--lease-id", "--id", "--slug", "--job-id", "--task-id", "--base-ref", "--parent-dir"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { command, options };
}

function stringOption(options: Record<string, string | boolean>, key: string): string | undefined {
  return typeof options[key] === "string" ? (options[key] as string) : undefined;
}

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (!parsed.command || parsed.options.help === true) {
    printUsage();
    return;
  }
  const repoRoot = stringOption(parsed.options, "repo-root");
  const json = parsed.options.json === true;
  let result: WorkerSessionView;

  if (parsed.command === "start") {
    const id = stringOption(parsed.options, "id");
    const slug = stringOption(parsed.options, "slug");
    if (!id || !slug) throw new Error("start requires --id and --slug.");
    result = await startHarnessWorkerSession({
      repoRoot,
      id,
      slug,
      owner: stringOption(parsed.options, "owner"),
      jobId: stringOption(parsed.options, "job-id") ?? null,
      taskId: stringOption(parsed.options, "task-id") ?? null,
      baseRef: stringOption(parsed.options, "base-ref"),
      parentDir: stringOption(parsed.options, "parent-dir"),
    });
  } else if (parsed.command === "status") {
    result = await statusHarnessWorkerSession({ repoRoot, scopeKey: stringOption(parsed.options, "scope"), leaseId: stringOption(parsed.options, "lease-id"), owner: stringOption(parsed.options, "owner") });
  } else if (parsed.command === "release") {
    result = await releaseHarnessWorkerSession({ repoRoot, scopeKey: stringOption(parsed.options, "scope"), leaseId: stringOption(parsed.options, "lease-id"), owner: stringOption(parsed.options, "owner"), cleanup: parsed.options.cleanup === true });
  } else {
    throw new Error(`Unknown command: ${parsed.command}`);
  }

  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : renderHarnessWorkerSession(result));
}

export async function runFromArgv(argv: string[]): Promise<number> {
  try {
    await main(argv);
    return 0;
  } catch (error) {
    process.stderr.write(`harness-worker-session failed: ${String(error)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  runFromArgv(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
