import { execFile as execFileWithCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  runBoundedQueueSession,
  type BoundedQueueSessionResult,
} from "../.pi/agent/extensions/queue-runner.ts";

export interface HarnessQueueSessionOptions {
  cwd?: string;
  owner?: string;
  allowInitialHandoff?: boolean;
  maxSteps?: number;
  maxRuntimeSeconds?: number;
  recentLimit?: number;
  taskId?: string;
  scope?: string;
}

export interface HarnessQueueSessionOperatorContext {
  taskId: string | null;
  scope: string | null;
  backgrounding: false;
  visibleLogs: string;
}

export interface HarnessQueueSessionView {
  cwd: string;
  operator: HarnessQueueSessionOperatorContext;
  result: BoundedQueueSessionResult;
}

const execFile = promisify(execFileWithCallback);
const QUEUE_FILE = ".pi/agent/state/runtime/queue.json";
const PROTECTED_PATH_PATTERNS = [
  /(^|\/)\.env($|\.)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /^\.pi\/agent\/state\/runtime\//,
];

function formatIdList(ids: string[], emptyLabel: string): string {
  return ids.length > 0 ? ids.join(", ") : emptyLabel;
}

function normalizeGitStatusPath(line: string): string | null {
  const raw = line.slice(3).trim();
  if (!raw) return null;
  const renamedTarget = raw.includes(" -> ") ? raw.split(" -> ").at(-1) : raw;
  return (renamedTarget ?? raw).replace(/^\"|\"$/g, "");
}

function protectedPathReason(path: string): string | null {
  return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(path)) ? path : null;
}

async function listDirtyTrackedFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFile("git", ["-C", cwd, "status", "--porcelain", "--untracked-files=no"]);
    return stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map(normalizeGitStatusPath)
      .filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

async function listApprovalBoundaryJobIds(cwd: string): Promise<string[]> {
  try {
    const raw = await readFile(resolve(cwd, QUEUE_FILE), "utf8");
    const queue = JSON.parse(raw) as { jobs?: Array<{ id?: string; status?: string; approvalRequired?: boolean }> };
    return (queue.jobs ?? [])
      .filter((job) => job.approvalRequired && (job.status === "queued" || job.status === "running"))
      .map((job) => job.id ?? "unknown")
      .filter((id) => id.length > 0);
  } catch {
    return [];
  }
}

async function assertOperatorPreflight(cwd: string): Promise<void> {
  const dirtyTrackedFiles = await listDirtyTrackedFiles(cwd);
  const dirtyProtectedFiles = dirtyTrackedFiles.filter((path) => protectedPathReason(path));
  if (dirtyProtectedFiles.length > 0) {
    throw new Error(`Operator queue session stopped before work because protected paths are dirty: ${dirtyProtectedFiles.join(", ")}.`);
  }
  if (dirtyTrackedFiles.length > 0) {
    throw new Error(`Operator queue session stopped before work because tracked files are dirty: ${dirtyTrackedFiles.join(", ")}.`);
  }

  const approvalBoundaryJobIds = await listApprovalBoundaryJobIds(cwd);
  if (approvalBoundaryJobIds.length > 0) {
    throw new Error(`Operator queue session stopped before work because approval boundary is present: ${approvalBoundaryJobIds.join(", ")}.`);
  }
}

function buildOperatorContext(options: HarnessQueueSessionOptions): HarnessQueueSessionOperatorContext {
  return {
    taskId: options.taskId?.trim() || null,
    scope: options.scope?.trim() || null,
    backgrounding: false,
    visibleLogs: "stdout summary and logs/harness-actions.jsonl audit trail",
  };
}

export function assertHarnessQueueSessionCliScope(options: HarnessQueueSessionOptions): void {
  if (!options.taskId?.trim() && !options.scope?.trim()) {
    throw new Error("harness-queue-session requires --task-id or --scope so operator sessions stay explicitly scoped.");
  }
}

export async function buildHarnessQueueSession(options: HarnessQueueSessionOptions = {}): Promise<HarnessQueueSessionView> {
  const cwd = resolve(options.cwd ?? process.cwd());
  await assertOperatorPreflight(cwd);
  const result = await runBoundedQueueSession(cwd, {
    owner: options.owner,
    allowInitialHandoff: options.allowInitialHandoff,
    maxSteps: options.maxSteps,
    maxRuntimeSeconds: options.maxRuntimeSeconds,
    recentLimit: options.recentLimit,
  });
  return { cwd, operator: buildOperatorContext(options), result };
}

function formatActionCounts(counts: Record<string, number>): string {
  return ["started", "finalized", "blocked", "noop"]
    .map((key) => `${key}=${counts[key] ?? 0}`)
    .join(", ");
}

export function renderHarnessQueueSession(view: HarnessQueueSessionView): string {
  const { cwd, operator, result } = view;
  const { finalInspection, triage } = result;
  const { summary } = finalInspection;
  const lines = [
    "Harness Queue Session",
    `cwd: ${cwd}`,
    `operator task id: ${operator.taskId ?? "none"}`,
    `operator scope: ${operator.scope ?? "none"}`,
    `backgrounding: ${operator.backgrounding ? "enabled" : "disabled"}`,
    `visible logs: ${operator.visibleLogs}`,
    `stop reason: ${result.stopReason}`,
    `reason: ${result.reason}`,
    `duration seconds: ${triage.durationSeconds}`,
    `steps run: ${result.stepsRun}/${result.maxSteps}`,
    `max runtime seconds: ${result.maxRuntimeSeconds}`,
    `queue: ${summary.queuePaused ? "paused" : "ready"}`,
    `active job: ${summary.activeJob?.id ?? "none"}`,
    `active task: ${summary.activeTask?.id ?? "none"}`,
    `blocked jobs: ${formatIdList(summary.blockedJobIds, "none")}`,
    `failed jobs: ${formatIdList(summary.failedJobIds, "none")}`,
    `queued jobs remaining: ${triage.queuedJobsRemaining}`,
    `action counts: ${formatActionCounts(triage.actionCounts)}`,
    `started jobs: ${formatIdList(triage.startedJobIds, "none")}`,
    `finalized jobs: ${formatIdList(triage.finalizedJobIds, "none")}`,
    `blocked/touched jobs: ${formatIdList(triage.blockedJobIds, "none")}`,
    `touched tasks: ${formatIdList(triage.touchedTaskIds, "none")}`,
    `recovery actions: ${formatIdList(triage.recoveryActions, "none")}`,
    `recommended next action: ${triage.nextAction}`,
    `next action reason: ${triage.nextActionReason}`,
  ];

  if (result.steps.length > 0) {
    lines.push("step summary:");
    for (const step of result.steps) {
      const fragments = [
        `#${step.step}`,
        step.action,
        step.startedJobId ? `started=${step.startedJobId}` : null,
        step.finalizedJobId ? `finalized=${step.finalizedJobId}` : null,
        step.blockedJobIds.length > 0 ? `blocked=${step.blockedJobIds.join(",")}` : null,
        step.linkedTaskId ? `task=${step.linkedTaskId}` : null,
        step.recoveryAction ? `recovery=${step.recoveryAction}` : null,
      ].filter(Boolean);
      lines.push(`- ${fragments.join(" ")}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(
    `Usage: node --import tsx scripts/harness-queue-session.ts [options]\n\nOptions:\n  --cwd <path>                 Run against a specific repo/runtime root (default: current working directory)\n  --owner <name>               Owner used for queue-step task claims (default: assistant)\n  --task-id <id>               Explicit operator task id/scope anchor for this foreground session\n  --scope <text>               Explicit operator scope for this foreground session\n  --max-steps <n>              Maximum queue steps to run in one bounded session (default: 5, max: 50)\n  --max-runtime-seconds <n>    Maximum wall-clock runtime for one bounded session (default: 60, max: 600)\n  --recent <n>                 Final inspection recent list length (default: 5, max: 20)\n  --no-initial-handoff         Do not generate the initial handoff when a job starts\n  --json                       Emit machine-readable JSON instead of text\n  -h, --help                   Show this help text\n`,
  );
}

export function parseHarnessQueueSessionArgs(argv: string[]): HarnessQueueSessionOptions & { json: boolean; help: boolean } {
  const result: HarnessQueueSessionOptions & { json: boolean; help: boolean } = {
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      result.help = true;
      continue;
    }
    if (arg === "--no-initial-handoff") {
      result.allowInitialHandoff = false;
      continue;
    }
    if (arg === "--cwd" || arg === "--owner" || arg === "--task-id" || arg === "--scope" || arg === "--max-steps" || arg === "--max-runtime-seconds" || arg === "--recent") {
      const next = argv[index + 1];
      if (!next) throw new Error(`${arg} requires a value.`);
      if (arg === "--cwd") result.cwd = next;
      if (arg === "--owner") result.owner = next;
      if (arg === "--task-id") result.taskId = next;
      if (arg === "--scope") result.scope = next;
      if (arg === "--max-steps") result.maxSteps = Number.parseInt(next, 10);
      if (arg === "--max-runtime-seconds") result.maxRuntimeSeconds = Number.parseInt(next, 10);
      if (arg === "--recent") result.recentLimit = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseHarnessQueueSessionArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  assertHarnessQueueSessionCliScope(args);
  const view = await buildHarnessQueueSession(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderHarnessQueueSession(view));
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`harness-queue-session failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
