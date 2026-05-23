import { resolve } from "node:path";

import { runAllChecks, type DoctorCheckResult, type DoctorReport } from "../.pi/agent/extensions/doctor.ts";

interface DoctorCliOptions {
  json: boolean;
  cwd: string;
}

function parseArgs(argv: string[]): DoctorCliOptions {
  let json = false;
  let cwd = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--cwd") {
      const value = argv[i + 1];
      if (!value) throw new Error("--cwd requires a value");
      cwd = resolve(value);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { json, cwd };
}

function printHelp(): void {
  process.stdout.write(`Usage: harness:doctor [--json] [--cwd <path>]

Reports the health of repo-local harness state. Read-only.

Checks:
  - runtime-state   leases.json, queue.json, tasks.json parse and have version 1
  - schemas-valid   every *.schema.json in .pi/agent/state/schemas/ parses
  - models-config   .pi/agent/models.json parses and has routing_defaults
  - audit-log       logs/harness-actions.jsonl is line-parseable JSONL

Exit code:
  0  all checks pass (warn is acceptable)
  1  any check fails
`);
}

function statusIcon(status: DoctorCheckResult["status"]): string {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

function renderReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`harness:doctor — overall: ${statusIcon(report.overall)}`);
  lines.push(`cwd: ${report.cwd}`);
  lines.push("");
  for (const check of report.checks) {
    lines.push(`[${statusIcon(check.status)}] ${check.name}: ${check.message}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await runAllChecks(options.cwd);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderReport(report)}\n`);
  }
  process.exitCode = report.overall === "fail" ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`harness:doctor failed: ${(error as Error).message}\n`);
  process.exitCode = 2;
});
