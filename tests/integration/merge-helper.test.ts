import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { applyMerge, buildMergeReadiness, type MergePrDetails } from "../../scripts/harness-merge.ts";
import { makeTempRepo, copyFixtureRepoFile } from "../extension-units/test-utils.ts";
import type { CommandRunner } from "../../scripts/harness-pr-gate.ts";

const execFile = promisify(execFileCallback);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFile("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.stdout.trim();
}

async function setupMergeRepo(prefix: string, lifecycleReady: boolean): Promise<string> {
  const cwd = await makeTempRepo(prefix);
  await runGit(cwd, ["init", "-b", "main"]);
  await runGit(cwd, ["config", "user.name", "Pi Harness Tests"]);
  await runGit(cwd, ["config", "user.email", "pi-harness-tests@example.com"]);
  await copyFixtureRepoFile(cwd, ".pi/agent/lifecycle/slice-lifecycle-policy.json");
  await copyFixtureRepoFile(cwd, ".pi/agent/release/merge-release-policy.json");
  await mkdir(join(cwd, "logs", "coding"), { recursive: true });
  await mkdir(join(cwd, "reports", "planning"), { recursive: true });
  await writeFile(join(cwd, "README.md"), "# merge helper fixture\n", "utf8");
  await writeFile(join(cwd, "reports", "planning", "phase-8-plan.md"), "# Plan\n\n## Acceptance Criteria\n- TDD implementation plan.\n", "utf8");
  await writeFile(
    join(cwd, "logs", "CURRENT.md"),
    "# Current Harness Logs\n\n## Current coding log\n- `logs/coding/phase-8.md`\n\n## Current planning log\n- `reports/planning/phase-8-plan.md`\n",
    "utf8",
  );
  await writeFile(
    join(cwd, "logs", "coding", "phase-8.md"),
    lifecycleReady
      ? `# Coding\n\n### RED Evidence\n- Command: node --import tsx --test tests/extension-units/merge-helper.test.ts\n- Failure: helper missing.\n\n### GREEN Evidence\n- Command: node --import tsx --test tests/extension-units/merge-helper.test.ts\n- Result: pass.\n\n## Review (2026-05-07) - working-tree\n\n### Findings\nCRITICAL\n- none\n\nHIGH\n- none\n\nReview Verdict: no_required_fixes\n\n## Creation / Submission (g-create/g-submit)\n- Commit: abc123 feat(merge): helper\n- PR: https://github.com/example/repo/pull/101\n\n## PR Gate\n- mergeStateStatus: CLEAN\n- Checks: pass\n`
      : `# Coding\n\n## Creation / Submission (g-create/g-submit)\n- PR: https://github.com/example/repo/pull/101\n`,
    "utf8",
  );
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"),
    JSON.stringify({
      version: 1,
      activeTaskId: "task-merge",
      tasks: [{ id: "task-merge", status: lifecycleReady ? "review" : "in_progress", acceptance: ["merge helper ready"], validation: { decision: lifecycleReady ? "pass" : "pending" } }],
    }),
    "utf8",
  );
  await runGit(cwd, ["add", "."]);
  await runGit(cwd, ["commit", "-m", "fixture"]);
  return cwd;
}

function fakeRunner(pr: Partial<MergePrDetails> = {}, checks: Array<Record<string, string>> = [{ name: "CI", state: "SUCCESS" }]): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  const details = {
    number: 101,
    url: "https://github.com/example/repo/pull/101",
    state: "OPEN",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    reviews: [],
    comments: [],
    headRefName: "feature/merge-helper",
    baseRefName: "main",
    ...pr,
  };
  const runner: CommandRunner = async (command, args) => {
    calls.push([command, ...args]);
    assert.equal(command, "gh");
    assert.equal(args.includes("--watch"), false);
    if (args[0] === "pr" && args[1] === "checks") return { stdout: JSON.stringify(checks), stderr: "", code: 0 };
    if (args[0] === "pr" && args[1] === "view") return { stdout: JSON.stringify(details), stderr: "", code: 0 };
    if (args[0] === "pr" && args[1] === "merge") return { stdout: "merged", stderr: "", code: 0 };
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  return { runner, calls };
}

test("check reports blocked when lifecycle readiness is missing", async () => {
  const cwd = await setupMergeRepo("merge-helper-blocked-", false);
  const { runner } = fakeRunner();

  const result = await buildMergeReadiness({ pr: "101", repoRoot: cwd, mode: "check" }, { runner });

  assert.equal(result.readiness.ready, false);
  assert.match(result.readiness.blockers.join("\n"), /lifecycle.*merge_ready/i);
});

test("check reports ready when lifecycle and PR gate preconditions pass", async () => {
  const cwd = await setupMergeRepo("merge-helper-ready-", true);
  const { runner } = fakeRunner();

  const result = await buildMergeReadiness({ pr: "101", repoRoot: cwd, mode: "check" }, { runner });

  assert.equal(result.readiness.ready, true);
  assert.equal(result.readiness.recommendedNextAction, "ready_for_manual_merge");
});

test("apply blocks dirty local state before merge", async () => {
  const cwd = await setupMergeRepo("merge-helper-dirty-", true);
  await writeFile(join(cwd, "README.md"), "# dirty\n", "utf8");
  const { runner, calls } = fakeRunner();

  const result = await applyMerge({ pr: "101", repoRoot: cwd }, { runner });

  assert.equal(result.status, "blocked");
  assert.match(result.readiness.blockers.join("\n"), /local repo dirty/i);
  assert.equal(calls.some((call) => call[1] === "pr" && call[2] === "merge"), false);
});

test("apply succeeds only when policy passes and sync-main is explicit", async () => {
  const cwd = await setupMergeRepo("merge-helper-apply-", true);
  const { runner, calls } = fakeRunner();
  let syncCalls = 0;

  const result = await applyMerge(
    { pr: "101", repoRoot: cwd, method: "squash", syncMain: true },
    {
      runner,
      syncLocalMainFn: async () => {
        syncCalls += 1;
        return {
          repoRoot: cwd,
          remote: "origin",
          branch: "main",
          status: "already_current",
          beforeHead: "abc",
          remoteHead: "abc",
          afterHead: "abc",
          dirtyTrackedFiles: [],
          preservedLocalBookkeeping: [],
        };
      },
    },
  );

  assert.equal(result.status, "merged");
  assert.equal(syncCalls, 1);
  assert.equal(calls.some((call) => call.join(" ").includes("pr merge 101 --squash")), true);
});

test("apply without --sync-main does not run sync-main", async () => {
  const cwd = await setupMergeRepo("merge-helper-no-sync-", true);
  const { runner } = fakeRunner();
  let syncCalls = 0;

  const result = await applyMerge(
    { pr: "101", repoRoot: cwd, method: "squash", syncMain: false },
    { runner, syncLocalMainFn: async () => { syncCalls += 1; throw new Error("sync should not run"); } },
  );

  assert.equal(result.status, "merged");
  assert.equal(syncCalls, 0);
  assert.equal(result.syncMain, undefined);
});
