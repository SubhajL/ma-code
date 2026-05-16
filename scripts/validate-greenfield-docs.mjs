#!/usr/bin/env node
import { accessSync, constants, readFileSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "docs/initiatives/greenfield-scaffold/README.md",
  "docs/initiatives/greenfield-scaffold/backout.md",
  "docs/initiatives/greenfield-scaffold/phase-b-queue-readiness.md",
  "docs/initiatives/greenfield-scaffold/phase-c-worker-execution-proof.json",
  "docs/initiatives/greenfield-scaffold/readiness-checklist.md",
  "docs/initiatives/greenfield-scaffold/afk-approvals.json",
  "docs/initiatives/greenfield-scaffold/issues.json",
  "docs/initiatives/greenfield-scaffold/pipeline.json",
  "docs/initiatives/greenfield-scaffold/slice-plan.json",
];

const failures = [];
for (const path of requiredFiles) {
  try {
    accessSync(path, constants.R_OK);
  } catch {
    failures.push(`${path} is missing`);
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const pipeline = readJson("docs/initiatives/greenfield-scaffold/pipeline.json");
if (pipeline) {
  if (pipeline.status !== "done") failures.push("greenfield pipeline status must be done");
  const incomplete = (pipeline.slices ?? []).filter((slice) => slice.status !== "done").map((slice) => slice.sliceId ?? "<unknown>");
  if (incomplete.length > 0) failures.push(`greenfield pipeline has incomplete slices: ${incomplete.join(", ")}`);
}

const slicePlan = readJson("docs/initiatives/greenfield-scaffold/slice-plan.json");
if (slicePlan) {
  if (slicePlan.status !== "done") failures.push("greenfield slice-plan status must be done");
  const incomplete = (slicePlan.slices ?? []).filter((slice) => slice.status !== "done").map((slice) => slice.sliceId ?? "<unknown>");
  if (incomplete.length > 0) failures.push(`greenfield slice-plan has incomplete slices: ${incomplete.join(", ")}`);
}

const issues = readJson("docs/initiatives/greenfield-scaffold/issues.json");
if (issues) {
  const incomplete = (issues.issues ?? []).filter((issue) => {
    if (issue.type === "HITL") return issue.status !== "approved";
    return issue.status !== "done";
  }).map((issue) => `${issue.issueId}:${issue.status}`);
  if (incomplete.length > 0) failures.push(`greenfield issues are not complete/approved: ${incomplete.join(", ")}`);
}

const approvals = readJson("docs/initiatives/greenfield-scaffold/afk-approvals.json");
if (approvals && !(approvals.approvals ?? []).some((approval) => approval.issueId === "issue-017")) {
  failures.push("issue-017 approval is missing from afk-approvals.json");
}

const phaseC = readJson("docs/initiatives/greenfield-scaffold/phase-c-worker-execution-proof.json");
if (phaseC) {
  if (phaseC.phase !== "C_worker_execution_proof") failures.push("phase-c proof artifact must declare phase C_worker_execution_proof");
  if ((phaseC.proofJobs ?? []).length !== 1) failures.push("phase-c proof artifact must contain exactly one proof job");
}

const readiness = readFileSync("docs/initiatives/greenfield-scaffold/readiness-checklist.md", "utf8");
if (!/Greenfield initiative status/i.test(readiness) || !/complete/i.test(readiness)) {
  failures.push("readiness checklist must state the Greenfield initiative completion status");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("greenfield-docs-ok");
