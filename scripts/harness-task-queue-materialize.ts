import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  materializeTaskQueueJob,
  type TaskQueueMaterializationInput,
} from "../.pi/agent/extensions/queue-runner.ts";

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function positiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(requireValue(value, flag), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function usage(): string {
  return [
    "Usage: node --import tsx scripts/harness-task-queue-materialize.ts --task-id <id> --allowed-path <path> --assigned-role <role> --work-type <type> [options]",
    "",
    "Options:",
    "  --cwd <path>                  Runtime root to materialize into (default: current working directory).",
    "  --job-id <id>                 Required deterministic queue job id.",
    "  --initiative <id>             Queue source initiative id (default: runtime-tasks).",
    "  --issue-id <id>               Queue source issue id (default: task id).",
    "  --allowed-path <path>         Allowed path; may be repeated.",
    "  --assigned-role <role>        Harness role, e.g. backend_worker.",
    "  --work-type <type>            Work type, e.g. implementation.",
    "  --domain <domain>             Domain; may be repeated.",
    "  --validation-command <cmd>    Validation command; may be repeated.",
    "  --max-runtime-minutes <n>     Runtime budget metadata for the queue job.",
    "  --json                        Emit JSON.",
  ].join("\n");
}

export function parseTaskQueueMaterializeArgs(argv: string[]): { input: TaskQueueMaterializationInput; json: boolean; cwd?: string } {
  let cwd: string | undefined;
  let taskId: string | undefined;
  let jobId: string | undefined;
  let initiativeId: string | undefined;
  let issueId: string | undefined;
  const allowedPaths: string[] = [];
  let assignedRole: string | undefined;
  let workType: string | undefined;
  const domains: string[] = [];
  const validationCommands: string[] = [];
  let maxRuntimeMinutes: number | undefined;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd") cwd = requireValue(argv[++index], "--cwd");
    else if (arg === "--task-id") taskId = requireValue(argv[++index], "--task-id");
    else if (arg === "--job-id") jobId = requireValue(argv[++index], "--job-id");
    else if (arg === "--initiative") initiativeId = requireValue(argv[++index], "--initiative");
    else if (arg === "--issue-id") issueId = requireValue(argv[++index], "--issue-id");
    else if (arg === "--allowed-path") allowedPaths.push(requireValue(argv[++index], "--allowed-path"));
    else if (arg === "--assigned-role") assignedRole = requireValue(argv[++index], "--assigned-role");
    else if (arg === "--work-type") workType = requireValue(argv[++index], "--work-type");
    else if (arg === "--domain") domains.push(requireValue(argv[++index], "--domain"));
    else if (arg === "--validation-command") validationCommands.push(requireValue(argv[++index], "--validation-command"));
    else if (arg === "--max-runtime-minutes") maxRuntimeMinutes = positiveInteger(argv[++index], "--max-runtime-minutes");
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") throw new Error(usage());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!taskId) throw new Error("--task-id is required.");
  if (!jobId) throw new Error("--job-id is required.");
  if (!maxRuntimeMinutes) throw new Error("--max-runtime-minutes is required.");
  if (allowedPaths.length === 0) throw new Error("At least one --allowed-path is required.");
  if (!assignedRole) throw new Error("--assigned-role is required.");
  if (!workType) throw new Error("--work-type is required.");

  return {
    input: {
      taskId,
      jobId,
      initiativeId,
      issueId,
      allowedPaths,
      assignedRole: assignedRole as TaskQueueMaterializationInput["assignedRole"],
      workType: workType as TaskQueueMaterializationInput["workType"],
      domains: domains as TaskQueueMaterializationInput["domains"],
      validationCommands: validationCommands.length > 0 ? validationCommands : undefined,
      maxRuntimeMinutes,
    },
    json,
    cwd,
  };
}

export async function runHarnessTaskQueueMaterialize(argv: string[], defaultCwd = realpathSync(process.cwd())) {
  const { input, json, cwd } = parseTaskQueueMaterializeArgs(argv);
  const result = await materializeTaskQueueJob(realpathSync(cwd ?? defaultCwd), input);
  if (json) return JSON.stringify(result, null, 2);
  return `${result.created ? "materialized" : "already-materialized"}: ${result.job.id}\n${result.reason}`;
}

async function main(argv: string[]): Promise<void> {
  const output = await runHarnessTaskQueueMaterialize(argv);
  process.stdout.write(`${output}\n`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href : false;
if (isMain) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = (error as Error).message;
    if (message.includes("Usage:")) {
      process.stdout.write(`${message}\n`);
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`harness-task-queue-materialize failed: ${message}\n`);
    process.exitCode = 1;
  });
}
