import { resolve } from "node:path";
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
}

export interface HarnessQueueSessionView {
  cwd: string;
  result: BoundedQueueSessionResult;
}

function formatIdList(ids: string[], emptyLabel: string): string {
  return ids.length > 0 ? ids.join(", ") : emptyLabel;
}

export async function buildHarnessQueueSession(options: HarnessQueueSessionOptions = {}): Promise<HarnessQueueSessionView> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const result = await runBoundedQueueSession(cwd, {
    owner: options.owner,
    allowInitialHandoff: options.allowInitialHandoff,
    maxSteps: options.maxSteps,
    maxRuntimeSeconds: options.maxRuntimeSeconds,
    recentLimit: options.recentLimit,
  });
  return { cwd, result };
}

function formatActionCounts(counts: Record<string, number>): string {
  return ["started", "finalized", "blocked", "noop"]
    .map((key) => `${key}=${counts[key] ?? 0}`)
    .join(", ");
}

export function renderHarnessQueueSession(view: HarnessQueueSessionView): string {
  const { cwd, result } = view;
  const { finalInspection, triage } = result;
  const { summary } = finalInspection;
  const lines = [
    "Harness Queue Session",
    `cwd: ${cwd}`,
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
    `Usage: node --import tsx scripts/harness-queue-session.ts [options]\n\nOptions:\n  --cwd <path>                 Run against a specific repo/runtime root (default: current working directory)\n  --owner <name>               Owner used for queue-step task claims (default: assistant)\n  --max-steps <n>              Maximum queue steps to run in one bounded session (default: 5, max: 50)\n  --max-runtime-seconds <n>    Maximum wall-clock runtime for one bounded session (default: 60, max: 600)\n  --recent <n>                 Final inspection recent list length (default: 5, max: 20)\n  --no-initial-handoff         Do not generate the initial handoff when a job starts\n  --json                       Emit machine-readable JSON instead of text\n  -h, --help                   Show this help text\n`,
  );
}

function parseArgs(argv: string[]): HarnessQueueSessionOptions & { json: boolean; help: boolean } {
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
    if (arg === "--cwd" || arg === "--owner" || arg === "--max-steps" || arg === "--max-runtime-seconds" || arg === "--recent") {
      const next = argv[index + 1];
      if (!next) throw new Error(`${arg} requires a value.`);
      if (arg === "--cwd") result.cwd = next;
      if (arg === "--owner") result.owner = next;
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
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

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
