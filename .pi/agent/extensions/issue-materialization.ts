import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { PRODUCT_PIPELINE_PHASE_ORDER } from "./product-pipeline.ts";

export type IssueMaterializationCommand = "dry-run" | "apply";
export type IssueMaterializationMode = "dry_run" | "apply";
export type IssueType = "HITL" | "AFK";
export type IssueStatus = "planned" | "blocked" | "done";
export type IssueQueueReadiness = "not_ready";

export interface IssueMaterializationSourceMeta {
  kind: "g-issues";
  capturedAt: string;
  approvedBy?: string;
  approvalRef?: string;
}

export interface IssueAllowedPathProof {
  path: string;
  access?: "read_only" | "non_mutating" | "read_write" | "mutating";
  mutating?: boolean;
}

export interface IssueMaterializationIssue {
  issueId: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  dependencies: string[];
  userStoriesCovered: string[];
  whatToBuild: string;
  acceptanceCriteria: string[];
  validationProof: string[];
  domains: string[];
  filesToModify: string[];
  allowedPaths: Array<string | IssueAllowedPathProof>;
  schemaPaths: string[];
  migrationPaths: string[];
  configPaths: string[];
  testPaths: string[];
  fixturePaths: string[];
  hitlGates: string[];
  queueReadiness: IssueQueueReadiness;
}

export interface IssueMaterializationSource {
  version: 1;
  initiativeId: string;
  source: IssueMaterializationSourceMeta;
  issues: IssueMaterializationIssue[];
}

export interface IssueMaterializationPlanInput {
  source: IssueMaterializationSource;
  rawSource: string;
  sourcePath: string;
  now?: string;
}

export interface IssueMaterializationPlan {
  version: 1;
  runId: string;
  initiativeId: string;
  sourceHash: string;
  sourcePath: string;
  issueCount: number;
  hitlCount: number;
  afkCount: number;
  plannedArtifacts: string[];
  files: Record<string, string>;
}

export interface MaterializeIssueArtifactsInput {
  repoRoot?: string;
  command: IssueMaterializationCommand;
  sourcePath: string;
  now?: string;
  overwrite?: boolean;
}

export interface IssueMaterializationResult {
  version: 1;
  mode: IssueMaterializationMode;
  runId: string;
  initiativeId: string;
  sourceHash: string;
  sourcePath: string;
  issueCount: number;
  hitlCount: number;
  afkCount: number;
  plannedArtifacts: string[];
  writtenArtifacts: string[];
  nextAction: string;
}

const INITIATIVE_ROOT = "docs/initiatives";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function trimString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireString(value: unknown, label: string): string {
  const stringValue = trimString(value);
  if (!stringValue) throw new Error(`${label} is required.`);
  return stringValue;
}

function requireOwnArray(record: Record<string, unknown>, key: string, label: string, options: { allowEmpty?: boolean } = {}): unknown[] {
  if (!hasOwn(record, key)) throw new Error(`${label} field is required.`);
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (!options.allowEmpty && value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

function normalizeStringArray(record: Record<string, unknown>, key: string, label: string, options: { allowEmpty?: boolean } = {}): string[] {
  return requireOwnArray(record, key, label, options).map((entry, index) => requireString(entry, `${label}[${index}]`));
}

function assertInitiativeSlug(value: string): string {
  const slug = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid initiativeId: ${value}`);
  return slug;
}

function normalizeRepoPath(pathValue: string, label: string): string {
  const normalized = pathValue.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) throw new Error(`${label} must be a safe repo-relative path.`);
  return normalized;
}

function normalizePathArray(record: Record<string, unknown>, key: string, label: string, options: { allowEmpty?: boolean } = {}): string[] {
  return normalizeStringArray(record, key, label, options).map((pathValue, index) => normalizeRepoPath(pathValue, `${label}[${index}]`));
}

function normalizeAllowedPaths(record: Record<string, unknown>, key: string, label: string): Array<string | IssueAllowedPathProof> {
  const values = requireOwnArray(record, key, label);
  return values.map((entry, index) => {
    if (typeof entry === "string") return normalizeRepoPath(entry, `${label}[${index}]`);
    if (!isRecord(entry)) throw new Error(`${label}[${index}] must be a string path or path proof object.`);
    const path = normalizeRepoPath(requireString(entry.path, `${label}[${index}].path`), `${label}[${index}].path`);
    const access = trimString(entry.access);
    if (access && !["read_only", "non_mutating", "read_write", "mutating"].includes(access)) throw new Error(`${label}[${index}].access is invalid.`);
    const mutating = typeof entry.mutating === "boolean" ? entry.mutating : undefined;
    return { path, ...(access ? { access: access as IssueAllowedPathProof["access"] } : {}), ...(mutating === undefined ? {} : { mutating }) };
  });
}

function normalizeIssue(value: unknown, index: number): IssueMaterializationIssue {
  if (!isRecord(value)) throw new Error(`issues[${index}] must be an object.`);
  const issueId = requireString(value.issueId, `issues[${index}].issueId`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(issueId)) throw new Error(`issues[${index}].issueId must be a durable slug.`);
  const title = requireString(value.title, `issues[${index}].title`);
  if (value.type !== "HITL" && value.type !== "AFK") throw new Error(`issues[${index}].type must be HITL or AFK.`);
  const status = value.status === undefined ? "planned" : value.status;
  if (status !== "planned" && status !== "blocked" && status !== "done") throw new Error(`issues[${index}].status is invalid.`);
  const dependencies = normalizeStringArray(value, "dependencies", `issues[${index}].dependencies`, { allowEmpty: true });
  const acceptanceCriteria = normalizeStringArray(value, "acceptanceCriteria", `issues[${index}].acceptanceCriteria`);
  const validationProof = normalizeStringArray(value, "validationProof", `issues[${index}].validationProof`, { allowEmpty: true });
  if (value.type === "AFK" && validationProof.length === 0) throw new Error(`AFK issue ${issueId} requires validationProof.`);
  const normalized: IssueMaterializationIssue = {
    issueId,
    title,
    type: value.type,
    status: status as IssueStatus,
    dependencies,
    userStoriesCovered: normalizeStringArray(value, "userStoriesCovered", `issues[${index}].userStoriesCovered`, { allowEmpty: true }),
    whatToBuild: requireString(value.whatToBuild, `issues[${index}].whatToBuild`),
    acceptanceCriteria,
    validationProof,
    domains: normalizeStringArray(value, "domains", `issues[${index}].domains`),
    filesToModify: normalizePathArray(value, "filesToModify", `issues[${index}].filesToModify`),
    allowedPaths: normalizeAllowedPaths(value, "allowedPaths", `issues[${index}].allowedPaths`),
    schemaPaths: normalizePathArray(value, "schemaPaths", `issues[${index}].schemaPaths`, { allowEmpty: true }),
    migrationPaths: normalizePathArray(value, "migrationPaths", `issues[${index}].migrationPaths`, { allowEmpty: true }),
    configPaths: normalizePathArray(value, "configPaths", `issues[${index}].configPaths`, { allowEmpty: true }),
    testPaths: normalizePathArray(value, "testPaths", `issues[${index}].testPaths`, { allowEmpty: true }),
    fixturePaths: normalizePathArray(value, "fixturePaths", `issues[${index}].fixturePaths`, { allowEmpty: true }),
    hitlGates: normalizeStringArray(value, "hitlGates", `issues[${index}].hitlGates`, { allowEmpty: true }),
    queueReadiness: "not_ready",
  };
  return normalized;
}

function validateDependencies(issues: IssueMaterializationIssue[]): void {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (ids.has(issue.issueId)) throw new Error(`Duplicate issueId: ${issue.issueId}`);
    ids.add(issue.issueId);
  }
  for (const issue of issues) {
    for (const dependency of issue.dependencies) {
      if (!ids.has(dependency)) throw new Error(`Issue ${issue.issueId} depends on unknown issue ${dependency}.`);
      if (dependency === issue.issueId) throw new Error(`Issue ${issue.issueId} cannot depend on itself.`);
    }
  }
}

export function parseIssueMaterializationSource(value: unknown): IssueMaterializationSource {
  if (!isRecord(value)) throw new Error("Issue materialization source must be an object.");
  if (value.version !== 1) throw new Error("Issue materialization source version must be 1.");
  const initiativeId = assertInitiativeSlug(requireString(value.initiativeId, "initiativeId"));
  if (!isRecord(value.source)) throw new Error("source metadata is required.");
  if (value.source.kind !== "g-issues") throw new Error("source.kind must be g-issues.");
  const capturedAt = requireString(value.source.capturedAt, "source.capturedAt");
  const issuesValue = value.issues;
  if (!Array.isArray(issuesValue) || issuesValue.length === 0) throw new Error("issues must be a non-empty array.");
  const issues = issuesValue.map(normalizeIssue);
  validateDependencies(issues);
  return {
    version: 1,
    initiativeId,
    source: {
      kind: "g-issues",
      capturedAt,
      approvedBy: trimString(value.source.approvedBy) ?? undefined,
      approvalRef: trimString(value.source.approvalRef) ?? undefined,
    },
    issues,
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashSource(rawSource: string): string {
  return createHash("sha256").update(rawSource).digest("hex");
}

function runIdFromNow(now: string): string {
  return `run-${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace(/[^0-9TZ]/g, "")}`;
}

function initiativeBase(initiativeId: string): string {
  return `${INITIATIVE_ROOT}/${assertInitiativeSlug(initiativeId)}`;
}

function assertUnderInitiative(pathValue: string, initiativeId: string): string {
  const normalized = normalizeRepoPath(pathValue, "artifact path");
  const base = `${initiativeBase(initiativeId)}/`;
  if (!normalized.startsWith(base)) throw new Error(`Artifact path escaped initiative directory: ${pathValue}`);
  return normalized;
}

function issueSummaryPath(initiativeId: string, issueId: string): string {
  return `${initiativeBase(initiativeId)}/slices/${issueId}.summary.json`;
}

function allowedPathStrings(allowedPaths: Array<string | IssueAllowedPathProof>): string[] {
  return allowedPaths.map((entry) => typeof entry === "string" ? entry : entry.path);
}

function buildIssuesJson(input: IssueMaterializationPlanInput, sourceHash: string): unknown {
  return {
    version: 1,
    initiativeId: input.source.initiativeId,
    source: {
      ...input.source.source,
      sourcePath: input.sourcePath,
      sourceHash,
    },
    issues: input.source.issues,
  };
}

function buildSlicePlan(input: IssueMaterializationSource): unknown {
  return {
    version: 1,
    initiativeId: input.initiativeId,
    status: "planned",
    slices: input.issues.map((issue) => ({
      sliceId: issue.issueId,
      issueId: issue.issueId,
      title: issue.title,
      type: issue.type,
      status: issue.status,
      currentPhase: "stitch_prompt",
      phaseOrder: PRODUCT_PIPELINE_PHASE_ORDER,
      phaseEvidence: {
        stitch_prompt: {
          status: "materialized",
          artifactPath: issueSummaryPath(input.initiativeId, issue.issueId),
          evidence: ["Phase A issue summary generated from approved g-issues source."],
        },
      },
      dependencies: issue.dependencies,
      queueReadiness: issue.queueReadiness,
      filesToModify: issue.filesToModify,
      allowedPaths: issue.allowedPaths,
      schemaPaths: issue.schemaPaths,
      migrationPaths: issue.migrationPaths,
      configPaths: issue.configPaths,
      testPaths: issue.testPaths,
      fixturePaths: issue.fixturePaths,
      blockedReason: issue.dependencies.length > 0 ? `Waiting for dependencies: ${issue.dependencies.join(", ")}` : null,
    })),
    policy: {
      phase: "A_issue_materialization_only",
      queueReadyConversion: "deferred_to_phase_b",
      queueReadiness: "not_ready",
      noWorkerExecution: true,
      noRuntimeStateMutation: true,
    },
  };
}

function buildPipeline(input: IssueMaterializationSource): unknown {
  return {
    version: 1,
    initiativeId: input.initiativeId,
    maxParallelSlices: 2,
    slices: input.issues.map((issue) => ({
      sliceId: issue.issueId,
      title: issue.title,
      status: issue.status,
      currentPhase: "stitch_prompt",
      phaseOrder: PRODUCT_PIPELINE_PHASE_ORDER,
      artifacts: {
        issueSummary: issueSummaryPath(input.initiativeId, issue.issueId),
      },
      hitlGate: issue.type === "HITL"
        ? {
            type: "issue_materialization_review",
            status: "waiting_for_human",
            summary: issue.hitlGates[0] ?? `Review HITL issue ${issue.issueId} before queue-ready conversion.`,
            artifactPath: issueSummaryPath(input.initiativeId, issue.issueId),
            approvalRef: null,
          }
        : null,
      blockers: [],
    })),
    parallelDecisions: [],
    phaseABoundary: {
      queueReadiness: "not_ready",
      queueReadyConversion: "Phase B only",
      materializedWork: {
        queueJobIds: [],
        workerSessionIds: [],
        worktreePaths: [],
      },
    },
  };
}

function buildSliceSummary(initiativeId: string, issue: IssueMaterializationIssue, sourceHash: string): unknown {
  return {
    version: 1,
    initiativeId,
    issueId: issue.issueId,
    type: issue.type,
    queueReadiness: issue.queueReadiness,
    dependencies: issue.dependencies,
    summary: {
      sliceId: issue.issueId,
      filesToModify: issue.filesToModify,
      allowedPaths: issue.allowedPaths,
      contracts: [],
      schemaPaths: issue.schemaPaths,
      migrationPaths: issue.migrationPaths,
      configPaths: issue.configPaths,
      testPaths: issue.testPaths,
      fixturePaths: issue.fixturePaths,
      notes: [
        `Phase A source hash: ${sourceHash}`,
        `Issue type: ${issue.type}`,
        `Allowed path roots: ${allowedPathStrings(issue.allowedPaths).join(", ")}`,
      ],
    },
    acceptanceCriteria: issue.acceptanceCriteria,
    validationProof: issue.validationProof,
    hitlGates: issue.hitlGates,
  };
}

function renderList(values: string[], empty = "none"): string {
  return values.length > 0 ? values.map((value) => `  - ${value}`).join("\n") : `  - ${empty}`;
}

function renderBacklog(input: IssueMaterializationSource, sourceHash: string): string {
  const lines = [
    `# Issue Materialization Backlog — ${input.initiativeId}`,
    "",
    "## Source",
    `- kind: ${input.source.kind}`,
    `- capturedAt: ${input.source.capturedAt}`,
    `- approvedBy: ${input.source.approvedBy ?? "missing"}`,
    `- approvalRef: ${input.source.approvalRef ?? "missing"}`,
    `- sourceHash: ${sourceHash}`,
    "",
    "## Phase A Boundary",
    "- Queue readiness remains `not_ready` for every issue.",
    "- Queue-ready conversion belongs to Phase B.",
    "- No queue jobs, task packets, worker sessions, or runtime state are materialized by this helper.",
    "",
    "## Issue List",
  ];
  for (const issue of input.issues) {
    lines.push(
      "",
      `### ${issue.issueId}: ${issue.title}`,
      `- type: ${issue.type}`,
      `- status: ${issue.status}`,
      `- queueReadiness: ${issue.queueReadiness}`,
      `- dependencies: ${issue.dependencies.length > 0 ? issue.dependencies.join(", ") : "none"}`,
      "- userStoriesCovered:",
      renderList(issue.userStoriesCovered),
      "- whatToBuild:",
      `  - ${issue.whatToBuild}`,
      "- acceptanceCriteria:",
      renderList(issue.acceptanceCriteria),
      "- validationProof:",
      renderList(issue.validationProof),
      "- filesToModify:",
      renderList(issue.filesToModify),
      "- allowedPaths:",
      renderList(allowedPathStrings(issue.allowedPaths)),
      "- hitlGates:",
      renderList(issue.hitlGates),
    );
  }
  lines.push("", "## Dependencies", "");
  for (const issue of input.issues) lines.push(`- ${issue.issueId}: ${issue.dependencies.length > 0 ? issue.dependencies.join(", ") : "none"}`);
  return `${lines.join("\n")}\n`;
}

function buildReport(input: IssueMaterializationSource, plan: IssueMaterializationPlan): unknown {
  return {
    version: 1,
    runId: plan.runId,
    initiativeId: plan.initiativeId,
    generatedAt: plan.runId.replace(/^run-/, ""),
    source: {
      ...input.source,
      sourcePath: plan.sourcePath,
      sourceHash: plan.sourceHash,
    },
    issueCount: plan.issueCount,
    hitlCount: plan.hitlCount,
    afkCount: plan.afkCount,
    plannedArtifacts: plan.plannedArtifacts,
    phaseABoundary: {
      writesOnlyUnder: initiativeBase(plan.initiativeId),
      queueReadiness: "not_ready",
      noQueueJobs: true,
      noWorkerSessions: true,
    },
  };
}

function renderReportMarkdown(report: ReturnType<typeof buildReport>): string {
  const typed = report as {
    runId: string;
    initiativeId: string;
    issueCount: number;
    hitlCount: number;
    afkCount: number;
    source: { kind: string; sourceHash: string; approvedBy?: string; approvalRef?: string };
    plannedArtifacts: string[];
  };
  return [
    `# Issue Materialization Report — ${typed.initiativeId}`,
    "",
    `- runId: ${typed.runId}`,
    `- sourceKind: ${typed.source.kind}`,
    `- sourceHash: ${typed.source.sourceHash}`,
    `- approvedBy: ${typed.source.approvedBy ?? "missing"}`,
    `- approvalRef: ${typed.source.approvalRef ?? "missing"}`,
    `- issueCount: ${typed.issueCount}`,
    `- HITL: ${typed.hitlCount}`,
    `- AFK: ${typed.afkCount}`,
    "- phase: A issue materialization only",
    "- queueReadiness: not_ready",
    "",
    "## Planned Artifacts",
    ...typed.plannedArtifacts.map((artifact) => `- ${artifact}`),
    "",
  ].join("\n");
}

export function buildIssueMaterializationPlan(input: IssueMaterializationPlanInput): IssueMaterializationPlan {
  const source = parseIssueMaterializationSource(input.source);
  const now = input.now ?? new Date().toISOString();
  const runId = runIdFromNow(now);
  const sourceHash = hashSource(input.rawSource);
  const base = initiativeBase(source.initiativeId);
  const reportBase = `${base}/materialization-runs/${runId}`;
  const files: Record<string, string> = {};
  files[`${base}/backlog.md`] = renderBacklog(source, sourceHash);
  files[`${base}/issues.json`] = stableJson(buildIssuesJson({ ...input, source }, sourceHash));
  files[`${base}/slice-plan.json`] = stableJson(buildSlicePlan(source));
  files[`${base}/pipeline.json`] = stableJson(buildPipeline(source));
  for (const issue of source.issues) files[issueSummaryPath(source.initiativeId, issue.issueId)] = stableJson(buildSliceSummary(source.initiativeId, issue, sourceHash));
  const partialPlan: IssueMaterializationPlan = {
    version: 1,
    runId,
    initiativeId: source.initiativeId,
    sourceHash,
    sourcePath: input.sourcePath,
    issueCount: source.issues.length,
    hitlCount: source.issues.filter((issue) => issue.type === "HITL").length,
    afkCount: source.issues.filter((issue) => issue.type === "AFK").length,
    plannedArtifacts: [],
    files,
  };
  const reportJsonPath = `${reportBase}.json`;
  const reportMarkdownPath = `${reportBase}.md`;
  const plannedArtifacts = [...Object.keys(files), reportJsonPath, reportMarkdownPath].map((artifact) => assertUnderInitiative(artifact, source.initiativeId)).sort();
  const report = buildReport(source, { ...partialPlan, plannedArtifacts });
  files[reportJsonPath] = stableJson(report);
  files[reportMarkdownPath] = renderReportMarkdown(report);
  return { ...partialPlan, plannedArtifacts, files };
}

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function assertApplyApproved(source: IssueMaterializationSource): void {
  if (!source.source.approvedBy || !source.source.approvalRef) throw new Error("source.approvedBy and approvalRef are required before apply.");
}

async function writeArtifacts(repoRoot: string, plan: IssueMaterializationPlan, overwrite: boolean): Promise<string[]> {
  const root = resolve(repoRoot);
  const existing: string[] = [];
  for (const artifact of plan.plannedArtifacts) {
    if (await exists(join(root, artifact))) existing.push(artifact);
  }
  if (existing.length > 0 && !overwrite) throw new Error(`Refusing to overwrite existing initiative artifacts without --overwrite: ${existing.join(", ")}`);
  for (const artifact of plan.plannedArtifacts) {
    await mkdir(dirname(join(root, artifact)), { recursive: true });
    await writeFile(join(root, artifact), plan.files[artifact], "utf8");
  }
  return plan.plannedArtifacts;
}

export async function materializeIssueArtifacts(input: MaterializeIssueArtifactsInput): Promise<IssueMaterializationResult> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const rawSource = await readFile(input.sourcePath, "utf8");
  const source = parseIssueMaterializationSource(JSON.parse(rawSource));
  if (input.command === "apply") assertApplyApproved(source);
  const plan = buildIssueMaterializationPlan({ source, rawSource, sourcePath: input.sourcePath, now: input.now });
  const writtenArtifacts = input.command === "apply" ? await writeArtifacts(repoRoot, plan, input.overwrite === true) : [];
  return {
    version: 1,
    mode: input.command === "dry-run" ? "dry_run" : "apply",
    runId: plan.runId,
    initiativeId: plan.initiativeId,
    sourceHash: plan.sourceHash,
    sourcePath: plan.sourcePath,
    issueCount: plan.issueCount,
    hitlCount: plan.hitlCount,
    afkCount: plan.afkCount,
    plannedArtifacts: plan.plannedArtifacts,
    writtenArtifacts,
    nextAction: input.command === "dry-run" ? "Review planned artifacts, then run apply when approved." : "Review materialized initiative artifacts; Phase B may consume issues.json and slice summaries later.",
  };
}

export function renderIssueMaterializationResult(result: IssueMaterializationResult): string {
  return [
    "Harness Issue Materialization",
    `mode: ${result.mode}`,
    `initiative: ${result.initiativeId}`,
    `run: ${result.runId}`,
    `source hash: ${result.sourceHash}`,
    `issues: ${result.issueCount} (${result.hitlCount} HITL, ${result.afkCount} AFK)`,
    "planned artifacts:",
    ...(result.plannedArtifacts.length > 0 ? result.plannedArtifacts.map((artifact) => `- ${artifact}`) : ["- none"]),
    "written artifacts:",
    ...(result.writtenArtifacts.length > 0 ? result.writtenArtifacts.map((artifact) => `- ${artifact}`) : ["- none"]),
    `next action: ${result.nextAction}`,
  ].join("\n");
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function issueMaterializationExtension(): void {}
