import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildHarnessBranchName,
  buildHarnessWorktreePath,
  buildHarnessWorktreeReviewPrep,
  cleanupHarnessWorktree,
  createHarnessWorktree,
  inspectHarnessWorktrees,
} from "../../scripts/harness-worktree.ts";
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

test("worktree helper creates, inspects, prepares review, and cleans up a bounded worktree", async () => {
  const repoRoot = await initGitRepo("worktree-helper-");

  assert.equal(
    buildHarnessBranchName({ id: "HARNESS-024", slug: "Worktree helpers" }),
    "split/harness-024-worktree-helpers",
  );
  assert.match(buildHarnessWorktreePath({ repoRoot, id: "HARNESS-024", slug: "Worktree helpers" }), /harness-024-worktree-helpers$/);

  const created = await createHarnessWorktree({
    repoRoot,
    id: "HARNESS-024",
    slug: "Worktree helpers",
    baseRef: "main",
  });

  assert.equal(created.branchName, "split/harness-024-worktree-helpers");
  assert.equal(await runGit(created.worktreePath, ["branch", "--show-current"]), created.branchName);

  const inspected = await inspectHarnessWorktrees({ repoRoot });
  const resolvedWorktreePath = resolve(created.worktreePath);
  assert.equal(inspected.worktrees.length, 2);
  assert.ok(inspected.worktrees.some((entry) => entry.isRepoRoot));
  assert.ok(inspected.worktrees.some((entry) => entry.path === resolvedWorktreePath && entry.branch === created.branchName));

  await writeFile(join(created.worktreePath, "notes.txt"), "bounded helper proof\n", "utf8");
  await runGit(created.worktreePath, ["add", "notes.txt"]);
  await runGit(created.worktreePath, ["commit", "-m", "add notes for review prep"]);

  const reviewPrep = await buildHarnessWorktreeReviewPrep({
    repoRoot,
    worktreePath: created.worktreePath,
    baseRef: "main",
  });

  assert.equal(reviewPrep.branch, created.branchName);
  assert.equal(reviewPrep.clean, true);
  assert.equal(reviewPrep.aheadCommitCount, 1);
  assert.ok(reviewPrep.changedFiles.includes("notes.txt"));
  assert.equal(reviewPrep.mergeReady, true);
  assert.deepEqual(reviewPrep.warnings, []);

  await cleanupHarnessWorktree({ repoRoot, worktreePath: created.worktreePath });
  const postCleanup = await inspectHarnessWorktrees({ repoRoot });
  assert.equal(postCleanup.worktrees.length, 1);
  assert.equal(postCleanup.worktrees[0]?.isRepoRoot, true);
});

test("worktree helper refuses to remove a dirty linked worktree", async () => {
  const repoRoot = await initGitRepo("worktree-helper-dirty-");
  const created = await createHarnessWorktree({
    repoRoot,
    id: "HARNESS-024",
    slug: "Dirty lane",
    baseRef: "main",
  });

  const dirtyFile = join(created.worktreePath, "draft.txt");
  await writeFile(dirtyFile, "uncommitted change\n", "utf8");

  await assert.rejects(
    cleanupHarnessWorktree({ repoRoot, worktreePath: created.worktreePath }),
    /dirty worktree/i,
  );

  await rm(dirtyFile);
  await cleanupHarnessWorktree({ repoRoot, worktreePath: created.worktreePath });
});
