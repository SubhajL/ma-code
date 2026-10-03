import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type GitCommandRunner = (cwd: string, args: string[]) => Promise<GitCommandResult>;

export interface RuntimeContext {
  repoRoot: string;
  worktreeRoot: string;
  controlPlaneRoot: string;
  executionCwd: string;
  targetPath: string;
  gitCommonDir: string;
}

export type RuntimeContextResolution =
  | { ok: true; context: RuntimeContext }
  | {
      ok: false;
      reason: string;
      sessionControlPlaneRoot: string | null;
      sessionGitCommonDir: string | null;
      targetGitCommonDir: string | null;
    };

interface GitWorktreeIdentity {
  worktreeRoot: string;
  gitCommonDir: string;
  executionCwd: string;
}

async function nearestExistingDirectory(startPath: string): Promise<string | null> {
  let candidate = resolve(startPath);
  while (true) {
    try {
      const details = await stat(candidate);
      if (details.isDirectory()) return candidate;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }

    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

async function resolveGitWorktreeIdentity(
  requestedCwd: string,
  runGit: GitCommandRunner,
): Promise<GitWorktreeIdentity | null> {
  const executionCwd = await nearestExistingDirectory(requestedCwd);
  if (!executionCwd) return null;

  const rootResult = await runGit(executionCwd, ["rev-parse", "--show-toplevel"]);
  if (rootResult.code !== 0 || !rootResult.stdout.trim()) return null;
  const worktreeRoot = resolve(executionCwd, rootResult.stdout.trim());

  const commonDirResult = await runGit(worktreeRoot, ["rev-parse", "--git-common-dir"]);
  if (commonDirResult.code !== 0 || !commonDirResult.stdout.trim()) return null;

  return {
    worktreeRoot,
    gitCommonDir: resolve(worktreeRoot, commonDirResult.stdout.trim()),
    executionCwd,
  };
}

export async function resolveRuntimeContext(
  input: {
    sessionCwd: string;
    executionCwd: string;
    targetPath: string;
  },
  runGit: GitCommandRunner,
): Promise<RuntimeContextResolution> {
  const session = await resolveGitWorktreeIdentity(input.sessionCwd, runGit);
  const target = await resolveGitWorktreeIdentity(input.executionCwd, runGit);

  if (!session || !target) {
    return {
      ok: false,
      reason: `git repo context could not be resolved (session: ${session ? "ok" : "missing"}, target: ${target ? "ok" : "missing"})`,
      sessionControlPlaneRoot: session?.worktreeRoot ?? null,
      sessionGitCommonDir: session?.gitCommonDir ?? null,
      targetGitCommonDir: target?.gitCommonDir ?? null,
    };
  }

  if (session.gitCommonDir !== target.gitCommonDir) {
    return {
      ok: false,
      reason: `target repo family differs from session repo family (session common-dir: ${session.gitCommonDir}, target common-dir: ${target.gitCommonDir})`,
      sessionControlPlaneRoot: session.worktreeRoot,
      sessionGitCommonDir: session.gitCommonDir,
      targetGitCommonDir: target.gitCommonDir,
    };
  }

  return {
    ok: true,
    context: {
      repoRoot: session.worktreeRoot,
      worktreeRoot: target.worktreeRoot,
      controlPlaneRoot: target.worktreeRoot,
      executionCwd: target.executionCwd,
      targetPath: resolve(input.targetPath),
      gitCommonDir: target.gitCommonDir,
    },
  };
}
