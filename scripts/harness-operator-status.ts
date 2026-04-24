import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { inspectQueueState, type QueueInspectionResult } from "../.pi/agent/extensions/queue-runner.ts";

export interface HarnessStatusOptions {
  cwd?: string;
  recentLimit?: number;
}

export interface HarnessStatusView {
  cwd: string;
  recentLimit: number;
  inspection: QueueInspectionResult;
}

function clampRecentLimit(input: number | undefined): number {
  return Math.max(1, Math.min(input ?? 5, 20));
}

function summarizeActiveValue(value: { id?: string | null; status?: string | null } | null | undefined, fallback: string): string {
  if (!value?.id) return fallback;
  if (!value.status) return value.id;
  return `${value.id} (${value.status})`;
}

function formatCountMap(counts: Record<string, number>, preferredOrder: string[]): string {
  const ordered = preferredOrder
    .filter((key) => key in counts)
    .map((key) => `${key}=${counts[key] ?? 0}`);

  const extras = Object.keys(counts)
    .filter((key) => !preferredOrder.includes(key))
    .sort()
    .map((key) => `${key}=${counts[key] ?? 0}`);

  return [...ordered, ...extras].join(", ");
}

function formatIdList(ids: string[], emptyLabel: string): string {
  return ids.length > 0 ? ids.join(", ") : emptyLabel;
}

export async function buildHarnessOperatorStatus(options: HarnessStatusOptions = {}): Promise<HarnessStatusView> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const recentLimit = clampRecentLimit(options.recentLimit);
  const inspection = await inspectQueueState(cwd, { recentLimit });
  return { cwd, recentLimit, inspection };
}

export function renderHarnessOperatorStatus(view: HarnessStatusView): string {
  const { inspection, cwd, recentLimit } = view;
  const { summary } = inspection;

  const lines = [
    "Harness Operator Status",
    `cwd: ${cwd}`,
    `queue: ${summary.queuePaused ? "paused" : "ready"}`,
    `active job: ${summarizeActiveValue(summary.activeJob, "none")}`,
    `active task: ${summarizeActiveValue(summary.activeTask, "none")}`,
    `job counts: ${formatCountMap(summary.jobCounts, ["queued", "running", "blocked", "failed", "done"])}`,
    `task counts: ${formatCountMap(summary.taskCounts, ["queued", "in_progress", "review", "blocked", "failed", "done"]) || "none"}`,
    `blocked jobs: ${formatIdList(summary.blockedJobIds, "none")}`,
    `failed jobs: ${formatIdList(summary.failedJobIds, "none")}`,
    `blocked tasks: ${formatIdList(summary.blockedTaskIds, "none")}`,
    `failed tasks: ${formatIdList(summary.failedTaskIds, "none")}`,
    `recent job ids (last ${recentLimit}): ${formatIdList(summary.recentJobIds, "none")}`,
    `recent task ids (last ${recentLimit}): ${formatIdList(summary.recentTaskIds, "none")}`,
  ];

  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(`Usage: node --import tsx scripts/harness-operator-status.ts [options]\n\nOptions:\n  --cwd <path>       Inspect a specific repo/runtime root (default: current working directory)\n  --recent <n>       Show up to n recent job/task IDs (default: 5, max: 20)\n  --json             Emit machine-readable JSON instead of text\n  -h, --help         Show this help text\n`);
}

function parseArgs(argv: string[]): { cwd?: string; recentLimit?: number; json: boolean; help: boolean } {
  const result: { cwd?: string; recentLimit?: number; json: boolean; help: boolean } = {
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
    if (arg === "--cwd") {
      const next = argv[index + 1];
      if (!next) throw new Error("--cwd requires a path value.");
      result.cwd = next;
      index += 1;
      continue;
    }
    if (arg === "--recent") {
      const next = argv[index + 1];
      if (!next) throw new Error("--recent requires a numeric value.");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed)) throw new Error(`Invalid --recent value: ${next}`);
      result.recentLimit = parsed;
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

  const view = await buildHarnessOperatorStatus({ cwd: args.cwd, recentLimit: args.recentLimit });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderHarnessOperatorStatus(view));
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`harness-operator-status failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
