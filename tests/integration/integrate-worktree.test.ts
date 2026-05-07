import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { readExecutionLeaseState } from "../../.pi/agent/extensions/execution-leases.ts";
import { integrateHarnessWorktree } from "../../scripts/harness-integrate.ts";
import { createHarnessWorktree } from "../../scripts/harness-worktree.ts";
import { makeTempRepo } from "../extension-units/test-utils.ts";

const execFile = promisify(execFileCallback);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFile("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.stdout.trim();
}

async function initGitRepo(prefix: string): Promise<string> {
  const cwd = await makeTempRepo(prefix);
  await runGit(cwd, ["init", "-b", "main"]);
  await runGit(cwd, ["config", "user.name", "Pi Harness Tests"]);
  await runGit(cwd, ["config", "user.email", "pi-harness-tests@example.com"]);
  await writeFile(join(cwd, "README.md"), "# temp repo\n", "utf8");
  await runGit(cwd, ["add", "README.md"]);
  await runGit(cwd, ["commit", "-m", "initial commit"]);
  return cwd;
}

test("integration helper fast-forwards main from a clean linked worktree and tolerates generated validation artifacts", async () => {
  const repoRoot = await initGitRepo("integrate-worktree-");
  const created = await createHarnessWorktree({
    repoRoot,
    id: "HARNESS-070",
    slug: "integration helper",
    baseRef: "main",
  });

  await writeFile(join(created.worktreePath, "notes.txt"), "merge me\n", "utf8");
  await runGit(created.worktreePath, ["add", "notes.txt"]);
  await runGit(created.worktreePath, ["commit", "-m", "feature commit"]);
  const sourceHead = await runGit(created.worktreePath, ["rev-parse", "HEAD"]);

  await mkdir(join(repoRoot, "reports", "validation"), { recursive: true });
  await writeFile(join(repoRoot, "reports", "validation", "2026-05-07_core-workflows-validation-script.md"), "generated\n", "utf8");
  await writeFile(join(repoRoot, "reports", "validation", "2026-05-07_core-workflows-validation-script.json"), "{}\n", "utf8");

  const result = await integrateHarnessWorktree({
    repoRoot,
    sourceWorktreePath: created.worktreePath,
    runPostMergeValidation: false,
  });

  assert.equal(result.status, "merged");
  assert.equal(result.sourceBranch, created.branchName);
  assert.equal(result.sourceHead, sourceHead);
  assert.equal(await runGit(repoRoot, ["rev-parse", "HEAD"]), sourceHead);
  assert.deepEqual(result.toleratedUntrackedArtifacts.sort(), [
    "reports/validation/2026-05-07_core-workflows-validation-script.json",
    "reports/validation/2026-05-07_core-workflows-validation-script.md",
  ]);
  assert.equal((await readExecutionLeaseState(repoRoot)).leases.length, 0);
});

test("integration helper succeeds as already_current when source worktree is clean and already merged", async () => {
  const repoRoot = await initGitRepo("integrate-worktree-current-");
  const created = await createHarnessWorktree({
    repoRoot,
    id: "HARNESS-074",
    slug: "already current",
    baseRef: "main",
  });

  const result = await integrateHarnessWorktree({
    repoRoot,
    sourceWorktreePath: created.worktreePath,
    runPostMergeValidation: false,
  });

  assert.equal(result.status, "already_current");
  assert.equal(result.beforeHead, result.afterHead);
});

test("integration helper blocks when root main has dirty tracked files", async () => {
  const repoRoot = await initGitRepo("integrate-worktree-dirty-");
  const created = await createHarnessWorktree({
    repoRoot,
    id: "HARNESS-071",
    slug: "dirty root",
    baseRef: "main",
  });

  await writeFile(join(created.worktreePath, "notes.txt"), "merge me\n", "utf8");
  await runGit(created.worktreePath, ["add", "notes.txt"]);
  await runGit(created.worktreePath, ["commit", "-m", "feature commit"]);
  await writeFile(join(repoRoot, "README.md"), "# dirty root\n", "utf8");

  await assert.rejects(
    integrateHarnessWorktree({ repoRoot, sourceWorktreePath: created.worktreePath, runPostMergeValidation: false }),
    /tracked dirt/i,
  );
});

test("integration helper blocks when source branch is not a fast-forward of main", async () => {
  const repoRoot = await initGitRepo("integrate-worktree-nonff-");
  const created = await createHarnessWorktree({
    repoRoot,
    id: "HARNESS-073",
    slug: "non ff",
    baseRef: "main",
  });

  await writeFile(join(created.worktreePath, "notes.txt"), "feature\n", "utf8");
  await runGit(created.worktreePath, ["add", "notes.txt"]);
  await runGit(created.worktreePath, ["commit", "-m", "feature commit"]);
  await writeFile(join(repoRoot, "main-only.txt"), "main moves too\n", "utf8");
  await runGit(repoRoot, ["add", "main-only.txt"]);
  await runGit(repoRoot, ["commit", "-m", "main commit"]);

  await assert.rejects(
    integrateHarnessWorktree({ repoRoot, sourceWorktreePath: created.worktreePath, runPostMergeValidation: false }),
    /not a fast-forward/i,
  );
});

test("integration helper blocks when source worktree is not merge-ready", async () => {
  const repoRoot = await initGitRepo("integrate-worktree-unready-");
  const created = await createHarnessWorktree({
    repoRoot,
    id: "HARNESS-072",
    slug: "unready lane",
    baseRef: "main",
  });

  await writeFile(join(created.worktreePath, "draft.txt"), "dirty feature\n", "utf8");

  await assert.rejects(
    integrateHarnessWorktree({ repoRoot, sourceWorktreePath: created.worktreePath, runPostMergeValidation: false }),
    /merge-ready|uncommitted|dirty/i,
  );
});
