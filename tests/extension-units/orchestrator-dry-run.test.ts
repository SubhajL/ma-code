import assert from "node:assert/strict";
import test from "node:test";

import { classifyOrchestratorGoal, type OrchestratorClassification, type OrchestratorInitiativeCandidate } from "../../.pi/agent/extensions/orchestrator-classifier.ts";
import {
  assertSafeDelegatedDryRunCommand,
  planOrchestratorDryRun,
  type DelegatedDryRunCall,
  type DelegatedDryRunResult,
} from "../../.pi/agent/extensions/orchestrator-dry-run.ts";

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

function classify(goal: string): OrchestratorClassification {
  return classifyOrchestratorGoal({
    goal,
    packageScripts: allScripts,
    initiativeCandidates: [initiative],
    git: { branch: "main", dirty: false },
  });
}

function makeRunner(result: DelegatedDryRunResult, calls: DelegatedDryRunCall[] = []) {
  return {
    calls,
    runner: async (call: DelegatedDryRunCall): Promise<DelegatedDryRunResult> => {
      calls.push(call);
      return result;
    },
  };
}

test("product pipeline dry-run delegates exactly one allowlisted helper command", async () => {
  const calls: DelegatedDryRunCall[] = [];
  const { runner } = makeRunner(
    {
      exitCode: 0,
      stdout: JSON.stringify({ mode: "dry_run", status: "ready", blockers: [], nextSafeActions: ["Review dry-run plan"] }),
      stderr: "",
    },
    calls,
  );

  const plan = await planOrchestratorDryRun({ classification: classify("Continue greenfield scaffold pipeline"), runner });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm run harness:product-pipeline -- dry-run --initiative greenfield-scaffold --json");
  assert.deepEqual(calls[0].args, ["run", "harness:product-pipeline", "--", "dry-run", "--initiative", "greenfield-scaffold", "--json"]);
  assert.equal(plan.version, 1);
  assert.equal(plan.mode, "dry_run");
  assert.equal(plan.selectedPath, "product_pipeline");
  assert.equal(plan.status, "ready");
  assert.equal(plan.writesFiles, false);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.nextSafeActions, ["Review dry-run plan"]);
});

test("blocked helper JSON normalizes blockers, missing artifacts, HITL gates, and next actions", async () => {
  const { runner, calls } = makeRunner({
    exitCode: 0,
    stdout: JSON.stringify({
      mode: "dry_run",
      status: "blocked",
      blockers: ["FE validation missing"],
      missingArtifacts: ["docs/initiatives/greenfield-scaffold/contracts/issue-002.json"],
      hitlGates: ["screen approval"],
      nextSafeActions: ["Approve the current screen artifact"],
    }),
    stderr: "",
  });

  const plan = await planOrchestratorDryRun({ classification: classify("Continue greenfield scaffold pipeline"), runner });

  assert.equal(calls.length, 1);
  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.blockers, ["FE validation missing"]);
  assert.deepEqual(plan.missingArtifacts, ["docs/initiatives/greenfield-scaffold/contracts/issue-002.json"]);
  assert.deepEqual(plan.hitlGates, ["screen approval"]);
  assert.deepEqual(plan.nextSafeActions, ["Approve the current screen artifact"]);
});

test("ambiguous classification requests clarification and runs no helper", async () => {
  const { runner, calls } = makeRunner({ exitCode: 0, stdout: "{}", stderr: "" });

  const plan = await planOrchestratorDryRun({ classification: classify("do it"), runner });

  assert.equal(calls.length, 0);
  assert.equal(plan.status, "needs_input");
  assert.equal(plan.selectedPath, "clarification");
  assert.equal(plan.delegatedCommand, null);
  assert.ok(plan.blockers.some((entry) => entry.includes("Clarify")));
});

test("missing placeholders stop before helper execution", async () => {
  const { runner, calls } = makeRunner({ exitCode: 0, stdout: "{}", stderr: "" });
  const classification = classifyOrchestratorGoal({
    goal: "Queue AFK issues",
    packageScripts: allScripts,
    initiativeCandidates: [initiative],
    git: { branch: "main", dirty: false },
  });

  const plan = await planOrchestratorDryRun({ classification, runner });

  assert.equal(calls.length, 0);
  assert.equal(plan.status, "needs_input");
  assert.deepEqual(plan.requiredArtifacts, ["initiative-slug"]);
  assert.match(plan.blockers.join("\n"), /initiative-slug/);
});

test("unsafe delegated commands are rejected before runner execution", async () => {
  const { runner, calls } = makeRunner({ exitCode: 0, stdout: "{}", stderr: "" });
  const classification = { ...classify("Merge PR #42 after gates pass"), nextDryRunCommand: "npm run harness:merge -- apply --pr 42 --json" };

  const plan = await planOrchestratorDryRun({ classification, runner });

  assert.equal(calls.length, 0);
  assert.equal(plan.status, "blocked");
  assert.match(plan.blockers.join("\n"), /not allowlisted|unsafe/i);
  assert.throws(() => assertSafeDelegatedDryRunCommand("merge", "npm run harness:merge -- apply --pr 42 --json"), /not allowlisted|unsafe/i);
});

test("helper nonzero exit becomes error with raw output excerpt", async () => {
  const { runner } = makeRunner({ exitCode: 2, stdout: "", stderr: "missing pipeline.json" });

  const plan = await planOrchestratorDryRun({ classification: classify("Continue greenfield scaffold pipeline"), runner });

  assert.equal(plan.status, "error");
  assert.match(plan.blockers.join("\n"), /exited with code 2/);
  assert.match(plan.rawOutputExcerpt, /missing pipeline\.json/);
});

test("invalid helper JSON becomes error with raw output excerpt", async () => {
  const { runner } = makeRunner({ exitCode: 0, stdout: "not json", stderr: "" });

  const plan = await planOrchestratorDryRun({ classification: classify("Continue greenfield scaffold pipeline"), runner });

  assert.equal(plan.status, "error");
  assert.match(plan.blockers.join("\n"), /invalid JSON/i);
  assert.match(plan.rawOutputExcerpt, /not json/);
});
