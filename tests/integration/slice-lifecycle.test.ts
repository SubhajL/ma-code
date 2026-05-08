import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

import { copyFixtureRepoFile, makeTempRepo } from "../extension-units/test-utils.ts";

const execFileAsync = promisify(execFile);
const CLI = join(process.cwd(), "scripts", "harness-slice-lifecycle.ts");
const TSX_IMPORT = process.env.TSX_IMPORT_PATH ?? join(process.cwd(), "node_modules", "tsx", "dist", "loader.mjs");

async function seedRepo(codingLog: string, planningLog = `# Plan\n\n## Acceptance Criteria\n- Lifecycle assessment works.\n\n## TDD Slice\n- first tracer behavior.\n`, tasks: unknown = {
  activeTaskId: "task-1",
  tasks: [
    {
      id: "task-1",
      status: "review",
      taskClass: "implementation",
      acceptance: ["Lifecycle assessment works"],
      validation: { decision: "pass", source: "validator" },
    },
  ],
}) {
  const cwd = await makeTempRepo("slice-lifecycle-integration-");
  for (const dir of [".pi/agent/lifecycle", ".pi/agent/state/runtime", "logs/coding", "reports/planning"]) {
    await mkdir(join(cwd, dir), { recursive: true });
  }
  await copyFixtureRepoFile(cwd, ".pi/agent/lifecycle/slice-lifecycle-policy.json");
  await writeFile(join(cwd, "logs", "CURRENT.md"), "# Current Harness Logs\n\n## Current coding log\n- `logs/coding/current.md`\n\n## Current planning log\n- `reports/planning/current-plan.md`\n");
  await writeFile(join(cwd, "logs", "coding", "current.md"), codingLog);
  await writeFile(join(cwd, "reports", "planning", "current-plan.md"), planningLog);
  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"), `${JSON.stringify(tasks, null, 2)}\n`);
  return cwd;
}

const completeCodingEvidence = `# Coding\n\n### RED Evidence\n- Command: node --import tsx --test tests/extension-units/slice-lifecycle.test.ts\n- Failure: missing helper.\n\n### GREEN Evidence\n- Command: node --import tsx --test tests/extension-units/slice-lifecycle.test.ts\n- Result: pass.\n\n## Review (2026-05-07) - working-tree\n\n### Findings\nCRITICAL\n- none\n\nHIGH\n- none\n\nReview Verdict: no_required_fixes\n`;

test("CLI check reports create_ready for planning, RED/GREEN, and g-check evidence", async () => {
  const cwd = await seedRepo(completeCodingEvidence);
  const { stdout } = await execFileAsync(process.execPath, ["--import", TSX_IMPORT, CLI, "check", "--stage", "create_ready", "--json"], { cwd });
  const parsed = JSON.parse(stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.assessment.currentStage, "create_ready");
  assert.equal(parsed.assessment.target.ready, true);
});

test("CLI check blocks create_ready when GREEN evidence is missing", async () => {
  const cwd = await seedRepo(completeCodingEvidence.replace(/### GREEN Evidence[\s\S]*?## Review/, "## Review"));
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", TSX_IMPORT, CLI, "check", "--stage", "create_ready", "--json"], { cwd }),
    (error: unknown) => {
      const stdout = (error as { stdout?: string }).stdout ?? "";
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.ok, false);
      assert.ok(parsed.assessment.missingPrerequisites.includes("coding_green"));
      return true;
    },
  );
});

test("CLI check blocks create_ready when g-check evidence is missing", async () => {
  const cwd = await seedRepo(completeCodingEvidence.replace(/## Review[\s\S]*/, ""));
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", TSX_IMPORT, CLI, "check", "--stage", "create_ready", "--json"], { cwd }),
    (error: unknown) => {
      const stdout = (error as { stdout?: string }).stdout ?? "";
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.ok, false);
      assert.ok(parsed.assessment.missingPrerequisites.includes("checked"));
      return true;
    },
  );
});

test("submit plus PR-gate evidence reaches merge_ready", async () => {
  const cwd = await seedRepo(`${completeCodingEvidence}\n\n## Creation\n- Branch: split/example\n- Commit: abc123\n\n## Submission\n- PR URL: https://github.com/example/repo/pull/12\n- State: OPEN\n\n## PR Gate\n- mergeStateStatus CLEAN\n- Checks: passing\n`);
  const { stdout } = await execFileAsync(process.execPath, ["--import", TSX_IMPORT, CLI, "status", "--json"], { cwd });
  const parsed = JSON.parse(stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.assessment.currentStage, "merge_ready");
});

test("explicit merge and sync evidence can satisfy local_main_synced", async () => {
  const cwd = await seedRepo(`${completeCodingEvidence}\n\n## Creation\n- Branch: split/example\n- Commit: abc123\n\n## Submission\n- PR URL: https://github.com/example/repo/pull/12\n- State: MERGED\n\n## PR Gate\n- mergeStateStatus CLEAN\n- Checks: passing\n\n## Merge\n- PR #12: MERGED\n- merge commit: def456\n\n## Sync Main\n- local main equals origin/main\n- ahead/behind: 0 0\n`);
  const { stdout } = await execFileAsync(process.execPath, ["--import", TSX_IMPORT, CLI, "check", "--stage", "local_main_synced", "--json"], { cwd });
  const parsed = JSON.parse(stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.assessment.currentStage, "local_main_synced");
});

test("CLI check can consume lifecycle evidence bundle for merge_ready", async () => {
  const cwd = await makeTempRepo("slice-lifecycle-cli-evidence-");
  await mkdir(join(cwd, ".pi", "agent", "lifecycle"), { recursive: true });
  await mkdir(join(cwd, "reports", "lifecycle"), { recursive: true });
  await copyFixtureRepoFile(cwd, ".pi/agent/lifecycle/slice-lifecycle-policy.json");
  await writeFile(join(cwd, "reports", "lifecycle", "task-123.merge-evidence.json"), `${JSON.stringify({
    version: 1,
    taskId: "task-123",
    directImplementationExemption: true,
    planning: { acceptanceCriteria: ["CLI consumes lifecycle evidence"], tddSlice: "CLI evidence tracer" },
    task: { acceptanceCriteria: ["CLI consumes lifecycle evidence"], validationDecision: "pass" },
    redGreenEvidence: { red: true, green: true },
    review: { verdict: "no_required_fixes" },
    creation: { branch: "split/task-123", commit: "abc123" },
    pr: { url: "https://github.com/example/repo/pull/123", state: "OPEN" },
    prGate: { status: "pass", mergeStateStatus: "CLEAN" },
  }, null, 2)}\n`, "utf8");

  const { stdout } = await execFileAsync(process.execPath, ["--import", TSX_IMPORT, CLI, "check", "--stage", "merge_ready", "--evidence-file", "reports/lifecycle/task-123.merge-evidence.json", "--json"], { cwd });
  const parsed = JSON.parse(stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.assessment.currentStage, "merge_ready");
  assert.match(parsed.assessment.evidence.lifecycleEvidencePath, /task-123\.merge-evidence\.json$/);
});
