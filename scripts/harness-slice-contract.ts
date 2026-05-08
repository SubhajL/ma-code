import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { generateSliceContract, writeSliceContractArtifacts, type SliceContractResult } from "../.pi/agent/extensions/slice-contracts.ts";

export interface HarnessSliceContractOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
  dryRun: boolean;
  apply: boolean;
  json?: boolean;
}

export interface HarnessSliceContractCliResult extends SliceContractResult {
  mode: "dry-run" | "apply";
  createdFiles: string[];
}

export async function runHarnessSliceContract(options: HarnessSliceContractOptions): Promise<HarnessSliceContractCliResult> {
  const result = await generateSliceContract({ repoRoot: options.repoRoot, initiative: options.initiative, sliceId: options.sliceId });
  if (options.apply) {
    const createdFiles = await writeSliceContractArtifacts(result);
    return { mode: "apply", createdFiles, ...result };
  }
  return { mode: "dry-run", createdFiles: [], ...result };
}

function usage(): string {
  return [
    "Usage:",
    "  harness-slice-contract --initiative <slug> --slice <slice-id> --dry-run [--json]",
    "  harness-slice-contract --initiative <slug> --slice <slice-id> --apply [--json]",
  ].join("\n");
}

function parseArgs(argv: string[]): HarnessSliceContractOptions {
  let initiative: string | undefined;
  let sliceId: string | undefined;
  let dryRun = false;
  let apply = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--initiative") {
      initiative = argv[++index];
    } else if (arg === "--slice") {
      sliceId = argv[++index];
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--apply") {
      apply = true;
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
  if (dryRun === apply) throw new Error("Choose exactly one of --dry-run or --apply.");
  return { initiative, sliceId, dryRun, apply, json };
}

function renderText(result: HarnessSliceContractCliResult): string {
  return [
    "Harness Slice Contract",
    `mode: ${result.mode}`,
    `repo root: ${result.repoRoot}`,
    `initiative: ${result.initiativeId}`,
    `slice: ${result.sliceId}`,
    `contract hash: ${result.contractHash}`,
    `json path: ${result.jsonPath}`,
    `markdown path: ${result.markdownPath}`,
    "created files:",
    ...(result.createdFiles.length > 0 ? result.createdFiles.map((file) => `- ${file}`) : ["- none"]),
    "",
    result.markdown.trimEnd(),
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessSliceContract(options);
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
