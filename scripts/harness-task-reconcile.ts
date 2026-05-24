import { exec as execCallback } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  ensureTasksState,
  mutateTasksState,
  readTasksState,
} from "../.pi/agent/extensions/lib/tasks-state.ts";

const exec = promisify(execCallback);

type TaskStatus = "queued" | "in_progress" | "review" | "blocked" | "done" | "failed";

interface TaskRecord {
  id: string;
  title: string;
  owner: string | null;
  status: TaskStatus;
  taskClass: string;
  acceptance: string[];
  evidence: string[];
  notes: string[];
  validation?: {
    tier?: string;
    decision?: string;
    checklist?: unknown;
    source?: string | null;
    updatedAt?: string | null;
  };
  timestamps: {
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
  };
  [key: string]: unknown;
}

interface ReconcileOptions {
  command: "supersede-blocked";
  cwd: string;
  taskId: string;
  approvalRef: string;
  reason: string;
  evidenceCommands: string[];
  json: boolean;
}

interface EvidenceResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function usage(): string {
  return [
    "Usage: node --import tsx scripts/harness-task-reconcile.ts supersede-blocked --task-id <id> --approval-ref <ref> --reason <text> --evidence-command <cmd> [options]",
    "",
    "Options:",
    "  --cwd <path>                 Runtime repo root (default: current working directory)",
    "  --task-id <id>               Blocked historical task to reconcile",
    "  --approval-ref <ref>         Human/operator approval reference for protected runtime mutation",
    "  --reason <text>              Reconciliation reason recorded in task notes/evidence",
    "  --evidence-command <cmd>     Command that must pass before the task is marked done; repeatable",
    "  --json                       Emit JSON",
    "  -h, --help                   Show this help text",
  ].join("\n");
}

function parseArgs(argv: string[]): ReconcileOptions {
  if (argv.includes("--help") || argv.includes("-h")) throw new Error(usage());
  const command = argv[0];
  if (command !== "supersede-blocked") throw new Error(`Unknown command: ${command ?? "<missing>"}\n${usage()}`);
  const options: ReconcileOptions = {
    command,
    cwd: process.cwd(),
    taskId: "",
    approvalRef: "",
    reason: "",
    evidenceCommands: [],
    json: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (["--cwd", "--task-id", "--approval-ref", "--reason", "--evidence-command"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      index += 1;
      if (arg === "--cwd") options.cwd = value;
      if (arg === "--task-id") options.taskId = value;
      if (arg === "--approval-ref") options.approvalRef = value;
      if (arg === "--reason") options.reason = value;
      if (arg === "--evidence-command") options.evidenceCommands.push(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!options.taskId) throw new Error("supersede-blocked requires --task-id.");
  if (!options.approvalRef) throw new Error("supersede-blocked requires --approval-ref.");
  if (!options.reason) throw new Error("supersede-blocked requires --reason.");
  if (options.evidenceCommands.length === 0) throw new Error("supersede-blocked requires at least one --evidence-command.");
  return options;
}

async function runEvidenceCommands(cwd: string, commands: string[]): Promise<EvidenceResult[]> {
  const results: EvidenceResult[] = [];
  for (const command of commands) {
    try {
      const result = await exec(command, { cwd, timeout: 120_000, maxBuffer: 1024 * 1024 });
      results.push({ command, exitCode: 0, stdout: result.stdout, stderr: result.stderr });
    } catch (error) {
      const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      const exitCode = typeof err.code === "number" ? err.code : 1;
      results.push({ command, exitCode, stdout: err.stdout ?? "", stderr: err.stderr ?? err.message ?? "" });
      throw new Error(`evidence command failed (${exitCode}): ${command}`);
    }
  }
  return results;
}

async function assertBlockedTaskExists(cwd: string, taskId: string): Promise<void> {
  const state = await readTasksState<TaskRecord>(cwd);
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== "blocked") {
    throw new Error(`Refusing to reconcile ${taskId}: expected blocked status but found ${task.status}.`);
  }
}

async function reconcile(options: ReconcileOptions): Promise<Record<string, unknown>> {
  const cwd = resolve(options.cwd);
  await ensureTasksState(cwd);
  await assertBlockedTaskExists(cwd, options.taskId);
  const evidence = await runEvidenceCommands(cwd, options.evidenceCommands);
  const reconciledAt = new Date().toISOString();
  let previousStatus: TaskStatus | null = null;

  await mutateTasksState<TaskRecord, void>(cwd, (state) => {
    const task = state.tasks.find((candidate) => candidate.id === options.taskId);
    if (!task) throw new Error(`Task not found: ${options.taskId}`);
    previousStatus = task.status;
    if (task.status !== "blocked") {
      throw new Error(`Refusing to reconcile ${options.taskId}: expected blocked status but found ${task.status}.`);
    }
    const note = [
      `Reconciled stale blocked task via harness-task-reconcile at ${reconciledAt}.`,
      `approvalRef=${options.approvalRef}`,
      `reason=${options.reason}`,
      `evidenceCommands=${options.evidenceCommands.join(" | ")}`,
    ].join(" ");
    const evidenceNote = [
      `Superseded stale blocked task at ${reconciledAt}.`,
      `approvalRef=${options.approvalRef}`,
      `reason=${options.reason}`,
      `evidenceCommands=${options.evidenceCommands.join(" | ")}`,
    ].join(" ");
    task.notes = [...(Array.isArray(task.notes) ? task.notes : []), note];
    task.evidence = [...(Array.isArray(task.evidence) ? task.evidence : []), evidenceNote];
    task.validation = {
      tier: task.validation?.tier ?? "standard",
      decision: "overridden",
      checklist: task.validation?.checklist ?? {
        acceptance: "met",
        tests: "met",
        diff_review: "not_applicable",
        evidence: "met",
      },
      source: "override",
      updatedAt: reconciledAt,
    };
    task.status = "done";
    task.timestamps = {
      ...task.timestamps,
      updatedAt: reconciledAt,
      completedAt: reconciledAt,
    };
    if (state.activeTaskId === task.id) state.activeTaskId = null;
  });

  return {
    ok: true,
    taskId: options.taskId,
    previousStatus,
    status: "done",
    validationDecision: "overridden",
    evidence: evidence.map((result) => ({ command: result.command, exitCode: result.exitCode })),
  };
}

export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await reconcile(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Reconciled ${options.taskId}: ${result.previousStatus} -> done\n`);
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = (error as Error).message;
    if (message.includes("Usage:")) {
      process.stdout.write(`${message}\n`);
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`harness-task-reconcile failed: ${message}\n`);
    process.exitCode = 1;
  });
}
