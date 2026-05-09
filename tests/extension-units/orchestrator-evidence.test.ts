import assert from "node:assert/strict";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";

import {
  collectOrchestratorEvidence,
  runOrchestratorMergeApply,
  runOrchestratorMergeCheck,
  assertNoRawGitMergeCommand,
  type DelegatedMergeCall,
  type DelegatedMergeResult,
} from "../../.pi/agent/extensions/orchestrator-evidence.ts";

async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-evidence-"));
  await mkdir(join(root, "docs/initiatives/checkout/worker-runs"), { recursive: true });
  await mkdir(join(root, "docs/initiatives/checkout/pr-runs"), { recursive: true });
  await mkdir(join(root, "reports/lifecycle"), { recursive: true });
  await mkdir(join(root, "logs/coding"), { recursive: true });
  await writeFile(join(root, "logs/CURRENT.md"), "# Current Harness Logs\n\n## Current coding log\n- `logs/coding/fixture.md`\n", "utf8");
  await writeFile(join(root, "logs/coding/fixture.md"), "# fixture\n\nRED: failed first\nGREEN: passed after fix\nReview Verdict: no_required_fixes\n", "utf8");
  await writeFile(
    join(root, "docs/initiatives/checkout/worker-runs/worker-123.json"),
    JSON.stringify({ runId: "worker-123", selectedPath: "worker_job", delegatedCommand: "npm run harness:worker-execute -- run --initiative checkout --json", status: "review_ready", artifactPath: "docs/initiatives/checkout/worker-runs/worker-123.json" }, null, 2),
    "utf8",
  );
  await writeFile(
    join(root, "docs/initiatives/checkout/pr-runs/pr-123.json"),
    JSON.stringify({ runId: "pr-123", pr: 123, status: "gate_pass", delegatedCommands: ["npm run harness:pr-lifecycle -- gate --pr 123 --json"], prGate: { finalStatus: "pass", mergeStateStatus: "CLEAN" } }, null, 2),
    "utf8",
  );
  await writeFile(
    join(root, "reports/lifecycle/task-123.merge-evidence.json"),
    JSON.stringify({ version: 1, taskId: "task-123", runId: "fixture", lifecycle: { currentStage: "merge_ready" }, prGate: { finalStatus: "pass" } }, null, 2),
    "utf8",
  );
  return root;
}

function mergeRunner(results: DelegatedMergeResult[], calls: DelegatedMergeCall[] = []) {
  return {
    calls,
    runner: async (call: DelegatedMergeCall): Promise<DelegatedMergeResult> => {
      calls.push(call);
      const result = results.shift();
      if (!result) throw new Error("unexpected merge helper call");
      return result;
    },
  };
}

test("aggregates initiative, lifecycle, coding-log, delegated-command, and next-action evidence", async () => {
  const repoRoot = await fixtureRepo();

  const summary = await collectOrchestratorEvidence({ repoRoot, initiative: "checkout", runId: "fixture", lifecycleEvidence: "reports/lifecycle/task-123.merge-evidence.json" });

  assert.equal(summary.version, 1);
  assert.equal(summary.mode, "evidence");
  assert.equal(summary.selectedPath, "worker_job");
  assert.equal(summary.merge.defaultStopBeforeMerge, true);
  assert.equal(summary.merge.attempted, false);
  assert.equal(summary.merge.delegatedOnlyToHarnessMerge, true);
  assert.equal(summary.merge.rawGitMergeUsed, false);
  assert.match(summary.nextSafeAction, /harness:merge check/);
  assert.deepEqual(summary.blockers, []);
  assert.ok(summary.consumedEvidence.initiativeRuns.some((path) => path.endsWith("worker-runs/worker-123.json")));
  assert.ok(summary.consumedEvidence.initiativeRuns.some((path) => path.endsWith("pr-runs/pr-123.json")));
  assert.equal(summary.consumedEvidence.lifecycleEvidence, "reports/lifecycle/task-123.merge-evidence.json");
  assert.equal(summary.consumedEvidence.codingLog, "logs/coding/fixture.md");
  assert.equal(summary.consumedEvidence.reviewVerdict, "no_required_fixes");
  assert.equal(summary.consumedEvidence.prGate?.status, "pass");
  assert.ok(summary.delegatedCommands.some((entry) => entry.command.includes("harness:worker-execute")));
});

test("missing lifecycle or review evidence blocks merge readiness", async () => {
  const repoRoot = await fixtureRepo();
  await writeFile(join(repoRoot, "logs/coding/fixture.md"), "# fixture\nGREEN: yes\n", "utf8");
  await unlink(join(repoRoot, "reports/lifecycle/task-123.merge-evidence.json"));

  const summary = await collectOrchestratorEvidence({ repoRoot, initiative: "checkout", runId: "fixture" });

  assert.equal(summary.status, "blocked");
  assert.match(summary.blockers.join("\n"), /lifecycle evidence/i);
  assert.match(summary.blockers.join("\n"), /Review Verdict/i);
  assert.match(summary.nextSafeAction, /fix evidence/i);
});

test("merge-check delegates only to harness:merge check and stops before merge", async () => {
  const { runner, calls } = mergeRunner([{ exitCode: 0, stdout: JSON.stringify({ readiness: { ready: true, blockers: [] } }), stderr: "" }]);

  const result = await runOrchestratorMergeCheck({ pr: 123, method: "squash", lifecycleEvidence: "reports/lifecycle/task-123.json" }, runner);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm run harness:merge -- check --pr 123 --method squash --lifecycle-evidence reports/lifecycle/task-123.json --json");
  assert.equal(result.mode, "merge_check");
  assert.equal(result.consumedEvidence.mergeHelper?.checkReady, true);
  assert.equal(result.merge.attempted, false);
  assert.equal(result.nextSafeAction, "harness:merge apply --pr 123 --method squash");
});

test("merge-apply requires approval, checks before apply, and blocks failed checks", async () => {
  const missingApproval = await runOrchestratorMergeApply({ pr: 123, method: "squash", lifecycleEvidence: "reports/lifecycle/task-123.json" }, async () => {
    throw new Error("should not delegate without approval");
  });
  assert.equal(missingApproval.status, "blocked");
  assert.match(missingApproval.blockers.join("\n"), /approval-ref/);

  const blockedRunner = mergeRunner([{ exitCode: 1, stdout: JSON.stringify({ readiness: { ready: false, blockers: ["PR gate must be pass"] } }), stderr: "" }]);
  const blocked = await runOrchestratorMergeApply({ pr: 123, method: "squash", approvalRef: "human-123", lifecycleEvidence: "reports/lifecycle/task-123.json" }, blockedRunner.runner);
  assert.equal(blocked.status, "blocked");
  assert.equal(blockedRunner.calls.length, 1);
  assert.match(blocked.blockers.join("\n"), /PR gate/);

  const okRunner = mergeRunner([
    { exitCode: 0, stdout: JSON.stringify({ readiness: { ready: true, blockers: [] } }), stderr: "" },
    { exitCode: 0, stdout: JSON.stringify({ status: "merged", readiness: { ready: true, blockers: [] } }), stderr: "" },
  ]);
  const ok = await runOrchestratorMergeApply({ pr: 123, method: "squash", approvalRef: "human-123", lifecycleEvidence: "reports/lifecycle/task-123.json" }, okRunner.runner);
  assert.equal(ok.status, "merged");
  assert.equal(ok.approval.approvalRef, "human-123");
  assert.deepEqual(okRunner.calls.map((call) => call.command), [
    "npm run harness:merge -- check --pr 123 --method squash --lifecycle-evidence reports/lifecycle/task-123.json --json",
    "npm run harness:merge -- apply --pr 123 --method squash --lifecycle-evidence reports/lifecycle/task-123.json --json",
  ]);
});

test("rejects raw git merge commands", () => {
  assert.throws(() => assertNoRawGitMergeCommand("git merge origin/main"), /raw git merge/i);
  assert.throws(() => assertNoRawGitMergeCommand("npm run harness:merge -- apply --pr 1 --method squash && git merge main"), /raw git merge/i);
  assert.doesNotThrow(() => assertNoRawGitMergeCommand("npm run harness:merge -- check --pr 1 --json"));
});
