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

const OPERATIONAL_LOG_PATHS = [
  "logs/CURRENT.md",
  "logs/coding/",
  "reports/planning/",
] as const;

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeAllowedPaths(values: Array<string | { path?: string }> | undefined): string[] {
  return (values ?? [])
    .map((value) => typeof value === "string" ? value : value.path)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function summarizeTddSlice(tddSlice: QueueJob["tddSlice"] | undefined): string {
  if (!tddSlice) return "Use the smallest behavior-first TDD slice justified by the issue acceptance criteria.";
  return [
    `First tracer behavior: ${tddSlice.firstTracerBehavior}.`,
    `Public interface: ${tddSlice.publicInterface}.`,
    `Test surface: ${tddSlice.testSurface.join(", ") || "none"}.`,
    `Boundary dependencies: ${tddSlice.boundaryDependencies.join(", ") || "none"}.`,
    `Mock plan: ${tddSlice.mockPlan}.`,
    `Out of scope: ${tddSlice.outOfScopeBehaviors.join(", ") || "none"}.`,
  ].join(" ");
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
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
  initiativeId: string,
  issue: AfkWorkerExecutionPlanIssue,
  tddSlice: QueueJob["tddSlice"] | undefined,
): string {
  const planningPrompt = buildPlanningPrompt(initiativeId, issue, tddSlice);
  const codingPrompt = buildCodingPrompt(initiativeId, issue, tddSlice);
  const script = `pi ${JSON.stringify(planningPrompt)} && pi ${JSON.stringify(codingPrompt)}`;
  return `bash -lc ${shellSingleQuote(script)}`;
}

export function isOperationalLogPath(pathValue: string): boolean {
  const normalized = pathValue.replace(/\\/g, "/").replace(/^\.\//, "");
  return OPERATIONAL_LOG_PATHS.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}
