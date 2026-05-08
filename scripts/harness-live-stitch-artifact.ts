import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { applyLiveStitchArtifact, planLiveStitchArtifact, writeLiveStitchArtifactArtifacts, type AppliedLiveStitchArtifactResult, type PlannedLiveStitchArtifactResult } from "../.pi/agent/extensions/live-stitch-adapter.ts";

type LiveStitchCliMode = "dry-run" | "apply";

export interface HarnessLiveStitchArtifactOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
  mode: LiveStitchCliMode;
  approvalRef?: string;
  providerCommand?: string;
  timeoutMs?: number;
  json?: boolean;
}

export type HarnessLiveStitchArtifactResult = PlannedLiveStitchArtifactResult | AppliedLiveStitchArtifactResult;

export async function runHarnessLiveStitchArtifact(options: HarnessLiveStitchArtifactOptions): Promise<HarnessLiveStitchArtifactResult> {
  if (options.mode === "dry-run") {
    return planLiveStitchArtifact({
      repoRoot: options.repoRoot,
      initiative: options.initiative,
      sliceId: options.sliceId,
      providerCommand: options.providerCommand,
      policyAllowsProviderCommand: Boolean(process.env.HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND),
      timeoutMs: options.timeoutMs,
    });
  }
  const result = await applyLiveStitchArtifact({
    repoRoot: options.repoRoot,
    initiative: options.initiative,
    sliceId: options.sliceId,
    approvalRef: options.approvalRef,
    providerCommand: options.providerCommand,
    policyAllowsProviderCommand: Boolean(process.env.HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND),
    timeoutMs: options.timeoutMs,
  });
  const createdFiles = await writeLiveStitchArtifactArtifacts(result);
  return { ...result, createdFiles };
}

function readNext(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): HarnessLiveStitchArtifactOptions {
  let initiative: string | undefined;
  let sliceId: string | undefined;
  let approvalRef: string | undefined;
  let providerCommand: string | undefined;
  let timeoutMs: number | undefined;
  let dryRun = false;
  let apply = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--initiative") {
      initiative = readNext(argv, index, arg);
      index += 1;
    } else if (arg === "--slice") {
      sliceId = readNext(argv, index, arg);
      index += 1;
    } else if (arg === "--approval-ref") {
      approvalRef = readNext(argv, index, arg);
      index += 1;
    } else if (arg === "--provider-command") {
      providerCommand = readNext(argv, index, arg);
      index += 1;
    } else if (arg === "--timeout-ms") {
      const rawTimeout = readNext(argv, index, arg);
      timeoutMs = Number(rawTimeout);
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout-ms must be a positive integer.");
      index += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error("Usage: harness-live-stitch-artifact --initiative <slug> --slice <slice-id> (--dry-run|--apply) [--approval-ref <operator-ref>] [--provider-command <cmd>] [--timeout-ms <n>] [--json]");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!initiative) throw new Error("--initiative is required.");
  if (!sliceId) throw new Error("--slice is required.");
  if ((dryRun ? 1 : 0) + (apply ? 1 : 0) !== 1) throw new Error("Choose exactly one of --dry-run or --apply.");
  return { initiative, sliceId, mode: apply ? "apply" : "dry-run", approvalRef, providerCommand, timeoutMs, json };
}

function renderText(result: HarnessLiveStitchArtifactResult): string {
  return [
    "Harness Live Stitch Artifact",
    `repo root: ${result.repoRoot}`,
    `initiative: ${result.initiativeId}`,
    `slice: ${result.sliceId}`,
    `status: ${result.artifact.status}`,
    `summary json path: ${result.summaryJsonPath}`,
    `summary markdown path: ${result.summaryMarkdownPath}`,
    `managed root: ${result.artifact.managedArtifacts.root}`,
    `manifest path: ${result.artifact.managedArtifacts.manifestPath}`,
    `required config: ${result.requiredConfig.length > 0 ? result.requiredConfig.join(", ") : "present"}`,
    `planned command: ${result.plannedCall.command ?? "not configured"}`,
    "created files:",
    ...(result.createdFiles.length > 0 ? result.createdFiles.map((file) => `- ${file}`) : ["- none"]),
    "",
    result.markdown,
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessLiveStitchArtifact(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(renderText(result));
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
