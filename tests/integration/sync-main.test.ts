import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { syncLocalMain } from "../../scripts/harness-sync-main.ts";
import { makeTempRepo } from "../extension-units/test-utils.ts";

const execFile = promisify(execFileCallback);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFile("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.stdout.trim();
}

async function commitAll(cwd: string, message: string): Promise<string> {
  await runGit(cwd, ["add", "."]);
  await runGit(cwd, ["commit", "-m", message]);
  return runGit(cwd, ["rev-parse", "HEAD"]);
}

async function setupOriginAndClone(prefix: string): Promise<{ upstream: string; clone: string; origin: string }> {
  const upstream = await makeTempRepo(`${prefix}-upstream-`);
  await runGit(upstream, ["init", "-b", "main"]);
  await runGit(upstream, ["config", "user.name", "Pi Harness Tests"]);
  await runGit(upstream, ["config", "user.email", "pi-harness-tests@example.com"]);
  await writeFile(
    join(upstream, ".gitignore"),
    ".pi/agent/state/runtime/*.json\n.pi/agent/state/runtime/*.lock\nlogs/harness-actions.jsonl\n",
    "utf8",
  );
  await writeFile(join(upstream, "README.md"), "# sync helper fixture\n", "utf8");
  await commitAll(upstream, "initial commit");

  const origin = join(await makeTempRepo(`${prefix}-origin-parent-`), "origin.git");
  await execFile("git", ["clone", "--bare", upstream, origin], { encoding: "utf8" });
  await runGit(upstream, ["remote", "add", "origin", origin]);
  await runGit(upstream, ["push", "-u", "origin", "main"]);

  const cloneParent = await makeTempRepo(`${prefix}-clone-parent-`);
  const clone = join(cloneParent, "work");
  await execFile("git", ["clone", origin, clone], { encoding: "utf8" });
  await runGit(clone, ["config", "user.name", "Pi Harness Tests"]);
  await runGit(clone, ["config", "user.email", "pi-harness-tests@example.com"]);

  return { upstream, clone, origin };
}

test("sync helper fast-forwards main and preserves ignored runtime bookkeeping", async () => {
  const { upstream, clone } = await setupOriginAndClone("sync-main-clean");

  await mkdir(join(clone, ".pi", "agent", "state", "runtime"), { recursive: true });
  await mkdir(join(clone, "logs"), { recursive: true });
  await writeFile(join(clone, ".pi", "agent", "state", "runtime", "tasks.json"), "{\"local\":true}\n", "utf8");
  await writeFile(join(clone, ".pi", "agent", "state", "runtime", "queue.json"), "{\"localQueue\":true}\n", "utf8");
  await writeFile(join(clone, "logs", "harness-actions.jsonl"), "{\"local\":true}\n", "utf8");

  await writeFile(join(upstream, "README.md"), "# sync helper fixture\n\nremote update\n", "utf8");
  const remoteHead = await commitAll(upstream, "remote update");
  await runGit(upstream, ["push", "origin", "main"]);

  const result = await syncLocalMain({ repoRoot: clone });

  assert.equal(result.status, "synced");
  assert.equal(result.afterHead, remoteHead);
  assert.equal(await runGit(clone, ["rev-parse", "HEAD"]), remoteHead);
  assert.equal(await readFile(join(clone, ".pi", "agent", "state", "runtime", "tasks.json"), "utf8"), "{\"local\":true}\n");
  assert.equal(await readFile(join(clone, "logs", "harness-actions.jsonl"), "utf8"), "{\"local\":true}\n");
});

test("sync helper blocks when non-bookkeeping tracked files are dirty", async () => {
  const { upstream, clone } = await setupOriginAndClone("sync-main-dirty");
  const beforeHead = await runGit(clone, ["rev-parse", "HEAD"]);

  await writeFile(join(upstream, "README.md"), "# sync helper fixture\n\nremote update\n", "utf8");
  await commitAll(upstream, "remote update");
  await runGit(upstream, ["push", "origin", "main"]);

  await writeFile(join(clone, "README.md"), "# local tracked dirt\n", "utf8");

  await assert.rejects(syncLocalMain({ repoRoot: clone }), /non-bookkeeping tracked dirt/i);
  assert.equal(await runGit(clone, ["rev-parse", "HEAD"]), beforeHead);
});
