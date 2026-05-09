import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type OrchestratorRepoContext = "greenfield_candidate" | "brownfield_project" | "existing_harness_repo" | "unknown";
export type OrchestratorInitiativeMaturity = "none" | "missing" | "initiated" | "planning" | "active_existing_initiative" | "unknown";
export type OrchestratorSafeNextMode = "dry_run" | "bounded_worker" | "pr_lifecycle" | "product_pipeline" | "afk_queue" | "status";
export type OrchestratorBlockedMode = "greenfield_assumption" | "unbounded_parallel_without_context" | "direct_runtime_mutation";

export interface OrchestratorContextInitiativeSignals {
  slug?: string;
  exists: boolean;
  hasPrd?: boolean;
  hasBacklog?: boolean;
  hasDecisions?: boolean;
  hasIssues?: boolean;
  hasPipeline?: boolean;
  hasSlicePlan?: boolean;
  sliceCount?: number;
  screenArtifactCount?: number;
  contractCount?: number;
  workerRunCount?: number;
  prRunCount?: number;
}

export interface OrchestratorContextGitSignals {
  isGitRepo?: boolean;
  commitCount?: number;
  aheadOfOriginMain?: number;
  behindOriginMain?: number;
}

export interface OrchestratorContextSignals {
  repoRoot?: string;
  goal?: string;
  packageJsonExists?: boolean;
  packageName?: string;
  packageScripts?: string[];
  hasPiAgent?: boolean;
  extensionCount?: number;
  scriptCount?: number;
  testCount?: number;
  initiative?: OrchestratorContextInitiativeSignals;
  knownInitiativeCount?: number;
  git?: OrchestratorContextGitSignals;
}

export interface OrchestratorContextAssessment {
  repoContext: OrchestratorRepoContext;
  initiativeMaturity: OrchestratorInitiativeMaturity;
  greenfieldEligible: boolean;
  reasoning: string[];
  safeNextModes: OrchestratorSafeNextMode[];
  blockedModes: OrchestratorBlockedMode[];
  signals: OrchestratorContextSignals;
}

export interface CollectOrchestratorContextOptions {
  repoRoot: string;
  initiativeSlug?: string;
  goal?: string;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function includesHarnessScript(scripts: string[] | undefined): boolean {
  return Boolean(scripts?.some((script) => script.startsWith("harness:") || script.startsWith("validate:orchestrator")));
}

function goalMentionsGreenfield(goal: string | undefined): boolean {
  return /\bgreenfield\b/i.test(goal ?? "");
}

function slugMentionsGreenfield(slug: string | undefined): boolean {
  return /\bgreenfield\b/i.test(slug ?? "");
}

export function analyzeOrchestratorContext(signals: OrchestratorContextSignals): OrchestratorContextAssessment {
  const reasoning: string[] = [];
  const safeNextModes: OrchestratorSafeNextMode[] = ["dry_run", "status"];
  const blockedModes: OrchestratorBlockedMode[] = ["direct_runtime_mutation"];

  const packageScripts = signals.packageScripts ?? [];
  const hasHarnessIdentity = Boolean(
    signals.hasPiAgent ||
      includesHarnessScript(packageScripts) ||
      signals.packageName?.includes("harness") ||
      (signals.extensionCount ?? 0) >= 5,
  );
  const hasExistingProjectShape = Boolean(
    signals.packageJsonExists ||
      (signals.scriptCount ?? 0) > 0 ||
      (signals.testCount ?? 0) > 0 ||
      (signals.git?.commitCount ?? 0) > 1,
  );

  let repoContext: OrchestratorRepoContext = "unknown";
  if (hasHarnessIdentity) {
    repoContext = "existing_harness_repo";
    reasoning.push("repo has Pi harness/package/scripts/extensions signals");
  } else if (hasExistingProjectShape) {
    repoContext = "brownfield_project";
    reasoning.push("repo has existing project files, tests, scripts, or git history");
  } else if (signals.packageJsonExists === false && (signals.git?.commitCount ?? 0) <= 1) {
    repoContext = "greenfield_candidate";
    reasoning.push("repo lacks existing project/harness signals and has little or no history");
  } else {
    reasoning.push("repo signals are incomplete; greenfield cannot be assumed");
  }

  const initiative = signals.initiative;
  let initiativeMaturity: OrchestratorInitiativeMaturity = "none";
  if (initiative?.slug && !initiative.exists) {
    initiativeMaturity = "missing";
    reasoning.push(`initiative ${initiative.slug} does not exist`);
  } else if (initiative?.exists) {
    if (initiative.hasIssues || initiative.hasPipeline || initiative.hasSlicePlan || (initiative.sliceCount ?? 0) > 0 || (initiative.workerRunCount ?? 0) > 0 || (initiative.prRunCount ?? 0) > 0) {
      initiativeMaturity = "active_existing_initiative";
      reasoning.push("initiative artifacts already include issues, pipeline, slices, or execution evidence");
    } else if (initiative.hasPrd || initiative.hasBacklog || initiative.hasDecisions) {
      initiativeMaturity = "planning";
      reasoning.push("initiative has planning artifacts");
    } else {
      initiativeMaturity = "initiated";
      reasoning.push("initiative directory exists but has no active execution artifacts");
    }
  } else if ((signals.knownInitiativeCount ?? 0) > 0) {
    initiativeMaturity = "unknown";
    reasoning.push("repo has initiative artifacts but no initiative was selected");
  }

  const hasActiveInitiative = initiativeMaturity === "active_existing_initiative" || initiativeMaturity === "planning";
  const greenfieldEligible = repoContext === "greenfield_candidate" && !hasActiveInitiative;

  if (!greenfieldEligible) {
    blockedModes.push("greenfield_assumption");
  }
  blockedModes.push("unbounded_parallel_without_context");

  if (repoContext === "existing_harness_repo" || repoContext === "brownfield_project") {
    safeNextModes.push("bounded_worker", "pr_lifecycle");
  }
  if (initiativeMaturity === "active_existing_initiative") {
    safeNextModes.push("product_pipeline", "afk_queue", "bounded_worker", "pr_lifecycle");
  }
  if ((initiative?.hasPipeline || initiative?.hasIssues) && !greenfieldEligible) {
    reasoning.push("existing initiative lifecycle artifacts mean future work must be incremental, not greenfield");
  }
  if ((goalMentionsGreenfield(signals.goal) || slugMentionsGreenfield(initiative?.slug)) && !greenfieldEligible) {
    reasoning.push("greenfield wording or slug is label-only and is overridden by current repo/initiative evidence");
  }
  if (!greenfieldEligible && reasoning.length === 0) {
    reasoning.push("greenfield eligibility is false because current evidence is insufficient or contradictory");
  }

  return {
    repoContext,
    initiativeMaturity,
    greenfieldEligible,
    reasoning: unique(reasoning),
    safeNextModes: unique(safeNextModes),
    blockedModes: unique(blockedModes),
    signals,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function countDirectoryEntries(path: string): Promise<number> {
  try {
    return (await readdir(path)).length;
  } catch {
    return 0;
  }
}

async function countJsonFiles(path: string): Promise<number> {
  try {
    return (await readdir(path)).filter((entry) => entry.endsWith(".json") || entry.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

async function readPackageSignals(repoRoot: string): Promise<Pick<OrchestratorContextSignals, "packageJsonExists" | "packageName" | "packageScripts">> {
  const packagePath = join(repoRoot, "package.json");
  if (!(await exists(packagePath))) return { packageJsonExists: false, packageScripts: [] };
  try {
    const parsed = JSON.parse(await readFile(packagePath, "utf8")) as { name?: string; scripts?: Record<string, unknown> };
    return {
      packageJsonExists: true,
      packageName: parsed.name,
      packageScripts: Object.keys(parsed.scripts ?? {}).sort(),
    };
  } catch {
    return { packageJsonExists: true, packageScripts: [] };
  }
}

async function readInitiativeSignals(repoRoot: string, initiativeSlug: string | undefined): Promise<{ knownInitiativeCount: number; initiative?: OrchestratorContextInitiativeSignals }> {
  const initiativesRoot = join(repoRoot, "docs", "initiatives");
  let knownInitiativeCount = 0;
  try {
    const entries = await readdir(initiativesRoot, { withFileTypes: true });
    knownInitiativeCount = entries.filter((entry) => entry.isDirectory() && entry.name !== "TEMPLATE").length;
  } catch {
    knownInitiativeCount = 0;
  }
  if (!initiativeSlug) return { knownInitiativeCount };

  const base = join(initiativesRoot, initiativeSlug);
  const initiativeExists = await exists(base);
  const initiative: OrchestratorContextInitiativeSignals = {
    slug: initiativeSlug,
    exists: initiativeExists,
  };
  if (initiativeExists) {
    initiative.hasPrd = await exists(join(base, "prd.md"));
    initiative.hasBacklog = await exists(join(base, "backlog.md"));
    initiative.hasDecisions = await exists(join(base, "decisions.md"));
    initiative.hasIssues = await exists(join(base, "issues.json"));
    initiative.hasPipeline = await exists(join(base, "pipeline.json"));
    initiative.hasSlicePlan = await exists(join(base, "slice-plan.json"));
    initiative.sliceCount = await countDirectoryEntries(join(base, "slices"));
    initiative.screenArtifactCount = await countJsonFiles(join(base, "screen-artifacts"));
    initiative.contractCount = await countJsonFiles(join(base, "contracts"));
    initiative.workerRunCount = await countJsonFiles(join(base, "worker-runs"));
    initiative.prRunCount = await countJsonFiles(join(base, "pr-runs"));
  }
  return { knownInitiativeCount, initiative };
}

async function gitNumber(repoRoot: string, args: string[]): Promise<number | undefined> {
  try {
    const result = await execFile("git", args, { cwd: repoRoot, timeout: 1000 });
    const parsed = Number(result.stdout.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readGitSignals(repoRoot: string): Promise<OrchestratorContextGitSignals> {
  try {
    await execFile("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot, timeout: 1000 });
  } catch {
    return { isGitRepo: false };
  }
  const gitSignals: OrchestratorContextGitSignals = {
    isGitRepo: true,
    commitCount: await gitNumber(repoRoot, ["rev-list", "--count", "HEAD"]),
  };
  try {
    const result = await execFile("git", ["rev-list", "--left-right", "--count", "origin/main...HEAD"], { cwd: repoRoot, timeout: 1000 });
    const [behind, ahead] = result.stdout.trim().split(/\s+/).map((value) => Number(value));
    if (Number.isFinite(ahead)) gitSignals.aheadOfOriginMain = ahead;
    if (Number.isFinite(behind)) gitSignals.behindOriginMain = behind;
  } catch {
    // origin/main can be absent in temp repos; absence is not fatal for context classification.
  }
  return gitSignals;
}

export async function collectOrchestratorContextSignals(options: CollectOrchestratorContextOptions): Promise<OrchestratorContextSignals> {
  const repoRoot = options.repoRoot;
  const [packageSignals, initiativeSignals, gitSignals] = await Promise.all([
    readPackageSignals(repoRoot),
    readInitiativeSignals(repoRoot, options.initiativeSlug),
    readGitSignals(repoRoot),
  ]);
  return {
    repoRoot,
    goal: options.goal,
    ...packageSignals,
    hasPiAgent: await exists(join(repoRoot, ".pi", "agent")),
    extensionCount: await countDirectoryEntries(join(repoRoot, ".pi", "agent", "extensions")),
    scriptCount: await countDirectoryEntries(join(repoRoot, "scripts")),
    testCount: await countDirectoryEntries(join(repoRoot, "tests")),
    knownInitiativeCount: initiativeSignals.knownInitiativeCount,
    initiative: initiativeSignals.initiative,
    git: gitSignals,
  };
}

export default function orchestratorContextExtension(): void {}
