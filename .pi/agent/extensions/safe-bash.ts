import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type RiskLevel = "allow" | "warn" | "block";

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

function commandTouchesProtectedPath(command: string): string | null {
  const suspiciousPatterns: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /(?:>|>>|\btee\b)[^\n]*\.env(?:\.[A-Za-z0-9_-]+)?\b/i, reason: ".env write detected" },
    { pattern: /(?:>|>>|\btee\b)[^\n]*\.git\//i, reason: ".git write detected" },
    {
      pattern: /(?:>|>>|\btee\b)[^\n]*\.pi\/agent\/state\/runtime\//i,
      reason: "runtime state write detected",
    },
  ];

  for (const rule of suspiciousPatterns) {
    if (rule.pattern.test(command)) return rule.reason;
  }
  return null;
}

async function getCurrentBranch(pi: ExtensionAPI, cwd: string): Promise<string | null> {
  const result = await pi.exec("git", ["-C", cwd, "branch", "--show-current"]);
  if (result.code !== 0) return null;

  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
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
  const logFile = resolve(cwd, "logs", "harness-actions.jsonl");
  await mkdir(dirname(logFile), { recursive: true });

  await withFileMutationQueue(logFile, async () => {
    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const rawPath = String((event.input as { path?: string }).path ?? "");
      const absolutePath = resolveToolPath(ctx.cwd, rawPath);
      const protectedReason = findProtectedPathReason(absolutePath);
      const branch = await getCurrentBranch(pi, ctx.cwd);
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
          reasons: ["tracked file mutation on main is blocked"],
        });

        return {
          block: true,
          reason: "Tracked file mutation on `main` is blocked. Create a branch or worktree first.",
        };
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
    const branch = await getCurrentBranch(pi, ctx.cwd);
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

    if (branch === "main" && commandLooksMutating(command)) {
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
        reasons: ["mutating command on main is blocked"],
      });

      return {
        block: true,
        reason: "Mutating bash commands on `main` are blocked. Create a branch or worktree first.",
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
