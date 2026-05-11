import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertSafeDelegatedRunCommand,
  defaultOrchestratorRunPreflight,
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


async function makeRepoWithAutoLandPolicy(policy: Record<string, unknown>): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "orch-auto-land-policy-"));
  const policyDir = join(repoRoot, ".pi", "agent", "routing");
  await mkdir(policyDir, { recursive: true });
  await writeFile(join(policyDir, "orchestrator-auto-land-policy.json"), `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  return repoRoot;
}


function makeSequenceRunner(results: DelegatedRunResult[], calls: DelegatedRunCall[] = []) {
  return {
    calls,
    runner: async (call: DelegatedRunCall) => {
      calls.push(call);
      const result = results.shift();
      assert.ok(result, `unexpected delegated call: ${call.command}`);
      return result;
    },
  };
}

function jsonResult(record: unknown): DelegatedRunResult {
  return { exitCode: 0, stdout: `${JSON.stringify(record)}\n`, stderr: "" };
}

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

  const blocked = await runOrchestratorRun({ initiative: "greenfield-scaffold", jobId: "afk-greenfield-scaffold-issue-001", maxSteps: 3, maxRuntimeSeconds: 300, allowPrCreate: true, disableAutoLand: true }, runner, cleanPreflight);
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blockers.join("\n"), /approval-ref/);
  assert.equal(calls.length, 0);

  const result = await runOrchestratorRun({ initiative: "greenfield-scaffold", jobId: "afk-greenfield-scaffold-issue-001", maxSteps: 3, maxRuntimeSeconds: 300, allowPrCreate: true, approvalRef: "human-123", disableAutoLand: true }, runner, cleanPreflight);
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


test("approved auto-land worker job creates PR, gates, merges, syncs main, and reports completion", async () => {
  const { runner, calls } = makeSequenceRunner([
    jsonResult({ runId: "worker-1", status: "review_ready", queueJobId: "job-1", nextOperatorAction: "worker ready" }),
    jsonResult({ runId: "pr-worker-1", status: "pr_created", pr: { url: "https://github.com/acme/repo/pull/1", number: 1 } }),
    jsonResult({ runId: "pr-worker-1", status: "gate_passed", pr: { url: "https://github.com/acme/repo/pull/1", number: 1, gateStatus: "passed" } }),
    jsonResult({ runId: "pr-worker-1", status: "gate_passed", lifecycle: { mergeReady: true }, pr: { url: "https://github.com/acme/repo/pull/1", number: 1 } }),
    jsonResult({ runId: "pr-worker-1", status: "merged", pr: { url: "https://github.com/acme/repo/pull/1", number: 1 }, merge: { mergeCommit: "abc123" } }),
    jsonResult({ runId: "pr-worker-1", status: "synced", pr: { url: "https://github.com/acme/repo/pull/1", number: 1 }, merge: { syncedMainSha: "def456" } }),
  ]);

  const result = await runOrchestratorRun({
    lane: "worker_job",
    initiative: "greenfield-scaffold",
    jobId: "job-1",
    maxSteps: 3,
    maxRuntimeSeconds: 300,
    allowPrCreate: true,
    autoLand: true,
    syncMain: true,
    approvalRef: "approval-123",
  }, runner, cleanPreflight);

  assert.equal(result.status, "completed");
  assert.equal(result.pr.created, true);
  assert.equal(result.pr.url, "https://github.com/acme/repo/pull/1");
  assert.equal(result.merge.attempted, true);
  assert.equal(result.merge.allowed, true);
  assert.equal(calls.length, 6);
  assert.equal(calls[0].command, "npm run harness:worker-execute -- run --initiative greenfield-scaffold --job-id job-1 --max-steps 3 --max-runtime-seconds 300 --no-stop-before-pr --allow-pr-create --approval-ref approval-123 --json");
  assert.equal(calls[1].command, "npm run harness:pr-lifecycle -- create --initiative greenfield-scaffold --worker-run-id worker-1 --run-id pr-worker-1 --json");
  assert.equal(calls[4].command, "npm run harness:pr-lifecycle -- merge --initiative greenfield-scaffold --run-id pr-worker-1 --allow-merge --approval-ref approval-123 --method squash --json");
  assert.equal(calls[5].command, "npm run harness:pr-lifecycle -- sync-main --initiative greenfield-scaffold --run-id pr-worker-1 --json");
});

test("auto-land requires approval and worker-job lane", async () => {
  const { runner } = makeRunner(jsonResult({}));

  assert.match((await runOrchestratorRun({ lane: "worker_job", initiative: "greenfield-scaffold", jobId: "job-1", maxSteps: 3, maxRuntimeSeconds: 300, autoLand: true }, runner, cleanPreflight)).blockers.join("\n"), /approval-ref/);
  assert.match((await runOrchestratorRun({ lane: "parallel_lanes", initiative: "greenfield-scaffold", maxSteps: 3, maxRuntimeSeconds: 300, maxParallel: 2, workerCommand: "npm test", autoLand: true, approvalRef: "approval-123" }, runner, cleanPreflight)).blockers.join("\n"), /worker_job/);
});


test("enabled default auto-land policy injects approved worker-job PR merge sync", async () => {
  const repoRoot = await makeRepoWithAutoLandPolicy({
    version: 1,
    enabled: true,
    lanes: ["worker_job"],
    approvalRef: "policy-approval-123",
    syncMain: true,
    mergeMethod: "squash",
  });
  const { runner, calls } = makeSequenceRunner([
    jsonResult({ runId: "worker-policy", status: "review_ready", queueJobId: "job-1" }),
    jsonResult({ runId: "pr-worker-policy", status: "pr_created", pr: { url: "https://github.com/acme/repo/pull/2", number: 2 } }),
    jsonResult({ runId: "pr-worker-policy", status: "gate_passed", pr: { url: "https://github.com/acme/repo/pull/2", number: 2, gateStatus: "passed" } }),
    jsonResult({ runId: "pr-worker-policy", status: "gate_passed", lifecycle: { mergeReady: true }, pr: { url: "https://github.com/acme/repo/pull/2", number: 2 } }),
    jsonResult({ runId: "pr-worker-policy", status: "merged", pr: { url: "https://github.com/acme/repo/pull/2", number: 2 }, merge: { mergeCommit: "abc123" } }),
    jsonResult({ runId: "pr-worker-policy", status: "synced", pr: { url: "https://github.com/acme/repo/pull/2", number: 2 }, merge: { syncedMainSha: "def456" } }),
  ]);

  const result = await runOrchestratorRun({
    repoRoot,
    lane: "worker_job",
    initiative: "greenfield-scaffold",
    jobId: "job-1",
    maxSteps: 3,
    maxRuntimeSeconds: 300,
  }, runner, cleanPreflight);

  assert.equal(result.status, "completed");
  assert.equal(result.autoLand?.enabled, true);
  assert.equal(result.autoLand?.syncedMain, true);
  assert.equal(calls[0].command, "npm run harness:worker-execute -- run --initiative greenfield-scaffold --job-id job-1 --max-steps 3 --max-runtime-seconds 300 --no-stop-before-pr --allow-pr-create --approval-ref policy-approval-123 --json");
  assert.equal(calls[4].command, "npm run harness:pr-lifecycle -- merge --initiative greenfield-scaffold --run-id pr-worker-policy --allow-merge --approval-ref policy-approval-123 --method squash --json");
});

test("default auto-land policy can be disabled for conservative worker job runs", async () => {
  const repoRoot = await makeRepoWithAutoLandPolicy({
    version: 1,
    enabled: true,
    lanes: ["worker_job"],
    approvalRef: "policy-approval-123",
    syncMain: true,
  });
  const { runner, calls } = makeRunner(jsonResult({ runId: "worker-disabled", status: "review_ready", queueJobId: "job-1" }));

  const result = await runOrchestratorRun({
    repoRoot,
    lane: "worker_job",
    initiative: "greenfield-scaffold",
    jobId: "job-1",
    maxSteps: 3,
    maxRuntimeSeconds: 300,
    disableAutoLand: true,
  }, runner, cleanPreflight);

  assert.equal(result.status, "stopped");
  assert.equal(result.autoLand, undefined);
  assert.equal(calls[0].command, "npm run harness:worker-execute -- run --initiative greenfield-scaffold --job-id job-1 --max-steps 3 --max-runtime-seconds 300 --stop-before-pr --json");
});

test("enabled default auto-land policy without approval ref blocks before delegation", async () => {
  const repoRoot = await makeRepoWithAutoLandPolicy({ version: 1, enabled: true, lanes: ["worker_job"], syncMain: true });
  const { runner, calls } = makeRunner(jsonResult({}));

  const result = await runOrchestratorRun({
    repoRoot,
    lane: "worker_job",
    initiative: "greenfield-scaffold",
    jobId: "job-1",
    maxSteps: 3,
    maxRuntimeSeconds: 300,
  }, runner, cleanPreflight);

  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /approval-ref/);
  assert.equal(calls.length, 0);
});

test("default preflight ignores generated initiative runtime run artifacts while still blocking other dirty files", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "orch-preflight-runtime-artifacts-"));
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const git = promisify(execFile);

  await git("git", ["init"], { cwd: repoRoot });
  await writeFile(join(repoRoot, "README.md"), "fixture\n", "utf8");
  await mkdir(join(repoRoot, "docs", "initiatives", "checkout"), { recursive: true });
  await writeFile(join(repoRoot, "docs", "initiatives", "checkout", "issues.json"), "{}\n", "utf8");
  await git("git", ["add", "README.md", "docs/initiatives/checkout/issues.json"], { cwd: repoRoot });
  await git("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"], { cwd: repoRoot });
  await mkdir(join(repoRoot, "docs", "initiatives", "checkout", "afk-runs"), { recursive: true });
  await writeFile(join(repoRoot, "docs", "initiatives", "checkout", "afk-runs", "run-001.json"), "{}\n", "utf8");

  assert.deepEqual(await defaultOrchestratorRunPreflight(repoRoot), { safe: true, blockers: [] });

  await writeFile(join(repoRoot, "dirty.txt"), "nope\n", "utf8");
  const blocked = await defaultOrchestratorRunPreflight(repoRoot);
  assert.equal(blocked.safe, false);
  assert.match(blocked.blockers.join("\n"), /dirty.txt/);
});
