import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { QueueJob } from "./queue-runner.ts";

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

interface PiRepoSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
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

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function readRepoPiInvocation(repoRoot: string): { modelId?: string; thinking?: string } {
  try {
    const raw = JSON.parse(readFileSync(resolve(repoRoot, ".pi", "settings.json"), "utf8")) as PiRepoSettings;
    const defaultProvider = raw.defaultProvider?.trim() ?? "";
    const defaultModel = raw.defaultModel?.trim() ?? "";
    const modelId = defaultModel.includes("/")
      ? defaultModel
      : defaultProvider && defaultModel
        ? `${defaultProvider}/${defaultModel}`
        : undefined;
    const thinking = raw.defaultThinkingLevel?.trim();
    return {
      modelId,
      thinking: thinking && VALID_THINKING_LEVELS.has(thinking) ? thinking : undefined,
    };
  } catch {
    return {};
  }
}

function buildPiCommand(repoRoot: string, prompt: string): string {
  const invocation = readRepoPiInvocation(repoRoot);
  const segments = ["pi"];
  if (invocation.modelId) segments.push("--model", JSON.stringify(invocation.modelId));
  if (invocation.thinking) segments.push("--thinking", JSON.stringify(invocation.thinking));
  segments.push(JSON.stringify(prompt));
  return segments.join(" ");
}

function buildPlanningPrompt(initiativeId: string, issue: AfkWorkerExecutionPlanIssue, tddSlice: QueueJob["tddSlice"] | undefined): string {
  const goal = issue.whatToBuild?.trim() || issue.title;
  const allowedPaths = normalizeAllowedPaths(issue.allowedPaths);
  const filesToModify = normalizeList(issue.filesToModify);
  const acceptance = normalizeList(issue.acceptanceCriteria);
  const validation = normalizeList(issue.validationProof);
  return [
    "/skill:g-planning",
    `Plan a bounded AFK implementation for ${initiativeId} ${issue.issueId}.`,
    `Goal: ${goal}.`,
    `Allowed paths: ${allowedPaths.join(", ") || "none"}.`,
    `Primary files to modify: ${filesToModify.join(", ") || "none"}.`,
    `Acceptance criteria: ${acceptance.join(" | ") || "none"}.`,
    `Validation commands after implementation: ${validation.join(" | ") || "none"}.`,
    summarizeTddSlice(tddSlice),
    "Use the repo Pi log convention and create/update the active planning/coding logs for this slice.",
  ].join(" ");
}

function buildCodingPrompt(initiativeId: string, issue: AfkWorkerExecutionPlanIssue, tddSlice: QueueJob["tddSlice"] | undefined): string {
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
    "/skill:g-coding",
    `Implement AFK issue ${issue.issueId} for initiative ${initiativeId}.`,
    `Goal: ${goal}.`,
    `Allowed paths: ${allowedPaths.join(", ") || "none"}.`,
    `Files to modify: ${filesToModify.join(", ") || "none"}.`,
    `Acceptance criteria: ${acceptance.join(" | ") || "none"}.`,
    `Validation commands to run after implementation: ${validation.join(" | ") || "none"}.`,
    summarizeTddSlice(tddSlice),
    domainSafety,
    "Use strict TDD, keep changes bounded, update Pi logs, and stop before PR creation.",
  ].join(" ");
}

export function buildAfkImplementationCommand(
  repoRoot: string,
  initiativeId: string,
  issue: AfkWorkerExecutionPlanIssue,
  tddSlice: QueueJob["tddSlice"] | undefined,
): string {
  const planningPrompt = buildPlanningPrompt(initiativeId, issue, tddSlice);
  const codingPrompt = buildCodingPrompt(initiativeId, issue, tddSlice);
  const script = `${buildPiCommand(repoRoot, planningPrompt)} && ${buildPiCommand(repoRoot, codingPrompt)}`;
  return `bash -lc ${shellSingleQuote(script)}`;
}

export function isOperationalLogPath(pathValue: string): boolean {
  const normalized = pathValue.replace(/\\/g, "/").replace(/^\.\//, "");
  return OPERATIONAL_LOG_PATHS.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}
