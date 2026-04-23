import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { TASKS_FILE, getActiveTask, readTaskState, type TaskRecord } from "./till-done.ts";

type RiskLevel = "allow" | "warn" | "block";
type AutoBranchOutcome =
  | { ok: true; branch: string; mode: "created" | "switched"; task: TaskRecord }
  | { ok: false; reason: string; auditReasons: string[] };

const AUDIT_LOG = "logs/harness-actions.jsonl";
const ALLOWED_BOOKKEEPING_DIRTY_PATHS = new Set([TASKS_FILE, AUDIT_LOG]);
const GIT_CONTROL_COMMAND_PATTERN = /\bgit\s+(add|commit|merge|rebase|cherry-pick|reset|restore|clean|checkout|switch|push|branch)\b/i;
const AUTO_BRANCHABLE_BASH_PATTERNS: RegExp[] = [
  /\btouch\b/i,
  /\bmkdir\b/i,
  /\bcp\b/i,
  /\bmv\b/i,
  /\btee\b/i,
  />/,
  /\bsed\s+-i\b/i,
  /\bperl\s+-i\b/i,
];

const PROTECTED_PATH_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\/)\.env($|\.)/, reason: "secret/env files are protected" },
  { pattern: /(^|\/)\.git(\/|$)/, reason: ".git internals are protected" },
  { pattern: /(^|\/)node_modules(\/|$)/, reason: "dependency folders are protected" },
  {
    pattern: /(^|\/)\.pi\/agent\/state\/runtime(\/|$)/,
    reason: "runtime state must not be edited directly",
  },
];

const HARD_BLOCK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bsudo\b/i, reason: "sudo is blocked by default" },
  { pattern: /\brm\s+-[^\n]*r[^\n]*f\b/i, reason: "recursive forced deletion is blocked" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "destructive git reset is blocked" },
  { pattern: /\bgit\s+clean\s+-[^\n]*f[^\n]*d/i, reason: "destructive git clean is blocked" },
  { pattern: /\bgit\s+push\b[^\n]*--force(?:-with-lease)?\b/i, reason: "force push is blocked" },
  { pattern: /\bgit\s+branch\s+-D\b/i, reason: "force branch deletion is blocked" },
  { pattern: /\bchmod\b[^\n]*\b777\b/i, reason: "sweeping chmod 777 is blocked" },
  { pattern: /\bchown\b[^\n]*\s-R\b/i, reason: "recursive chown is blocked" },
];

const WARN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bnpm\s+(install|update)\b/i, reason: "dependency surface is changing" },
  { pattern: /\bpnpm\s+(add|install|update)\b/i, reason: "dependency surface is changing" },
  { pattern: /\byarn\s+(add|install|upgrade)\b/i, reason: "dependency surface is changing" },
  { pattern: /\bbrew\s+(install|upgrade)\b/i, reason: "system package state is changing" },
  { pattern: /\bmv\b/i, reason: "rename/move operations can be broad-impact" },
];

const MUTATING_COMMAND_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\btouch\b/i,
  /\bmkdir\b/i,
  /\btee\b/i,
  />/,
  /\bsed\s+-i\b/i,
  /\bperl\s+-i\b/i,
  /\bgit\s+(add|commit|merge|rebase|cherry-pick|reset|restore|clean|checkout|switch|push)\b/i,
];

function normalizePath(input: string): string {
  return input.replace(/^@/, "").replace(/\\/g, "/");
}

function normalizeRepoRelativePath(input: string): string {
  return normalizePath(input).replace(/^\.\//, "").replace(/^"|"$/g, "");
}

function resolveToolPath(cwd: string, input: string): string {
  return resolve(cwd, normalizePath(input));
}

function findProtectedPathReason(path: string): string | null {
  const normalized = normalizePath(path);
  for (const rule of PROTECTED_PATH_RULES) {
    if (rule.pattern.test(normalized)) return rule.reason;
  }
  return null;
}

function classifyBashRisk(command: string): { level: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];

  for (const rule of HARD_BLOCK_PATTERNS) {
    if (rule.pattern.test(command)) reasons.push(rule.reason);
  }
  if (reasons.length > 0) return { level: "block", reasons };

  for (const rule of WARN_PATTERNS) {
    if (rule.pattern.test(command)) reasons.push(rule.reason);
  }
  if (reasons.length > 0) return { level: "warn", reasons };

  return { level: "allow", reasons: [] };
}

function commandLooksMutating(command: string): boolean {
  return MUTATING_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

function bashCommandEligibleForAutoBranch(command: string): boolean {
  return !GIT_CONTROL_COMMAND_PATTERN.test(command) && AUTO_BRANCHABLE_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

function commandTouchesProtectedPath(command: string): string | null {
  const suspiciousPatterns: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /(?:>|>>|\btee\b)[^\n]*\.env(?:\.[A-Za-z0-9_-]+)?\b/i, reason: ".env write detected" },
    { pattern: /(?:>|>>|\btee\b)[^\n]*\.git\//i, reason: ".git write detected" },
    {
      pattern: /(?:>|>>|\btee\b)[^\n]*\.pi\/agent\/state\/runtime\//i,
      reason: "runtime state write detected",
    },
    { pattern: /\btouch\b[^\n]*\.env(?:\.[A-Za-z0-9_-]+)?\b/i, reason: ".env write detected" },
    { pattern: /\btouch\b[^\n]*\.git\//i, reason: ".git write detected" },
    {
      pattern: /\btouch\b[^\n]*\.pi\/agent\/state\/runtime\//i,
      reason: "runtime state write detected",
    },
    { pattern: /\bmkdir\b[^\n]*\.git(?:\/|\b)/i, reason: ".git write detected" },
    {
      pattern: /\bmkdir\b[^\n]*\.pi\/agent\/state\/runtime(?:\/|\b)/i,
      reason: "runtime state write detected",
    },
  ];

  for (const rule of suspiciousPatterns) {
    if (rule.pattern.test(command)) return rule.reason;
  }
  return null;
}

function parseDirtyTrackedFiles(statusPorcelain: string): string[] {
  const files = new Set<string>();

  for (const rawLine of statusPorcelain.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const status = line.slice(0, 2);
    if (status === "??") continue;

    const payload = line.slice(3).trim();
    if (!payload) continue;

    const parts = payload.includes(" -> ") ? payload.split(" -> ") : [payload];
    for (const part of parts) {
      const normalized = normalizeRepoRelativePath(part);
      if (normalized) files.add(normalized);
    }
  }

  return [...files];
}

function dirtyTrackedFilesAreAllowedBookkeeping(paths: string[]): boolean {
  return paths.every((path) => ALLOWED_BOOKKEEPING_DIRTY_PATHS.has(normalizeRepoRelativePath(path)));
}

function slugifyBranchSegment(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  const bounded = slug.slice(0, 48).replace(/-+$/g, "");
  return bounded || "task";
}

function deriveTaskBranchName(task: TaskRecord): string {
  return `task/${task.id}-${slugifyBranchSegment(task.title)}`;
}

async function getCurrentBranch(pi: ExtensionAPI, cwd: string): Promise<string | null> {
  const result = await pi.exec("git", ["-C", cwd, "branch", "--show-current"]);
  if (result.code !== 0) return null;

  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
}

async function getDirtyTrackedFiles(pi: ExtensionAPI, cwd: string): Promise<{ files: string[] | null; error: string | null }> {
  const result = await pi.exec("git", ["-C", cwd, "status", "--porcelain", "--untracked-files=no"]);
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "git status failed";
    return { files: null, error: detail };
  }

  return { files: parseDirtyTrackedFiles(result.stdout), error: null };
}

async function getRunnableActiveTask(cwd: string): Promise<TaskRecord | null> {
  const state = await readTaskState(cwd);
  const task = getActiveTask(state);
  if (!task) return null;
  if (task.status !== "in_progress") return null;
  if (!task.owner) return null;
  if (task.acceptance.length === 0) return null;
  return task;
}

async function ensureTaskBranch(pi: ExtensionAPI, cwd: string, task: TaskRecord): Promise<{ ok: true; branch: string; mode: "created" | "switched" } | { ok: false; branch: string; error: string }> {
  const branch = deriveTaskBranchName(task);
  const listResult = await pi.exec("git", ["-C", cwd, "branch", "--list", branch]);
  if (listResult.code !== 0) {
    const detail = listResult.stderr.trim() || listResult.stdout.trim() || "git branch lookup failed";
    return { ok: false, branch, error: detail };
  }

  const exists = listResult.stdout.trim().length > 0;
  const switchArgs = exists ? ["-C", cwd, "switch", branch] : ["-C", cwd, "switch", "-c", branch];
  const switchResult = await pi.exec("git", switchArgs);
  if (switchResult.code !== 0) {
    const detail = switchResult.stderr.trim() || switchResult.stdout.trim() || "git switch failed";
    return { ok: false, branch, error: detail };
  }

  return { ok: true, branch, mode: exists ? "switched" : "created" };
}

function mainMutationBlockReason(target: string, detail: string): string {
  return `Blocked ${target} on \`main\`. Auto-branch requires an active task and safe repo state (no unexpected dirty tracked files); otherwise create or switch to a non-main branch first. ${detail}`;
}

function modelIdFromContext(ctx: { model?: { id?: string } | null }): string | null {
  return ctx.model?.id ?? null;
}

function providerFromModelId(modelId: string | null): string | null {
  if (!modelId) return null;
  const slash = modelId.indexOf("/");
  return slash >= 0 ? modelId.slice(0, slash) : null;
}

async function appendAuditLog(cwd: string, entry: Record<string, unknown>): Promise<void> {
  const logFile = resolve(cwd, AUDIT_LOG);
  await mkdir(dirname(logFile), { recursive: true });

  await withFileMutationQueue(logFile, async () => {
    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  });
}

async function attemptAutoBranchOnMain(
  pi: ExtensionAPI,
  ctx: { cwd: string; model?: { id?: string } | null },
  tool: "write" | "edit" | "bash",
  metadata: Record<string, unknown>,
): Promise<AutoBranchOutcome> {
  const modelId = modelIdFromContext(ctx);
  const provider = providerFromModelId(modelId);
  const task = await getRunnableActiveTask(ctx.cwd);

  if (!task) {
    const auditReasons = ["auto-branch requires an active in-progress task with owner and acceptance criteria"];
    await appendAuditLog(ctx.cwd, {
      ts: new Date().toISOString(),
      extension: "safe-bash",
      action: "auto-branch",
      outcome: "skipped",
      tool,
      cwd: ctx.cwd,
      branch: "main",
      modelId,
      provider,
      taskId: null,
      reasons: auditReasons,
      ...metadata,
    });

    return {
      ok: false,
      reason: mainMutationBlockReason(tool === "bash" ? "mutating bash command" : tool, "No active task is in progress with an owner and acceptance criteria."),
      auditReasons,
    };
  }

  const dirtyState = await getDirtyTrackedFiles(pi, ctx.cwd);
  if (dirtyState.error) {
    const auditReasons = [`git status check failed: ${dirtyState.error}`];
    await appendAuditLog(ctx.cwd, {
      ts: new Date().toISOString(),
      extension: "safe-bash",
      action: "auto-branch",
      outcome: "failed",
      tool,
      cwd: ctx.cwd,
      branch: "main",
      modelId,
      provider,
      taskId: task.id,
      reasons: auditReasons,
      ...metadata,
    });

    return {
      ok: false,
      reason: mainMutationBlockReason(tool === "bash" ? "mutating bash command" : tool, `Could not inspect repo state: ${dirtyState.error}.`),
      auditReasons,
    };
  }

  const dirtyTrackedFiles = dirtyState.files ?? [];
  if (!dirtyTrackedFilesAreAllowedBookkeeping(dirtyTrackedFiles)) {
    const unexpectedDirtyFiles = dirtyTrackedFiles.filter(
      (path) => !ALLOWED_BOOKKEEPING_DIRTY_PATHS.has(normalizeRepoRelativePath(path)),
    );
    const auditReasons = [`unexpected dirty tracked files: ${unexpectedDirtyFiles.join(", ")}`];
    await appendAuditLog(ctx.cwd, {
      ts: new Date().toISOString(),
      extension: "safe-bash",
      action: "auto-branch",
      outcome: "skipped",
      tool,
      cwd: ctx.cwd,
      branch: "main",
      modelId,
      provider,
      taskId: task.id,
      dirtyTrackedFiles,
      reasons: auditReasons,
      ...metadata,
    });

    return {
      ok: false,
      reason: mainMutationBlockReason(
        tool === "bash" ? "mutating bash command" : tool,
        `Unexpected dirty tracked files: ${unexpectedDirtyFiles.join(", ")}.`,
      ),
      auditReasons,
    };
  }

  const branchResult = await ensureTaskBranch(pi, ctx.cwd, task);
  if (branchResult.ok === false) {
    const auditReasons = [`git switch failed: ${branchResult.error}`];
    await appendAuditLog(ctx.cwd, {
      ts: new Date().toISOString(),
      extension: "safe-bash",
      action: "auto-branch",
      outcome: "failed",
      tool,
      cwd: ctx.cwd,
      branch: "main",
      toBranch: branchResult.branch,
      modelId,
      provider,
      taskId: task.id,
      dirtyTrackedFiles,
      reasons: auditReasons,
      ...metadata,
    });

    return {
      ok: false,
      reason: mainMutationBlockReason(
        tool === "bash" ? "mutating bash command" : tool,
        `Automatic branch switch failed: ${branchResult.error}.`,
      ),
      auditReasons,
    };
  }

  await appendAuditLog(ctx.cwd, {
    ts: new Date().toISOString(),
    extension: "safe-bash",
    action: "auto-branch",
    outcome: branchResult.mode,
    tool,
    cwd: ctx.cwd,
    branch: "main",
    toBranch: branchResult.branch,
    modelId,
    provider,
    taskId: task.id,
    taskTitle: task.title,
    dirtyTrackedFiles,
    ...metadata,
  });

  return {
    ok: true,
    branch: branchResult.branch,
    mode: branchResult.mode,
    task,
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const rawPath = String((event.input as { path?: string }).path ?? "");
      const absolutePath = resolveToolPath(ctx.cwd, rawPath);
      const protectedReason = findProtectedPathReason(absolutePath);
      let branch = await getCurrentBranch(pi, ctx.cwd);
      const modelId = modelIdFromContext(ctx);
      const provider = providerFromModelId(modelId);

      if (protectedReason) {
        await appendAuditLog(ctx.cwd, {
          ts: new Date().toISOString(),
          extension: "safe-bash",
          action: "blocked",
          tool: event.toolName,
          cwd: ctx.cwd,
          branch,
          modelId,
          provider,
          path: rawPath,
          resolvedPath: absolutePath,
          reasons: [protectedReason],
        });

        return {
          block: true,
          reason: `Blocked ${event.toolName}: ${protectedReason}`,
        };
      }

      if (branch === "main") {
        const autoBranch = await attemptAutoBranchOnMain(pi, ctx, event.toolName, {
          path: rawPath,
          resolvedPath: absolutePath,
        });

        if (autoBranch.ok === false) {
          await appendAuditLog(ctx.cwd, {
            ts: new Date().toISOString(),
            extension: "safe-bash",
            action: "blocked",
            tool: event.toolName,
            cwd: ctx.cwd,
            branch,
            modelId,
            provider,
            path: rawPath,
            resolvedPath: absolutePath,
            reasons: autoBranch.auditReasons,
          });

          return {
            block: true,
            reason: autoBranch.reason,
          };
        }

        branch = autoBranch.branch;
      }

      await appendAuditLog(ctx.cwd, {
        ts: new Date().toISOString(),
        extension: "safe-bash",
        action: "allowed-mutation",
        tool: event.toolName,
        cwd: ctx.cwd,
        branch,
        modelId,
        provider,
        path: rawPath,
        resolvedPath: absolutePath,
      });

      return;
    }

    if (event.toolName !== "bash") return;

    const command = String((event.input as { command?: string }).command ?? "");
    let branch = await getCurrentBranch(pi, ctx.cwd);
    const modelId = modelIdFromContext(ctx);
    const provider = providerFromModelId(modelId);

    const protectedPathReason = commandTouchesProtectedPath(command);
    if (protectedPathReason) {
      await appendAuditLog(ctx.cwd, {
        ts: new Date().toISOString(),
        extension: "safe-bash",
        action: "blocked",
        tool: "bash",
        cwd: ctx.cwd,
        branch,
        modelId,
        provider,
        command,
        reasons: [protectedPathReason],
      });

      return {
        block: true,
        reason: `Blocked bash command: ${protectedPathReason}`,
      };
    }

    const risk = classifyBashRisk(command);

    if (risk.level === "block") {
      await appendAuditLog(ctx.cwd, {
        ts: new Date().toISOString(),
        extension: "safe-bash",
        action: "blocked",
        tool: "bash",
        cwd: ctx.cwd,
        branch,
        modelId,
        provider,
        command,
        reasons: risk.reasons,
      });

      return {
        block: true,
        reason: `Blocked bash command: ${risk.reasons.join("; ")}`,
      };
    }

    if (branch === "main" && commandLooksMutating(command)) {
      if (!bashCommandEligibleForAutoBranch(command)) {
        const auditReasons = ["command is not eligible for automatic branching"];
        await appendAuditLog(ctx.cwd, {
          ts: new Date().toISOString(),
          extension: "safe-bash",
          action: "auto-branch",
          outcome: "skipped",
          tool: "bash",
          cwd: ctx.cwd,
          branch,
          modelId,
          provider,
          command,
          reasons: auditReasons,
        });

        const reason = mainMutationBlockReason(
          "mutating bash command",
          "Command is not eligible for automatic branching.",
        );

        await appendAuditLog(ctx.cwd, {
          ts: new Date().toISOString(),
          extension: "safe-bash",
          action: "blocked",
          tool: "bash",
          cwd: ctx.cwd,
          branch,
          modelId,
          provider,
          command,
          reasons: auditReasons,
        });

        return {
          block: true,
          reason,
        };
      }

      const autoBranch = await attemptAutoBranchOnMain(pi, ctx, "bash", { command });
      if (autoBranch.ok === false) {
        await appendAuditLog(ctx.cwd, {
          ts: new Date().toISOString(),
          extension: "safe-bash",
          action: "blocked",
          tool: "bash",
          cwd: ctx.cwd,
          branch,
          modelId,
          provider,
          command,
          reasons: autoBranch.auditReasons,
        });

        return {
          block: true,
          reason: autoBranch.reason,
        };
      }

      branch = autoBranch.branch;
    }

    if (risk.level === "warn") {
      if (!ctx.hasUI) {
        await appendAuditLog(ctx.cwd, {
          ts: new Date().toISOString(),
          extension: "safe-bash",
          action: "blocked",
          tool: "bash",
          cwd: ctx.cwd,
          branch,
          modelId,
          provider,
          command,
          reasons: [...risk.reasons, "warn-level command blocked because no interactive confirmation UI exists"],
        });

        return {
          block: true,
          reason: `Risky bash command blocked in non-interactive mode: ${risk.reasons.join("; ")}`,
        };
      }

      const ok = await ctx.ui.confirm(
        "Risky bash command",
        `${command}\n\nReasons:\n- ${risk.reasons.join("\n- ")}\n\nAllow this command?`,
      );

      await appendAuditLog(ctx.cwd, {
        ts: new Date().toISOString(),
        extension: "safe-bash",
        action: ok ? "confirmed" : "blocked",
        tool: "bash",
        cwd: ctx.cwd,
        branch,
        modelId,
        provider,
        command,
        reasons: risk.reasons,
      });

      if (!ok) {
        return {
          block: true,
          reason: `Blocked by user after warning: ${risk.reasons.join("; ")}`,
        };
      }
    }

    if (commandLooksMutating(command)) {
      await appendAuditLog(ctx.cwd, {
        ts: new Date().toISOString(),
        extension: "safe-bash",
        action: "allowed-mutation",
        tool: "bash",
        cwd: ctx.cwd,
        branch,
        modelId,
        provider,
        command,
        riskLevel: risk.level,
      });
    }
  });
}
