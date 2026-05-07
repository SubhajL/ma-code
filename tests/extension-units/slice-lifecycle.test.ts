import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assessSliceLifecycle, loadLifecyclePolicy, stageMeetsOrExceeds } from "../../.pi/agent/extensions/slice-lifecycle.ts";
import { makeTempRepo, copyFixtureRepoFile } from "./test-utils.ts";

async function seedLifecycleRepo(options: {
  codingLog?: string;
  planningLog?: string;
  tasks?: unknown;
} = {}) {
  const cwd = await makeTempRepo("slice-lifecycle-unit-");
  await mkdir(join(cwd, ".pi", "agent", "lifecycle"), { recursive: true });
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  await mkdir(join(cwd, "logs", "coding"), { recursive: true });
  await mkdir(join(cwd, "reports", "planning"), { recursive: true });
  await copyFixtureRepoFile(cwd, ".pi/agent/lifecycle/slice-lifecycle-policy.json");
  await writeFile(
    join(cwd, "logs", "CURRENT.md"),
    [
      "# Current Harness Logs",
      "",
      "## Current coding log",
      "- `logs/coding/phase-6.md`",
      "",
      "## Current planning log",
      "- `reports/planning/phase-6-plan.md`",
      "",
    ].join("\n"),
  );
  await writeFile(join(cwd, "logs", "coding", "phase-6.md"), options.codingLog ?? "");
  await writeFile(join(cwd, "reports", "planning", "phase-6-plan.md"), options.planningLog ?? "");
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"),
    JSON.stringify(options.tasks ?? { activeTaskId: "task-1", tasks: [] }, null, 2),
  );
  return cwd;
}

const planningLog = `# Plan\n\n## Acceptance Criteria\n- A lifecycle helper can assess create readiness.\n\n## TDD Slice\n- first behavior is lifecycle classification.\n`;
const codingLog = `# Coding\n\n### RED Evidence\n- Command: node --import tsx --test tests/extension-units/slice-lifecycle.test.ts\n- Failure: helper missing.\n\n### GREEN Evidence\n- Command: node --import tsx --test tests/extension-units/slice-lifecycle.test.ts\n- Result: pass.\n\n## Review (2026-05-07) - working-tree\n\n### Findings\nCRITICAL\n- none\n\nReview Verdict: no_required_fixes\n`;
const validatedTaskState = {
  activeTaskId: "task-1",
  tasks: [
    {
      id: "task-1",
      title: "Implement lifecycle helper",
      status: "review",
      taskClass: "implementation",
      acceptance: ["Classifies lifecycle stage"],
      validation: { decision: "pass", source: "validator" },
      evidence: ["Changed files: .pi/agent/extensions/slice-lifecycle.ts"],
    },
  ],
};

test("lifecycle policy parses ordered checkpoints", async () => {
  const cwd = await seedLifecycleRepo();
  const policy = await loadLifecyclePolicy(cwd);

  assert.equal(policy.version, 1);
  assert.deepEqual(policy.checkpoints.slice(0, 4).map((stage) => stage.name), [
    "intake_required",
    "planning_ready",
    "task_ready",
    "coding_red",
  ]);
  assert.equal(policy.checkpoints.at(-1)?.name, "local_main_synced");
});

test("stage ordering treats later checkpoints as satisfying earlier readiness", () => {
  assert.equal(stageMeetsOrExceeds("create_ready", "coding_green"), true);
  assert.equal(stageMeetsOrExceeds("checked", "merge_ready"), false);
});

test("planning plus RED/GREEN plus g-check plus validated task is create_ready", async () => {
  const cwd = await seedLifecycleRepo({ planningLog, codingLog, tasks: validatedTaskState });
  const assessment = await assessSliceLifecycle({ cwd, targetStage: "create_ready" });

  assert.equal(assessment.currentStage, "create_ready");
  assert.equal(assessment.target?.ready, true);
  assert.deepEqual(assessment.blockingGaps, []);
  assert.ok(assessment.evidence.planningLogPath?.endsWith("reports/planning/phase-6-plan.md"));
  assert.equal(assessment.evidence.redGreenEvidence.green, true);
  assert.equal(assessment.evidence.reviewVerdict, "no_required_fixes");
});

test("missing g-check evidence blocks create_ready and reports prerequisite", async () => {
  const cwd = await seedLifecycleRepo({
    planningLog,
    tasks: validatedTaskState,
    codingLog: codingLog.replace(/## Review[\s\S]*/, ""),
  });
  const assessment = await assessSliceLifecycle({ cwd, targetStage: "create_ready" });

  assert.equal(assessment.target?.ready, false);
  assert.ok(assessment.missingPrerequisites.includes("checked"));
  assert.ok(assessment.blockingGaps.some((gap) => gap.includes("g-check")));
});


test("plain coding-log branch metadata does not count as created evidence", async () => {
  const cwd = await seedLifecycleRepo({
    planningLog,
    tasks: validatedTaskState,
    codingLog: `# Coding\n\n- Branch: split/example\n\n${codingLog}`,
  });
  const assessment = await assessSliceLifecycle({ cwd });

  assert.equal(assessment.currentStage, "create_ready");
  assert.equal(assessment.evidence.created, false);
});

test("explicit PR and sync evidence can recognize later lightweight stages", async () => {
  const cwd = await seedLifecycleRepo({
    planningLog,
    tasks: validatedTaskState,
    codingLog: `${codingLog}\n\n## Creation\n- Branch: split/example\n- Commit: abc123\n\n## Submission\n- PR URL: https://github.com/example/repo/pull/1\n- State: OPEN\n\n## PR Gate\n- mergeStateStatus CLEAN\n- Checks: pass\n\n## Merge\n- PR #1: MERGED\n- merge commit: def456\n\n## Sync Main\n- local main equals origin/main\n- ahead/behind: 0 0\n`,
  });
  const assessment = await assessSliceLifecycle({ cwd, targetStage: "local_main_synced" });

  assert.equal(assessment.currentStage, "local_main_synced");
  assert.equal(assessment.target?.ready, true);
  assert.equal(assessment.evidence.pr.url, "https://github.com/example/repo/pull/1");
});
