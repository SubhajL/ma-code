import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { generateStitchPrompt, writeStitchPromptArtifacts, type StitchPromptResult } from "../.pi/agent/extensions/stitch.ts";

type StitchPromptMode = "dry-run" | "apply";

export interface HarnessStitchPromptOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
  mode: StitchPromptMode;
  allowNonUi?: boolean;
  json?: boolean;
}

export interface HarnessStitchPromptCliResult extends StitchPromptResult {
  mode: StitchPromptMode;
  createdFiles: string[];
}

export async function runHarnessStitchPrompt(options: HarnessStitchPromptOptions): Promise<HarnessStitchPromptCliResult> {
  const result = await generateStitchPrompt({
    repoRoot: options.repoRoot,
    initiative: options.initiative,
    sliceId: options.sliceId,
    allowNonUi: options.allowNonUi,
  });
  const createdFiles = options.mode === "apply" ? await writeStitchPromptArtifacts(result) : [];
  return { ...result, mode: options.mode, createdFiles };
}

function parseArgs(argv: string[]): HarnessStitchPromptOptions {
  let initiative: string | undefined;
  let sliceId: string | undefined;
  let dryRun = false;
  let apply = false;
  let json = false;
  let allowNonUi = false;

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
    } else if (arg === "--allow-non-ui") {
      allowNonUi = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error("Usage: harness-stitch-prompt --initiative <slug> --slice <slice-id> (--dry-run|--apply) [--allow-non-ui] [--json]");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!initiative) throw new Error("--initiative is required.");
  if (!sliceId) throw new Error("--slice is required.");
  if ((dryRun ? 1 : 0) + (apply ? 1 : 0) !== 1) throw new Error("Choose exactly one of --dry-run or --apply.");
  return { initiative, sliceId, mode: apply ? "apply" : "dry-run", allowNonUi, json };
}

function renderText(result: HarnessStitchPromptCliResult): string {
  return [
    "Harness Stitch Prompt",
    `repo root: ${result.repoRoot}`,
    `initiative: ${result.initiativeId}`,
    `slice: ${result.sliceId}`,
    `mode: ${result.mode}`,
    `prompt path: ${result.promptPath}`,
    `metadata path: ${result.metadataPath}`,
    "created files:",
    ...(result.createdFiles.length > 0 ? result.createdFiles.map((file) => `- ${file}`) : ["- none"]),
    "",
    result.prompt,
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessStitchPrompt(options);
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
