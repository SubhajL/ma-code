import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const LEASES_FILE = ".pi/agent/state/runtime/leases.json";
export const EXECUTION_LEASE_STATE_VERSION = 1 as const;
export const QUEUE_SESSION_LEASE_SCOPE = "queue-session";

export interface ExecutionLeaseRecord {
  id: string;
  scope: string;
  owner: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string | null;
}

export interface ExecutionLeaseState {
  version: 1;
  leases: ExecutionLeaseRecord[];
}

export interface AcquireExecutionLeaseInput {
  id: string;
  scope: string;
  owner: string;
  acquiredAt?: string;
  expiresAt: string;
  heartbeatAt?: string | null;
  now?: string;
}

export interface AcquireExecutionLeaseResult {
  acquired: boolean;
  lease: ExecutionLeaseRecord | null;
  conflict: ExecutionLeaseRecord | null;
  state: ExecutionLeaseState;
}

export interface ReleaseExecutionLeaseResult {
  released: boolean;
  releasedLease: ExecutionLeaseRecord | null;
  state: ExecutionLeaseState;
}

export interface ExecutionLeaseSummary {
  activeLeaseCount: number;
  activeScopes: string[];
  leases: Array<Pick<ExecutionLeaseRecord, "id" | "scope" | "owner" | "expiresAt" | "heartbeatAt">>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function defaultExecutionLeaseState(): ExecutionLeaseState {
  return {
    version: EXECUTION_LEASE_STATE_VERSION,
    leases: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLeaseRecord(raw: unknown): ExecutionLeaseRecord | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string") return null;
  if (typeof raw.scope !== "string") return null;
  if (typeof raw.owner !== "string") return null;
  if (typeof raw.acquiredAt !== "string") return null;
  if (typeof raw.expiresAt !== "string") return null;
  if (!(typeof raw.heartbeatAt === "string" || raw.heartbeatAt === null || raw.heartbeatAt === undefined)) return null;

  const heartbeatAt = typeof raw.heartbeatAt === "string" ? raw.heartbeatAt : null;

  return {
    id: raw.id,
    scope: raw.scope,
    owner: raw.owner,
    acquiredAt: raw.acquiredAt,
    expiresAt: raw.expiresAt,
    heartbeatAt,
  };
}

export function normalizeExecutionLeaseState(raw: unknown): ExecutionLeaseState {
  if (!isRecord(raw)) return defaultExecutionLeaseState();
  const leases = Array.isArray(raw.leases) ? raw.leases.map(normalizeLeaseRecord).filter((lease): lease is ExecutionLeaseRecord => lease !== null) : [];
  return {
    version: EXECUTION_LEASE_STATE_VERSION,
    leases,
  };
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isExpired(lease: ExecutionLeaseRecord, now: string): boolean {
  const expiresMs = timestampMs(lease.expiresAt);
  const nowMs = timestampMs(now);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) return false;
  return expiresMs <= nowMs;
}

export function pruneExpiredExecutionLeases(state: ExecutionLeaseState, now: string = nowIso()): ExecutionLeaseState {
  return {
    version: EXECUTION_LEASE_STATE_VERSION,
    leases: state.leases.filter((lease) => !isExpired(lease, now)),
  };
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function resolveLeaseFile(cwd: string): string {
  return resolve(cwd, LEASES_FILE);
}

export async function readExecutionLeaseState(cwd: string): Promise<ExecutionLeaseState> {
  const absolute = resolveLeaseFile(cwd);
  if (!(await pathExists(absolute))) {
    return defaultExecutionLeaseState();
  }

  const raw = await readFile(absolute, "utf8");
  return normalizeExecutionLeaseState(JSON.parse(raw));
}

export async function writeExecutionLeaseState(cwd: string, state: ExecutionLeaseState): Promise<void> {
  const absolute = resolveLeaseFile(cwd);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(normalizeExecutionLeaseState(state), null, 2)}\n`, "utf8");
}

export async function acquireExecutionLease(cwd: string, input: AcquireExecutionLeaseInput): Promise<AcquireExecutionLeaseResult> {
  const current = await readExecutionLeaseState(cwd);
  const now = input.now ?? input.acquiredAt ?? nowIso();
  const state = pruneExpiredExecutionLeases(current, now);
  const conflict = state.leases.find((lease) => lease.scope === input.scope) ?? null;

  if (conflict) {
    await writeExecutionLeaseState(cwd, state);
    return {
      acquired: false,
      lease: null,
      conflict,
      state,
    };
  }

  const lease: ExecutionLeaseRecord = {
    id: input.id,
    scope: input.scope,
    owner: input.owner,
    acquiredAt: input.acquiredAt ?? now,
    expiresAt: input.expiresAt,
    heartbeatAt: input.heartbeatAt ?? null,
  };

  const nextState: ExecutionLeaseState = {
    version: EXECUTION_LEASE_STATE_VERSION,
    leases: [...state.leases, lease],
  };
  await writeExecutionLeaseState(cwd, nextState);
  return {
    acquired: true,
    lease,
    conflict: null,
    state: nextState,
  };
}

export async function releaseExecutionLease(cwd: string, leaseId: string): Promise<ReleaseExecutionLeaseResult> {
  const current = await readExecutionLeaseState(cwd);
  const releasedLease = current.leases.find((lease) => lease.id === leaseId) ?? null;
  const nextState: ExecutionLeaseState = {
    version: EXECUTION_LEASE_STATE_VERSION,
    leases: current.leases.filter((lease) => lease.id !== leaseId),
  };
  await writeExecutionLeaseState(cwd, nextState);
  return {
    released: releasedLease !== null,
    releasedLease,
    state: nextState,
  };
}

export function summarizeExecutionLeases(state: ExecutionLeaseState): ExecutionLeaseSummary {
  return {
    activeLeaseCount: state.leases.length,
    activeScopes: [...new Set(state.leases.map((lease) => lease.scope))],
    leases: state.leases.map((lease) => ({
      id: lease.id,
      scope: lease.scope,
      owner: lease.owner,
      expiresAt: lease.expiresAt,
      heartbeatAt: lease.heartbeatAt,
    })),
  };
}
