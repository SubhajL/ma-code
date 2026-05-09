import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type OrchestratorRunLane = "queue_level" | "worker_job" | "parallel_lanes";
export type OrchestratorRunStatus = "completed" | "blocked" | "failed" | "stopped";
export type OrchestratorRunStopReason =
  | "approval_boundary"
  | "validation_failure"
  | "lease_conflict"
  | "dirty_repo"
  | "max_steps"
  | "max_runtime"
  | "none";

export interface DelegatedRunCall {
  command: string;
  executable: "npm";
  args: string[];
}

export interface DelegatedRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type DelegatedRunRunner = (call: DelegatedRunCall) => Promise<DelegatedRunResult>;

export interface OrchestratorRunPreflightResult {
  safe: boolean;
  blockers: string[];
}

export type OrchestratorRunPreflight = (repoRoot: string) => Promise<OrchestratorRunPreflightResult>;

export interface OrchestratorRunRequest {
  repoRoot?: string;
  lane?: OrchestratorRunLane;
  initiative?: string;
  jobId?: string;
  maxSteps?: number;
  maxRuntimeSeconds?: number;
  maxParallel?: number;
  workerCommand?: string;
  allowPrCreate?: boolean;
  approvalRef?: string;
}

export interface OrchestratorRunSessionResult {
  version: 1;
  mode: "run";
  runId: string;
  selectedLane: OrchestratorRunLane | null;
  delegatedCommand: string | null;
  status: OrchestratorRunStatus;
  limits: {
    maxSteps: number | null;
    maxRuntimeSeconds: number | null;
    maxParallel: number;
  };
  startedWork: string[];
  completedWork: string[];
  blockers: string[];
  stopReason: OrchestratorRunStopReason;
  pr: {
    created: false;
    url: null;
    gateStatus: null;
  };
  merge: {
    attempted: false;
    allowed: false;
    reason: "Phase 4 stops before merge by default";
  };
  rawOutputExcerpt: string;
  nextSafeActions: string[];
}

const ALLOWED_SCRIPTS: Record<OrchestratorRunLane, string> = {
  queue_level: "harness:afk-orchestrate",
  worker_job: "harness:worker-execute",
  parallel_lanes: "harness:parallel-worker-lanes",
};
const FORBIDDEN_COMMAND_TOKENS = ["harness:merge", " pr-lifecycle ", "sync-main", ".pi/agent/state/runtime"];
const UNSAFE_WORKER_COMMAND = /(^|\s)(git|gh\s+pr\s+merge|rm\s+-rf|merge|apply|sync-main|--force|force-with-lease)(\s|$)/i;

function nowRunId(): string {
  return `orch-run-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase()}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'"'"'`)}'`;
}

function commandString(script: string, argsAfterSeparator: string[]): string {
  return ["npm", "run", script, "--", ...argsAfterSeparator.map(shellQuote)].join(" ");
}

function callFor(script: string, argsAfterSeparator: string[]): DelegatedRunCall {
  return { command: commandString(script, argsAfterSeparator), executable: "npm", args: ["run", script, "--", ...argsAfterSeparator] };
}

function positiveInteger(value: number | undefined, label: string): number {
  if (value === undefined) throw new Error(`${label} is required.`);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function optionalPositiveInteger(value: number | undefined, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function assertSlug(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) throw new Error(`${label} must be a lowercase slug.`);
  return normalized;
}

function assertJobId(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error("--job-id is required for worker-job run lane.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) throw new Error("--job-id contains unsafe characters.");
  return normalized;
}

function excerpt(stdout: string, stderr: string): string {
  return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim().slice(0, 2000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((entry) => (typeof entry === "string" ? [entry] : [])) : [];
}

function baseResult(input: OrchestratorRunRequest, selectedLane: OrchestratorRunLane | null, delegatedCommand: string | null): OrchestratorRunSessionResult {
  return {
    version: 1,
    mode: "run",
    runId: nowRunId(),
    selectedLane,
    delegatedCommand,
    status: "blocked",
    limits: {
      maxSteps: input.maxSteps ?? null,
      maxRuntimeSeconds: input.maxRuntimeSeconds ?? null,
      maxParallel: input.maxParallel ?? 1,
    },
    startedWork: [],
    completedWork: [],
    blockers: [],
    stopReason: "none",
    pr: { created: false, url: null, gateStatus: null },
    merge: { attempted: false, allowed: false, reason: "Phase 4 stops before merge by default" },
    rawOutputExcerpt: "",
    nextSafeActions: [],
  };
}

function blocked(input: OrchestratorRunRequest, selectedLane: OrchestratorRunLane | null, blockers: string[], stopReason: OrchestratorRunStopReason = "none"): OrchestratorRunSessionResult {
  return {
    ...baseResult(input, selectedLane, null),
    status: "blocked",
    blockers: unique(blockers),
    stopReason,
    nextSafeActions: ["Resolve the visible blockers, then rerun harness:orchestrate run with explicit bounds."],
  };
}

function selectLane(input: OrchestratorRunRequest): OrchestratorRunLane {
  if (input.lane) {
    if (input.lane === "worker_job" && input.jobId === undefined) throw new Error("--lane worker_job requires --job-id.");
    if (input.lane !== "worker_job" && input.jobId !== undefined) throw new Error("Exactly one lane may be selected; --job-id selects worker_job and cannot be combined with a different lane.");
    return input.lane;
  }
  return input.jobId ? "worker_job" : "queue_level";
}

function assertSafeWorkerCommand(command: string | undefined): string {
  const normalized = command?.trim();
  if (!normalized) throw new Error("--worker-command is required for parallel-lanes run delegation.");
  if (UNSAFE_WORKER_COMMAND.test(normalized) || normalized.includes(".pi/agent/state/runtime") || normalized.includes("harness:merge")) {
    throw new Error("parallel-lanes --worker-command contains an unsafe token.");
  }
  return normalized;
}

function buildDelegatedRunCall(input: OrchestratorRunRequest): { lane: OrchestratorRunLane; call: DelegatedRunCall } {
  const lane = selectLane(input);
  const initiative = assertSlug(input.initiative, "--initiative");
  const maxSteps = positiveInteger(input.maxSteps, "--max-steps");
  const maxRuntimeSeconds = positiveInteger(input.maxRuntimeSeconds, "--max-runtime-seconds");
  const maxParallel = optionalPositiveInteger(input.maxParallel, "--max-parallel", 1);
  if (input.allowPrCreate && !input.approvalRef?.trim()) throw new Error("--allow-pr-create requires --approval-ref.");

  if (lane === "queue_level") {
    const args = ["run", "--run", "--initiative", initiative, "--max-steps", String(maxSteps), "--max-runtime-seconds", String(maxRuntimeSeconds)];
    if (input.maxParallel !== undefined) args.push("--max-parallel", String(maxParallel));
    args.push("--json");
    return { lane, call: callFor(ALLOWED_SCRIPTS[lane], args) };
  }

  if (lane === "worker_job") {
    const jobId = assertJobId(input.jobId);
    const args = ["run", "--initiative", initiative, "--job-id", jobId, "--max-steps", String(maxSteps), "--max-runtime-seconds", String(maxRuntimeSeconds), "--stop-before-pr"];
    if (input.allowPrCreate && input.approvalRef) args.push("--allow-pr-create", "--approval-ref", input.approvalRef.trim());
    args.push("--json");
    return { lane, call: callFor(ALLOWED_SCRIPTS[lane], args) };
  }

  const workerCommand = assertSafeWorkerCommand(input.workerCommand);
  const args = ["run", "--initiative", initiative, "--max-parallel", String(maxParallel), "--max-runtime-seconds", String(maxRuntimeSeconds), "--worker-command", workerCommand, "--json"];
  return { lane, call: callFor(ALLOWED_SCRIPTS[lane], args) };
}

function splitShellLike(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("Delegated command has unterminated shell quote.");
  if (current) tokens.push(current);
  return tokens;
}

function tokensAfterSeparator(tokens: string[]): string[] {
  const separator = tokens.indexOf("--");
  if (separator < 0) throw new Error("Delegated run command must use npm '--' argument separator.");
  return tokens.slice(separator + 1);
}

export function assertSafeDelegatedRunCommand(lane: OrchestratorRunLane, command: string): DelegatedRunCall {
  const tokens = splitShellLike(command);
  if (tokens.length < 5 || tokens[0] !== "npm" || tokens[1] !== "run") throw new Error("Delegated run command must start with npm run.");
  const script = tokens[2];
  if (script !== ALLOWED_SCRIPTS[lane]) throw new Error(`Delegated run command is not allowlisted for ${lane}.`);
  const commandWithSpaces = ` ${command.toLowerCase()} `;
  for (const token of FORBIDDEN_COMMAND_TOKENS) {
    if (commandWithSpaces.includes(token)) throw new Error(`Delegated run command contains unsafe token: ${token.trim()}`);
  }
  const after = tokensAfterSeparator(tokens);
  if (lane === "queue_level") {
    if (after[0] !== "run" || !after.includes("--run") || !after.includes("--max-steps") || !after.includes("--max-runtime-seconds") || !after.includes("--json")) {
      throw new Error("queue_level run command must use bounded AFK run --run with JSON output.");
    }
  } else if (lane === "worker_job") {
    if (after[0] !== "run" || !after.includes("--job-id") || !after.includes("--max-steps") || !after.includes("--max-runtime-seconds") || !after.includes("--stop-before-pr") || !after.includes("--json")) {
      throw new Error("worker_job run command must execute one bounded worker job and stop before PR.");
    }
  } else {
    if (after[0] !== "run" || !after.includes("--max-parallel") || !after.includes("--max-runtime-seconds") || !after.includes("--worker-command") || !after.includes("--json")) {
      throw new Error("parallel_lanes run command must use bounded foreground parallel worker lanes.");
    }
    const workerCommandIndex = after.indexOf("--worker-command");
    assertSafeWorkerCommand(after[workerCommandIndex + 1]);
  }
  return { command, executable: "npm", args: tokens.slice(1) };
}

export async function defaultOrchestratorRunPreflight(repoRoot: string): Promise<OrchestratorRunPreflightResult> {
  try {
    const result = await execFile("git", ["-C", repoRoot, "status", "--porcelain"], { encoding: "utf8" });
    const dirtyLines = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    const blockers: string[] = [];
    if (dirtyLines.length > 0) blockers.push(`dirty repo: ${dirtyLines.slice(0, 5).join("; ")}`);
    if (dirtyLines.some((line) => line.includes(".pi/agent/state/runtime") || /\.env(?:\.|$)/.test(line))) blockers.push("protected path mutation is visible in git status.");
    return { safe: blockers.length === 0, blockers };
  } catch {
    return { safe: true, blockers: [] };
  }
}

async function defaultRunner(call: DelegatedRunCall): Promise<DelegatedRunResult> {
  const args = call.args[0] === "run" ? ["run", "--silent", ...call.args.slice(1)] : call.args;
  try {
    const result = await execFile(call.executable, args, { encoding: "utf8", maxBuffer: 1024 * 1024 });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const typed = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { exitCode: typeof typed.code === "number" ? typed.code : 1, stdout: typed.stdout ?? "", stderr: typed.stderr ?? typed.message };
  }
}

function stopReasonFrom(lane: OrchestratorRunLane, record: Record<string, unknown>, raw: string): OrchestratorRunStopReason {
  const text = `${String(record.stopReason ?? "")} ${String(record.lastAction ?? "")} ${raw}`.toLowerCase();
  if (text.includes("approval")) return "approval_boundary";
  if (lane === "worker_job" && String(record.status) === "review_ready") return "approval_boundary";
  if (text.includes("validation")) return "validation_failure";
  if (text.includes("lease") || text.includes("conflict")) return "lease_conflict";
  if (text.includes("max_steps") || text.includes("max steps")) return "max_steps";
  if (text.includes("max_runtime") || text.includes("max runtime")) return "max_runtime";
  return "none";
}

function statusFrom(lane: OrchestratorRunLane, record: Record<string, unknown>, stopReason: OrchestratorRunStopReason): OrchestratorRunStatus {
  const rawStatus = String(record.status ?? "").toLowerCase();
  if (rawStatus.includes("failed") || rawStatus === "error") return "failed";
  if (rawStatus.includes("blocked") || readStrings(record.blockers).length > 0) return "blocked";
  if (stopReason === "approval_boundary" || stopReason === "max_steps" || stopReason === "max_runtime") return "stopped";
  if (lane === "worker_job" && rawStatus === "review_ready") return "stopped";
  return "completed";
}

function workStarted(lane: OrchestratorRunLane, record: Record<string, unknown>): string[] {
  if (lane === "queue_level") return readStrings(record.startedQueueJobs);
  if (lane === "worker_job") return typeof record.queueJobId === "string" && record.status === "running" ? [record.queueJobId] : [];
  return Array.isArray(record.lanes) ? record.lanes.flatMap((laneRecord) => isRecord(laneRecord) && typeof laneRecord.laneId === "string" && laneRecord.status === "running" ? [laneRecord.laneId] : []) : [];
}

function workCompleted(lane: OrchestratorRunLane, record: Record<string, unknown>): string[] {
  if (lane === "worker_job") return typeof record.queueJobId === "string" && ["review_ready", "done"].includes(String(record.status)) ? [record.queueJobId] : [];
  if (lane === "parallel_lanes") return Array.isArray(record.lanes) ? record.lanes.flatMap((laneRecord) => isRecord(laneRecord) && typeof laneRecord.laneId === "string" && laneRecord.status === "done" ? [laneRecord.laneId] : []) : [];
  return [];
}

export async function runOrchestratorRun(input: OrchestratorRunRequest, runner: DelegatedRunRunner = defaultRunner, preflight: OrchestratorRunPreflight = defaultOrchestratorRunPreflight): Promise<OrchestratorRunSessionResult> {
  let lane: OrchestratorRunLane | null = null;
  let call: DelegatedRunCall | null = null;
  try {
    const built = buildDelegatedRunCall(input);
    lane = built.lane;
    call = assertSafeDelegatedRunCommand(lane, built.call.command);
  } catch (error) {
    return blocked(input, lane, [(error as Error).message]);
  }

  const repoRoot = input.repoRoot ?? process.cwd();
  const safety = await preflight(repoRoot);
  if (!safety.safe) return blocked(input, lane, safety.blockers, "dirty_repo");

  const result = await runner(call);
  const base = baseResult(input, lane, call.command);
  if (result.exitCode !== 0) {
    return {
      ...base,
      status: result.stderr.toLowerCase().includes("lease") ? "blocked" : "failed",
      blockers: [`Delegated helper exited with code ${result.exitCode}.`],
      stopReason: result.stderr.toLowerCase().includes("lease") ? "lease_conflict" : "none",
      rawOutputExcerpt: excerpt(result.stdout, result.stderr),
      nextSafeActions: ["Inspect the delegated helper output and resolve blockers before rerunning."],
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = isRecord(JSON.parse(result.stdout)) ? JSON.parse(result.stdout) as Record<string, unknown> : {};
  } catch {
    return {
      ...base,
      status: "failed",
      blockers: ["Delegated helper emitted invalid JSON."],
      rawOutputExcerpt: excerpt(result.stdout, result.stderr),
      nextSafeActions: ["Rerun the selected lane directly to inspect helper output."],
    };
  }

  const stopReason = stopReasonFrom(lane, parsed, result.stdout);
  const blockers = readStrings(parsed.blockers);
  const status = statusFrom(lane, parsed, stopReason);
  return {
    ...base,
    status,
    blockers,
    stopReason,
    startedWork: workStarted(lane, parsed),
    completedWork: workCompleted(lane, parsed),
    rawOutputExcerpt: "",
    nextSafeActions: unique([
      typeof parsed.nextOperatorAction === "string" ? parsed.nextOperatorAction : "",
      status === "completed" ? "Inspect run evidence and decide whether a separate PR lifecycle handoff is appropriate." : "Inspect blockers and rerun only after the boundary is resolved.",
    ]),
  };
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function orchestratorRunExtension(): void {}
