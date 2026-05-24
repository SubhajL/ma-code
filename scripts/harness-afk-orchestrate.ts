import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  renderAfkOrchestrationRun,
  runAfkOrchestration,
  type AfkOrchestrationCommand,
} from "../.pi/agent/extensions/afk-orchestration.ts";

export interface HarnessAfkOrchestrateOptions {
  command: AfkOrchestrationCommand;
  initiativeId: string;
  runId?: string;
  maxParallel?: number;
  maxSteps?: number;
  maxRuntimeSeconds?: number;
  explainIssueId?: string;
  queueOnly?: boolean;
  runRequested?: boolean;
  json?: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  harness-afk-orchestrate dry-run --initiative <slug> [--max-parallel 1] [--explain <issue-id>] [--json]",
    "  harness-afk-orchestrate apply --initiative <slug> [--queue-only] [--max-parallel 1] [--run-id <id>] [--json]",
    "  harness-afk-orchestrate run --initiative <slug> --run --max-steps <n> --max-runtime-seconds <n> [--max-parallel 1] [--run-id <id>] [--json]",
    "  harness-afk-orchestrate status --initiative <slug> [--explain <issue-id>] [--json]",
    "",
    "Rules:",
    "  - dry-run writes no files",
    "  - apply is queue-only and creates queue jobs through the queue-runner helper path",
    "  - run requires explicit bounded limits and delegates to runBoundedQueueSession",
    "  - HITL issues are never auto-queued and Phase B performs no product code implementation",
  ].join("\n");
}

function positiveInteger(value: string | undefined, label: string): number {
  if (!value) throw new Error(`${label} requires a value.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function parseArgs(argv: string[]): HarnessAfkOrchestrateOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (!["dry-run", "apply", "run", "status"].includes(commandValue)) throw new Error(`Unknown command: ${commandValue}\n${usage()}`);

  let initiativeId: string | undefined;
  let runId: string | undefined;
  let maxParallel: number | undefined;
  let maxSteps: number | undefined;
  let maxRuntimeSeconds: number | undefined;
  let explainIssueId: string | undefined;
  let queueOnly = false;
  let runRequested = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--initiative") initiativeId = rest[++index];
    else if (arg === "--run-id") runId = rest[++index];
    else if (arg === "--max-parallel") maxParallel = positiveInteger(rest[++index], "--max-parallel");
    else if (arg === "--max-steps") maxSteps = positiveInteger(rest[++index], "--max-steps");
    else if (arg === "--max-runtime-seconds") maxRuntimeSeconds = positiveInteger(rest[++index], "--max-runtime-seconds");
    else if (arg === "--explain") explainIssueId = rest[++index];
    else if (arg === "--queue-only") queueOnly = true;
    else if (arg === "--run") runRequested = true;
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") throw new Error(usage());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!initiativeId) throw new Error("--initiative is required.");
  if (commandValue === "dry-run" && (queueOnly || runRequested || runId)) throw new Error("dry-run does not accept --queue-only, --run, or --run-id.");
  if (commandValue === "status" && (queueOnly || runRequested || runId || maxSteps || maxRuntimeSeconds)) throw new Error("status does not accept queue/run mutation flags.");
  if (commandValue === "apply" && runRequested) throw new Error("apply is queue-only; use run --run for bounded session execution.");
  if (commandValue === "run" && queueOnly) throw new Error("run mode cannot accept --queue-only.");
  if (commandValue === "run" && !runRequested) throw new Error("run mode requires explicit --run.");
  if (commandValue === "run" && (!maxSteps || !maxRuntimeSeconds)) throw new Error("run mode requires --max-steps and --max-runtime-seconds.");

  return {
    command: commandValue as AfkOrchestrationCommand,
    initiativeId,
    runId,
    maxParallel,
    maxSteps,
    maxRuntimeSeconds,
    explainIssueId,
    queueOnly: commandValue === "apply" ? true : queueOnly,
    runRequested,
    json,
  };
}

export async function runHarnessAfkOrchestrate(options: HarnessAfkOrchestrateOptions) {
  return runAfkOrchestration({
    repoRoot: process.cwd(),
    command: options.command,
    initiativeId: options.initiativeId,
    runId: options.runId,
    maxParallel: options.maxParallel,
    maxSteps: options.maxSteps,
    maxRuntimeSeconds: options.maxRuntimeSeconds,
    explainIssueId: options.explainIssueId,
    queueOnly: options.queueOnly,
    runRequested: options.runRequested,
  });
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessAfkOrchestrate(options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderAfkOrchestrationRun(result)}\n`);
}

export async function runFromArgv(argv: string[]): Promise<number> {
  try {
    await main(argv);
    return 0;
  } catch (error: unknown) {
    const message = (error as Error).message ?? String(error);
    if (message.includes("Usage:")) {
      process.stdout.write(`${message}\n`);
      return 0;
    }
    process.stderr.write(`harness-afk-orchestrate failed: ${message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runFromArgv(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
