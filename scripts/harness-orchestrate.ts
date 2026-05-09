import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  classifyOrchestratorGoal,
  type OrchestratorClassification,
  type OrchestratorGitState,
  type OrchestratorInitiativeCandidate,
} from "../.pi/agent/extensions/orchestrator-classifier.ts";
import { planOrchestratorDryRun, type OrchestratorDryRunPlan } from "../.pi/agent/extensions/orchestrator-dry-run.ts";

const execFile = promisify(execFileCallback);

export interface HarnessOrchestrateOptions {
  command: "classify" | "dry-run";
  goal: string;
  json?: boolean;
  repoRoot?: string;
}

function usage(): string {
  return [
    "Usage:",
    "  harness-orchestrate classify --goal <human-goal> [--json]",
    "  harness-orchestrate dry-run --goal <human-goal> [--json]",
    "",
    "Rules:",
    "  - classify is read-only and writes no files",
    "  - dry-run classifies, invokes at most one allowlisted dry-run/status/check helper, and writes no orchestrator files",
    "  - apply/run/create/merge execution is out of scope",
  ].join("\n");
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

export function parseHarnessOrchestrateArgs(argv: string[]): HarnessOrchestrateOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (commandValue !== "classify" && commandValue !== "dry-run") throw new Error(`Unknown or unsupported command: ${commandValue}\n${usage()}`);

  let goal: string | undefined;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--goal") goal = requireValue(rest[++index], "--goal");
    else if (arg === "--json") json = true;
    else if (["--apply", "--run", "--create", "--merge", "--allow-merge"].includes(arg)) throw new Error(`${arg} is not supported by harness-orchestrate ${commandValue}.`);
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }

  if (!goal || goal.trim().length === 0) throw new Error("--goal is required.");
  return { command: commandValue, goal, json };
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readPackageScripts(repoRoot: string): Promise<string[]> {
  try {
    const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    const scripts = packageJson && typeof packageJson === "object" ? (packageJson as { scripts?: unknown }).scripts : undefined;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return [];
    return Object.keys(scripts).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readInitiativeCandidates(repoRoot: string): Promise<OrchestratorInitiativeCandidate[]> {
  const initiativesRoot = join(repoRoot, "docs", "initiatives");
  if (!(await pathExists(initiativesRoot))) return [];
  const entries = await readdir(initiativesRoot, { withFileTypes: true });
  const candidates: OrchestratorInitiativeCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "TEMPLATE") continue;
    const base = join(initiativesRoot, entry.name);
    candidates.push({
      slug: entry.name,
      hasPipeline: await pathExists(join(base, "pipeline.json")),
      hasIssues: await pathExists(join(base, "issues.json")),
      hasSlices: await pathExists(join(base, "slices")),
    });
  }
  return candidates.sort((left, right) => left.slug.localeCompare(right.slug));
}

async function readGitState(repoRoot: string): Promise<OrchestratorGitState> {
  try {
    const branchResult = await execFile("git", ["-C", repoRoot, "branch", "--show-current"], { encoding: "utf8" });
    const statusResult = await execFile("git", ["-C", repoRoot, "status", "--porcelain"], { encoding: "utf8" });
    return { branch: branchResult.stdout.trim() || "detached", dirty: statusResult.stdout.trim().length > 0 };
  } catch {
    return { branch: "unknown", dirty: false };
  }
}

export async function runHarnessOrchestrate(options: HarnessOrchestrateOptions): Promise<OrchestratorClassification> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  return classifyOrchestratorGoal({
    goal: options.goal,
    packageScripts: await readPackageScripts(repoRoot),
    initiativeCandidates: await readInitiativeCandidates(repoRoot),
    git: await readGitState(repoRoot),
  });
}

export async function runHarnessOrchestrateDryRun(options: HarnessOrchestrateOptions): Promise<OrchestratorDryRunPlan> {
  const classification = await runHarnessOrchestrate(options);
  return planOrchestratorDryRun({ classification });
}

function renderClassificationText(result: OrchestratorClassification): string {
  return [
    "Harness Orchestrate Phase 1 Classification",
    `goal: ${result.goal}`,
    `selectedPath: ${result.selectedPath}`,
    `confidence: ${result.confidence}`,
    `nextDryRunCommand: ${result.nextDryRunCommand ?? "none"}`,
    "blockedReasons:",
    ...(result.blockedReasons.length > 0 ? result.blockedReasons.map((entry) => `- ${entry}`) : ["- none"]),
  ].join("\n");
}

function renderDryRunText(result: OrchestratorDryRunPlan): string {
  return [
    "Harness Orchestrate Phase 2 Dry Run",
    `selectedPath: ${result.selectedPath}`,
    `confidence: ${result.confidence}`,
    `status: ${result.status}`,
    `delegatedCommand: ${result.delegatedCommand ?? "none"}`,
    "blockers:",
    ...(result.blockers.length > 0 ? result.blockers.map((entry) => `- ${entry}`) : ["- none"]),
    "nextSafeActions:",
    ...(result.nextSafeActions.length > 0 ? result.nextSafeActions.map((entry) => `- ${entry}`) : ["- none"]),
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseHarnessOrchestrateArgs(argv);
  if (options.command === "classify") {
    const result = await runHarnessOrchestrate(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderClassificationText(result)}\n`);
    return;
  }
  const result = await runHarnessOrchestrateDryRun(options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderDryRunText(result)}\n`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = (error as Error).message;
    if (message.includes("Usage:")) {
      process.stdout.write(`${message}\n`);
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`harness-orchestrate failed: ${message}\n`);
    process.exitCode = 1;
  });
}
