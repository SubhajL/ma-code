import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  approveScreenArtifact,
  getScreenArtifactApprovalStatus,
  rejectScreenArtifact,
  type ScreenArtifactApprovalResult,
  type ScreenArtifactApprovalStatusResult,
} from "../.pi/agent/extensions/screen-artifact-approval.ts";

type ScreenApprovalCommand = "status" | "approve" | "reject";

export interface HarnessScreenApprovalOptions {
  repoRoot?: string;
  command: ScreenApprovalCommand;
  initiative: string;
  sliceId: string;
  decidedBy?: string;
  note?: string;
  reason?: string;
  reapprove?: boolean;
  json?: boolean;
}

export type HarnessScreenApprovalCliResult =
  | ({ command: "status" } & ScreenArtifactApprovalStatusResult)
  | ({ command: "approve" | "reject" } & ScreenArtifactApprovalResult);

export async function runHarnessScreenApproval(options: HarnessScreenApprovalOptions): Promise<HarnessScreenApprovalCliResult> {
  if (options.command === "status") {
    const status = await getScreenArtifactApprovalStatus({ repoRoot: options.repoRoot, initiative: options.initiative, sliceId: options.sliceId });
    return { command: "status", ...status };
  }
  if (options.command === "approve") {
    const result = await approveScreenArtifact({
      repoRoot: options.repoRoot,
      initiative: options.initiative,
      sliceId: options.sliceId,
      decidedBy: options.decidedBy ?? "",
      note: options.note,
      allowReapproval: options.reapprove,
    });
    return { command: "approve", ...result };
  }
  const result = await rejectScreenArtifact({
    repoRoot: options.repoRoot,
    initiative: options.initiative,
    sliceId: options.sliceId,
    decidedBy: options.decidedBy ?? "",
    note: options.note,
    reason: options.reason,
    allowReapproval: options.reapprove,
  });
  return { command: "reject", ...result };
}

function usage(): string {
  return [
    "Usage:",
    "  harness-screen-approval status --initiative <slug> --slice <slice-id> [--json]",
    "  harness-screen-approval approve --initiative <slug> --slice <slice-id> --by <name> --note <text> [--reapprove] [--json]",
    "  harness-screen-approval reject --initiative <slug> --slice <slice-id> --by <name> --reason <text> [--note <text>] [--reapprove] [--json]",
  ].join("\n");
}

function parseArgs(argv: string[]): HarnessScreenApprovalOptions {
  const rawCommand = argv.shift();
  if (rawCommand === "--help" || rawCommand === "-h" || rawCommand === undefined) throw new Error(usage());
  if (rawCommand !== "status" && rawCommand !== "approve" && rawCommand !== "reject") throw new Error(`Unknown command: ${rawCommand}\n${usage()}`);
  const command: ScreenApprovalCommand = rawCommand;

  let initiative: string | undefined;
  let sliceId: string | undefined;
  let decidedBy: string | undefined;
  let note: string | undefined;
  let reason: string | undefined;
  let reapprove = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--initiative") {
      initiative = argv[++index];
    } else if (arg === "--slice") {
      sliceId = argv[++index];
    } else if (arg === "--by") {
      decidedBy = argv[++index];
    } else if (arg === "--note") {
      note = argv[++index];
    } else if (arg === "--reason") {
      reason = argv[++index];
    } else if (arg === "--reapprove") {
      reapprove = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!initiative) throw new Error("--initiative is required.");
  if (!sliceId) throw new Error("--slice is required.");
  if (command === "approve") {
    if (!decidedBy) throw new Error("--by is required.");
    if (!note) throw new Error("--note is required.");
  }
  if (command === "reject") {
    if (!decidedBy) throw new Error("--by is required.");
    if (!reason) throw new Error("--reason is required.");
  }
  return { command, initiative, sliceId, decidedBy, note, reason, reapprove, json };
}

function renderText(result: HarnessScreenApprovalCliResult): string {
  if (result.command === "status") {
    return [
      "Harness Screen Approval Status",
      `repo root: ${result.repoRoot}`,
      `initiative: ${result.initiativeId}`,
      `slice: ${result.sliceId}`,
      `status: ${result.status}`,
      `artifact path: ${result.artifactPath}`,
      `artifact hash: ${result.artifactHash ?? "none"}`,
      `approval path: ${result.approvalPath}`,
      `approval exists: ${result.approvalExists}`,
      `stale approval: ${result.staleApproval}`,
    ].join("\n");
  }
  return [
    `Harness Screen Approval ${result.command}`,
    `repo root: ${result.repoRoot}`,
    `initiative: ${result.initiativeId}`,
    `slice: ${result.sliceId}`,
    `decision: ${result.approval.decision}`,
    `artifact path: ${result.artifactPath}`,
    `artifact hash: ${result.artifactHash}`,
    `approval path: ${result.approvalPath}`,
    `approval ref: ${result.approval.approvalRef}`,
    "created files:",
    ...(result.createdFiles.length > 0 ? result.createdFiles.map((file) => `- ${file}`) : ["- none"]),
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessScreenApproval(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderText(result)}\n`);
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
