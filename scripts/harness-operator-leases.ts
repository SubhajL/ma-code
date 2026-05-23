import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  clearStaleExecutionLeases,
  isExecutionLeaseStale,
  readExecutionLeaseState,
  type ExecutionLeaseRecord,
} from "../.pi/agent/extensions/execution-leases.ts";

export type HarnessOperatorLeaseCommand = "list" | "clear-stale";

export interface HarnessOperatorLeasesOptions {
  cwd?: string;
  now?: string;
}

export interface HarnessOperatorLeaseItem {
  id: string;
  scope: string;
  owner: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string | null;
  stale: boolean;
}

export interface HarnessOperatorLeasesView {
  cwd: string;
  now: string;
  summary: {
    totalLeaseCount: number;
    activeLeaseCount: number;
    staleLeaseCount: number;
  };
  leases: HarnessOperatorLeaseItem[];
}

export interface ClearStaleHarnessOperatorLeasesResult extends HarnessOperatorLeasesView {
  action: "clear-stale";
  removedLeaseIds: string[];
  retainedLeaseIds: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function leaseToItem(lease: ExecutionLeaseRecord, now: string): HarnessOperatorLeaseItem {
  return {
    id: lease.id,
    scope: lease.scope,
    owner: lease.owner,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    heartbeatAt: lease.heartbeatAt,
    stale: isExecutionLeaseStale(lease, now),
  };
}

function buildView(cwd: string, now: string, leases: ExecutionLeaseRecord[]): HarnessOperatorLeasesView {
  const items = leases.map((lease) => leaseToItem(lease, now));
  const staleLeaseCount = items.filter((lease) => lease.stale).length;
  return {
    cwd,
    now,
    summary: {
      totalLeaseCount: items.length,
      activeLeaseCount: items.length - staleLeaseCount,
      staleLeaseCount,
    },
    leases: items,
  };
}

export async function buildHarnessOperatorLeases(options: HarnessOperatorLeasesOptions = {}): Promise<HarnessOperatorLeasesView> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const now = options.now ?? nowIso();
  const state = await readExecutionLeaseState(cwd);
  return buildView(cwd, now, state.leases);
}

export async function clearStaleHarnessOperatorLeases(options: HarnessOperatorLeasesOptions = {}): Promise<ClearStaleHarnessOperatorLeasesResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const now = options.now ?? nowIso();
  const result = await clearStaleExecutionLeases(cwd, now);
  const view = buildView(cwd, now, result.state.leases);
  return {
    ...view,
    action: "clear-stale",
    removedLeaseIds: result.removedLeases.map((lease) => lease.id),
    retainedLeaseIds: result.retainedLeases.map((lease) => lease.id),
  };
}

export function renderHarnessOperatorLeases(view: HarnessOperatorLeasesView | ClearStaleHarnessOperatorLeasesResult): string {
  const lines = [
    "Harness Operator Leases",
    `cwd: ${view.cwd}`,
    `now: ${view.now}`,
    `total leases: ${view.summary.totalLeaseCount}`,
    `active leases: ${view.summary.activeLeaseCount}`,
    `stale leases: ${view.summary.staleLeaseCount}`,
  ];

  if ("removedLeaseIds" in view) {
    lines.push(`removed stale leases: ${view.removedLeaseIds.length > 0 ? view.removedLeaseIds.join(", ") : "none"}`);
    lines.push(`retained leases: ${view.retainedLeaseIds.length > 0 ? view.retainedLeaseIds.join(", ") : "none"}`);
  }

  if (view.leases.length === 0) {
    lines.push("leases: none");
  } else {
    lines.push("leases:");
    for (const lease of view.leases) {
      lines.push(`- ${lease.id} scope=${lease.scope} owner=${lease.owner} expiresAt=${lease.expiresAt} stale=${lease.stale}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(`Usage: node --import tsx scripts/harness-operator-leases.ts [command] [options]\n\nCommands:\n  list          List current execution leases (default)\n  clear-stale   Remove only expired/stale leases; active leases are preserved\n\nOptions:\n  --cwd <path>   Inspect a specific repo/runtime root (default: current working directory)\n  --json         Emit machine-readable JSON instead of text\n  -h, --help     Show this help text\n`);
}

function parseArgs(argv: string[]): { command: HarnessOperatorLeaseCommand; cwd?: string; json: boolean; help: boolean } {
  const result: { command: HarnessOperatorLeaseCommand; cwd?: string; json: boolean; help: boolean } = {
    command: "list",
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "list" || arg === "clear-stale") {
      result.command = arg;
      continue;
    }
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
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

export async function runFromArgv(argv: string[]): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      printUsage();
      return 0;
    }

    const view = args.command === "clear-stale"
      ? await clearStaleHarnessOperatorLeases({ cwd: args.cwd })
      : await buildHarnessOperatorLeases({ cwd: args.cwd });

    if (args.json) {
      process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(renderHarnessOperatorLeases(view));
    return 0;
  } catch (error) {
    process.stderr.write(`harness-operator-leases failed: ${String(error)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  runFromArgv(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
