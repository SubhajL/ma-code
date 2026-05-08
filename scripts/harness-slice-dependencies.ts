import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decideSliceParallelism,
  type SliceArtifactReference,
  type SliceDependencySummary,
  type SliceParallelismDecision,
} from "../.pi/agent/extensions/slice-dependency-decision.ts";

export interface HarnessSliceDependenciesOptions {
  repoRoot?: string;
  check: string[];
  schedulingReadiness: boolean;
  leaseConflictCheckAvailable: boolean;
  json?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSummary(value: unknown): SliceDependencySummary | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.summary)) return value.summary as unknown as SliceDependencySummary;
  return value as unknown as SliceDependencySummary;
}

export async function runHarnessSliceDependencies(options: HarnessSliceDependenciesOptions): Promise<SliceParallelismDecision> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const entries: SliceArtifactReference[] = [];
  for (const artifactPath of options.check) {
    try {
      const parsed = JSON.parse(await readFile(resolve(repoRoot, artifactPath), "utf8"));
      const summary = asSummary(parsed);
      entries.push(summary ? { artifactPath, summary } : { artifactPath, parseError: "expected object slice summary or { summary } wrapper" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        entries.push({ artifactPath, missing: true });
      } else {
        entries.push({ artifactPath, parseError: (error as Error).message });
      }
    }
  }
  return decideSliceParallelism({
    slices: entries,
    schedulingReadiness: options.schedulingReadiness,
    leaseConflictCheckAvailable: options.leaseConflictCheckAvailable,
  });
}

function usage(): string {
  return [
    "Usage:",
    "  harness-slice-dependencies --check <artifact.json> <artifact.json> [--json]",
    "  harness-slice-dependencies --check <artifact.json> <artifact.json> --scheduling-readiness --lease-conflict-check-available [--json]",
  ].join("\n");
}

function parseArgs(argv: string[]): HarnessSliceDependenciesOptions {
  const check: string[] = [];
  let json = false;
  let schedulingReadiness = false;
  let leaseConflictCheckAvailable = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      while (argv[index + 1] && !argv[index + 1].startsWith("--")) check.push(argv[++index]);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--scheduling-readiness") {
      schedulingReadiness = true;
    } else if (arg === "--lease-conflict-check-available") {
      leaseConflictCheckAvailable = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (check.length < 2) throw new Error("--check requires at least two artifact paths.");
  return { check, schedulingReadiness, leaseConflictCheckAvailable, json };
}

function renderText(decision: SliceParallelismDecision): string {
  return [
    "Harness Slice Dependencies",
    `decision: ${decision.decision}`,
    `parallelAllowed: ${decision.parallelAllowed}`,
    `recommendedExecution: ${decision.recommendedExecution}`,
    `sliceIds: ${decision.sliceIds.length > 0 ? decision.sliceIds.join(", ") : "none"}`,
    "blockers:",
    ...(decision.blockers.length > 0 ? decision.blockers.map((blocker) => `- ${blocker.type}: ${blocker.reason}`) : ["- none"]),
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const decision = await runHarnessSliceDependencies(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderText(decision)}\n`);
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
