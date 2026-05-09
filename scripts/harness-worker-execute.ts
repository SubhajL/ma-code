import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  renderWorkerExecutionRun,
  runWorkerExecution,
  type WorkerExecutionCommand,
} from "../.pi/agent/extensions/worker-execution.ts";

export interface HarnessWorkerExecuteOptions {
  command: WorkerExecutionCommand;
  initiativeId: string;
  queueJobId?: string;
  runId?: string;
  explainRunId?: string;
  maxSteps?: number;
  maxRuntimeSeconds?: number;
  baseRef?: string;
  worktreeParent?: string;
  worktreePath?: string;
  redCommand?: string;
  implementationCommand?: string;
  validationCommands?: string[];
  reviewVerdict?: "no_required_fixes" | "changes_required";
  stopBeforePr?: boolean;
  allowPrCreate?: boolean;
  explicitApprovalRef?: string;
  json?: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  harness-worker-execute dry-run --initiative <slug> [--job-id <queue-job-id>] [--json]",
    "  harness-worker-execute run --initiative <slug> --job-id <queue-job-id> --max-steps <n> --max-runtime-seconds <n> [--implementation-command <cmd>] [--red-command <cmd>] [--validation-command <cmd>] [--review-verdict no_required_fixes|changes_required] [--stop-before-pr] [--json]",
    "  harness-worker-execute resume --initiative <slug> --run-id <run-id> --max-steps <n> --max-runtime-seconds <n> [--json]",
    "  harness-worker-execute status --initiative <slug> [--run-id <run-id>] [--json]",
    "  harness-worker-execute explain-run --initiative <slug> --run-id <run-id> [--json]",
    "",
    "Rules:",
    "  - dry-run/status/explain-run write no files",
    "  - run/resume require explicit bounded limits",
    "  - first Phase C slice executes one selected AFK queue job only",
    "  - --stop-before-pr is the default hard boundary",
    "  - --allow-pr-create requires --approval-ref and still never auto-merges",
  ].join("\n");
}

function positiveInteger(value: string | undefined, label: string): number {
  if (!value) throw new Error(`${label} requires a value.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): HarnessWorkerExecuteOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (!["dry-run", "run", "status", "resume", "explain-run"].includes(commandValue)) throw new Error(`Unknown command: ${commandValue}\n${usage()}`);

  let initiativeId: string | undefined;
  let queueJobId: string | undefined;
  let runId: string | undefined;
  let explainRunId: string | undefined;
  let maxSteps: number | undefined;
  let maxRuntimeSeconds: number | undefined;
  let baseRef: string | undefined;
  let worktreeParent: string | undefined;
  let worktreePath: string | undefined;
  let redCommand: string | undefined;
  let implementationCommand: string | undefined;
  const validationCommands: string[] = [];
  let reviewVerdict: "no_required_fixes" | "changes_required" | undefined;
  let stopBeforePr = true;
  let allowPrCreate = false;
  let explicitApprovalRef: string | undefined;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--initiative") initiativeId = requireValue(rest[++index], "--initiative");
    else if (arg === "--job-id") queueJobId = requireValue(rest[++index], "--job-id");
    else if (arg === "--run-id") runId = requireValue(rest[++index], "--run-id");
    else if (arg === "--explain-run") explainRunId = requireValue(rest[++index], "--explain-run");
    else if (arg === "--max-steps") maxSteps = positiveInteger(rest[++index], "--max-steps");
    else if (arg === "--max-runtime-seconds") maxRuntimeSeconds = positiveInteger(rest[++index], "--max-runtime-seconds");
    else if (arg === "--base-ref") baseRef = requireValue(rest[++index], "--base-ref");
    else if (arg === "--worktree-parent") worktreeParent = requireValue(rest[++index], "--worktree-parent");
    else if (arg === "--worktree-path") worktreePath = requireValue(rest[++index], "--worktree-path");
    else if (arg === "--red-command") redCommand = requireValue(rest[++index], "--red-command");
    else if (arg === "--implementation-command") implementationCommand = requireValue(rest[++index], "--implementation-command");
    else if (arg === "--validation-command") validationCommands.push(requireValue(rest[++index], "--validation-command"));
    else if (arg === "--review-verdict") {
      const value = requireValue(rest[++index], "--review-verdict");
      if (value !== "no_required_fixes" && value !== "changes_required") throw new Error("--review-verdict must be no_required_fixes or changes_required.");
      reviewVerdict = value;
    } else if (arg === "--stop-before-pr") stopBeforePr = true;
    else if (arg === "--no-stop-before-pr") stopBeforePr = false;
    else if (arg === "--allow-pr-create") allowPrCreate = true;
    else if (arg === "--approval-ref") explicitApprovalRef = requireValue(rest[++index], "--approval-ref");
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") throw new Error(usage());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!initiativeId) throw new Error("--initiative is required.");
  if ((commandValue === "run" || commandValue === "resume") && (!maxSteps || !maxRuntimeSeconds)) throw new Error("run/resume require --max-steps and --max-runtime-seconds.");
  if (commandValue === "run" && !queueJobId) throw new Error("run requires --job-id so Phase C executes exactly one selected job.");
  if (commandValue === "resume" && !runId) throw new Error("resume requires --run-id.");
  if ((commandValue === "dry-run" || commandValue === "status" || commandValue === "explain-run") && (implementationCommand || redCommand || validationCommands.length > 0)) throw new Error(`${commandValue} does not accept execution commands.`);
  if (allowPrCreate && !explicitApprovalRef) throw new Error("--allow-pr-create requires --approval-ref.");
  if (!stopBeforePr && !(allowPrCreate && explicitApprovalRef)) throw new Error("--no-stop-before-pr requires --allow-pr-create and --approval-ref.");

  return {
    command: commandValue as WorkerExecutionCommand,
    initiativeId,
    queueJobId,
    runId,
    explainRunId,
    maxSteps,
    maxRuntimeSeconds,
    baseRef,
    worktreeParent,
    worktreePath,
    redCommand,
    implementationCommand,
    validationCommands: validationCommands.length > 0 ? validationCommands : undefined,
    reviewVerdict,
    stopBeforePr,
    allowPrCreate,
    explicitApprovalRef,
    json,
  };
}

export async function runHarnessWorkerExecute(options: HarnessWorkerExecuteOptions) {
  return runWorkerExecution({
    repoRoot: process.cwd(),
    command: options.command,
    initiativeId: options.initiativeId,
    queueJobId: options.queueJobId,
    runId: options.runId,
    explainRunId: options.explainRunId,
    maxSteps: options.maxSteps,
    maxRuntimeSeconds: options.maxRuntimeSeconds,
    baseRef: options.baseRef,
    worktreeParent: options.worktreeParent,
    worktreePath: options.worktreePath,
    redCommand: options.redCommand,
    implementationCommand: options.implementationCommand,
    validationCommands: options.validationCommands,
    reviewVerdict: options.reviewVerdict,
    stopBeforePr: options.stopBeforePr,
    allowPrCreate: options.allowPrCreate,
    explicitApprovalRef: options.explicitApprovalRef,
  });
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessWorkerExecute(options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderWorkerExecutionRun(result)}\n`);
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = (error as Error).message;
    if (message.includes("Usage:")) {
      process.stdout.write(`${message}\n`);
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`harness-worker-execute failed: ${message}\n`);
    process.exitCode = 1;
  });
}
