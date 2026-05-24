import { exec as execCallback } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  ensureQueueState,
  mutateQueueState,
  readQueueState,
} from "../.pi/agent/extensions/lib/queue-state.ts";

const exec = promisify(execCallback);

type QueueJobStatus = "queued" | "running" | "blocked" | "done" | "failed";

interface QueueJob {
  id: string;
  status: QueueJobStatus;
  notes?: string[];
  updatedAt?: string;
  finishedAt?: string;
  [key: string]: unknown;
}

interface ReconcileOptions {
  command: "supersede-blocked";
  cwd: string;
  jobId: string;
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
    "Usage: node --import tsx scripts/harness-queue-reconcile.ts supersede-blocked --job-id <id> --approval-ref <ref> --reason <text> --evidence-command <cmd> [options]",
    "",
    "Options:",
    "  --cwd <path>                 Runtime repo root (default: current working directory)",
    "  --job-id <id>                Blocked queue job to reconcile",
    "  --approval-ref <ref>         Human/operator approval reference for protected runtime mutation",
    "  --reason <text>              Reconciliation reason recorded in queue notes",
    "  --evidence-command <cmd>     Command that must pass before the job is marked done; repeatable",
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
    jobId: "",
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
    if (["--cwd", "--job-id", "--approval-ref", "--reason", "--evidence-command"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      index += 1;
      if (arg === "--cwd") options.cwd = value;
      if (arg === "--job-id") options.jobId = value;
      if (arg === "--approval-ref") options.approvalRef = value;
      if (arg === "--reason") options.reason = value;
      if (arg === "--evidence-command") options.evidenceCommands.push(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!options.jobId) throw new Error("supersede-blocked requires --job-id.");
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

async function assertBlockedJobExists(cwd: string, jobId: string): Promise<void> {
  const state = await readQueueState<QueueJob>(cwd);
  const job = state.jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Queue job not found: ${jobId}`);
  if (job.status !== "blocked") {
    throw new Error(`Refusing to reconcile ${jobId}: expected blocked status but found ${job.status}.`);
  }
}

async function reconcile(options: ReconcileOptions): Promise<Record<string, unknown>> {
  const cwd = resolve(options.cwd);
  await ensureQueueState(cwd);
  await assertBlockedJobExists(cwd, options.jobId);
  const evidence = await runEvidenceCommands(cwd, options.evidenceCommands);
  const reconciledAt = new Date().toISOString();
  let previousStatus: QueueJobStatus | null = null;

  await mutateQueueState<QueueJob, void>(cwd, (state) => {
    const job = state.jobs.find((candidate) => candidate.id === options.jobId);
    if (!job) throw new Error(`Queue job not found: ${options.jobId}`);
    previousStatus = job.status;
    if (job.status !== "blocked") {
      throw new Error(`Refusing to reconcile ${options.jobId}: expected blocked status but found ${job.status}.`);
    }
    const note = [
      `Reconciled stale blocked job via harness-queue-reconcile at ${reconciledAt}.`,
      `approvalRef=${options.approvalRef}`,
      `reason=${options.reason}`,
      `evidenceCommands=${options.evidenceCommands.join(" | ")}`,
    ].join(" ");
    job.notes = [...(Array.isArray(job.notes) ? job.notes : []), note];
    job.status = "done";
    job.updatedAt = reconciledAt;
    job.finishedAt = reconciledAt;
    if (state.activeJobId === job.id) state.activeJobId = null;
  });

  return {
    ok: true,
    jobId: options.jobId,
    previousStatus,
    status: "done",
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
  process.stdout.write(`Reconciled ${options.jobId}: ${result.previousStatus} -> done\n`);
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
    process.stderr.write(`harness-queue-reconcile failed: ${message}\n`);
    process.exitCode = 1;
  });
}
