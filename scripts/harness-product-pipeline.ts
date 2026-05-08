import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  assertApplyRepoPreflight,
  buildProductPipelineRun,
  latestProductPipelineRun,
  loadProductPipelinePlan,
  renderProductPipelineRun,
  writeProductPipelineRun,
  type ProductPipelineRun,
} from "../.pi/agent/extensions/product-pipeline.ts";

export type HarnessProductPipelineCommand = "dry-run" | "apply" | "status";

export interface HarnessProductPipelineOptions {
  repoRoot?: string;
  command: HarnessProductPipelineCommand;
  initiative: string;
  maxParallel?: number;
  json?: boolean;
}

export type HarnessProductPipelineResult = ProductPipelineRun & {
  writtenRunPath: string | null;
};

function usage(): string {
  return [
    "Usage:",
    "  harness-product-pipeline dry-run --initiative <slug> [--max-parallel <n>] [--json]",
    "  harness-product-pipeline apply --initiative <slug> [--max-parallel <n>] [--json]",
    "  harness-product-pipeline status --initiative <slug> [--json]",
    "",
    "Rules:",
    "  - dry-run writes no files",
    "  - apply performs one bounded foreground materialization step then exits",
    "  - status reads durable pipeline run artifacts",
  ].join("\n");
}

function parseArgs(argv: string[]): HarnessProductPipelineOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (!["dry-run", "apply", "status"].includes(commandValue)) throw new Error(`Unknown command: ${commandValue}\n${usage()}`);
  let initiative: string | undefined;
  let maxParallel: number | undefined;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--initiative") {
      initiative = rest[++index];
    } else if (arg === "--max-parallel") {
      maxParallel = Number(rest[++index]);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!initiative) throw new Error("--initiative is required.");
  if (maxParallel !== undefined && (!Number.isInteger(maxParallel) || maxParallel < 1)) throw new Error("--max-parallel must be a positive integer.");
  return { command: commandValue as HarnessProductPipelineCommand, initiative, maxParallel, json };
}

export async function runHarnessProductPipeline(options: HarnessProductPipelineOptions): Promise<HarnessProductPipelineResult> {
  const repoRoot = options.repoRoot ?? process.cwd();

  if (options.command === "status") {
    const latest = await latestProductPipelineRun(repoRoot, options.initiative);
    if (latest) return { ...latest.run, writtenRunPath: latest.path };
    const plan = await loadProductPipelinePlan({ repoRoot, initiativeId: options.initiative });
    const run = buildProductPipelineRun({ plan, mode: "dry_run", maxParallelSlices: options.maxParallel });
    return { ...run, writtenRunPath: null };
  }

  const plan = await loadProductPipelinePlan({ repoRoot, initiativeId: options.initiative });
  const mode = options.command === "dry-run" ? "dry_run" : "apply";
  if (mode === "apply") await assertApplyRepoPreflight(repoRoot);
  const run = buildProductPipelineRun({ plan, mode, maxParallelSlices: options.maxParallel });
  const writtenRunPath = mode === "apply" ? await writeProductPipelineRun({ repoRoot, run }) : null;
  return { ...run, writtenRunPath };
}

function renderResult(result: HarnessProductPipelineResult): string {
  const lines = [renderProductPipelineRun(result), `written run path: ${result.writtenRunPath ?? "none"}`];
  return lines.join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessProductPipeline(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderResult(result)}\n`);
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
    process.stderr.write(`harness-product-pipeline failed: ${message}\n`);
    process.exitCode = 1;
  });
}
