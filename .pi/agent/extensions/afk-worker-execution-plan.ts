import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { QueueJob, QueueJobWorkerExecutionPlan } from "./queue-runner.ts";

export interface AfkWorkerExecutionPlanIssue {
  issueId: string;
  title: string;
  whatToBuild?: string;
  acceptanceCriteria?: string[];
  allowedPaths?: Array<string | { path?: string }>;
  filesToModify?: string[];
  validationProof?: string[];
  domains?: string[];
}

const OPERATIONAL_LOG_PATHS = [
  "logs/CURRENT.md",
  "logs/coding/",
  "reports/planning/",
] as const;

const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeAllowedPaths(values: Array<string | { path?: string }> | undefined): string[] {
  return (values ?? [])
    .map((value) => typeof value === "string" ? value.trim() : value.path?.trim())
    .filter((value): value is string => Boolean(value));
}

function summarizeTddSlice(tddSlice: QueueJob["tddSlice"] | undefined): string {
  if (!tddSlice) return "No explicit TDD slice metadata was supplied.";
  return [
    `First tracer behavior: ${tddSlice.firstTracerBehavior}.`,
    `Public interface: ${tddSlice.publicInterface}.`,
    `Test surface: ${tddSlice.testSurface.join(" | ")}.`,
    `Boundary dependencies: ${tddSlice.boundaryDependencies.join(" | ")}.`,
  ].join(" ");
}

function splitProviderModel(value: string | undefined): { provider?: string; modelId?: string } {
  if (!value) return {};
  const trimmed = value.trim();
  if (trimmed.length === 0) return {};
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) return { modelId: trimmed };
  return {
    provider: trimmed.slice(0, slashIndex),
    modelId: trimmed.slice(slashIndex + 1),
  };
}

function readRepoPiInvocation(repoRoot: string): { provider?: string; modelId?: string; thinkingLevel?: QueueJobWorkerExecutionPlan["thinkingLevel"] } {
  try {
    const settingsPath = resolve(repoRoot, ".pi", "settings.json");
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      defaultModel?: string;
      defaultProvider?: string;
      defaultThinkingLevel?: string;
    };
    const combinedModelId = raw.defaultModel?.includes("/")
      ? raw.defaultModel
      : raw.defaultProvider && raw.defaultModel
        ? `${raw.defaultProvider}/${raw.defaultModel}`
        : raw.defaultModel;
    const thinking = raw.defaultThinkingLevel?.trim();
    return {
      ...splitProviderModel(combinedModelId),
      thinkingLevel: thinking && VALID_THINKING_LEVELS.has(thinking) ? thinking as QueueJobWorkerExecutionPlan["thinkingLevel"] : undefined,
    };
  } catch {
    return {};
  }
}

function buildSameRuntimePrompt(initiativeId: string, issue: AfkWorkerExecutionPlanIssue, tddSlice: QueueJob["tddSlice"] | undefined): string {
  const goal = issue.whatToBuild?.trim() || issue.title;
  const allowedPaths = normalizeAllowedPaths(issue.allowedPaths);
  const filesToModify = normalizeList(issue.filesToModify);
  const acceptance = normalizeList(issue.acceptanceCriteria);
  const validation = normalizeList(issue.validationProof);
  const domains = normalizeList(issue.domains);
  const domainSafety = domains.includes("frontend")
    ? "Also follow frontend safety guidance when touching frontend files."
    : domains.includes("backend")
      ? "Also follow backend safety guidance when touching backend files."
      : "";
  return [
    `Implement AFK issue ${issue.issueId} for initiative ${initiativeId}.`,
    `Goal: ${goal}.`,
    `Allowed paths: ${allowedPaths.join(", ") || "none"}.`,
    `Files to modify: ${filesToModify.join(", ") || "none"}.`,
    `Acceptance criteria: ${acceptance.join(" | ") || "none"}.`,
    `Validation commands to run after implementation: ${validation.join(" | ") || "none"}.`,
    summarizeTddSlice(tddSlice),
    domainSafety,
    "Use strict TDD: add or update the smallest relevant failing test first, confirm RED for the right reason, implement the smallest passing change, then rerun the relevant validation commands.",
    "Read logs/CURRENT.md before updating logs, append progress to the active coding log, and keep Pi log conventions intact.",
    "Do not create a PR, do not merge, and stop after bounded implementation plus validation evidence.",
  ].join(" ");
}

export function buildAfkWorkerExecutionPlan(
  repoRoot: string,
  initiativeId: string,
  issue: AfkWorkerExecutionPlanIssue,
  tddSlice: QueueJob["tddSlice"] | undefined,
): QueueJobWorkerExecutionPlan {
  const invocation = readRepoPiInvocation(repoRoot);
  return {
    strategy: "same_runtime_prompt",
    prompt: buildSameRuntimePrompt(initiativeId, issue, tddSlice),
    toolProfile: "coding",
    includeProjectExtensions: false,
    includeContextFiles: true,
    provider: invocation.provider,
    modelId: invocation.modelId,
    thinkingLevel: invocation.thinkingLevel,
  };
}

export function isOperationalLogPath(pathValue: string): boolean {
  const normalized = pathValue.replace(/\\/g, "/").replace(/^\.\//, "");
  return OPERATIONAL_LOG_PATHS.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function afkWorkerExecutionPlanExtension(): void {}
