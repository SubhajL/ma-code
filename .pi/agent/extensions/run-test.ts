import type { ExtensionAPI, ExecResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { appendAuditEntry, type AuditLogEntry } from "./lib/audit-log.ts";
const NAMESPACED_SCRIPT_PATTERN = /^(test|validate):[a-z0-9][a-z0-9:-]*$/;
const STANDALONE_SCRIPT_PATTERN = /^typecheck$/;
const DISALLOWED_FLAG_PATTERN = /^(--no-verify|--unsafe-perm|--ignore-scripts)$/;

export interface RunTestInput {
  script: string;
  args?: string[];
}

export interface RunTestOutcome {
  ok: boolean;
  script: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  reason: string | null;
  reasons: string[];
}

export interface RunTestDeps {
  exec(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
  cwd: string;
  now?: () => number;
  appendAudit?(entry: Record<string, unknown>): Promise<void>;
  modelId?: string | null;
  provider?: string | null;
}

const RunTestSchema = Type.Object({
  script: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Array(Type.String())),
});

export interface RunTestValidation {
  ok: boolean;
  reason: string | null;
  reasons: string[];
}

export function validateRunTestInput(input: RunTestInput): RunTestValidation {
  if (!input.script || input.script.length === 0) {
    const reason = "script must be a non-empty npm script name";
    return { ok: false, reason, reasons: [reason] };
  }
  if (!STANDALONE_SCRIPT_PATTERN.test(input.script) && !NAMESPACED_SCRIPT_PATTERN.test(input.script)) {
    const reason = `script must be a known test:*, validate:*, or typecheck npm script (got: ${input.script})`;
    return { ok: false, reason, reasons: [reason] };
  }
  for (const arg of input.args ?? []) {
    if (DISALLOWED_FLAG_PATTERN.test(arg)) {
      const reason = `disallowed npm flag in args: ${arg}`;
      return { ok: false, reason, reasons: [reason] };
    }
  }
  return { ok: true, reason: null, reasons: [] };
}

export async function executeRunTest(deps: RunTestDeps, input: RunTestInput): Promise<RunTestOutcome> {
  const args = input.args ?? [];
  const validation = validateRunTestInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      script: input.script,
      args,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      reason: validation.reason,
      reasons: validation.reasons,
    };
  }

  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const execArgs = ["run", input.script];
  if (args.length > 0) {
    execArgs.push("--", ...args);
  }

  const result = await deps.exec("npm", execArgs);
  const durationMs = Math.max(0, now() - startedAt);

  const ok = result.code === 0;
  const reason = ok ? null : `npm run ${input.script} exited with code ${result.code}`;
  const outcome: RunTestOutcome = {
    ok,
    script: input.script,
    args,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
    reason,
    reasons: reason ? [reason] : [],
  };

  if (deps.appendAudit) {
    await deps.appendAudit({
      ts: new Date().toISOString(),
      extension: "run-test",
      tool: "run_test",
      action: ok ? "passed" : "failed",
      modelId: deps.modelId ?? null,
      provider: deps.provider ?? null,
      script: input.script,
      args,
      exitCode: outcome.exitCode,
      durationMs,
    });
  }

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

export default function runTestExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "run_test",
    label: "Run Test",
    description:
      "Run an allow-listed npm script (test:*, validate:*, or typecheck) and return exit code, stdout, stderr.",
    promptSnippet:
      "Prefer run_test over `bash npm run ...` when running test:*, validate:*, or typecheck scripts.",
    promptGuidelines: [
      "Use this typed tool rather than bash for running npm test/validate/typecheck scripts.",
      "The `script` argument must match an allow-listed npm script name (test:*, validate:*, or typecheck).",
      "Pass extra script arguments via the `args` array; they are appended after `--`.",
    ],
    parameters: RunTestSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const modelId = modelIdFromContext(ctx);
      const provider = providerFromModelId(modelId);
      const outcome = await executeRunTest(
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
