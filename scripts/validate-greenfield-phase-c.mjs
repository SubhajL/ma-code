#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const jsonMode = process.argv.includes("--json");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const errors = [];
const proofPath = "docs/initiatives/greenfield-scaffold/phase-c-worker-execution-proof.json";
const phaseBPath = "docs/initiatives/greenfield-scaffold/phase-b-queue-readiness.md";
const issuesPath = "docs/initiatives/greenfield-scaffold/issues.json";

let artifact = null;
try {
  artifact = readJson(proofPath);
} catch (error) {
  errors.push(`unable to read ${proofPath}: ${error.message}`);
}

let phaseB = "";
try {
  phaseB = readText(phaseBPath);
} catch (error) {
  errors.push(`unable to read ${phaseBPath}: ${error.message}`);
}

let issues = null;
try {
  issues = readJson(issuesPath);
} catch (error) {
  errors.push(`unable to read ${issuesPath}: ${error.message}`);
}

const proofJobs = asArray(artifact?.proofJobs);
const [proofJob] = proofJobs;
const sourceCandidate = asArray(issues?.issues).find((issue) => issue?.issueId === proofJob?.sourceCandidateId);

if (artifact?.phase !== "C_worker_execution_proof") errors.push("phase-c proof artifact must declare phase C_worker_execution_proof");
if (artifact?.sourcePhaseBQueueReadiness !== "candidate_only") errors.push("phase-c proof must consume Phase B candidate_only readiness");
if (artifact?.liveWorkerExecutionReady !== false) errors.push("phase-c proof artifact must not claim live worker execution is already complete");
if (!/candidate_only/.test(phaseB) || !/Do not run autonomous workers in Phase B/.test(phaseB)) errors.push("Phase B contract boundary is missing or drifted");
if (proofJobs.length !== 1) errors.push(`expected exactly one materialized proof job, found ${proofJobs.length}`);
if (!proofJob) errors.push("missing proof job");

if (proofJob) {
  if (proofJob.id !== "phase-c-greenfield-worker-proof-issue-002") errors.push("proof job id must be deterministic");
  if (proofJob.status !== "materialized_proof_only") errors.push("proof job must be materialized as proof-only");
  if (proofJob.queueJobSource?.kind !== "issue-materialization") errors.push("proof job must retain issue-materialization provenance");
  if (proofJob.queueJobSource?.initiativeId !== "greenfield-scaffold") errors.push("proof job provenance must reference greenfield-scaffold");
  if (proofJob.queueJobSource?.issueId !== proofJob.sourceCandidateId) errors.push("proof job provenance must match source candidate");
  if (!sourceCandidate) errors.push(`source candidate ${proofJob.sourceCandidateId} not found in issues.json`);
  if (sourceCandidate && sourceCandidate.queueReadiness !== "not_ready") errors.push("source candidate queueReadiness must remain not_ready; Phase C uses derived proof metadata only");
  if (!asArray(proofJob.allowedPaths).includes("docs/initiatives/greenfield-scaffold")) errors.push("proof job must be constrained to Greenfield scaffold docs allowed path");
  if (!proofJob.implementationCommand || !/phase-c-worker-proof\.md/.test(proofJob.implementationCommand)) errors.push("proof job must include a bounded implementation command that writes the proof artifact");
  if (!asArray(proofJob.validationCommands).includes("npm run validate:greenfield-phase-c")) errors.push("proof job must validate through npm run validate:greenfield-phase-c");
  if (proofJob.prBoundary?.stopBeforePr !== true) errors.push("proof job must stop before PR");
  if (proofJob.prBoundary?.allowPrCreate !== false) errors.push("proof job must not allow PR creation inside worker execution");
}

const report = {
  phase: artifact?.phase ?? "C_worker_execution_proof",
  sourcePhaseBQueueReadiness: artifact?.sourcePhaseBQueueReadiness ?? "unknown",
  liveWorkerExecutionReady: artifact?.liveWorkerExecutionReady === true,
  proofJobs,
  errors,
};

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
} else {
  process.stdout.write("greenfield-phase-c-ok\n");
}

if (errors.length > 0) process.exit(1);
