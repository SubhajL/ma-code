import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  renderPrLifecycleRun,
  runPrLifecycle,
  type PrLifecycleCommand,
} from "../.pi/agent/extensions/pr-lifecycle.ts";

export interface HarnessPrLifecycleOptions {
  command: PrLifecycleCommand;
  initiativeId: string;
  runId?: string;
  workerRunId?: string;
  title?: string;
  body?: string;
  baseRef?: string;
  method?: "squash" | "merge" | "rebase";
  allowMerge?: boolean;
  approvalRef?: string;
  stopBeforeMerge?: boolean;
  closeSuperseded?: boolean;
  closeApprovalRef?: string;
  pr?: string;
  lifecycleEvidenceFile?: string;
  json?: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  harness-pr-lifecycle dry-run --initiative <slug> --worker-run-id <id> [--run-id <id>] [--json]",
    "  harness-pr-lifecycle create --initiative <slug> --worker-run-id <id> --run-id <id> [--title <title>] [--body <body>] [--json]",
    "  harness-pr-lifecycle gate --initiative <slug> --run-id <id> [--json]",
    "  harness-pr-lifecycle merge-ready --initiative <slug> --run-id <id> [--json]",
    "  harness-pr-lifecycle merge --initiative <slug> --run-id <id> --allow-merge --approval-ref <ref> [--method squash|merge|rebase] [--json]",
    "  harness-pr-lifecycle sync-main --initiative <slug> --run-id <id> [--json]",
    "  harness-pr-lifecycle status --initiative <slug> [--run-id <id>] [--json]",
    "",
    "Rules:",
    "  - dry-run/status write no files",
    "  - create requires Phase C worker-run evidence",
    "  - --stop-before-merge is the default hard boundary",
    "  - merge requires --allow-merge --approval-ref and an allowed --method",
    "  - --close-superseded requires --close-approval-ref",
  ].join("\n");
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): HarnessPrLifecycleOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (!["dry-run", "create", "gate", "merge-ready", "merge", "sync-main", "status"].includes(commandValue)) throw new Error(`Unknown command: ${commandValue}\n${usage()}`);
  let initiativeId: string | undefined;
  let runId: string | undefined;
  let workerRunId: string | undefined;
  let title: string | undefined;
  let body: string | undefined;
  let baseRef: string | undefined;
  let method: "squash" | "merge" | "rebase" | undefined;
  let allowMerge = false;
  let approvalRef: string | undefined;
  let stopBeforeMerge = true;
  let closeSuperseded = false;
  let closeApprovalRef: string | undefined;
  let pr: string | undefined;
  let lifecycleEvidenceFile: string | undefined;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--initiative") initiativeId = requireValue(rest[++index], "--initiative");
    else if (arg === "--run-id") runId = requireValue(rest[++index], "--run-id");
    else if (arg === "--worker-run-id") workerRunId = requireValue(rest[++index], "--worker-run-id");
    else if (arg === "--title") title = requireValue(rest[++index], "--title");
    else if (arg === "--body") body = requireValue(rest[++index], "--body");
    else if (arg === "--base-ref") baseRef = requireValue(rest[++index], "--base-ref");
    else if (arg === "--method") {
      const value = requireValue(rest[++index], "--method");
      if (!["squash", "merge", "rebase"].includes(value)) throw new Error("--method must be squash, merge, or rebase.");
      method = value as "squash" | "merge" | "rebase";
    } else if (arg === "--allow-merge") allowMerge = true;
    else if (arg === "--approval-ref") approvalRef = requireValue(rest[++index], "--approval-ref");
    else if (arg === "--stop-before-merge") stopBeforeMerge = true;
    else if (arg === "--no-stop-before-merge") stopBeforeMerge = false;
    else if (arg === "--close-superseded") closeSuperseded = true;
    else if (arg === "--close-approval-ref") closeApprovalRef = requireValue(rest[++index], "--close-approval-ref");
    else if (arg === "--pr") pr = requireValue(rest[++index], "--pr");
    else if (arg === "--lifecycle-evidence" || arg === "--evidence-file") lifecycleEvidenceFile = requireValue(rest[++index], arg);
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") throw new Error(usage());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!initiativeId) throw new Error("--initiative is required.");
  if ((commandValue === "dry-run" || commandValue === "create") && !workerRunId) throw new Error(`${commandValue} requires --worker-run-id.`);
  if (["create", "gate", "merge-ready", "merge", "sync-main"].includes(commandValue) && !runId) throw new Error(`${commandValue} requires --run-id.`);
  if (commandValue === "merge" && (!allowMerge || !approvalRef)) throw new Error("merge requires --allow-merge and --approval-ref.");
  if (!stopBeforeMerge && (!allowMerge || !approvalRef)) throw new Error("--no-stop-before-merge requires --allow-merge and --approval-ref.");
  if (closeSuperseded && !closeApprovalRef) throw new Error("--close-superseded requires --close-approval-ref.");

  return { command: commandValue as PrLifecycleCommand, initiativeId, runId, workerRunId, title, body, baseRef, method, allowMerge, approvalRef, stopBeforeMerge, closeSuperseded, closeApprovalRef, pr, lifecycleEvidenceFile, json };
}

export async function runHarnessPrLifecycle(options: HarnessPrLifecycleOptions) {
  return runPrLifecycle({ repoRoot: process.cwd(), ...options });
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessPrLifecycle(options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderPrLifecycleRun(result)}\n`);
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
    process.stderr.write(`harness-pr-lifecycle failed: ${message}\n`);
    process.exitCode = 1;
  });
}
