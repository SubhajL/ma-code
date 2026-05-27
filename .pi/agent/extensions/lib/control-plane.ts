import { appendAuditEntry, type AuditLogEntry } from "./audit-log.ts";

export const CONTROL_PLANE_AUDIT_EXTENSION = "control-plane";

export type ControlPlaneInputParseResult<TInput> =
  | { input: TInput }
  | { error: string };

export interface ControlPlaneContext {
  readonly cwd: string;
  readonly kernelCommand: string;
  /**
   * Caller-initiated audit emission. Asymmetric with the kernel's own
   * terminal emission: if this throws (e.g., SQLite contention), the
   * exception propagates out of `spec.run` and the kernel converts it
   * to a `ControlPlaneFailed` result. The kernel only "guards" its own
   * terminal `:ok` / `:blocked` / `:failed` emission via `auditError`
   * — caller emissions are the caller's responsibility. If you want
   * non-fatal intermediate audits, wrap the call in your own try/catch.
   */
  emitAudit(entry: Omit<AuditLogEntry, "ts" | "extension"> & { action: string }): Promise<void>;
}

export interface ControlPlaneCommandSpec<TName extends string, TInput, TValue> {
  readonly name: TName;
  parseInput(raw: unknown): ControlPlaneInputParseResult<TInput>;
  run(input: TInput, ctx: ControlPlaneContext): Promise<TValue>;
}

export interface ControlPlaneOk<TName extends string, TValue> {
  readonly status: "ok";
  readonly command: TName;
  readonly value: TValue;
  readonly auditError?: string;
}

export interface ControlPlaneBlocked<TName extends string> {
  readonly status: "blocked";
  readonly command: TName;
  readonly reason: string;
  readonly details?: Record<string, unknown>;
  readonly auditError?: string;
}

export interface ControlPlaneFailed<TName extends string> {
  readonly status: "failed";
  readonly command: TName;
  readonly error: { code: string; message: string };
  readonly auditError?: string;
}

export type ControlPlaneResult<TName extends string, TValue> =
  | ControlPlaneOk<TName, TValue>
  | ControlPlaneBlocked<TName>
  | ControlPlaneFailed<TName>;

export class ControlPlaneBlockedError extends Error {
  readonly reason: string;
  readonly details?: Record<string, unknown>;

  constructor(reason: string, details?: Record<string, unknown>) {
    super(`control_plane_blocked: ${reason}`);
    this.name = "ControlPlaneBlockedError";
    this.reason = reason;
    this.details = details;
  }
}

export interface RunControlPlaneCommandOptions {
  readonly cwd: string;
  /**
   * Optional override for audit emission. Defaults to writing through
   * `appendAuditEntry` so emissions land in the canonical SQLite
   * `audit_log` table plus the JSONL mirror. Tests use this to inject
   * failing emitters; production callers should leave it unset.
   */
  emitAudit?(cwd: string, entry: AuditLogEntry): Promise<void>;
}

export function defineControlPlaneCommand<TName extends string, TInput, TValue>(
  spec: ControlPlaneCommandSpec<TName, TInput, TValue>,
): ControlPlaneCommandSpec<TName, TInput, TValue> {
  return spec;
}

function errorCodeFrom(error: unknown): string {
  if (error instanceof Error && typeof error.name === "string" && error.name.length > 0) {
    return error.name;
  }
  return "UnknownError";
}

function errorMessageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function runControlPlaneCommand<TName extends string, TInput, TValue>(
  spec: ControlPlaneCommandSpec<TName, TInput, TValue>,
  rawInput: unknown,
  options: RunControlPlaneCommandOptions,
): Promise<ControlPlaneResult<TName, TValue>> {
  const { cwd } = options;
  const emit = options.emitAudit ?? appendAuditEntry;

  let parsed: ControlPlaneInputParseResult<TInput>;
  try {
    parsed = spec.parseInput(rawInput);
  } catch (error) {
    parsed = { error: `parse_threw:${errorMessageFrom(error)}` };
  }
  if ("error" in parsed) {
    // Input rejection short-circuits BEFORE audit so the audit log records
    // only validated work. Surfacing parse failures requires a structured
    // result (above) — they are caller-side bugs, not control-plane events.
    //
    // Convention: parse rejections always carry `reason: "invalid_input:<detail>"`.
    // Consumers that need to distinguish caller-side parse failures from
    // legitimate runtime-block decisions (e.g., a `waiting_for_human` from
    // bounded autonomy) can check `result.reason.startsWith("invalid_input:")`.
    return {
      status: "blocked",
      command: spec.name,
      reason: `invalid_input:${parsed.error}`,
    };
  }

  const input = parsed.input;
  const ctx: ControlPlaneContext = {
    cwd,
    kernelCommand: spec.name,
    async emitAudit(entry) {
      await emit(cwd, {
        ts: new Date().toISOString(),
        extension: CONTROL_PLANE_AUDIT_EXTENSION,
        ...entry,
      });
    },
  };

  let value: TValue;
  try {
    value = await spec.run(input, ctx);
  } catch (error) {
    if (error instanceof ControlPlaneBlockedError) {
      const blocked: ControlPlaneBlocked<TName> = {
        status: "blocked",
        command: spec.name,
        reason: error.reason,
        ...(error.details ? { details: error.details } : {}),
      };
      const auditError = await safeEmit(emit, cwd, {
        ts: new Date().toISOString(),
        extension: CONTROL_PLANE_AUDIT_EXTENSION,
        action: `${spec.name}:blocked`,
        reason: error.reason,
        ...(error.details ? { details: error.details } : {}),
      });
      return auditError ? { ...blocked, auditError } : blocked;
    }
    const failed: ControlPlaneFailed<TName> = {
      status: "failed",
      command: spec.name,
      error: { code: errorCodeFrom(error), message: errorMessageFrom(error) },
    };
    const auditError = await safeEmit(emit, cwd, {
      ts: new Date().toISOString(),
      extension: CONTROL_PLANE_AUDIT_EXTENSION,
      action: `${spec.name}:failed`,
      errorCode: failed.error.code,
      errorMessage: failed.error.message,
    });
    return auditError ? { ...failed, auditError } : failed;
  }

  const ok: ControlPlaneOk<TName, TValue> = {
    status: "ok",
    command: spec.name,
    value,
  };
  const auditError = await safeEmit(emit, cwd, {
    ts: new Date().toISOString(),
    extension: CONTROL_PLANE_AUDIT_EXTENSION,
    action: `${spec.name}:ok`,
  });
  return auditError ? { ...ok, auditError } : ok;
}

async function safeEmit(
  emit: (cwd: string, entry: AuditLogEntry) => Promise<void>,
  cwd: string,
  entry: AuditLogEntry,
): Promise<string | undefined> {
  try {
    await emit(cwd, entry);
    return undefined;
  } catch (error) {
    return errorMessageFrom(error);
  }
}
