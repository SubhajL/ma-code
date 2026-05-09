import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type OrchestratorApplyPath =
  | "product_intake"
  | "issue_materialization"
  | "product_pipeline"
  | "stitch_prompt"
  | "stitch_artifact"
  | "screen_approval"
  | "slice_contract"
  | "frontend_packet"
  | "backend_packet"
  | "afk_queue_materialization";

export type OrchestratorApplyStatus = "materialized" | "blocked" | "failed";

export interface DelegatedApplyCall {
  command: string;
  executable: "npm";
  args: string[];
}

export interface DelegatedApplyResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type DelegatedApplyRunner = (call: DelegatedApplyCall) => Promise<DelegatedApplyResult>;

export interface OrchestratorApplyRequest {
  path: OrchestratorApplyPath;
  command?: string;
  initiative?: string;
  sliceId?: string;
  source?: string;
  description?: string;
  action?: "approve" | "reject";
  approvalRef?: string;
  by?: string;
  note?: string;
  reason?: string;
}

export interface OrchestratorApplyPlan {
  version: 1;
  mode: "apply";
  selectedPath: OrchestratorApplyPath;
  delegatedCommand: string;
  call: DelegatedApplyCall;
  requiredArgs: string[];
  allowedWritePaths: string[];
  approval: { required: false; approvalRef?: undefined } | { required: true; approvalRef: string };
  nextSafeActions: string[];
}

export interface OrchestratorApplyMaterializationResult {
  version: 1;
  mode: "apply";
  selectedPath: OrchestratorApplyPath;
  delegatedCommand: string;
  status: OrchestratorApplyStatus;
  approvalRef?: string;
  createdFiles: string[];
  allowedWritePaths: string[];
  blockers: string[];
  helperSummary: Record<string, unknown>;
  rawOutputExcerpt: string;
  nextSafeActions: string[];
}

const UNSAFE_COMMANDS = new Set(["run", "create", "merge", "sync-main"]);
const RAW_GIT_COMMAND_TOKEN = "git";
const FORBIDDEN_TOKENS = ["harness:merge", "pr-lifecycle", "worker-execute", ".pi/agent/state/runtime"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmpty(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required.`);
  return normalized;
}

function assertSlug(value: string, flag: string): string {
  const normalized = nonEmpty(value, flag);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) throw new Error(`${flag} must be a lowercase slug.`);
  return normalized;
}

function assertSlice(value: string, flag: string): string {
  const normalized = nonEmpty(value, flag);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) throw new Error(`${flag} contains unsafe characters.`);
  return normalized;
}

function assertRelativeArtifactPath(value: string, flag: string): string {
  const normalized = nonEmpty(value, flag).replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\0")) throw new Error(`${flag} must be a safe relative path.`);
  if (normalized.startsWith(".pi/agent/state/runtime/")) throw new Error(`${flag} references protected runtime state.`);
  return normalized;
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'"'"'`)}'`;
}

function commandString(script: string, argsAfterSeparator: string[]): string {
  return ["npm", "run", script, "--", ...argsAfterSeparator.map(shellQuote)].join(" ");
}

function callFor(script: string, argsAfterSeparator: string[]): DelegatedApplyCall {
  const args = ["run", script, "--", ...argsAfterSeparator];
  return { command: commandString(script, argsAfterSeparator), executable: "npm", args };
}

function ensureNoForbiddenCommand(call: DelegatedApplyCall): void {
  const command = call.command.toLowerCase();
  for (const token of FORBIDDEN_TOKENS) {
    if (command.includes(token)) throw new Error(`Phase 3 apply policy forbids delegated token: ${token}`);
  }
}

export function rejectUnsafeApplyVerb(command: string): void {
  const normalized = command.trim().toLowerCase();
  if (UNSAFE_COMMANDS.has(normalized)) throw new Error(`${command} is not supported by harness-orchestrate apply.`);
  if (normalized === RAW_GIT_COMMAND_TOKEN || normalized.startsWith(`${RAW_GIT_COMMAND_TOKEN} `)) throw new Error("raw git commands are not supported by harness-orchestrate apply.");
}

function plan(script: string, args: string[], values: Omit<OrchestratorApplyPlan, "version" | "mode" | "delegatedCommand" | "call">): OrchestratorApplyPlan {
  const call = callFor(script, args);
  ensureNoForbiddenCommand(call);
  return { version: 1, mode: "apply", delegatedCommand: call.command, call, ...values };
}

export function buildOrchestratorApplyPlan(input: OrchestratorApplyRequest): OrchestratorApplyPlan {
  if (input.command !== undefined) throw new Error("generic command strings are not accepted by harness-orchestrate apply; choose an allowlisted --path.");

  if (input.path === "product_intake") {
    const initiative = assertSlug(input.initiative, "--initiative");
    const description = nonEmpty(input.description, "--description");
    return plan("harness:product-intake", ["--slug", initiative, "--description", description, "--apply", "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative", "description"],
      allowedWritePaths: [`docs/initiatives/${initiative}/intake.json`, `docs/initiatives/${initiative}/prd.md`, `docs/initiatives/${initiative}/backlog.md`, `docs/initiatives/${initiative}/decisions.md`, "docs/frontend/README.md", "docs/backend/README.md"],
      approval: { required: false },
      nextSafeActions: ["Run harness:orchestrate dry-run or g-prd/g-issues planning for the initiative."],
    });
  }

  if (input.path === "issue_materialization") {
    const source = assertRelativeArtifactPath(input.source ?? "", "--source");
    return plan("harness:issue-materialize", ["apply", "--source", source, "--json"], {
      selectedPath: input.path,
      requiredArgs: ["source"],
      allowedWritePaths: ["docs/initiatives/**"],
      approval: { required: false },
      nextSafeActions: ["Run harness:product-pipeline dry-run for the materialized initiative."],
    });
  }

  if (input.path === "product_pipeline") {
    const initiative = assertSlug(input.initiative, "--initiative");
    return plan("harness:product-pipeline", ["apply", "--initiative", initiative, "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative"],
      allowedWritePaths: [`docs/initiatives/${initiative}/pipeline-runs/*.json`],
      approval: { required: false },
      nextSafeActions: ["Inspect pipeline run output before any worker or PR lifecycle action."],
    });
  }

  if (input.path === "stitch_prompt") {
    const initiative = assertSlug(input.initiative, "--initiative");
    const sliceId = assertSlice(input.sliceId, "--slice");
    return plan("harness:stitch-prompt", ["--initiative", initiative, "--slice", sliceId, "--apply", "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative", "sliceId"],
      allowedWritePaths: [`docs/initiatives/${initiative}/stitch-prompts/${sliceId}.*`],
      approval: { required: false },
      nextSafeActions: ["Review the stitch prompt before generating or approving screen artifacts."],
    });
  }

  if (input.path === "stitch_artifact") {
    const initiative = assertSlug(input.initiative, "--initiative");
    const sliceId = assertSlice(input.sliceId, "--slice");
    return plan("harness:stitch-artifact", ["--initiative", initiative, "--slice", sliceId, "--apply", "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative", "sliceId"],
      allowedWritePaths: [`docs/initiatives/${initiative}/screen-artifacts/${sliceId}.mock-screen.*`],
      approval: { required: false },
      nextSafeActions: ["Run screen approval status/approve or reject with explicit human review."],
    });
  }

  if (input.path === "screen_approval") {
    const initiative = assertSlug(input.initiative, "--initiative");
    const sliceId = assertSlice(input.sliceId, "--slice");
    const action = input.action === "reject" ? "reject" : input.action === "approve" ? "approve" : nonEmpty(input.action, "--action") as "approve" | "reject";
    const approvalRef = nonEmpty(input.approvalRef, "--approval-ref");
    const by = nonEmpty(input.by, "--by");
    const args = [action, "--initiative", initiative, "--slice", sliceId, "--by", by];
    if (action === "approve") args.push("--note", nonEmpty(input.note, "--note"));
    else args.push("--reason", nonEmpty(input.reason, "--reason"));
    if (action === "reject" && input.note?.trim()) args.push("--note", input.note.trim());
    args.push("--json");
    return plan("harness:screen-approval", args, {
      selectedPath: input.path,
      requiredArgs: ["action", "initiative", "sliceId", "approvalRef", "by", action === "approve" ? "note" : "reason"],
      allowedWritePaths: [`docs/initiatives/${initiative}/screen-artifacts/${sliceId}.approval.json`],
      approval: { required: true, approvalRef },
      nextSafeActions: ["Run harness:slice-contract dry-run/apply only after approval is accepted."],
    });
  }

  if (input.path === "slice_contract") {
    const initiative = assertSlug(input.initiative, "--initiative");
    const sliceId = assertSlice(input.sliceId, "--slice");
    return plan("harness:slice-contract", ["--initiative", initiative, "--slice", sliceId, "--apply", "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative", "sliceId"],
      allowedWritePaths: [`docs/initiatives/${initiative}/contracts/${sliceId}.contract.json`, `docs/initiatives/${initiative}/contracts/${sliceId}.contract.md`],
      approval: { required: false },
      nextSafeActions: ["Generate frontend/backend packets only for approved contract boundaries."],
    });
  }

  if (input.path === "frontend_packet") {
    const initiative = assertSlug(input.initiative, "--initiative");
    const sliceId = assertSlice(input.sliceId, "--slice");
    return plan("harness:fe-packet", ["--initiative", initiative, "--slice", sliceId, "--apply", "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative", "sliceId"],
      allowedWritePaths: [`docs/initiatives/${initiative}/packets/${sliceId}.frontend.packet.json`, `docs/initiatives/${initiative}/packets/${sliceId}.frontend.packet.md`],
      approval: { required: false },
      nextSafeActions: ["Review the frontend packet before creating tasks or queue jobs."],
    });
  }

  if (input.path === "backend_packet") {
    const initiative = assertSlug(input.initiative, "--initiative");
    const sliceId = assertSlice(input.sliceId, "--slice");
    return plan("harness:be-packet", ["--initiative", initiative, "--slice", sliceId, "--apply", "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative", "sliceId"],
      allowedWritePaths: [`docs/initiatives/${initiative}/packets/${sliceId}.backend.packet.json`, `docs/initiatives/${initiative}/packets/${sliceId}.backend.packet.md`],
      approval: { required: false },
      nextSafeActions: ["Review the backend packet before creating tasks or queue jobs."],
    });
  }

  if (input.path === "afk_queue_materialization") {
    const initiative = assertSlug(input.initiative, "--initiative");
    return plan("harness:afk-orchestrate", ["apply", "--queue-only", "--initiative", initiative, "--json"], {
      selectedPath: input.path,
      requiredArgs: ["initiative"],
      allowedWritePaths: [`docs/initiatives/${initiative}/afk-runs/*.json`, ".pi/agent/state/runtime/queue-jobs-via-helper"],
      approval: { required: false },
      nextSafeActions: ["Inspect queue status; start bounded queue sessions only through explicit run commands outside Phase 3 apply."],
    });
  }

  throw new Error(`Unknown apply path: ${(input as { path?: string }).path}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPattern(pathValue: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) return pathValue.startsWith(pattern.slice(0, -3));
  if (!pattern.includes("*")) return pathValue === pattern;
  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join("[^/]*")}$`);
  return regex.test(pathValue);
}

export function assertCreatedFilesWithinAllowlist(plan: OrchestratorApplyPlan, files: string[]): string[] {
  const normalizedFiles = [...new Set(files.map((file) => file.trim().replace(/\\/g, "/")).filter(Boolean))];
  if (normalizedFiles.length === 0) throw new Error("Delegated apply helper did not report created files; refusing to confirm materialization.");
  const unsafe = normalizedFiles.filter((file) => file.startsWith("/") || file.includes("..") || file.startsWith(".pi/agent/state/runtime/"));
  if (unsafe.length > 0) throw new Error(`Delegated helper reported unsafe created files: ${unsafe.join(", ")}`);
  const outside = normalizedFiles.filter((file) => !plan.allowedWritePaths.some((pattern) => matchesPattern(file, pattern)));
  if (outside.length > 0) throw new Error(`Delegated helper reported files outside allowed write paths: ${outside.join(", ")}`);
  return normalizedFiles;
}

function readStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) out.push(...value.filter((entry): entry is string => typeof entry === "string"));
  }
  return out;
}

function extractCreatedFiles(plan: OrchestratorApplyPlan, record: Record<string, unknown>): string[] {
  const files = readStringArray(record, ["createdFiles", "writtenArtifacts"]);
  for (const key of ["writtenRunPath", "approvalPath"] as const) {
    if (typeof record[key] === "string" && record[key].trim()) files.push(record[key]);
  }
  if (files.length === 0 && plan.selectedPath === "afk_queue_materialization" && typeof record.runId === "string") {
    const initiativeIndex = plan.call.args.indexOf("--initiative");
    const initiative = initiativeIndex >= 0 ? plan.call.args[initiativeIndex + 1] : "";
    if (initiative) files.push(`docs/initiatives/${initiative}/afk-runs/${record.runId}.json`);
  }
  return files;
}

function excerpt(stdout: string, stderr: string): string {
  return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim().slice(0, 2000);
}

function helperSummary(record: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const key of ["mode", "status", "runId", "createdFiles", "writtenRunPath", "approvalPath", "nextOperatorAction"]) {
    if (key in record) summary[key] = record[key];
  }
  return summary;
}

async function defaultRunner(call: DelegatedApplyCall): Promise<DelegatedApplyResult> {
  const args = call.args[0] === "run" ? ["run", "--silent", ...call.args.slice(1)] : call.args;
  try {
    const result = await execFile(call.executable, args, { encoding: "utf8" });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const typed = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { exitCode: typeof typed.code === "number" ? typed.code : 1, stdout: typed.stdout ?? "", stderr: typed.stderr ?? typed.message };
  }
}

export async function runOrchestratorApply(input: OrchestratorApplyRequest, runner: DelegatedApplyRunner = defaultRunner): Promise<OrchestratorApplyMaterializationResult> {
  const plan = buildOrchestratorApplyPlan(input);
  const result = await runner(plan.call);
  if (result.exitCode !== 0) {
    return {
      version: 1,
      mode: "apply",
      selectedPath: plan.selectedPath,
      delegatedCommand: plan.delegatedCommand,
      status: "failed",
      approvalRef: plan.approval.approvalRef,
      createdFiles: [],
      allowedWritePaths: plan.allowedWritePaths,
      blockers: [`Delegated helper exited with code ${result.exitCode}.`],
      helperSummary: {},
      rawOutputExcerpt: excerpt(result.stdout, result.stderr),
      nextSafeActions: plan.nextSafeActions,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = isRecord(JSON.parse(result.stdout)) ? JSON.parse(result.stdout) as Record<string, unknown> : {};
  } catch {
    return {
      version: 1,
      mode: "apply",
      selectedPath: plan.selectedPath,
      delegatedCommand: plan.delegatedCommand,
      status: "failed",
      approvalRef: plan.approval.approvalRef,
      createdFiles: [],
      allowedWritePaths: plan.allowedWritePaths,
      blockers: ["Delegated helper emitted invalid JSON."],
      helperSummary: {},
      rawOutputExcerpt: excerpt(result.stdout, result.stderr),
      nextSafeActions: plan.nextSafeActions,
    };
  }

  try {
    const createdFiles = assertCreatedFilesWithinAllowlist(plan, extractCreatedFiles(plan, parsed));
    return {
      version: 1,
      mode: "apply",
      selectedPath: plan.selectedPath,
      delegatedCommand: plan.delegatedCommand,
      status: "materialized",
      approvalRef: plan.approval.approvalRef,
      createdFiles,
      allowedWritePaths: plan.allowedWritePaths,
      blockers: [],
      helperSummary: helperSummary(parsed),
      rawOutputExcerpt: "",
      nextSafeActions: plan.nextSafeActions,
    };
  } catch (error) {
    return {
      version: 1,
      mode: "apply",
      selectedPath: plan.selectedPath,
      delegatedCommand: plan.delegatedCommand,
      status: "failed",
      approvalRef: plan.approval.approvalRef,
      createdFiles: extractCreatedFiles(plan, parsed),
      allowedWritePaths: plan.allowedWritePaths,
      blockers: [(error as Error).message],
      helperSummary: helperSummary(parsed),
      rawOutputExcerpt: excerpt(result.stdout, result.stderr),
      nextSafeActions: plan.nextSafeActions,
    };
  }
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function orchestratorApplyPolicyExtension(): void {}
