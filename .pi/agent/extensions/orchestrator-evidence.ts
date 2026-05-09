import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type OrchestratorEvidenceMode = "evidence" | "merge_check" | "merge_apply";
export type OrchestratorEvidenceStatus = "ready" | "blocked" | "merged";

export interface DelegatedEvidenceCommand {
  command: string;
  status: "planned" | "passed" | "failed" | "blocked";
  artifactPath?: string;
  exitCode?: number;
}

export interface ConsumedEvidenceSummary {
  initiativeRuns: string[];
  lifecycleEvidence: string | null;
  codingLog: string | null;
  reviewVerdict: "no_required_fixes" | "changes_required" | null;
  prGate: { status: string | null; mergeStateStatus?: string | null } | null;
  mergeHelper: { checkReady: boolean; blockers: string[]; artifactPath?: string | null } | null;
}

export interface OrchestratorApprovalSummary {
  required: boolean;
  approvalRef: string | null;
  approvedAction: "merge" | null;
}

export interface OrchestratorMergeBoundary {
  defaultStopBeforeMerge: true;
  attempted: boolean;
  delegatedOnlyToHarnessMerge: true;
  rawGitMergeUsed: false;
}

export interface OrchestratorEvidenceSummary {
  version: 1;
  runId: string;
  mode: OrchestratorEvidenceMode;
  status: OrchestratorEvidenceStatus;
  selectedPath: string | null;
  delegatedCommands: DelegatedEvidenceCommand[];
  consumedEvidence: ConsumedEvidenceSummary;
  blockers: string[];
  hitlGates: string[];
  approval: OrchestratorApprovalSummary;
  nextSafeAction: string;
  merge: OrchestratorMergeBoundary;
  reports?: { json: string; markdown: string };
  helperOutput?: Record<string, unknown>;
}

export interface CollectOrchestratorEvidenceOptions {
  repoRoot?: string;
  initiative: string;
  runId?: string;
  lifecycleEvidence?: string;
  codingLog?: string;
  writeReport?: boolean;
}

export interface OrchestratorMergeOptions {
  repoRoot?: string;
  pr: number | string;
  method?: "squash" | "merge" | "rebase";
  lifecycleEvidence?: string;
  approvalRef?: string;
}

export interface DelegatedMergeCall {
  command: string;
  executable: "npm";
  args: string[];
}

export interface DelegatedMergeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type DelegatedMergeRunner = (call: DelegatedMergeCall) => Promise<DelegatedMergeResult>;

const INITIATIVE_RUN_DIRS = ["pipeline-runs", "afk-runs", "worker-runs", "pr-runs"];
const REVIEW_RE = /Review Verdict:\s*(no_required_fixes|changes_required)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function relPath(repoRoot: string, path: string): string {
  const absolute = resolve(repoRoot, path);
  return relative(repoRoot, absolute).replace(/\\/g, "/");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const next = join(current, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && entry.name.endsWith(".json")) out.push(next);
    }
  }
  await walk(dir);
  return out.sort();
}

function matchesRunId(record: Record<string, unknown> | null, file: string, runId?: string): boolean {
  if (!runId) return true;
  if (file.includes(runId)) return true;
  return record?.runId === runId || record?.id === runId || record?.taskId === runId;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
}

function commandEntriesFromArtifact(repoRoot: string, file: string, record: Record<string, unknown> | null): DelegatedEvidenceCommand[] {
  if (!record) return [];
  const commands = unique([
    ...(typeof record.delegatedCommand === "string" ? [record.delegatedCommand] : []),
    ...stringArray(record.delegatedCommands),
    ...stringArray(record.commandsRun),
  ]);
  const status = String(record.status ?? record.finalStatus ?? "passed").toLowerCase().includes("fail") ? "failed" : "passed";
  return commands.map((command) => ({ command, status, artifactPath: relPath(repoRoot, file) }));
}

function selectedPathFromArtifacts(records: Array<Record<string, unknown> | null>): string | null {
  for (const record of records) {
    if (!record) continue;
    if (typeof record.selectedPath === "string") return record.selectedPath;
    if (typeof record.path === "string") return record.path;
    if (typeof record.mode === "string" && record.mode.includes("worker")) return "worker_job";
  }
  return records.length > 0 ? "evidence" : null;
}

function prGateFromArtifacts(records: Array<Record<string, unknown> | null>): ConsumedEvidenceSummary["prGate"] {
  for (const record of records) {
    const gate = isRecord(record?.prGate) ? record.prGate : isRecord(record?.gate) ? record.gate : null;
    if (!gate) continue;
    return {
      status: typeof gate.finalStatus === "string" ? gate.finalStatus : typeof gate.status === "string" ? gate.status : null,
      mergeStateStatus: typeof gate.mergeStateStatus === "string" ? gate.mergeStateStatus : null,
    };
  }
  return null;
}

async function resolveCodingLog(repoRoot: string, explicit?: string): Promise<{ path: string | null; text: string }> {
  const candidate = explicit ? relPath(repoRoot, explicit) : null;
  if (candidate && (await pathExists(resolve(repoRoot, candidate)))) return { path: candidate, text: await readFile(resolve(repoRoot, candidate), "utf8") };
  const currentPath = resolve(repoRoot, "logs/CURRENT.md");
  if (!(await pathExists(currentPath))) return { path: null, text: "" };
  const current = await readFile(currentPath, "utf8");
  const match = current.match(/`(logs\/coding\/[^`]+)`/);
  if (!match) return { path: null, text: "" };
  const logPath = match[1];
  const absolute = resolve(repoRoot, logPath);
  if (!(await pathExists(absolute))) return { path: logPath, text: "" };
  return { path: logPath, text: await readFile(absolute, "utf8") };
}

async function resolveLifecycleEvidence(repoRoot: string, explicit?: string, runId?: string): Promise<string | null> {
  if (explicit) return (await pathExists(resolve(repoRoot, explicit))) ? relPath(repoRoot, explicit) : null;
  const candidates = await collectJsonFiles(resolve(repoRoot, "reports/lifecycle"));
  for (const file of candidates) {
    const record = await readJsonFile(file);
    if (matchesRunId(record, file, runId)) return relPath(repoRoot, file);
  }
  return null;
}

async function writeReports(repoRoot: string, summary: OrchestratorEvidenceSummary): Promise<{ json: string; markdown: string }> {
  const dir = resolve(repoRoot, "reports/orchestration");
  await mkdir(dir, { recursive: true });
  const base = summary.runId || `orch-${Date.now()}`;
  const jsonPath = `reports/orchestration/${base}.json`;
  const mdPath = `reports/orchestration/${base}.md`;
  const withoutReports = { ...summary };
  delete withoutReports.reports;
  await writeFile(resolve(repoRoot, jsonPath), `${JSON.stringify(withoutReports, null, 2)}\n`, "utf8");
  await writeFile(
    resolve(repoRoot, mdPath),
    [
      `# Orchestrator Evidence — ${summary.runId}`,
      "",
      `- Mode: ${summary.mode}`,
      `- Status: ${summary.status}`,
      `- Selected path: ${summary.selectedPath ?? "none"}`,
      `- Next safe action: ${summary.nextSafeAction}`,
      "",
      "## Blockers",
      ...(summary.blockers.length > 0 ? summary.blockers.map((entry) => `- ${entry}`) : ["- none"]),
      "",
      "## Delegated Commands",
      ...(summary.delegatedCommands.length > 0 ? summary.delegatedCommands.map((entry) => `- ${entry.command} (${entry.status})`) : ["- none"]),
      "",
    ].join("\n"),
    "utf8",
  );
  return { json: jsonPath, markdown: mdPath };
}

export async function collectOrchestratorEvidence(options: CollectOrchestratorEvidenceOptions): Promise<OrchestratorEvidenceSummary> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeRoot = resolve(repoRoot, "docs/initiatives", options.initiative);
  const files = (
    await Promise.all(INITIATIVE_RUN_DIRS.map((dir) => collectJsonFiles(join(initiativeRoot, dir))))
  ).flat();
  const recordsWithFiles: Array<{ file: string; record: Record<string, unknown> | null }> = [];
  for (const file of files) {
    const record = await readJsonFile(file);
    recordsWithFiles.push({ file, record });
  }
  const records = recordsWithFiles.map((entry) => entry.record);
  const delegatedCommands = recordsWithFiles.flatMap((entry) => commandEntriesFromArtifact(repoRoot, entry.file, entry.record));
  const lifecycleEvidence = await resolveLifecycleEvidence(repoRoot, options.lifecycleEvidence, options.runId);
  const codingLog = await resolveCodingLog(repoRoot, options.codingLog);
  const reviewVerdict = (codingLog.text.match(REVIEW_RE)?.[1]?.toLowerCase() as "no_required_fixes" | "changes_required" | undefined) ?? null;
  const prGate = prGateFromArtifacts(records);

  const blockers: string[] = [];
  if (recordsWithFiles.length === 0) blockers.push(`No initiative run evidence found for ${options.initiative}.`);
  if (!lifecycleEvidence) blockers.push("Missing lifecycle evidence; merge readiness cannot be summarized.");
  if (!reviewVerdict) blockers.push("Missing Review Verdict in active coding log.");
  if (reviewVerdict === "changes_required") blockers.push("Review Verdict is changes_required.");
  if (prGate?.status && prGate.status !== "pass") blockers.push(`PR gate is not pass: ${prGate.status}.`);

  const summary: OrchestratorEvidenceSummary = {
    version: 1,
    runId: options.runId ?? `orch-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase()}`,
    mode: "evidence",
    status: blockers.length > 0 ? "blocked" : "ready",
    selectedPath: selectedPathFromArtifacts(records),
    delegatedCommands,
    consumedEvidence: {
      initiativeRuns: recordsWithFiles.map((entry) => relPath(repoRoot, entry.file)),
      lifecycleEvidence,
      codingLog: codingLog.path,
      reviewVerdict,
      prGate,
      mergeHelper: null,
    },
    blockers: unique(blockers),
    hitlGates: ["Explicit approval reference is required before merge apply."],
    approval: { required: true, approvalRef: null, approvedAction: null },
    nextSafeAction: blockers.length > 0 ? "fix evidence blockers before running harness:merge check" : "harness:merge check --pr <number> --method squash",
    merge: { defaultStopBeforeMerge: true, attempted: false, delegatedOnlyToHarnessMerge: true, rawGitMergeUsed: false },
  };
  if (options.writeReport) summary.reports = await writeReports(repoRoot, summary);
  return summary;
}

export function assertNoRawGitMergeCommand(command: string): void {
  if (/(^|\s)git\s+merge(\s|$)/i.test(command)) throw new Error("raw git merge is forbidden; delegate only to harness:merge.");
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'"'"'`)}'`;
}

function mergeCall(mode: "check" | "apply", options: OrchestratorMergeOptions): DelegatedMergeCall {
  const method = options.method ?? "squash";
  const args = ["run", "harness:merge", "--", mode, "--pr", String(options.pr), "--method", method];
  if (options.lifecycleEvidence) args.push("--lifecycle-evidence", options.lifecycleEvidence);
  args.push("--json");
  const command = ["npm", "run", "harness:merge", "--", mode, "--pr", String(options.pr), "--method", method, ...(options.lifecycleEvidence ? ["--lifecycle-evidence", options.lifecycleEvidence] : []), "--json"].map(shellQuote).join(" ");
  assertNoRawGitMergeCommand(command);
  return { command, executable: "npm", args };
}

async function defaultMergeRunner(call: DelegatedMergeCall, cwd?: string): Promise<DelegatedMergeResult> {
  const args = call.args[0] === "run" ? ["run", "--silent", ...call.args.slice(1)] : call.args;
  try {
    const result = await execFile(call.executable, args, { cwd, encoding: "utf8" });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const typed = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { exitCode: typeof typed.code === "number" ? typed.code : 1, stdout: typed.stdout ?? "", stderr: typed.stderr ?? typed.message };
  }
}

function parseHelperJson(result: DelegatedMergeResult): Record<string, unknown> {
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeReadyFromHelper(parsed: Record<string, unknown>, result: DelegatedMergeResult): { ready: boolean; blockers: string[] } {
  const readiness = isRecord(parsed.readiness) ? parsed.readiness : parsed;
  const blockers = stringArray(readiness.blockers);
  const ready = readiness.ready === true || (result.exitCode === 0 && blockers.length === 0);
  return { ready, blockers };
}

function baseMergeSummary(mode: OrchestratorEvidenceMode, options: OrchestratorMergeOptions): OrchestratorEvidenceSummary {
  return {
    version: 1,
    runId: `orch-${mode}-${options.pr}`,
    mode,
    status: "blocked",
    selectedPath: "merge",
    delegatedCommands: [],
    consumedEvidence: { initiativeRuns: [], lifecycleEvidence: options.lifecycleEvidence ?? null, codingLog: null, reviewVerdict: null, prGate: null, mergeHelper: null },
    blockers: [],
    hitlGates: [],
    approval: { required: true, approvalRef: options.approvalRef ?? null, approvedAction: options.approvalRef ? "merge" : null },
    nextSafeAction: "fix blockers",
    merge: { defaultStopBeforeMerge: true, attempted: false, delegatedOnlyToHarnessMerge: true, rawGitMergeUsed: false },
  };
}

export async function runOrchestratorMergeCheck(options: OrchestratorMergeOptions, runner?: DelegatedMergeRunner): Promise<OrchestratorEvidenceSummary> {
  const call = mergeCall("check", options);
  const result = await (runner ?? ((next) => defaultMergeRunner(next, resolve(options.repoRoot ?? process.cwd()))))(call);
  const parsed = parseHelperJson(result);
  const ready = mergeReadyFromHelper(parsed, result);
  const summary = baseMergeSummary("merge_check", options);
  summary.status = ready.ready ? "ready" : "blocked";
  summary.delegatedCommands = [{ command: call.command, status: result.exitCode === 0 ? "passed" : "failed", exitCode: result.exitCode }];
  summary.consumedEvidence.mergeHelper = { checkReady: ready.ready, blockers: ready.blockers };
  summary.blockers = unique(ready.blockers.length > 0 ? ready.blockers : result.exitCode === 0 ? [] : [result.stderr || result.stdout || "harness:merge check failed"]);
  summary.nextSafeAction = ready.ready ? `harness:merge apply --pr ${options.pr} --method ${options.method ?? "squash"}` : "fix merge readiness blockers, then rerun harness:merge check";
  summary.helperOutput = parsed;
  return summary;
}

export async function runOrchestratorMergeApply(options: OrchestratorMergeOptions, runner?: DelegatedMergeRunner): Promise<OrchestratorEvidenceSummary> {
  const summary = baseMergeSummary("merge_apply", options);
  if (!options.approvalRef?.trim()) {
    summary.blockers = ["merge-apply requires --approval-ref."];
    summary.nextSafeAction = "provide an explicit approval reference before merge apply";
    return summary;
  }
  const check = await runOrchestratorMergeCheck(options, runner);
  summary.delegatedCommands.push(...check.delegatedCommands);
  summary.consumedEvidence.mergeHelper = check.consumedEvidence.mergeHelper;
  summary.blockers = [...check.blockers];
  if (check.status !== "ready") {
    summary.nextSafeAction = "fix merge readiness blockers; apply was not delegated";
    return summary;
  }
  const call = mergeCall("apply", options);
  const result = await (runner ?? ((next) => defaultMergeRunner(next, resolve(options.repoRoot ?? process.cwd()))))(call);
  const parsed = parseHelperJson(result);
  const status = String(parsed.status ?? "");
  const merged = result.exitCode === 0 && status !== "blocked";
  summary.delegatedCommands.push({ command: call.command, status: merged ? "passed" : "failed", exitCode: result.exitCode });
  summary.status = merged ? "merged" : "blocked";
  summary.merge.attempted = true;
  summary.blockers = merged ? [] : unique([...(summary.blockers ?? []), result.stderr || result.stdout || "harness:merge apply failed"]);
  summary.nextSafeAction = merged ? "record merge evidence, then run harness:sync-main explicitly if local sync is required" : "fix merge apply blockers";
  summary.helperOutput = parsed;
  return summary;
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function orchestratorEvidenceExtension(): void {}
