import type { ExtensionAPI, ExecResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { appendAuditEntry, type AuditLogEntry } from "./lib/audit-log.ts";

const PROTECTED_PATH_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\/)\.env($|\.)/, reason: "secret/env files are protected" },
  { pattern: /(^|\/)\.git(\/|$)/, reason: ".git internals are protected" },
  { pattern: /(^|\/)node_modules(\/|$)/, reason: "dependency folders are protected" },
  {
    pattern: /(^|\/)\.pi\/agent\/state\/runtime(\/|$)/,
    reason: "runtime state must not be edited directly",
  },
];

export interface GitCommitInput {
  message: string;
  paths: string[];
  signoff?: boolean;
  allowEmpty?: boolean;
}

export interface GitCommitOutcome {
  ok: boolean;
  commitSha: string | null;
  branch: string | null;
  stagedPaths: string[];
  reason: string | null;
  reasons: string[];
}

export interface GitCommitDeps {
  exec(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
  cwd: string;
  appendAudit?(entry: Record<string, unknown>): Promise<void>;
  modelId?: string | null;
  provider?: string | null;
}

const GitCommitSchema = Type.Object({
  message: Type.String({ minLength: 1 }),
  paths: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  signoff: Type.Optional(Type.Boolean()),
  allowEmpty: Type.Optional(Type.Boolean()),
});

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/");
}

function findProtectedPath(paths: string[]): { path: string; reason: string } | null {
  for (const path of paths) {
    const normalized = normalizePath(path);
    for (const rule of PROTECTED_PATH_RULES) {
      if (rule.pattern.test(normalized)) return { path, reason: rule.reason };
    }
  }
  return null;
}

export interface GitCommitValidation {
  ok: boolean;
  reason: string | null;
  reasons: string[];
}

export function validateGitCommitInput(input: GitCommitInput): GitCommitValidation {
  const messageTrimmed = (input.message ?? "").trim();
  if (messageTrimmed.length === 0) {
    const reason = "commit message must not be empty";
    return { ok: false, reason, reasons: [reason] };
  }
  if (!input.paths || input.paths.length === 0) {
    const reason = "must specify at least one path to stage";
    return { ok: false, reason, reasons: [reason] };
  }
  const protectedHit = findProtectedPath(input.paths);
  if (protectedHit) {
    const reason = `path ${protectedHit.path} is protected: ${protectedHit.reason}`;
    return { ok: false, reason, reasons: [reason] };
  }
  return { ok: true, reason: null, reasons: [] };
}

async function readCurrentBranch(
  exec: GitCommitDeps["exec"],
  cwd: string,
): Promise<string | null> {
  const result = await exec("git", ["-C", cwd, "branch", "--show-current"]);
  if (result.code !== 0) return null;
  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
}

function describeExecError(result: { stdout: string; stderr: string }): string {
  const detail = result.stderr.trim() || result.stdout.trim();
  return detail.length > 0 ? detail : "unknown error";
}

export async function executeGitCommit(
  deps: GitCommitDeps,
  input: GitCommitInput,
): Promise<GitCommitOutcome> {
  const validation = validateGitCommitInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      commitSha: null,
      branch: null,
      stagedPaths: [],
      reason: validation.reason,
      reasons: validation.reasons,
    };
  }

  const branch = await readCurrentBranch(deps.exec, deps.cwd);

  if (branch === "main") {
    const reason = "refusing to commit on main; switch to a feature branch first";
    const outcome: GitCommitOutcome = {
      ok: false,
      commitSha: null,
      branch,
      stagedPaths: [],
      reason,
      reasons: [reason],
    };
    if (deps.appendAudit) {
      await deps.appendAudit({
        ts: new Date().toISOString(),
        extension: "git-commit",
        tool: "git_commit",
        action: "blocked",
        branch,
        modelId: deps.modelId ?? null,
        provider: deps.provider ?? null,
        paths: input.paths,
        reasons: outcome.reasons,
      });
    }
    return outcome;
  }

  const addResult = await deps.exec("git", ["-C", deps.cwd, "add", "--", ...input.paths]);
  if (addResult.code !== 0) {
    const reason = `git add failed: ${describeExecError(addResult)}`;
    const outcome: GitCommitOutcome = {
      ok: false,
      commitSha: null,
      branch,
      stagedPaths: [],
      reason,
      reasons: [reason],
    };
    if (deps.appendAudit) {
      await deps.appendAudit({
        ts: new Date().toISOString(),
        extension: "git-commit",
        tool: "git_commit",
        action: "failed",
        branch,
        modelId: deps.modelId ?? null,
        provider: deps.provider ?? null,
        paths: input.paths,
        reasons: outcome.reasons,
      });
    }
    return outcome;
  }

  const commitArgs = ["-C", deps.cwd, "commit", "-m", input.message];
  if (input.signoff) commitArgs.push("--signoff");
  if (input.allowEmpty) commitArgs.push("--allow-empty");

  const commitResult = await deps.exec("git", commitArgs);
  if (commitResult.code !== 0) {
    const reason = `git commit failed: ${describeExecError(commitResult)}`;
    const outcome: GitCommitOutcome = {
      ok: false,
      commitSha: null,
      branch,
      stagedPaths: input.paths,
      reason,
      reasons: [reason],
    };
    if (deps.appendAudit) {
      await deps.appendAudit({
        ts: new Date().toISOString(),
        extension: "git-commit",
        tool: "git_commit",
        action: "failed",
        branch,
        modelId: deps.modelId ?? null,
        provider: deps.provider ?? null,
        paths: input.paths,
        reasons: outcome.reasons,
      });
    }
    return outcome;
  }

  const shaResult = await deps.exec("git", ["-C", deps.cwd, "rev-parse", "HEAD"]);
  const commitSha = shaResult.code === 0 ? shaResult.stdout.trim() || null : null;

  if (deps.appendAudit) {
    await deps.appendAudit({
      ts: new Date().toISOString(),
      extension: "git-commit",
      tool: "git_commit",
      action: "committed",
      branch,
      commitSha,
      modelId: deps.modelId ?? null,
      provider: deps.provider ?? null,
      paths: input.paths,
      signoff: !!input.signoff,
      allowEmpty: !!input.allowEmpty,
    });
  }

  return {
    ok: true,
    commitSha,
    branch,
    stagedPaths: input.paths,
    reason: null,
    reasons: [],
  };
}

async function defaultAppendAudit(cwd: string, entry: Record<string, unknown>): Promise<void> {
  await appendAuditEntry(cwd, entry as AuditLogEntry);
}

function modelIdFromContext(ctx: { model?: { id?: string } | null }): string | null {
  return ctx.model?.id ?? null;
}

function providerFromModelId(modelId: string | null): string | null {
  if (!modelId) return null;
  const slash = modelId.indexOf("/");
  return slash >= 0 ? modelId.slice(0, slash) : null;
}

export default function gitCommitExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "git_commit",
    label: "Git Commit",
    description:
      "Stage explicit paths and create a git commit on a non-main branch. Refuses to run on main, refuses --no-verify, refuses protected paths.",
    promptSnippet:
      "Prefer git_commit over `bash git commit ...` when committing typed staged paths.",
    promptGuidelines: [
      "Use this typed tool rather than bash for git commits whenever possible.",
      "Stage paths explicitly via the `paths` argument; broad `git add -A` is not supported here.",
      "This tool refuses to commit on the main branch.",
      "Hooks are never bypassed; --no-verify is not exposed.",
    ],
    parameters: GitCommitSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const modelId = modelIdFromContext(ctx);
      const provider = providerFromModelId(modelId);
      const outcome = await executeGitCommit(
        {
          exec: async (cmd, args) => {
            const result: ExecResult = await pi.exec(cmd, args, { cwd: ctx.cwd });
            return { code: result.code, stdout: result.stdout, stderr: result.stderr };
          },
          cwd: ctx.cwd,
          appendAudit: (entry) => defaultAppendAudit(ctx.cwd, entry),
          modelId,
          provider,
        },
        params,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
        details: outcome,
      };
    },
  });
}
