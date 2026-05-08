import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { generateMockStitchArtifact, writeMockStitchArtifactArtifacts, type MockStitchArtifactResult } from "../.pi/agent/extensions/stitch-artifact-adapter.ts";

type StitchArtifactMode = "dry-run" | "apply";

export interface HarnessStitchArtifactOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
  mode: StitchArtifactMode;
  json?: boolean;
}

export interface HarnessStitchArtifactCliResult extends MockStitchArtifactResult {
  mode: StitchArtifactMode;
  createdFiles: string[];
}

export async function runHarnessStitchArtifact(options: HarnessStitchArtifactOptions): Promise<HarnessStitchArtifactCliResult> {
  const result = await generateMockStitchArtifact({
    repoRoot: options.repoRoot,
    initiative: options.initiative,
    sliceId: options.sliceId,
  });
  const createdFiles = options.mode === "apply" ? await writeMockStitchArtifactArtifacts(result) : [];
  return { ...result, mode: options.mode, createdFiles };
}

function parseArgs(argv: string[]): HarnessStitchArtifactOptions {
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
      throw new Error("Usage: harness-stitch-artifact --initiative <slug> --slice <slice-id> (--dry-run|--apply) [--json]");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!initiative) throw new Error("--initiative is required.");
  if (!sliceId) throw new Error("--slice is required.");
  if ((dryRun ? 1 : 0) + (apply ? 1 : 0) !== 1) throw new Error("Choose exactly one of --dry-run or --apply.");
  return { initiative, sliceId, mode: apply ? "apply" : "dry-run", json };
}

function renderText(result: HarnessStitchArtifactCliResult): string {
  return [
    "Harness Stitch Artifact",
    `repo root: ${result.repoRoot}`,
    `initiative: ${result.initiativeId}`,
    `slice: ${result.sliceId}`,
    `mode: ${result.mode}`,
    `json path: ${result.jsonPath}`,
    `markdown path: ${result.markdownPath}`,
    "created files:",
    ...(result.createdFiles.length > 0 ? result.createdFiles.map((file) => `- ${file}`) : ["- none"]),
    "",
    result.markdown,
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessStitchArtifact(options);
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
