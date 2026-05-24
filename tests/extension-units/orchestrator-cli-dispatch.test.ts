import assert from "node:assert/strict";
import test from "node:test";

import {
  ORCHESTRATE_COMMANDS,
  parseHarnessOrchestrateArgs,
} from "../../scripts/harness-orchestrate.ts";

const PUBLIC_COMMANDS = [
  "apply",
  "classify",
  "context",
  "continue",
  "dry-run",
  "evidence",
  "merge-apply",
  "merge-check",
  "run",
] as const;

test("orchestrator CLI registry exposes every public command", () => {
  assert.deepEqual(Object.keys(ORCHESTRATE_COMMANDS).sort(), [...PUBLIC_COMMANDS].sort());
  for (const command of PUBLIC_COMMANDS) {
    const definition = ORCHESTRATE_COMMANDS[command];
    assert.equal(definition.name, command);
    assert.equal(typeof definition.parse, "function");
    assert.equal(typeof definition.execute, "function");
  }
});

test("orchestrator CLI parser delegates representative command groups", () => {
  assert.deepEqual(parseHarnessOrchestrateArgs(["classify", "--goal", "plan cleanup", "--json"]), {
    command: "classify",
    goal: "plan cleanup",
    json: true,
  });

  assert.deepEqual(parseHarnessOrchestrateArgs(["context", "--initiative", "greenfield-scaffold", "--goal", "continue", "--json"]), {
    command: "context",
    initiative: "greenfield-scaffold",
    goal: "continue",
    json: true,
  });

  assert.deepEqual(parseHarnessOrchestrateArgs(["apply", "--path", "stitch_prompt", "--initiative", "checkout", "--slice", "slice-001", "--json"]), {
    command: "apply",
    path: "stitch_prompt",
    initiative: "checkout",
    sliceId: "slice-001",
    source: undefined,
    description: undefined,
    action: undefined,
    approvalRef: undefined,
    by: undefined,
    note: undefined,
    reason: undefined,
    json: true,
  });

  assert.deepEqual(parseHarnessOrchestrateArgs(["run", "--initiative", "greenfield-scaffold", "--job-id", "job-1", "--max-steps", "3", "--max-runtime-seconds", "300", "--auto-land", "--approval-ref", "human-1", "--sync-main", "--json"]), {
    command: "run",
    lane: undefined,
    initiative: "greenfield-scaffold",
    jobId: "job-1",
    maxSteps: 3,
    maxRuntimeSeconds: 300,
    maxParallel: undefined,
    workerCommand: undefined,
    allowPrCreate: false,
    autoLand: true,
    disableAutoLand: false,
    syncMain: true,
    mergeMethod: undefined,
    approvalRef: "human-1",
    json: true,
  });

  assert.deepEqual(parseHarnessOrchestrateArgs(["continue", "--initiative", "greenfield-scaffold", "--max-slices", "1", "--max-steps", "3", "--max-runtime-seconds", "300", "--no-auto-land", "--json"]), {
    command: "continue",
    initiative: "greenfield-scaffold",
    maxSlices: 1,
    maxParallel: undefined,
    maxSteps: 3,
    maxRuntimeSeconds: 300,
    autoLand: false,
    disableAutoLand: true,
    syncMain: undefined,
    mergeMethod: undefined,
    approvalRef: undefined,
    json: true,
  });

  assert.deepEqual(parseHarnessOrchestrateArgs(["evidence", "--initiative", "greenfield-scaffold", "--run-id", "run-1", "--write-report", "--json"]), {
    command: "evidence",
    initiative: "greenfield-scaffold",
    runId: "run-1",
    lifecycleEvidence: undefined,
    codingLog: undefined,
    writeReport: true,
    json: true,
  });

  assert.deepEqual(parseHarnessOrchestrateArgs(["merge-check", "--pr", "123", "--method", "squash", "--json"]), {
    command: "merge-check",
    pr: "123",
    method: "squash",
    lifecycleEvidence: undefined,
    approvalRef: undefined,
    json: true,
  });
});

test("orchestrator CLI parser rejects unsafe legacy verbs", () => {
  for (const command of ["create", "merge", "sync-main", "git"]) {
    assert.throws(() => parseHarnessOrchestrateArgs([command]), /not supported|raw git/i);
  }
  assert.throws(
    () => parseHarnessOrchestrateArgs(["run", "--initiative", "greenfield-scaffold", "--apply"]),
    /not supported by harness-orchestrate run/,
  );
  assert.throws(
    () => parseHarnessOrchestrateArgs(["apply", "--path", "stitch_prompt", "--initiative", "checkout", "--slice", "slice-001", "--command", "npm run harness:merge"]),
    /generic command strings are not accepted/i,
  );
});
