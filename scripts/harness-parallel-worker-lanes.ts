import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

import {
  assertApplyRepoPreflight,
  buildMixedDomainCoordinators,
  loadProductPipelinePlan,
  type ProductPipelineMixedDomainCoordinator,
} from "../.pi/agent/extensions/product-pipeline.ts";
import {
  acquireExecutionLease,
  readExecutionLeaseState,
  releaseExecutionLease,
} from "../.pi/agent/extensions/execution-leases.ts";
import {
  activeLeaseScopesFromRecords,
  buildParallelWorkerLaneManifest,
  latestParallelWorkerLaneManifest,
  renderParallelWorkerLaneManifest,
  writeParallelWorkerLaneManifest,
  type ParallelWorkerLane,
  type ParallelWorkerLaneManifest,
} from "../.pi/agent/extensions/parallel-worker-lanes.ts";
import {
  releaseHarnessWorkerSession,
  startHarnessWorkerSession,
} from "./harness-worker-session.ts";

export type HarnessParallelWorkerLanesCommand = "dry-run" | "apply" | "run" | "status" | "cleanup";

export interface HarnessParallelWorkerLanesOptions {
  repoRoot?: string;
  command: HarnessParallelWorkerLanesCommand;
  initiative: string;
  runId?: string;
  maxParallel?: number;
  maxRuntimeSeconds?: number;
  workerCommand?: string;
  owner?: string;
  baseRef?: string;
  parentDir?: string;
  laneId?: string;
  json?: boolean;
}

export interface HarnessMixedDomainLaneView extends ParallelWorkerLane {
  parentSliceId?: string | null;
  laneKind?: "frontend" | "backend" | "bff" | null;
  parentQueueJobId?: string | null;
}

export interface HarnessParallelWorkerLaneManifest extends ParallelWorkerLaneManifest {
  lanes: HarnessMixedDomainLaneView[];
  coordinators: ProductPipelineMixedDomainCoordinator[];
}

export interface HarnessParallelWorkerLanesResult {
  manifest: HarnessParallelWorkerLaneManifest;
  writtenManifestPath: string | null;
}

function usage(): string {
  return [
    "Usage:",
    "  harness-parallel-worker-lanes dry-run --initiative <slug> [--max-parallel <n>] [--json]",
    "  harness-parallel-worker-lanes apply --initiative <slug> [--max-parallel <n>] [--base-ref <ref>] [--json]",
    "  harness-parallel-worker-lanes run --initiative <slug> --worker-command <cmd> [--max-parallel <n>] [--max-runtime-seconds <n>] [--json]",
    "  harness-parallel-worker-lanes status --initiative <slug> [--json]",
    "  harness-parallel-worker-lanes cleanup --initiative <slug> --lane-id <lane-id> [--json]",
    "",
    "Rules:",
    "  - dry-run writes no files",
    "  - apply creates bounded worker sessions/worktrees and one initiative manifest",
    "  - run is foreground only and uses an explicit worker command",
    "  - cleanup is explicit and refuses dirty linked worktrees through worker-session",
  ].join("\n");
}

function parseArgs(argv: string[]): HarnessParallelWorkerLanesOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (!["dry-run", "apply", "run", "status", "cleanup"].includes(commandValue)) throw new Error(`Unknown command: ${commandValue}\n${usage()}`);

  let initiative: string | undefined;
  let runId: string | undefined;
  let maxParallel: number | undefined;
  let maxRuntimeSeconds: number | undefined;
  let workerCommand: string | undefined;
  let owner: string | undefined;
  let baseRef: string | undefined;
  let parentDir: string | undefined;
  let laneId: string | undefined;
  let repoRoot: string | undefined;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--initiative") initiative = rest[++index];
    else if (arg === "--run-id") runId = rest[++index];
    else if (arg === "--max-parallel") maxParallel = Number(rest[++index]);
    else if (arg === "--max-runtime-seconds") maxRuntimeSeconds = Number(rest[++index]);
    else if (arg === "--worker-command") workerCommand = rest[++index];
    else if (arg === "--owner") owner = rest[++index];
    else if (arg === "--base-ref") baseRef = rest[++index];
    else if (arg === "--parent-dir") parentDir = rest[++index];
    else if (arg === "--lane-id") laneId = rest[++index];
    else if (arg === "--repo-root") repoRoot = rest[++index];
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") throw new Error(usage());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!initiative) throw new Error("--initiative is required.");
  if (maxParallel !== undefined && (!Number.isInteger(maxParallel) || maxParallel < 1)) throw new Error("--max-parallel must be a positive integer.");
  if (maxRuntimeSeconds !== undefined && (!Number.isInteger(maxRuntimeSeconds) || maxRuntimeSeconds < 1)) throw new Error("--max-runtime-seconds must be a positive integer.");
  if (commandValue === "run" && !workerCommand) throw new Error("run requires --worker-command.");
  if (commandValue === "cleanup" && !laneId) throw new Error("cleanup requires --lane-id.");

  return { command: commandValue as HarnessParallelWorkerLanesCommand, initiative, runId, maxParallel, maxRuntimeSeconds, workerCommand, owner, baseRef, parentDir, laneId, repoRoot, json };
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutesIso(timestamp: string, minutes: number): string {
  return new Date(Date.parse(timestamp) + minutes * 60 * 1000).toISOString();
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function assertPacketArtifactsExist(repoRoot: string, lanes: Array<Pick<ParallelWorkerLane, "sliceId" | "packetPath">>): Promise<void> {
  const missing: string[] = [];
  for (const lane of lanes) {
    if (!lane.packetPath || !(await pathExists(join(repoRoot, lane.packetPath)))) missing.push(`${lane.sliceId}: ${lane.packetPath || "missing packet path"}`);
  }
  if (missing.length > 0) throw new Error(`Refusing apply with missing packet artifacts: ${missing.join("; ")}`);
}

function slugifySegment(input: string): string {
  const value = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!value) throw new Error(`Cannot slugify empty lane segment: ${input}`);
  return value;
}

function expandManifestWithMixedDomainCoordinators(
  manifest: ParallelWorkerLaneManifest,
  coordinators: ProductPipelineMixedDomainCoordinator[],
): HarnessParallelWorkerLaneManifest {
  const relevantCoordinators = coordinators.filter((coordinator) => manifest.lanes.some((lane) => lane.sliceId === coordinator.parentSliceId));
  const coordinatorsBySlice = new Map(relevantCoordinators.map((coordinator) => [coordinator.parentSliceId, coordinator]));
  const blockers = [...manifest.blockers];
  const expandedLanes: HarnessMixedDomainLaneView[] = [];

  for (const lane of manifest.lanes) {
    const coordinator = coordinatorsBySlice.get(lane.sliceId);
    if (!coordinator) {
      expandedLanes.push({ ...lane, parentSliceId: null, laneKind: null, parentQueueJobId: null });
      continue;
    }
    if (coordinator.conflictCheck.status !== "passed") {
      blockers.push(`Mixed-domain coordinator ${coordinator.parentSliceId} requires conflict checks to pass before child lanes can be materialized.`);
      expandedLanes.push({ ...lane, parentSliceId: coordinator.parentSliceId, laneKind: null, parentQueueJobId: coordinator.parentQueueJobId });
      continue;
    }

    const sliceSlug = slugifySegment(coordinator.parentSliceId);
    for (const childLane of coordinator.childLanes) {
      const laneSlug = `${sliceSlug}-${childLane.laneKind}`;
      expandedLanes.push({
        ...lane,
        laneId: `lane-${laneSlug}`,
        packetPath: childLane.packetPath,
        dependencyDecisionRef: `${lane.dependencyDecisionRef},mixed-domain:${coordinator.parentSliceId}:${childLane.laneKind}`,
        workerSessionScope: laneSlug,
        leaseId: `worker_lane-${laneSlug}`,
        branchName: `worker/${laneSlug}-parallel-lane`,
        worktreePath: `../ma-code-worktrees/${manifest.initiativeId}-${laneSlug}`,
        parentSliceId: coordinator.parentSliceId,
        laneKind: childLane.laneKind,
        parentQueueJobId: childLane.parentQueueJobId,
      });
    }
  }

  return {
    ...manifest,
    lanes: expandedLanes,
    blockers: [...new Set(blockers)],
    coordinators: relevantCoordinators,
  };
}

function orchestrationScope(initiative: string): string {
  return `parallel-run:${initiative}`;
}

async function buildManifestFromPlan(options: HarnessParallelWorkerLanesOptions, mode: "dry_run" | "apply" | "status"): Promise<HarnessParallelWorkerLaneManifest> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const plan = await loadProductPipelinePlan({ repoRoot, initiativeId: options.initiative });
  const leases = await readExecutionLeaseState(repoRoot);
  const manifest = buildParallelWorkerLaneManifest({
    plan,
    mode,
    runId: options.runId,
    maxParallelSlices: options.maxParallel,
    activeLeaseScopes: activeLeaseScopesFromRecords(leases.leases),
  });
  return expandManifestWithMixedDomainCoordinators(manifest, buildMixedDomainCoordinators(plan));
}

async function runDryRun(options: HarnessParallelWorkerLanesOptions): Promise<HarnessParallelWorkerLanesResult> {
  const manifest = await buildManifestFromPlan(options, "dry_run");
  return { manifest, writtenManifestPath: null };
}

async function runApply(options: HarnessParallelWorkerLanesOptions): Promise<HarnessParallelWorkerLanesResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  await assertApplyRepoPreflight(repoRoot);
  const manifest = await buildManifestFromPlan(options, "apply");

  if (manifest.blockers.length > 0 || manifest.parallelProof.phase10Decision !== "allowed" || manifest.parallelProof.leaseConflicts.length > 0) {
    throw new Error(`Refusing apply with parallel lane blockers: ${[...manifest.blockers, ...manifest.parallelProof.leaseConflicts].join("; ") || manifest.parallelProof.phase10Decision}`);
  }
  if (manifest.lanes.length === 0) throw new Error("Refusing apply because no eligible lanes were planned.");
  await assertPacketArtifactsExist(repoRoot, manifest.lanes);

  const acquiredAt = nowIso();
  const orchestration = await acquireExecutionLease(repoRoot, {
    id: manifest.orchestrationLeaseId,
    scope: orchestrationScope(options.initiative),
    owner: options.owner?.trim() || "assistant",
    acquiredAt,
    expiresAt: addMinutesIso(acquiredAt, 24 * 60),
    metadata: { leaseType: "parallel-run", initiativeId: options.initiative, runId: manifest.runId },
  });
  if (!orchestration.acquired) {
    throw new Error(`Parallel-run lease conflict for ${options.initiative}: ${orchestration.conflict?.id ?? "unknown"}`);
  }

  try {
    for (const lane of manifest.lanes) {
      const session = await startHarnessWorkerSession({
        repoRoot,
        id: lane.laneId,
        slug: `${options.initiative}-lane`,
        owner: options.owner,
        jobId: `parallel:${options.initiative}:${manifest.runId}:${lane.laneId}`,
        taskId: null,
        baseRef: options.baseRef,
        parentDir: options.parentDir,
      });
      lane.status = "leased";
      lane.leaseId = session.leaseId ?? lane.leaseId;
      lane.workerSessionScope = session.scopeKey;
      lane.branchName = session.branchName ?? lane.branchName;
      lane.worktreePath = session.worktreePath ?? lane.worktreePath;
    }
  } catch (error) {
    manifest.status = "failed";
    manifest.blockers.push(`apply failed after orchestration lease acquisition: ${(error as Error).message}`);
    await writeParallelWorkerLaneManifest({ repoRoot, manifest }).catch(() => undefined);
    throw error;
  }

  manifest.status = "materialized";
  manifest.mode = "apply";
  manifest.lastAction = { action: "apply", summary: "Created bounded worker sessions/worktrees and wrote durable parallel lane manifest.", at: nowIso() };
  const writtenManifestPath = await writeParallelWorkerLaneManifest({ repoRoot, manifest });
  return { manifest, writtenManifestPath };
}

function commandForLane(template: string, lane: ParallelWorkerLane): string {
  return template
    .replaceAll("{laneId}", lane.laneId)
    .replaceAll("{sliceId}", lane.sliceId)
    .replaceAll("{worktreePath}", lane.worktreePath)
    .replaceAll("{packetPath}", lane.packetPath);
}

async function runShellCommand(command: string, cwd: string, timeoutSeconds: number): Promise<number> {
  return await new Promise<number>((resolveCode) => {
    const child = spawn(process.platform === "win32" ? "cmd.exe" : "sh", process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command], {
      cwd,
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutSeconds * 1000);
    child.on("error", () => {
      clearTimeout(timer);
      resolveCode(1);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolveCode(signal ? 124 : code ?? 0);
    });
  });
}

async function runForeground(options: HarnessParallelWorkerLanesOptions): Promise<HarnessParallelWorkerLanesResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const latest = await latestParallelWorkerLaneManifest(repoRoot, options.initiative);
  if (!latest) throw new Error(`No parallel worker lane manifest found for ${options.initiative}. Run apply first.`);
  const manifest = latest.manifest;
  if (options.runId && manifest.runId !== options.runId) throw new Error(`Latest manifest runId ${manifest.runId} does not match requested ${options.runId}.`);
  if (!["materialized", "running"].includes(manifest.status)) throw new Error(`Cannot run parallel lanes from status ${manifest.status}.`);

  const maxParallel = Math.max(1, Math.floor(options.maxParallel ?? manifest.maxParallelSlices));
  const timeoutSeconds = options.maxRuntimeSeconds ?? 300;
  const lanes = manifest.lanes.filter((lane) => ["planned", "leased", "running"].includes(lane.status));
  let failed = false;
  manifest.mode = "run";
  manifest.status = "running";
  manifest.lastAction = { action: "run", summary: "Started foreground bounded worker lane execution.", at: nowIso() };
  await writeParallelWorkerLaneManifest({ repoRoot, manifest });

  for (let index = 0; index < lanes.length && !failed; index += maxParallel) {
    const batch = lanes.slice(index, index + maxParallel);
    const results = await Promise.all(batch.map(async (lane) => {
      lane.status = "running";
      lane.startedAt = lane.startedAt ?? nowIso();
      const command = commandForLane(options.workerCommand!, lane);
      const exitCode = await runShellCommand(command, lane.worktreePath || repoRoot, timeoutSeconds);
      lane.exitCode = exitCode;
      lane.finishedAt = nowIso();
      lane.status = exitCode === 0 ? "done" : "failed";
      if (exitCode !== 0) lane.blockers.push(`worker command exited with code ${exitCode}`);
      return exitCode;
    }));
    failed = results.some((code) => code !== 0);
  }

  if (failed) {
    manifest.status = "failed";
    manifest.blockers.push("Failed lane stopped new launches; worktree is preserved for inspection.");
  } else {
    manifest.status = manifest.lanes.every((lane) => lane.status === "done") ? "done" : "blocked";
  }
  manifest.lastAction = { action: "run", summary: failed ? "Foreground run failed; preserved failed lane worktree." : "Foreground run completed all planned lanes.", at: nowIso() };
  const writtenManifestPath = await writeParallelWorkerLaneManifest({ repoRoot, manifest });
  await releaseExecutionLease(repoRoot, manifest.orchestrationLeaseId).catch(() => undefined);
  return { manifest, writtenManifestPath };
}

async function runStatus(options: HarnessParallelWorkerLanesOptions): Promise<HarnessParallelWorkerLanesResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const latest = await latestParallelWorkerLaneManifest(repoRoot, options.initiative);
  if (latest) return { manifest: { ...latest.manifest, mode: "status", lastAction: { action: "status", summary: "Read latest durable parallel lane manifest.", at: nowIso() } }, writtenManifestPath: latest.path };
  const manifest = await buildManifestFromPlan(options, "status");
  return { manifest, writtenManifestPath: null };
}

async function runCleanup(options: HarnessParallelWorkerLanesOptions): Promise<HarnessParallelWorkerLanesResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const latest = await latestParallelWorkerLaneManifest(repoRoot, options.initiative);
  if (!latest) throw new Error(`No parallel worker lane manifest found for ${options.initiative}.`);
  const manifest = latest.manifest;
  const lane = manifest.lanes.find((entry) => entry.laneId === options.laneId);
  if (!lane) throw new Error(`No lane found for ${options.laneId}.`);
  if (lane.status !== "done") throw new Error(`Refusing cleanup for lane ${lane.laneId} with status ${lane.status}; only done lanes are eligible.`);
  await releaseHarnessWorkerSession({ repoRoot, scopeKey: lane.workerSessionScope, cleanup: true });
  lane.blockers = [];
  manifest.lastAction = { action: "status", summary: `Cleaned up done lane ${lane.laneId}.`, at: nowIso() };
  const writtenManifestPath = await writeParallelWorkerLaneManifest({ repoRoot, manifest });
  return { manifest, writtenManifestPath };
}

export async function runHarnessParallelWorkerLanes(options: HarnessParallelWorkerLanesOptions): Promise<HarnessParallelWorkerLanesResult> {
  if (options.command === "dry-run") return runDryRun(options);
  if (options.command === "apply") return runApply(options);
  if (options.command === "run") return runForeground(options);
  if (options.command === "cleanup") return runCleanup(options);
  return runStatus(options);
}

function renderResult(result: HarnessParallelWorkerLanesResult): string {
  return renderParallelWorkerLaneManifest(result.manifest, result.writtenManifestPath);
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessParallelWorkerLanes(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...result.manifest, writtenManifestPath: result.writtenManifestPath }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderResult(result)}\n`);
}

export async function runFromArgv(argv: string[]): Promise<number> {
  try {
    await main(argv);
    return 0;
  } catch (error: unknown) {
    const message = (error as Error).message ?? String(error);
    if (message.includes("Usage:")) {
      process.stdout.write(`${message}\n`);
      return 0;
    }
    process.stderr.write(`harness-parallel-worker-lanes failed: ${message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runFromArgv(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
