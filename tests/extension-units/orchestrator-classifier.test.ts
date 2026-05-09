import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { classifyOrchestratorGoal, slugFromGoal, type OrchestratorInitiativeCandidate } from "../../.pi/agent/extensions/orchestrator-classifier.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const allScripts = [
  "harness:operator",
  "harness:product-intake",
  "harness:stitch-prompt",
  "harness:issue-materialize",
  "harness:product-pipeline",
  "harness:afk-orchestrate",
  "harness:worker-execute",
  "harness:pr-lifecycle",
  "harness:merge",
];
const initiative: OrchestratorInitiativeCandidate = { slug: "greenfield-scaffold", hasPipeline: true, hasIssues: true, hasSlices: true };

function classify(goal: string, overrides: Partial<Parameters<typeof classifyOrchestratorGoal>[0]> = {}) {
  return classifyOrchestratorGoal({
    goal,
    packageScripts: allScripts,
    initiativeCandidates: [],
    git: { branch: "main", dirty: false },
    ...overrides,
  });
}

test("new product idea routes to product intake dry-run", () => {
  const result = classify("Build checkout mini flow");

  assert.equal(result.version, 1);
  assert.equal(result.mode, "classify");
  assert.equal(result.selectedPath, "product_feature");
  assert.equal(result.confidence, "high");
  assert.equal(result.goal, "Build checkout mini flow");
  assert.match(result.nextDryRunCommand ?? "", /^npm run harness:product-intake -- /);
  assert.match(result.nextDryRunCommand ?? "", /--slug checkout-mini/);
  assert.match(result.nextDryRunCommand ?? "", /--dry-run/);
  assert.deepEqual(result.blockedReasons, []);
  assert.deepEqual(result.requiredArtifacts, []);
  assert.equal(result.inspected.branch, "main");
  assert.equal(result.inspected.dirty, false);
});

test("slugFromGoal omits generic operator words", () => {
  assert.equal(slugFromGoal("Please implement the checkout mini flow"), "checkout-mini");
});

test("existing initiative with pipeline routes to product pipeline dry-run", () => {
  const result = classify("Continue greenfield scaffold pipeline", { initiativeCandidates: [initiative] });

  assert.equal(result.selectedPath, "product_pipeline");
  assert.equal(result.confidence, "high");
  assert.equal(result.nextDryRunCommand, "npm run harness:product-pipeline -- dry-run --initiative greenfield-scaffold --json");
  assert.deepEqual(result.requiredArtifacts, []);
});

test("UI slice goal for an initiative routes to stitch prompt dry-run", () => {
  const result = classify("Create UI screen slice issue-003 for greenfield scaffold", { initiativeCandidates: [initiative] });

  assert.equal(result.selectedPath, "ui_slice");
  assert.equal(result.confidence, "high");
  assert.equal(result.nextDryRunCommand, "npm run harness:stitch-prompt -- --initiative greenfield-scaffold --slice issue-003 --dry-run --json");
});

test("issue materialization goal routes to approved g-issues dry-run with required source", () => {
  const result = classify("Materialize approved g-issues backlog for checkout revamp");

  assert.equal(result.selectedPath, "issue_materialization");
  assert.equal(result.confidence, "medium");
  assert.equal(result.nextDryRunCommand, "npm run harness:issue-materialize -- dry-run --source <approved-g-issues.json> --json");
  assert.deepEqual(result.requiredArtifacts, ["approved-g-issues.json"]);
});

test("AFK-ready issue request routes to AFK queue dry-run", () => {
  const result = classify("Queue AFK issues for greenfield scaffold", { initiativeCandidates: [initiative] });

  assert.equal(result.selectedPath, "afk_queue");
  assert.equal(result.nextDryRunCommand, "npm run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --json");
});


test("initiative-specific paths do not guess the first initiative when none is mentioned", () => {
  const result = classify("Queue AFK issues", { initiativeCandidates: [initiative] });

  assert.equal(result.selectedPath, "afk_queue");
  assert.equal(result.confidence, "medium");
  assert.deepEqual(result.requiredArtifacts, ["initiative-slug"]);
  assert.equal(result.nextDryRunCommand, "npm run harness:afk-orchestrate -- dry-run --initiative <initiative-slug> --json");
});

test("specific queue job request routes to worker execution dry-run", () => {
  const result = classify("Run worker for job queue-abc on greenfield scaffold", { initiativeCandidates: [initiative] });

  assert.equal(result.selectedPath, "worker_job");
  assert.equal(result.nextDryRunCommand, "npm run harness:worker-execute -- dry-run --initiative greenfield-scaffold --job-id queue-abc --json");
});

test("PR lifecycle request routes to PR dry-run with worker-run artifact requirement", () => {
  const result = classify("Create PR from worker run wr-123 for greenfield scaffold", { initiativeCandidates: [initiative] });

  assert.equal(result.selectedPath, "pr_lifecycle");
  assert.equal(result.nextDryRunCommand, "npm run harness:pr-lifecycle -- dry-run --initiative greenfield-scaffold --worker-run-id wr-123 --json");
});

test("merge request uses merge check, not merge apply", () => {
  const result = classify("Merge PR #42 after gates pass");

  assert.equal(result.selectedPath, "merge");
  assert.equal(result.nextDryRunCommand, "npm run harness:merge -- check --pr 42 --json");
  assert.doesNotMatch(result.nextDryRunCommand ?? "", / apply |--allow-merge/);
});

test("vague request routes to clarification with no command", () => {
  const result = classify("do it");

  assert.equal(result.selectedPath, "clarification");
  assert.equal(result.confidence, "low");
  assert.equal(result.nextDryRunCommand, null);
  assert.ok(result.blockedReasons.length > 0);
});

test("dirty repo is reported as inspected metadata and does not block read-only classification", () => {
  const result = classify("Build checkout mini flow", { git: { branch: "feature/x", dirty: true } });

  assert.equal(result.selectedPath, "product_feature");
  assert.equal(result.inspected.branch, "feature/x");
  assert.equal(result.inspected.dirty, true);
});

test("missing package script blocks command recommendation", () => {
  const result = classify("Build checkout mini flow", { packageScripts: [] });

  assert.equal(result.selectedPath, "product_feature");
  assert.equal(result.nextDryRunCommand, null);
  assert.deepEqual(result.blockedReasons, ["Missing package script: harness:product-intake"]);
});

test("helper source stays bounded away from runtime mutation and PR creation APIs", async () => {
  const helperSource = await readFile(join(repoRoot, ".pi", "agent", "extensions", "orchestrator-classifier.ts"), "utf8");
  assert.doesNotMatch(helperSource, /run_next_queue_job|task_update|generate_task_packet|queue\.json|tasks\.json|\.pi\/agent\/state\/runtime/);
  assert.doesNotMatch(helperSource, /gh\s+pr\s+create|gh\s+pr\s+merge|harness:merge -- apply|--allow-merge/);
});
