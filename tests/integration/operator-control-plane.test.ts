import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { makeTempRepo } from "../extension-units/test-utils.ts";

const execFile = promisify(execFileCallback);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "../..");
const WRAPPER_SCRIPT = resolve(REPO_ROOT, "scripts/harness-operator.ts");
const TSX_LOADER = resolve(process.cwd(), "node_modules/tsx/dist/loader.mjs");
const ROOT_PARENT_URL = new URL(`file://${resolve(process.cwd(), "package.json")}`).href;
const NODE_LOADER = `data:text/javascript,const rootParentURL=${JSON.stringify(ROOT_PARENT_URL)};function isBareSpecifier(s){return !s.startsWith('.')&&!s.startsWith('/')&&!s.startsWith('node:')&&!s.match(/^[a-zA-Z][a-zA-Z+.-]*:/)}export async function resolve(specifier,context,defaultResolve){try{return await defaultResolve(specifier,context,defaultResolve)}catch(error){if(error&&error.code==='ERR_MODULE_NOT_FOUND'&&isBareSpecifier(specifier)){return defaultResolve(specifier,{...context,parentURL:rootParentURL},defaultResolve)}throw error}}`;

async function runNodeScript(scriptPath: string, args: string[] = []) {
  try {
    const result = await execFile(process.execPath, ["--import", TSX_LOADER, scriptPath, ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, HARNESS_TSX_IMPORT: TSX_LOADER, HARNESS_NODE_LOADER: NODE_LOADER },
    });
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

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

async function seedLeases(cwd: string): Promise<void> {
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "leases.json"),
    `${JSON.stringify({ version: 1, leases: [] }, null, 2)}\n`,
    "utf8",
  );
}

test("harness-operator help shows the supported subcommands", async () => {
  const result = await runNodeScript(WRAPPER_SCRIPT, ["help"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: node --import tsx scripts\/harness-operator\.ts/);
  assert.match(result.stdout, /status/);
  assert.match(result.stdout, /queue-session/);
  assert.match(result.stdout, /leases/);
  assert.match(result.stdout, /worktree/);
  assert.match(result.stdout, /worker-session/);
});

test("harness-operator status delegates to the status surface", async () => {
  const cwd = await makeTempRepo("operator-control-status-");
  const wrapped = await runNodeScript(WRAPPER_SCRIPT, ["status", "--cwd", cwd, "--recent", "1"]);

  assert.equal(wrapped.code, 0);
  assert.match(wrapped.stdout, /active task:/);
  assert.match(wrapped.stdout, /recent job ids \(last 1\):/);
});

test("harness-operator queue-session delegates passthrough help with nested separator", async () => {
  const wrapped = await runNodeScript(WRAPPER_SCRIPT, ["queue-session", "--", "--help"]);

  assert.equal(wrapped.code, 0);
  assert.match(wrapped.stdout, /Usage: node --import tsx scripts\/harness-queue-session\.ts/);
  assert.match(wrapped.stdout, /--scope <text>/);
});

test("harness-operator worktree delegates to the worktree status surface", async () => {
  const repoRoot = await initGitRepo("operator-control-worktree-");
  const normalizedRepoRoot = await realpath(repoRoot);
  const wrapped = await runNodeScript(WRAPPER_SCRIPT, ["worktree", "status", "--repo-root", repoRoot, "--json"]);
  const parsed = JSON.parse(wrapped.stdout) as { repoRoot: string; worktrees: Array<{ path: string; branch: string | null }> };

  assert.equal(wrapped.code, 0);
  assert.equal(parsed.repoRoot, normalizedRepoRoot);
  assert.ok(parsed.worktrees.some((entry) => entry.path === normalizedRepoRoot && entry.branch === "main"));
});

test("harness-operator leases delegates to the leases surface", async () => {
  const cwd = await makeTempRepo("operator-control-leases-");
  await seedLeases(cwd);
  const wrapped = await runNodeScript(WRAPPER_SCRIPT, ["leases", "list", "--cwd", cwd, "--json"]);
  const parsed = JSON.parse(wrapped.stdout) as { cwd: string; summary: { totalLeaseCount: number; activeLeaseCount: number; staleLeaseCount: number } };

  assert.equal(wrapped.code, 0);
  assert.equal(parsed.cwd, cwd);
  assert.equal(parsed.summary.totalLeaseCount, 0);
  assert.equal(parsed.summary.activeLeaseCount, 0);
  assert.equal(parsed.summary.staleLeaseCount, 0);
});

test("harness-operator worker-session delegates to the worker-session surface", async () => {
  const repoRoot = await initGitRepo("operator-control-worker-");
  const started = await runNodeScript(WRAPPER_SCRIPT, ["worker-session", "start", "--repo-root", repoRoot, "--id", "HARNESS-065", "--slug", "operator wrapper", "--base-ref", "main"]);
  const wrappedStatus = await runNodeScript(WRAPPER_SCRIPT, ["worker-session", "status", "--repo-root", repoRoot, "--scope", "harness-065", "--json"]);
  const released = await runNodeScript(WRAPPER_SCRIPT, ["worker-session", "release", "--repo-root", repoRoot, "--scope", "harness-065", "--cleanup"]);
  const parsed = JSON.parse(wrappedStatus.stdout) as { scopeKey: string; leaseId: string | null; branchName: string | null; worktreePath: string | null; worktree: { clean: boolean } | null };

  assert.equal(started.code, 0);
  assert.match(started.stdout, /Harness Worker Session Started/);
  assert.equal(wrappedStatus.code, 0);
  assert.equal(parsed.scopeKey, "harness-065");
  assert.ok(parsed.leaseId);
  assert.match(parsed.branchName ?? "", /worker\/harness-065-operator-wrapper/);
  assert.ok(parsed.worktreePath);
  assert.equal(parsed.worktree?.clean, true);
  assert.equal(released.code, 0);
  assert.match(released.stdout, /Harness Worker Session Released/);
});

test("harness-operator rejects unknown subcommands clearly", async () => {
  const result = await runNodeScript(WRAPPER_SCRIPT, ["unknown-surface"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown subcommand: unknown-surface/);
});

test("harness-operator preserves delegated non-zero exit codes", async () => {
  const wrapped = await runNodeScript(WRAPPER_SCRIPT, ["worker-session", "release", "--scope", "missing-scope"]);

  assert.notEqual(wrapped.code, 0);
  assert.match(wrapped.stderr, /No matching worker-lane lease was found/);
});
