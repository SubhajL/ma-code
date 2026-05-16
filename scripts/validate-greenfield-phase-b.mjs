#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const jsonMode = process.argv.includes("--json");
const scaffoldDir = join(root, "docs/initiatives/greenfield-scaffold");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const slicePlan = readJson("docs/initiatives/greenfield-scaffold/slice-plan.json");
const issuesDoc = readJson("docs/initiatives/greenfield-scaffold/issues.json");
const issues = asArray(issuesDoc.issues ?? issuesDoc);
const slices = asArray(slicePlan.slices);
const policy = slicePlan.policy ?? {};

const errors = [];
if (policy.phase !== "A_issue_materialization_only") errors.push("expected Phase A source policy");
if (policy.queueReadyConversion !== "deferred_to_phase_b") errors.push("expected queueReadyConversion deferred_to_phase_b");
if (policy.queueReadiness !== "not_ready") errors.push("expected Phase A queueReadiness not_ready");
if (policy.noWorkerExecution !== true) errors.push("expected noWorkerExecution guardrail");
if (policy.noRuntimeStateMutation !== true) errors.push("expected noRuntimeStateMutation guardrail");

const issueById = new Map(issues.map((issue) => [issue.id ?? issue.issueId, issue]));
const candidates = slices
  .filter((slice) => (slice?.id ?? slice?.issueId) && slice.queueReadiness === "not_ready")
  .map((slice) => {
    const id = slice.id ?? slice.issueId;
    const issue = issueById.get(id) ?? {};
    const allowedPaths = asArray(slice.allowedPaths ?? issue.allowedPaths);
    const hitlGates = asArray(slice.hitlGates ?? issue.hitlGates);
    const missing = [];
    if (!slice.title && !issue.title) missing.push("title");
    if (allowedPaths.length === 0) missing.push("allowedPaths");
    if (hitlGates.length === 0) missing.push("hitlGates");
    return {
      id,
      title: slice.title ?? issue.title,
      status: missing.length === 0 ? "queue_ready_candidate" : "not_ready_missing_metadata",
      sourceQueueReadiness: slice.queueReadiness,
      workerExecution: "disabled",
      runtimeMutation: "disabled",
      allowedPaths,
      hitlGates,
      missing,
    };
  });

if (!candidates.some((candidate) => candidate.status === "queue_ready_candidate")) {
  errors.push("no queue-ready candidates found");
}

const report = {
  phase: "B_queue_readiness",
  sourcePolicyPhase: policy.phase,
  queueReadiness: "candidate_only",
  workerExecution: "disabled",
  runtimeMutation: "disabled",
  sourceArtifacts: {
    slicePlan: "docs/initiatives/greenfield-scaffold/slice-plan.json",
    issues: "docs/initiatives/greenfield-scaffold/issues.json",
    scaffoldDir: "docs/initiatives/greenfield-scaffold",
  },
  candidateCount: candidates.filter((candidate) => candidate.status === "queue_ready_candidate").length,
  candidates,
  errors,
};

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`greenfield-phase-b-${errors.length === 0 ? "ok" : "failed"}\n`);
  process.stdout.write(`queue-ready-candidates=${report.candidateCount}\n`);
  process.stdout.write("workerExecution=disabled\n");
  process.stdout.write("runtimeMutation=disabled\n");
  for (const error of errors) process.stderr.write(`${error}\n`);
}

if (errors.length > 0) process.exitCode = 1;
