import type { ExtensionAPI, ExecResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { appendAuditEntry, type AuditLogEntry } from "./lib/audit-log.ts";

export type GitBranchAction = "show_current" | "list" | "create";

export interface GitBranchInput {
  action: GitBranchAction;
  name?: string;
  startPoint?: string;
}

export interface GitCheckoutInput {
  branch: string;
  create?: boolean;
  startPoint?: string;
  allowMain?: boolean;
}

export interface GitPushInput {
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
  dryRun?: boolean;
}

export interface GitToolValidation {
  ok: boolean;
  reason: string | null;
  reasons: string[];
}

export interface GitToolOutcome {
  ok: boolean;
  tool: "git_branch" | "git_checkout" | "git_push";
  action: string;
  branch: string | null;
  previousBranch?: string | null;
  currentBranch?: string | null;
  branches?: string[];
  remote?: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  reason: string | null;
  reasons: string[];
}

export interface GitToolsDeps {
  exec(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
  cwd: string;
  appendAudit?(entry: Record<string, unknown>): Promise<void>;
  modelId?: string | null;
  provider?: string | null;
}

const GitBranchSchema = Type.Object({
  action: Type.Union([Type.Literal("show_current"), Type.Literal("list"), Type.Literal("create")]),
  name: Type.Optional(Type.String({ minLength: 1 })),
  startPoint: Type.Optional(Type.String({ minLength: 1 })),
});

const GitCheckoutSchema = Type.Object({
  branch: Type.String({ minLength: 1 }),
  create: Type.Optional(Type.Boolean()),
  startPoint: Type.Optional(Type.String({ minLength: 1 })),
  allowMain: Type.Optional(Type.Boolean()),
});

const GitPushSchema = Type.Object({
  remote: Type.Optional(Type.String({ minLength: 1 })),
  branch: Type.Optional(Type.String({ minLength: 1 })),
  setUpstream: Type.Optional(Type.Boolean()),
  dryRun: Type.Optional(Type.Boolean()),
});

const BRANCH_ACTIONS = new Set<GitBranchAction>(["show_current", "list", "create"]);
const UNSAFE_REF_CHARS = /[\s~^:?*[\]\\`$;&|<>]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function validationFailure(reason: string): GitToolValidation {
  return { ok: false, reason, reasons: [reason] };
}

function validateBranchName(value: string | undefined, label = "branch name"): string | null {
  const name = value?.trim() ?? "";
  if (!name) return `${label} must be a non-empty string`;
  if (name.startsWith("-")) return `${label} must not start with '-'`;
  if (name.startsWith("+")) return `${label} looks like a force push refspec and is not allowed`;
  if (name.startsWith(":") || name.includes(":")) return `${label} must not contain push refspec ':' syntax`;
  if (name.includes("..")) return `${label} must not contain '..'`;
  if (name.includes("@{")) return `${label} must not contain '@{'`;
  if (name.includes("//")) return `${label} must not contain consecutive slashes`;
  if (name.endsWith("/") || name.endsWith(".") || name.endsWith(".lock")) {
    return `${label} has an invalid suffix`;
  }
  if (name === "HEAD") return `${label} must not be HEAD`;
  if (CONTROL_CHARS.test(name) || UNSAFE_REF_CHARS.test(name)) {
    return `${label} contains unsupported characters`;
  }
  return null;
}

function validateRefish(value: string | undefined, label: string): string | null {
  const refish = value?.trim() ?? "";
  if (!refish) return null;
  if (refish.startsWith("-")) return `${label} must not start with '-'`;
  if (CONTROL_CHARS.test(refish) || /[\s`$;&|<>]/.test(refish)) {
    return `${label} contains unsupported characters`;
  }
  return null;
}

function validateRemoteName(value: string | undefined): string | null {
  const remote = value?.trim() ?? "";
  if (!remote) return null;
  if (remote.startsWith("-")) return "remote must not start with '-'";
  if (CONTROL_CHARS.test(remote) || /[\s`$;&|<>:+]/.test(remote)) {
    return "remote contains unsupported characters";
  }
  return null;
}

function describeExecError(result: { stdout: string; stderr: string }): string {
  const detail = result.stderr.trim() || result.stdout.trim();
  return detail.length > 0 ? detail : "unknown error";
}

async function readCurrentBranch(exec: GitToolsDeps["exec"], cwd: string): Promise<string | null> {
  const result = await exec("git", ["-C", cwd, "branch", "--show-current"]);
  if (result.code !== 0) return null;
  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
}

async function assertGitBranchName(deps: GitToolsDeps, branch: string): Promise<string | null> {
  const result = await deps.exec("git", ["-C", deps.cwd, "check-ref-format", "--branch", branch]);
  if (result.code === 0) return null;
  return `git branch name validation failed: ${describeExecError(result)}`;
}

async function audit(deps: GitToolsDeps, entry: Record<string, unknown>): Promise<void> {
  if (!deps.appendAudit) return;
  await deps.appendAudit({
    ts: new Date().toISOString(),
    modelId: deps.modelId ?? null,
    provider: deps.provider ?? null,
    ...entry,
  });
}

function makeOutcome(
  tool: GitToolOutcome["tool"],
  action: string,
  fields: Partial<GitToolOutcome>,
): GitToolOutcome {
  return {
    ok: fields.ok ?? false,
    tool,
    action,
    branch: fields.branch ?? null,
    exitCode: fields.exitCode ?? null,
    stdout: fields.stdout ?? "",
    stderr: fields.stderr ?? "",
    reason: fields.reason ?? null,
    reasons: fields.reasons ?? (fields.reason ? [fields.reason] : []),
    previousBranch: fields.previousBranch,
    currentBranch: fields.currentBranch,
    branches: fields.branches,
    remote: fields.remote,
  };
}

export function validateGitBranchInput(input: GitBranchInput): GitToolValidation {
  if (!BRANCH_ACTIONS.has(input.action)) {
    return validationFailure(`unsupported branch action: ${String(input.action)}`);
  }
  if (input.action === "create") {
    const branchReason = validateBranchName(input.name);
    if (branchReason) return validationFailure(branchReason);
  }
  if (input.action !== "create" && input.name) {
    return validationFailure("name is only supported for action=create");
  }
  const startReason = validateRefish(input.startPoint, "startPoint");
  if (startReason) return validationFailure(startReason);
  if (input.startPoint && input.action !== "create") {
    return validationFailure("startPoint is only supported for action=create");
  }
  return { ok: true, reason: null, reasons: [] };
}

export async function executeGitBranch(deps: GitToolsDeps, input: GitBranchInput): Promise<GitToolOutcome> {
  const validation = validateGitBranchInput(input);
  if (!validation.ok) {
    const outcome = makeOutcome("git_branch", input.action, {
      reason: validation.reason,
      reasons: validation.reasons,
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_branch",
      action: "blocked",
      toolAction: input.action,
      branch: input.name ?? null,
      reasons: outcome.reasons,
    });
    return outcome;
  }

  if (input.action === "show_current") {
    const currentBranch = await readCurrentBranch(deps.exec, deps.cwd);
    const ok = currentBranch !== null;
    const reason = ok ? null : "git branch --show-current failed";
    const outcome = makeOutcome("git_branch", "show_current", {
      ok,
      branch: currentBranch,
      currentBranch,
      exitCode: ok ? 0 : 1,
      reason,
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_branch",
      action: ok ? "shown" : "failed",
      branch: currentBranch,
      reasons: outcome.reasons,
    });
    return outcome;
  }

  if (input.action === "list") {
    const result = await deps.exec("git", ["-C", deps.cwd, "branch", "--list"]);
    const ok = result.code === 0;
    const branches = ok
      ? result.stdout
        .split(/\r?\n/)
        .map((line) => line.replace(/^\*\s*/, "").trim())
        .filter((line) => line.length > 0)
      : [];
    const reason = ok ? null : `git branch --list failed: ${describeExecError(result)}`;
    const outcome = makeOutcome("git_branch", "list", {
      ok,
      branches,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      reason,
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_branch",
      action: ok ? "listed" : "failed",
      branchCount: branches.length,
      exitCode: result.code,
      reasons: outcome.reasons,
    });
    return outcome;
  }

  const branch = input.name?.trim() ?? "";
  const refReason = await assertGitBranchName(deps, branch);
  if (refReason) {
    const outcome = makeOutcome("git_branch", "create", {
      branch,
      reason: refReason,
      reasons: [refReason],
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_branch",
      action: "blocked",
      toolAction: "create",
      branch,
      reasons: outcome.reasons,
    });
    return outcome;
  }

  const args = ["-C", deps.cwd, "branch", branch];
  if (input.startPoint) args.push(input.startPoint.trim());
  const result = await deps.exec("git", args);
  const ok = result.code === 0;
  const reason = ok ? null : `git branch failed: ${describeExecError(result)}`;
  const outcome = makeOutcome("git_branch", "create", {
    ok,
    branch,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    reason,
  });
  await audit(deps, {
    extension: "git-tools",
    tool: "git_branch",
    action: ok ? "created" : "failed",
    branch,
    startPoint: input.startPoint ?? null,
    exitCode: result.code,
    reasons: outcome.reasons,
  });
  return outcome;
}

export function validateGitCheckoutInput(input: GitCheckoutInput): GitToolValidation {
  const branchReason = validateBranchName(input.branch);
  if (branchReason) return validationFailure(branchReason);
  if (input.branch.trim() === "main" && !input.allowMain) {
    return validationFailure("refusing to switch to main without allowMain=true");
  }
  const startReason = validateRefish(input.startPoint, "startPoint");
  if (startReason) return validationFailure(startReason);
  if (input.startPoint && !input.create) {
    return validationFailure("startPoint requires create=true");
  }
  return { ok: true, reason: null, reasons: [] };
}

export async function executeGitCheckout(deps: GitToolsDeps, input: GitCheckoutInput): Promise<GitToolOutcome> {
  const validation = validateGitCheckoutInput(input);
  if (!validation.ok) {
    const outcome = makeOutcome("git_checkout", "switch", {
      branch: input.branch ?? null,
      reason: validation.reason,
      reasons: validation.reasons,
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_checkout",
      action: "blocked",
      branch: input.branch ?? null,
      reasons: outcome.reasons,
    });
    return outcome;
  }

  const branch = input.branch.trim();
  const refReason = await assertGitBranchName(deps, branch);
  if (refReason) {
    const outcome = makeOutcome("git_checkout", "switch", {
      branch,
      reason: refReason,
      reasons: [refReason],
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_checkout",
      action: "blocked",
      branch,
      reasons: outcome.reasons,
    });
    return outcome;
  }

  const previousBranch = await readCurrentBranch(deps.exec, deps.cwd);
  const args = ["-C", deps.cwd, "switch"];
  if (input.create) args.push("-c");
  args.push(branch);
  if (input.create && input.startPoint) args.push(input.startPoint.trim());

  const result = await deps.exec("git", args);
  const ok = result.code === 0;
  const reason = ok ? null : `git switch failed: ${describeExecError(result)}`;
  const outcome = makeOutcome("git_checkout", "switch", {
    ok,
    branch,
    previousBranch,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    reason,
  });
  await audit(deps, {
    extension: "git-tools",
    tool: "git_checkout",
    action: ok ? "switched" : "failed",
    branch,
    previousBranch,
    create: !!input.create,
    startPoint: input.startPoint ?? null,
    allowMain: !!input.allowMain,
    exitCode: result.code,
    reasons: outcome.reasons,
  });
  return outcome;
}

export function validateGitPushInput(input: GitPushInput): GitToolValidation {
  const remoteReason = validateRemoteName(input.remote);
  if (remoteReason) return validationFailure(remoteReason);

  if (input.branch !== undefined) {
    const branchReason = validateBranchName(input.branch);
    if (branchReason) return validationFailure(branchReason.replace("branch name looks like", "branch looks like"));
    if (input.branch.trim() === "main") return validationFailure("refusing to push main");
  }
  return { ok: true, reason: null, reasons: [] };
}

export async function executeGitPush(deps: GitToolsDeps, input: GitPushInput): Promise<GitToolOutcome> {
  const validation = validateGitPushInput(input);
  if (!validation.ok) {
    const outcome = makeOutcome("git_push", "push", {
      branch: input.branch ?? null,
      remote: input.remote ?? "origin",
      reason: validation.reason,
      reasons: validation.reasons,
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_push",
      action: "blocked",
      branch: input.branch ?? null,
      remote: input.remote ?? "origin",
      reasons: outcome.reasons,
    });
    return outcome;
  }

  const remote = input.remote?.trim() || "origin";
  const branch = input.branch?.trim() || await readCurrentBranch(deps.exec, deps.cwd);
  if (!branch) {
    const reason = "could not resolve current branch for git push";
    const outcome = makeOutcome("git_push", "push", {
      remote,
      reason,
      reasons: [reason],
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_push",
      action: "failed",
      branch: null,
      remote,
      reasons: outcome.reasons,
    });
    return outcome;
  }
  const branchReason = validateBranchName(branch);
  if (branchReason) {
    const outcome = makeOutcome("git_push", "push", {
      branch,
      remote,
      reason: branchReason,
      reasons: [branchReason],
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_push",
      action: "blocked",
      branch,
      remote,
      reasons: outcome.reasons,
    });
    return outcome;
  }
  if (branch === "main") {
    const reason = "refusing to push main";
    const outcome = makeOutcome("git_push", "push", {
      branch,
      remote,
      reason,
      reasons: [reason],
    });
    await audit(deps, {
      extension: "git-tools",
      tool: "git_push",
      action: "blocked",
      branch,
      remote,
      reasons: outcome.reasons,
    });
    return outcome;
  }

  const args = ["-C", deps.cwd, "push"];
  if (input.dryRun) args.push("--dry-run");
  if (input.setUpstream) args.push("-u");
  args.push(remote, branch);

  const result = await deps.exec("git", args);
  const ok = result.code === 0;
  const reason = ok ? null : `git push failed: ${describeExecError(result)}`;
  const outcome = makeOutcome("git_push", "push", {
    ok,
    branch,
    remote,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    reason,
  });
  await audit(deps, {
    extension: "git-tools",
    tool: "git_push",
    action: ok ? "pushed" : "failed",
    branch,
    remote,
    setUpstream: !!input.setUpstream,
    dryRun: !!input.dryRun,
    exitCode: result.code,
    reasons: outcome.reasons,
  });
  return outcome;
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

function depsFromPi(pi: ExtensionAPI, cwd: string, modelId: string | null, provider: string | null): GitToolsDeps {
  return {
    exec: async (cmd, args) => {
      const result: ExecResult = await pi.exec(cmd, args, { cwd });
      return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    },
    cwd,
    appendAudit: (entry) => defaultAppendAudit(cwd, entry),
    modelId,
    provider,
  };
}

export default function gitToolsExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "git_branch",
    label: "Git Branch",
    description:
      "Show, list, or create git branches through bounded arguments. Does not expose branch deletion.",
    promptSnippet:
      "Prefer git_branch over `bash git branch ...` for showing, listing, or creating branches.",
    promptGuidelines: [
      "Use this typed tool rather than bash for git branch operations whenever possible.",
      "Use action=show_current for the current branch, action=list for local branches, and action=create for branch creation.",
      "Branch deletion is intentionally not exposed.",
    ],
    parameters: GitBranchSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const modelId = modelIdFromContext(ctx);
      const provider = providerFromModelId(modelId);
      const outcome = await executeGitBranch(depsFromPi(pi, ctx.cwd, modelId, provider), params);
      return {
        content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
        details: outcome,
      };
    },
  });

  pi.registerTool({
    name: "git_checkout",
    label: "Git Checkout",
    description:
      "Switch to an existing branch or create and switch to a new branch through git switch. Main requires explicit allowMain=true.",
    promptSnippet:
      "Prefer git_checkout over `bash git checkout ...` or `bash git switch ...` for branch switching.",
    promptGuidelines: [
      "Use this typed tool rather than bash for branch checkout/switch operations whenever possible.",
      "Set create=true to create and switch to a new branch.",
      "Switching to main requires allowMain=true so accidental main work is explicit.",
    ],
    parameters: GitCheckoutSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const modelId = modelIdFromContext(ctx);
      const provider = providerFromModelId(modelId);
      const outcome = await executeGitCheckout(depsFromPi(pi, ctx.cwd, modelId, provider), params);
      return {
        content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
        details: outcome,
      };
    },
  });

  pi.registerTool({
    name: "git_push",
    label: "Git Push",
    description:
      "Push the current or explicit non-main branch to a remote without force/delete refspec support.",
    promptSnippet:
      "Prefer git_push over `bash git push ...` for bounded non-force branch pushes.",
    promptGuidelines: [
      "Use this typed tool rather than bash for git push operations whenever possible.",
      "Force pushes, delete pushes, and direct main pushes are not exposed.",
      "Use setUpstream=true when publishing a branch for the first time.",
    ],
    parameters: GitPushSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const modelId = modelIdFromContext(ctx);
      const provider = providerFromModelId(modelId);
      const outcome = await executeGitPush(depsFromPi(pi, ctx.cwd, modelId, provider), params);
      return {
        content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
        details: outcome,
      };
    },
  });
}
