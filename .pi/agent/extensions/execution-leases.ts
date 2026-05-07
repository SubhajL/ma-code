import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const LEASES_FILE = ".pi/agent/state/runtime/leases.json";
export const EXECUTION_LEASE_STATE_VERSION = 1 as const;
export const QUEUE_SESSION_LEASE_SCOPE = "queue-session";
export const LOCAL_MAIN_INTEGRATION_LEASE_SCOPE = "local-main-integration";
export const WORKER_LANE_LEASE_TYPE = "worker_lane";

export type ExecutionLeaseMetadata = Record<string, string | null>;

export interface ExecutionLeaseRecord {
  id: string;
  scope: string;
  owner: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string | null;
  metadata?: ExecutionLeaseMetadata;
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
  metadata?: ExecutionLeaseMetadata;
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

export interface ClearStaleExecutionLeasesResult {
  removedLeases: ExecutionLeaseRecord[];
  retainedLeases: ExecutionLeaseRecord[];
  state: ExecutionLeaseState;
}

export interface WorkerLaneLeaseInput {
  id: string;
  scopeKey: string;
  owner: string;
  expiresAt: string;
  acquiredAt?: string;
  now?: string;
  jobId?: string | null;
  taskId?: string | null;
  worktreePath: string;
  branchName: string;
}

export interface FindWorkerLaneLeaseInput {
  leaseId?: string;
  scopeKey?: string;
  owner?: string;
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

function normalizeLeaseMetadata(raw: unknown): ExecutionLeaseMetadata | undefined {
  if (!isRecord(raw)) return undefined;
  const metadata: ExecutionLeaseMetadata = {};
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (typeof value === "string") metadata[key] = value;
    if (value === null) metadata[key] = null;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
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
    metadata: normalizeLeaseMetadata(raw.metadata),
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

export function isExecutionLeaseStale(lease: ExecutionLeaseRecord, now: string = nowIso()): boolean {
  return isExpired(lease, now);
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
    metadata: input.metadata,
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

export async function clearStaleExecutionLeases(cwd: string, now: string = nowIso()): Promise<ClearStaleExecutionLeasesResult> {
  const current = await readExecutionLeaseState(cwd);
  const retainedState = pruneExpiredExecutionLeases(current, now);
  const retainedIds = new Set(retainedState.leases.map((lease) => lease.id));
  const removedLeases = current.leases.filter((lease) => !retainedIds.has(lease.id));
  await writeExecutionLeaseState(cwd, retainedState);
  return {
    removedLeases,
    retainedLeases: retainedState.leases,
    state: retainedState,
  };
}

export async function acquireLocalMainIntegrationLease(
  cwd: string,
  input: { id: string; owner: string; expiresAt: string; acquiredAt?: string; now?: string },
): Promise<AcquireExecutionLeaseResult> {
  return acquireExecutionLease(cwd, {
    id: input.id,
    scope: LOCAL_MAIN_INTEGRATION_LEASE_SCOPE,
    owner: input.owner,
    acquiredAt: input.acquiredAt,
    expiresAt: input.expiresAt,
    now: input.now,
  });
}

export async function releaseLocalMainIntegrationLease(cwd: string, leaseId: string): Promise<ReleaseExecutionLeaseResult> {
  return releaseExecutionLease(cwd, leaseId);
}

export function workerLaneLeaseScope(scopeKey: string): string {
  return `${WORKER_LANE_LEASE_TYPE}:${scopeKey}`;
}

export function findWorkerLaneLeaseInState(state: ExecutionLeaseState, input: FindWorkerLaneLeaseInput): ExecutionLeaseRecord | null {
  return state.leases.find((lease) => {
    if (lease.metadata?.leaseType !== WORKER_LANE_LEASE_TYPE && !lease.scope.startsWith(`${WORKER_LANE_LEASE_TYPE}:`)) return false;
    if (input.leaseId && lease.id !== input.leaseId) return false;
    if (input.scopeKey && lease.scope !== workerLaneLeaseScope(input.scopeKey)) return false;
    if (input.owner && lease.owner !== input.owner) return false;
    return true;
  }) ?? null;
}

export async function findWorkerLaneLease(cwd: string, input: FindWorkerLaneLeaseInput): Promise<ExecutionLeaseRecord | null> {
  return findWorkerLaneLeaseInState(await readExecutionLeaseState(cwd), input);
}

export async function acquireWorkerLaneLease(cwd: string, input: WorkerLaneLeaseInput): Promise<AcquireExecutionLeaseResult> {
  return acquireExecutionLease(cwd, {
    id: input.id,
    scope: workerLaneLeaseScope(input.scopeKey),
    owner: input.owner,
    acquiredAt: input.acquiredAt,
    expiresAt: input.expiresAt,
    now: input.now,
    metadata: {
      leaseType: WORKER_LANE_LEASE_TYPE,
      scopeKey: input.scopeKey,
      jobId: input.jobId ?? null,
      taskId: input.taskId ?? null,
      worktreePath: input.worktreePath,
      branchName: input.branchName,
    },
  });
}

export async function releaseWorkerLaneLease(cwd: string, input: FindWorkerLaneLeaseInput): Promise<ReleaseExecutionLeaseResult> {
  const lease = await findWorkerLaneLease(cwd, input);
  if (!lease) {
    return {
      released: false,
      releasedLease: null,
      state: await readExecutionLeaseState(cwd),
    };
  }
  return releaseExecutionLease(cwd, lease.id);
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
