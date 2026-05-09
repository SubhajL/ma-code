import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeDelegatedRunCommand,
  runOrchestratorRun,
  type DelegatedRunCall,
  type DelegatedRunResult,
  type OrchestratorRunPreflight,
} from "../../.pi/agent/extensions/orchestrator-run.ts";

function makeRunner(result: DelegatedRunResult, calls: DelegatedRunCall[] = []) {
  return {
    calls,
    runner: async (call: DelegatedRunCall): Promise<DelegatedRunResult> => {
      calls.push(call);
      return result;
    },
  };
}

const cleanPreflight: OrchestratorRunPreflight = async () => ({ safe: true, blockers: [] });

test("queue-level run delegates exactly one bounded AFK orchestration command", async () => {
  const { runner, calls } = makeRunner({
    exitCode: 0,
    stdout: JSON.stringify({ mode: "run", runId: "afk-test", startedQueueJobs: ["afk-greenfield-scaffold-issue-001"], lastAction: "stopReason=max_steps" }),
    stderr: "",
  });

  const result = await runOrchestratorRun({ initiative: "greenfield-scaffold", maxSteps: 3, maxRuntimeSeconds: 300 }, runner, cleanPreflight);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm run harness:afk-orchestrate -- run --run --initiative greenfield-scaffold --max-steps 3 --max-runtime-seconds 300 --json");
  assert.equal(result.version, 1);
  assert.equal(result.mode, "run");
  assert.equal(result.selectedLane, "queue_level");
  assert.equal(result.status, "stopped");
  assert.deepEqual(result.startedWork, ["afk-greenfield-scaffold-issue-001"]);
  assert.equal(result.pr.created, false);
  assert.equal(result.merge.attempted, false);
});

test("worker-job run maps to worker-execute and optional PR boundary requires approval ref", async () => {
  const { runner, calls } = makeRunner({
    exitCode: 0,
    stdout: JSON.stringify({ status: "review_ready", runId: "worker-test", queueJobId: "afk-greenfield-scaffold-issue-001", prBoundary: { allowPrCreate: true, prCreated: false } }),
    stderr: "",
  });

  const blocked = await runOrchestratorRun({ initiative: "greenfield-scaffold", jobId: "afk-greenfield-scaffold-issue-001", maxSteps: 3, maxRuntimeSeconds: 300, allowPrCreate: true }, runner, cleanPreflight);
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blockers.join("\n"), /approval-ref/);
  assert.equal(calls.length, 0);

  const result = await runOrchestratorRun({ initiative: "greenfield-scaffold", jobId: "afk-greenfield-scaffold-issue-001", maxSteps: 3, maxRuntimeSeconds: 300, allowPrCreate: true, approvalRef: "human-123" }, runner, cleanPreflight);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm run harness:worker-execute -- run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-001 --max-steps 3 --max-runtime-seconds 300 --stop-before-pr --allow-pr-create --approval-ref human-123 --json");
  assert.equal(result.selectedLane, "worker_job");
  assert.equal(result.status, "stopped");
  assert.deepEqual(result.completedWork, ["afk-greenfield-scaffold-issue-001"]);
  assert.equal(result.stopReason, "approval_boundary");
});

test("parallel-lanes run maps to bounded parallel worker lanes with safe worker command", async () => {
  const { runner, calls } = makeRunner({
    exitCode: 0,
    stdout: JSON.stringify({ status: "done", runId: "run-test", lanes: [{ laneId: "lane-issue-002", status: "done" }], blockers: [] }),
    stderr: "",
  });

  const result = await runOrchestratorRun({ lane: "parallel_lanes", initiative: "greenfield-scaffold", maxSteps: 3, maxRuntimeSeconds: 300, maxParallel: 2, workerCommand: "npm test -- --runInBand" }, runner, cleanPreflight);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm run harness:parallel-worker-lanes -- run --initiative greenfield-scaffold --max-parallel 2 --max-runtime-seconds 300 --worker-command 'npm test -- --runInBand' --json");
  assert.equal(result.selectedLane, "parallel_lanes");
  assert.equal(result.status, "completed");
  assert.deepEqual(result.completedWork, ["lane-issue-002"]);
});

test("run blocks before delegation for missing bounds, missing initiative, lane ambiguity, dirty preflight, and unsafe commands", async () => {
  const { runner, calls } = makeRunner({ exitCode: 0, stdout: "{}", stderr: "" });

  assert.equal((await runOrchestratorRun({ initiative: "greenfield-scaffold", maxRuntimeSeconds: 300 }, runner, cleanPreflight)).status, "blocked");
  assert.match((await runOrchestratorRun({ maxSteps: 3, maxRuntimeSeconds: 300 }, runner, cleanPreflight)).blockers.join("\n"), /initiative/);
  assert.match((await runOrchestratorRun({ lane: "parallel_lanes", initiative: "greenfield-scaffold", jobId: "job-1", maxSteps: 3, maxRuntimeSeconds: 300, workerCommand: "npm test" }, runner, cleanPreflight)).blockers.join("\n"), /exactly one lane|multiple/i);
  assert.match((await runOrchestratorRun({ initiative: "greenfield-scaffold", maxSteps: 3, maxRuntimeSeconds: 300 }, runner, async () => ({ safe: false, blockers: ["dirty repo"] }))).blockers.join("\n"), /dirty repo/);
  assert.throws(() => assertSafeDelegatedRunCommand("queue_level", "npm run harness:merge -- apply --pr 1 --json"), /not allowlisted|unsafe/i);
  assert.throws(() => assertSafeDelegatedRunCommand("parallel_lanes", "npm run harness:parallel-worker-lanes -- run --initiative greenfield-scaffold --max-parallel 2 --max-runtime-seconds 300 --worker-command 'git merge main' --json"), /unsafe/i);
  assert.equal(calls.length, 0);
});
