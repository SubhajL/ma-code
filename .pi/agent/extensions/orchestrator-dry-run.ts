import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import type { OrchestratorClassification, OrchestratorSelectedPath } from "./orchestrator-classifier.ts";

const execFile = promisify(execFileCallback);

export type OrchestratorDryRunStatus = "ready" | "blocked" | "needs_input" | "error";

export interface DelegatedDryRunCall {
  command: string;
  executable: "npm";
  args: string[];
}

export interface DelegatedDryRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type DelegatedDryRunRunner = (call: DelegatedDryRunCall) => Promise<DelegatedDryRunResult>;

export interface OrchestratorDryRunPlan {
  version: 1;
  mode: "dry_run";
  selectedPath: OrchestratorSelectedPath;
  confidence: OrchestratorClassification["confidence"];
  delegatedCommand: string | null;
  status: OrchestratorDryRunStatus;
  writesFiles: false;
  requiredArtifacts: string[];
  missingArtifacts: string[];
  hitlGates: string[];
  blockers: string[];
  helperSummary: Record<string, unknown>;
  rawOutputExcerpt: string;
  nextSafeActions: string[];
}

export interface PlanOrchestratorDryRunOptions {
  classification: OrchestratorClassification;
  runner?: DelegatedDryRunRunner;
}

const ALLOWED_SCRIPTS: Record<string, string> = {
  product_feature: "harness:product-intake",
  ui_slice: "harness:stitch-prompt",
  issue_materialization: "harness:issue-materialize",
  product_pipeline: "harness:product-pipeline",
  afk_queue: "harness:afk-orchestrate",
  worker_job: "harness:worker-execute",
  pr_lifecycle: "harness:pr-lifecycle",
  merge: "harness:merge",
  status: "harness:operator",
};

const MUTATING_VERBS = new Set(["apply", "run", "create", "merge", "sync-main", "resume"]);
const MUTATING_FLAGS = new Set(["--apply", "--run", "--create", "--allow-merge", "--sync-main", "--force", "--overwrite"]);

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function excerpt(stdout: string, stderr: string): string {
  return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim().slice(0, 2000);
}

function splitShellLike(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (quote === '"' && char === "\\" && index + 1 < command.length) {
        current += command[++index];
      } else {
        current += char;
      }
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
  const separatorIndex = tokens.indexOf("--");
  if (separatorIndex < 0) throw new Error("Delegated command must use npm '--' argument separator.");
  return tokens.slice(separatorIndex + 1);
}

function assertNoUnsafeTokens(tokens: string[]): void {
  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (MUTATING_VERBS.has(normalized) || MUTATING_FLAGS.has(normalized)) throw new Error(`Delegated command contains unsafe token: ${token}`);
    if (normalized.includes(".pi/agent/state/runtime") || normalized.endsWith("/tasks.json") || normalized.endsWith("/queue.json")) {
      throw new Error(`Delegated command references protected runtime state: ${token}`);
    }
  }
}

function assertPathSpecificSafeShape(selectedPath: OrchestratorSelectedPath, script: string, afterSeparator: string[]): void {
  if (selectedPath === "product_feature") {
    if (script !== "harness:product-intake" || !afterSeparator.includes("--dry-run") || !afterSeparator.includes("--json")) {
      throw new Error("Product feature dry-run command is not allowlisted.");
    }
    assertNoUnsafeTokens(afterSeparator.filter((token) => token !== "--dry-run"));
    return;
  }
  if (selectedPath === "ui_slice") {
    if (script !== "harness:stitch-prompt" || !afterSeparator.includes("--dry-run") || !afterSeparator.includes("--json")) {
      throw new Error("UI slice dry-run command is not allowlisted.");
    }
    assertNoUnsafeTokens(afterSeparator.filter((token) => token !== "--dry-run"));
    return;
  }
  if (["issue_materialization", "product_pipeline", "afk_queue", "worker_job", "pr_lifecycle"].includes(selectedPath)) {
    if (afterSeparator[0] !== "dry-run" || !afterSeparator.includes("--json")) throw new Error(`${selectedPath} command must use dry-run --json.`);
    assertNoUnsafeTokens(afterSeparator.slice(1));
    return;
  }
  if (selectedPath === "merge") {
    if (script !== "harness:merge" || afterSeparator[0] !== "check" || !afterSeparator.includes("--json")) throw new Error("Merge path command is unsafe or not allowlisted; only merge check --json is allowed.");
    assertNoUnsafeTokens(afterSeparator.slice(1));
    return;
  }
  if (selectedPath === "status") {
    if (script !== "harness:operator" || afterSeparator[0] !== "status" || !afterSeparator.includes("--json")) throw new Error("Status path must use operator status --json.");
    assertNoUnsafeTokens(afterSeparator.slice(1));
    return;
  }
  throw new Error(`Selected path ${selectedPath} is not allowlisted for dry-run delegation.`);
}

export function assertSafeDelegatedDryRunCommand(selectedPath: OrchestratorSelectedPath, command: string): DelegatedDryRunCall {
  if (/<[^>]+>/.test(command)) throw new Error("Delegated command still contains placeholder artifacts and cannot be executed safely.");
  const tokens = splitShellLike(command);
  if (tokens.length < 5 || tokens[0] !== "npm" || tokens[1] !== "run") throw new Error("Delegated command must start with npm run.");
  const script = tokens[2];
  const expectedScript = ALLOWED_SCRIPTS[selectedPath];
  if (!expectedScript || script !== expectedScript) throw new Error(`Delegated command is not allowlisted for ${selectedPath}.`);
  const args = tokens.slice(1);
  const afterSeparator = tokensAfterSeparator(tokens);
  assertPathSpecificSafeShape(selectedPath, script, afterSeparator);
  return { command, executable: "npm", args };
}

async function defaultRunner(call: DelegatedDryRunCall): Promise<DelegatedDryRunResult> {
  const args = call.args[0] === "run" ? ["run", "--silent", ...call.args.slice(1)] : call.args;
  try {
    const result = await execFile(call.executable, args, { encoding: "utf8" });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const typed = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { exitCode: typeof typed.code === "number" ? typed.code : 1, stdout: typed.stdout ?? "", stderr: typed.stderr ?? typed.message };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) out.push(...value.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))));
    else if (typeof value === "string") out.push(value);
  }
  return unique(out);
}

function readNestedStringArray(record: Record<string, unknown>, path: string[]): string[] {
  let cursor: unknown = record;
  for (const segment of path) cursor = asRecord(cursor)[segment];
  return Array.isArray(cursor) ? unique(cursor.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))) : [];
}

function helperStatus(record: Record<string, unknown>, blockers: string[], missingArtifacts: string[], hitlGates: string[]): OrchestratorDryRunStatus {
  const rawStatus = String(record.status ?? asRecord(record.readiness).status ?? "").toLowerCase();
  const readyFlag = record.ready ?? asRecord(record.readiness).ready;
  if (rawStatus.includes("error") || rawStatus.includes("fail")) return "error";
  if (rawStatus.includes("blocked") || rawStatus.includes("pending") || blockers.length > 0 || missingArtifacts.length > 0 || hitlGates.length > 0) return "blocked";
  if (rawStatus.includes("needs_input")) return "needs_input";
  if (readyFlag === false) return "blocked";
  return "ready";
}

function summarizeHelper(record: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const key of ["mode", "status", "ready", "slug", "initiative", "selectedIssueIds", "plannedFiles", "createdFiles", "writtenArtifacts", "runId", "nextOperatorAction"]) {
    if (key in record) summary[key] = record[key];
  }
  if ("readiness" in record) summary.readiness = record.readiness;
  return summary;
}

function normalizeHelperJson(classification: OrchestratorClassification, command: string, parsed: Record<string, unknown>): OrchestratorDryRunPlan {
  const blockers = unique([
    ...readStringArray(parsed, ["blockers", "blockedReasons", "blockingQuestions", "errors"]),
    ...readNestedStringArray(parsed, ["readiness", "blockers"]),
  ]);
  const missingArtifacts = unique([
    ...classification.requiredArtifacts,
    ...readStringArray(parsed, ["missingArtifacts", "missing", "requiredArtifacts"]),
    ...readNestedStringArray(parsed, ["readiness", "missingArtifacts"]),
  ]);
  const hitlGates = unique([...classification.hitlGates, ...readStringArray(parsed, ["hitlGates", "gates"])]);
  const nextSafeActions = unique([
    ...readStringArray(parsed, ["nextSafeActions", "nextActions"]),
    ...(typeof parsed.nextOperatorAction === "string" ? [parsed.nextOperatorAction] : []),
    ...(typeof parsed.recommendedNextAction === "string" ? [parsed.recommendedNextAction] : []),
  ]);
  return {
    version: 1,
    mode: "dry_run",
    selectedPath: classification.selectedPath,
    confidence: classification.confidence,
    delegatedCommand: command,
    status: helperStatus(parsed, blockers, missingArtifacts, hitlGates),
    writesFiles: false,
    requiredArtifacts: unique(classification.requiredArtifacts),
    missingArtifacts,
    hitlGates,
    blockers,
    helperSummary: summarizeHelper(parsed),
    rawOutputExcerpt: "",
    nextSafeActions,
  };
}

function blockedPlan(classification: OrchestratorClassification, status: OrchestratorDryRunStatus, blockers: string[]): OrchestratorDryRunPlan {
  return {
    version: 1,
    mode: "dry_run",
    selectedPath: classification.selectedPath,
    confidence: classification.confidence,
    delegatedCommand: null,
    status,
    writesFiles: false,
    requiredArtifacts: unique(classification.requiredArtifacts),
    missingArtifacts: unique(classification.requiredArtifacts),
    hitlGates: unique(classification.hitlGates),
    blockers: unique(blockers),
    helperSummary: {},
    rawOutputExcerpt: "",
    nextSafeActions: status === "needs_input" ? ["Clarify the requested harness path or provide the missing artifact values."] : [],
  };
}

export async function planOrchestratorDryRun(options: PlanOrchestratorDryRunOptions): Promise<OrchestratorDryRunPlan> {
  const { classification } = options;
  if (classification.selectedPath === "clarification" || classification.confidence === "low") {
    return blockedPlan(classification, "needs_input", classification.blockedReasons.length > 0 ? classification.blockedReasons : ["Clarify the intended harness path before delegation."]);
  }
  if (!classification.nextDryRunCommand) {
    return blockedPlan(classification, "blocked", classification.blockedReasons.length > 0 ? classification.blockedReasons : ["Classifier did not produce a delegated dry-run command."]);
  }
  if (/<[^>]+>/.test(classification.nextDryRunCommand)) {
    return blockedPlan(classification, "needs_input", [`Missing required artifacts: ${classification.requiredArtifacts.join(", ") || "placeholder values"}`]);
  }

  let call: DelegatedDryRunCall;
  try {
    call = assertSafeDelegatedDryRunCommand(classification.selectedPath, classification.nextDryRunCommand);
  } catch (error) {
    return blockedPlan(classification, "blocked", [(error as Error).message]);
  }

  const result = await (options.runner ?? defaultRunner)(call);
  if (result.exitCode !== 0) {
    return {
      ...blockedPlan(classification, "error", [`Delegated helper exited with code ${result.exitCode}.`]),
      delegatedCommand: call.command,
      rawOutputExcerpt: excerpt(result.stdout, result.stderr),
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(result.stdout));
  } catch {
    return {
      ...blockedPlan(classification, "error", ["Delegated helper emitted invalid JSON."]),
      delegatedCommand: call.command,
      rawOutputExcerpt: excerpt(result.stdout, result.stderr),
    };
  }
  return normalizeHelperJson(classification, call.command, parsed);
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function orchestratorDryRunExtension(): void {}
