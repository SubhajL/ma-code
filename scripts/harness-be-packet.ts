import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  generateBackendImplementationPacket,
  writeBackendPacketPreview,
  type GeneratedBackendImplementationPacket,
  type WrittenBackendPacketPreview,
} from "../.pi/agent/extensions/backend-packet-generator.ts";

export interface HarnessBackendPacketOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
  dryRun: boolean;
  apply: boolean;
  json?: boolean;
}

export type HarnessBackendPacketCliResult = (GeneratedBackendImplementationPacket | WrittenBackendPacketPreview) & {
  mode: "dry-run" | "apply";
  createdFiles: string[];
};

export async function runHarnessBackendPacket(options: HarnessBackendPacketOptions): Promise<HarnessBackendPacketCliResult> {
  const generated = await generateBackendImplementationPacket({
    repoRoot: options.repoRoot,
    initiativeId: options.initiative,
    sliceId: options.sliceId,
  });
  if (options.apply) {
    const written = await writeBackendPacketPreview(generated);
    return { mode: "apply", ...written };
  }
  return { mode: "dry-run", createdFiles: [], ...generated };
}

function usage(): string {
  return [
    "Usage:",
    "  harness-be-packet --initiative <slug> --slice <slice-id> --dry-run [--json]",
    "  harness-be-packet --initiative <slug> --slice <slice-id> --apply [--json]",
  ].join("\n");
}

function parseArgs(argv: string[]): HarnessBackendPacketOptions {
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

function renderText(result: HarnessBackendPacketCliResult): string {
  return [
    "Harness Backend Packet",
    `mode: ${result.mode}`,
    `repo root: ${result.repoRoot}`,
    `initiative: ${result.initiativeId}`,
    `slice: ${result.sliceId}`,
    `frontend packet: ${result.frontendPacketPath}`,
    `frontend evidence: ${result.frontendEvidencePath}`,
    `contract: ${result.contractPath}`,
    `slice plan: ${result.slicePlanPath}`,
    `contract hash: ${result.contractHash}`,
    `json path: ${result.previewPaths.jsonPath}`,
    `markdown path: ${result.previewPaths.markdownPath}`,
    `routing lane: ${result.packet.routing.phaseLane ?? "none"}`,
    `routing source: ${result.packet.routing.phaseRoutingSource ?? result.packet.routing.source}`,
    "created files:",
    ...(result.createdFiles.length > 0 ? result.createdFiles.map((file) => `- ${file}`) : ["- none"]),
    "",
    result.renderedPacket.trimEnd(),
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessBackendPacket(options);
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
