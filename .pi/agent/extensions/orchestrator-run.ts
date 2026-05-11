import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { filterMeaningfulGitDirtyLines } from "./git-dirty-runtime-artifacts.ts";

const execFile = promisify(execFileCallback);

export type OrchestratorRunLane = "queue_level" | "worker_job" | "parallel_lanes";
export type OrchestratorMergeMethod = "squash" | "merge" | "rebase";
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
  autoLand?: boolean;
  disableAutoLand?: boolean;
  syncMain?: boolean;
  mergeMethod?: OrchestratorMergeMethod;
  approvalRef?: string;
}

export interface OrchestratorAutoLandPolicy {
  version: 1;
  enabled: boolean;
  lanes?: OrchestratorRunLane[];
  approvalRef?: string;
  syncMain?: boolean;
  mergeMethod?: OrchestratorMergeMethod;
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
    created: boolean;
    url: string | null;
    gateStatus: string | null;
  };
  merge: {
    attempted: boolean;
    allowed: boolean;
    reason: string;
  };
  autoLand?: {
    enabled: boolean;
    prRunId: string | null;
    commands: string[];
    syncedMain: boolean;
  };
  rawOutputExcerpt: string;
  nextSafeActions: string[];
}

const ALLOWED_SCRIPTS: Record<OrchestratorRunLane, string> = {
  queue_level: "harness:afk-orchestrate",
  worker_job: "harness:worker-execute",
  parallel_lanes: "harness:parallel-worker-lanes",
};
const DEFAULT_AUTO_LAND_POLICY_PATH = join(".pi", "agent", "routing", "orchestrator-auto-land-policy.json");
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

function isMergeMethod(value: unknown): value is OrchestratorMergeMethod {
  return value === "squash" || value === "merge" || value === "rebase";
}

function normalizeAutoLandPolicy(raw: unknown): OrchestratorAutoLandPolicy | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) throw new Error("orchestrator auto-land policy version must be 1.");
  const lanes = Array.isArray(record.lanes) ? record.lanes.filter((lane): lane is OrchestratorRunLane => lane === "worker_job" || lane === "queue_level" || lane === "parallel_lanes") : undefined;
  return {
    version: 1,
    enabled: record.enabled === true,
    lanes,
    approvalRef: typeof record.approvalRef === "string" && record.approvalRef.trim().length > 0 ? record.approvalRef.trim() : undefined,
    syncMain: typeof record.syncMain === "boolean" ? record.syncMain : undefined,
    mergeMethod: isMergeMethod(record.mergeMethod) ? record.mergeMethod : undefined,
  };
}

async function loadDefaultAutoLandPolicy(repoRoot: string): Promise<OrchestratorAutoLandPolicy | null> {
  try {
    return normalizeAutoLandPolicy(JSON.parse(await readFile(join(repoRoot, DEFAULT_AUTO_LAND_POLICY_PATH), "utf8")));
  } catch (error) {
    const typed = error as NodeJS.ErrnoException;
    if (typed.code === "ENOENT") return null;
    throw error;
  }
}

function applyDefaultAutoLandPolicy(input: OrchestratorRunRequest, policy: OrchestratorAutoLandPolicy | null): OrchestratorRunRequest {
  if (!policy?.enabled || input.autoLand || input.disableAutoLand) return input;
  let lane: OrchestratorRunLane;
  try {
    lane = selectLane(input);
  } catch {
    return input;
  }
  const lanes = policy.lanes && policy.lanes.length > 0 ? policy.lanes : ["worker_job"];
  if (lane !== "worker_job" || !lanes.includes("worker_job")) return input;
  return {
    ...input,
    autoLand: true,
    allowPrCreate: true,
    approvalRef: input.approvalRef ?? policy.approvalRef,
    syncMain: input.syncMain ?? policy.syncMain ?? true,
    mergeMethod: input.mergeMethod ?? policy.mergeMethod,
  };
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
    merge: { attempted: false, allowed: false, reason: input.autoLand ? "Auto-land requested but not completed" : "Phase 4 stops before merge by default" },
    autoLand: input.autoLand ? { enabled: true, prRunId: null, commands: [], syncedMain: false } : undefined,
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
  if (input.autoLand && !input.approvalRef?.trim()) throw new Error("--auto-land requires --approval-ref.");
  if (input.autoLand && lane !== "worker_job") throw new Error("--auto-land is currently supported only for the worker_job lane.");
  if (input.syncMain && !input.autoLand) throw new Error("--sync-main requires --auto-land.");

  if (lane === "queue_level") {
    const args = ["run", "--run", "--initiative", initiative, "--max-steps", String(maxSteps), "--max-runtime-seconds", String(maxRuntimeSeconds)];
    if (input.maxParallel !== undefined) args.push("--max-parallel", String(maxParallel));
    args.push("--json");
    return { lane, call: callFor(ALLOWED_SCRIPTS[lane], args) };
  }

  if (lane === "worker_job") {
    const jobId = assertJobId(input.jobId);
    const args = ["run", "--initiative", initiative, "--job-id", jobId, "--max-steps", String(maxSteps), "--max-runtime-seconds", String(maxRuntimeSeconds), input.autoLand ? "--no-stop-before-pr" : "--stop-before-pr"];
    if ((input.allowPrCreate || input.autoLand) && input.approvalRef) args.push("--allow-pr-create", "--approval-ref", input.approvalRef.trim());
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
    const hasStopBoundary = after.includes("--stop-before-pr");
    const hasApprovedPrBoundary = after.includes("--no-stop-before-pr") && after.includes("--allow-pr-create") && after.includes("--approval-ref");
    if (after[0] !== "run" || !after.includes("--job-id") || !after.includes("--max-steps") || !after.includes("--max-runtime-seconds") || !(hasStopBoundary || hasApprovedPrBoundary) || !after.includes("--json")) {
      throw new Error("worker_job run command must execute one bounded worker job and either stop before PR or carry approved PR creation.");
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
    const dirtyLines = filterMeaningfulGitDirtyLines(result.stdout.split("\n").map((line) => line.trim()).filter(Boolean));
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

function prLifecycleCall(argsAfterSeparator: string[]): DelegatedRunCall {
  return callFor("harness:pr-lifecycle", argsAfterSeparator);
}

function prRunIdFor(workerRunId: string): string {
  return `pr-${workerRunId}`;
}

function prInfoFrom(record: Record<string, unknown>): { url: string | null; number: number | null; gateStatus: string | null } {
  const pr = isRecord(record.pr) ? record.pr : {};
  const url = typeof pr.url === "string" ? pr.url : null;
  const rawNumber = pr.number;
  const number = typeof rawNumber === "number" ? rawNumber : typeof rawNumber === "string" && /^\d+$/.test(rawNumber) ? Number(rawNumber) : null;
  const gateStatus = typeof pr.gateStatus === "string" ? pr.gateStatus : typeof record.status === "string" && record.status.includes("gate") ? record.status : null;
  return { url, number, gateStatus };
}

async function runJsonCommand(call: DelegatedRunCall, runner: DelegatedRunRunner): Promise<{ result: DelegatedRunResult; parsed: Record<string, unknown> | null }> {
  const result = await runner(call);
  if (result.exitCode !== 0) return { result, parsed: null };
  try {
    const parsed = JSON.parse(result.stdout);
    return { result, parsed: isRecord(parsed) ? parsed : null };
  } catch {
    return { result, parsed: null };
  }
}

function mergeMethodFor(input: OrchestratorRunRequest): OrchestratorMergeMethod {
  return input.mergeMethod ?? "squash";
}

export async function runOrchestratorRun(input: OrchestratorRunRequest, runner: DelegatedRunRunner = defaultRunner, preflight: OrchestratorRunPreflight = defaultOrchestratorRunPreflight): Promise<OrchestratorRunSessionResult> {
  const repoRoot = input.repoRoot ?? process.cwd();
  let effectiveInput = input;
  let lane: OrchestratorRunLane | null = null;
  let call: DelegatedRunCall | null = null;
  try {
    effectiveInput = applyDefaultAutoLandPolicy(input, await loadDefaultAutoLandPolicy(repoRoot));
    const built = buildDelegatedRunCall(effectiveInput);
    lane = built.lane;
    call = assertSafeDelegatedRunCommand(lane, built.call.command);
  } catch (error) {
    return blocked(effectiveInput, lane, [(error as Error).message]);
  }

  const safety = await preflight(repoRoot);
  if (!safety.safe) return blocked(input, lane, safety.blockers, "dirty_repo");

  const result = await runner(call);
  const base = baseResult(effectiveInput, lane, call.command);
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

  const startedWork = workStarted(lane, parsed);
  const completedWork = workCompleted(lane, parsed);

  if (effectiveInput.autoLand) {
    const workerRunId = typeof parsed.runId === "string" ? parsed.runId : null;
    if (!workerRunId) {
      return {
        ...base,
        status: "blocked",
        blockers: ["Auto-land requires worker execution JSON with runId."],
        stopReason: "approval_boundary",
        startedWork,
        completedWork,
        nextSafeActions: ["Inspect worker execution output; rerun after worker-run evidence is available."],
      };
    }

    const approvalRef = effectiveInput.approvalRef?.trim();
    if (!approvalRef) {
      return {
        ...base,
        status: "blocked",
        blockers: ["Auto-land requires --approval-ref."],
        stopReason: "approval_boundary",
        startedWork,
        completedWork,
        nextSafeActions: ["Rerun with an explicit approval reference or omit --auto-land."],
      };
    }

    const prRunId = prRunIdFor(workerRunId);
    const commands: string[] = [];
    const runStep = async (stepCall: DelegatedRunCall, expected: string | ((record: Record<string, unknown>) => boolean)) => {
      commands.push(stepCall.command);
      const step = await runJsonCommand(stepCall, runner);
      if (step.result.exitCode !== 0 || !step.parsed) {
        return { ok: false, parsed: step.parsed, result: step.result, blockers: [`Auto-land command failed: ${stepCall.command}`] };
      }
      const passed = typeof expected === "string" ? String(step.parsed.status) === expected : expected(step.parsed);
      if (!passed) {
        return { ok: false, parsed: step.parsed, result: step.result, blockers: readStrings(step.parsed.blockers).length > 0 ? readStrings(step.parsed.blockers) : [`Auto-land command did not reach expected state: ${stepCall.command}`] };
      }
      return { ok: true, parsed: step.parsed, result: step.result, blockers: [] as string[] };
    };

    const create = await runStep(prLifecycleCall(["create", "--initiative", assertSlug(effectiveInput.initiative, "--initiative"), "--worker-run-id", workerRunId, "--run-id", prRunId, "--json"]), "pr_created");
    if (!create.ok || !create.parsed) {
      return { ...base, status: "blocked", blockers: create.blockers, stopReason: "approval_boundary", startedWork, completedWork, rawOutputExcerpt: excerpt(create.result.stdout, create.result.stderr), autoLand: { enabled: true, prRunId, commands, syncedMain: false }, nextSafeActions: ["Resolve PR creation blockers before rerunning auto-land."] };
    }

    const gate = await runStep(prLifecycleCall(["gate", "--initiative", assertSlug(effectiveInput.initiative, "--initiative"), "--run-id", prRunId, "--json"]), "gate_passed");
    if (!gate.ok || !gate.parsed) {
      return { ...base, status: "blocked", blockers: gate.blockers, stopReason: "validation_failure", startedWork, completedWork, rawOutputExcerpt: excerpt(gate.result.stdout, gate.result.stderr), autoLand: { enabled: true, prRunId, commands, syncedMain: false }, nextSafeActions: ["Wait for or fix PR gate checks, then rerun auto-land from PR lifecycle evidence."] };
    }

    const mergeReady = await runStep(prLifecycleCall(["merge-ready", "--initiative", assertSlug(effectiveInput.initiative, "--initiative"), "--run-id", prRunId, "--json"]), (record) => String(record.status) === "gate_passed" && isRecord(record.lifecycle) && record.lifecycle.mergeReady === true);
    if (!mergeReady.ok || !mergeReady.parsed) {
      return { ...base, status: "blocked", blockers: mergeReady.blockers, stopReason: "validation_failure", startedWork, completedWork, rawOutputExcerpt: excerpt(mergeReady.result.stdout, mergeReady.result.stderr), autoLand: { enabled: true, prRunId, commands, syncedMain: false }, nextSafeActions: ["Resolve merge-ready blockers before applying merge."] };
    }

    const merge = await runStep(prLifecycleCall(["merge", "--initiative", assertSlug(effectiveInput.initiative, "--initiative"), "--run-id", prRunId, "--allow-merge", "--approval-ref", approvalRef, "--method", mergeMethodFor(effectiveInput), "--json"]), "merged");
    if (!merge.ok || !merge.parsed) {
      return { ...base, status: "blocked", blockers: merge.blockers, stopReason: "approval_boundary", startedWork, completedWork, rawOutputExcerpt: excerpt(merge.result.stdout, merge.result.stderr), autoLand: { enabled: true, prRunId, commands, syncedMain: false }, merge: { attempted: true, allowed: true, reason: "bounded merge helper blocked merge" }, nextSafeActions: ["Inspect bounded merge helper blockers before rerunning."] };
    }

    let finalRecord = merge.parsed;
    let syncedMain = false;
    if (effectiveInput.syncMain) {
      const sync = await runStep(prLifecycleCall(["sync-main", "--initiative", assertSlug(effectiveInput.initiative, "--initiative"), "--run-id", prRunId, "--json"]), "synced");
      if (!sync.ok || !sync.parsed) {
        return { ...base, status: "blocked", blockers: sync.blockers, stopReason: "dirty_repo", startedWork, completedWork, rawOutputExcerpt: excerpt(sync.result.stdout, sync.result.stderr), autoLand: { enabled: true, prRunId, commands, syncedMain: false }, merge: { attempted: true, allowed: true, reason: "merge completed; sync-main blocked" }, nextSafeActions: ["Resolve sync-main blockers before starting downstream AFK work."] };
      }
      finalRecord = sync.parsed;
      syncedMain = true;
    }

    const pr = prInfoFrom(finalRecord);
    return {
      ...base,
      status: "completed",
      blockers: [],
      stopReason: "none",
      startedWork,
      completedWork,
      pr: { created: true, url: pr.url, gateStatus: pr.gateStatus },
      merge: { attempted: true, allowed: true, reason: syncedMain ? "auto-land merged and synced local main" : "auto-land merged; local main sync not requested" },
      autoLand: { enabled: true, prRunId, commands, syncedMain },
      rawOutputExcerpt: "",
      nextSafeActions: [syncedMain ? "Continue with the next eligible AFK issue." : "Sync local main before starting downstream AFK work."],
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
    startedWork,
    completedWork,
    rawOutputExcerpt: "",
    nextSafeActions: unique([
      typeof parsed.nextOperatorAction === "string" ? parsed.nextOperatorAction : "",
      status === "completed" ? "Inspect run evidence and decide whether a separate PR lifecycle handoff is appropriate." : "Inspect blockers and rerun only after the boundary is resolved.",
    ]),
  };

}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function orchestratorRunExtension(): void {}
