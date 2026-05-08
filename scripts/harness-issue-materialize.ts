import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  materializeIssueArtifacts,
  renderIssueMaterializationResult,
  type IssueMaterializationCommand,
} from "../.pi/agent/extensions/issue-materialization.ts";

export interface HarnessIssueMaterializeOptions {
  repoRoot?: string;
  command: IssueMaterializationCommand;
  sourcePath: string;
  overwrite?: boolean;
  json?: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  harness-issue-materialize dry-run --source <approved-g-issues.json> [--json]",
    "  harness-issue-materialize apply --source <approved-g-issues.json> [--overwrite] [--json]",
    "",
    "Rules:",
    "  - dry-run validates and reports planned initiative artifacts without writing files",
    "  - apply writes only under docs/initiatives/<slug>/",
    "  - queue readiness remains not_ready; queue-ready conversion belongs to Phase B",
    "  - no daemon, queue jobs, worker sessions, or runtime task/queue mutation",
  ].join("\n");
}

function parseArgs(argv: string[]): HarnessIssueMaterializeOptions {
  const [commandValue, ...rest] = argv;
  if (!commandValue || commandValue === "help" || commandValue === "--help" || commandValue === "-h") throw new Error(usage());
  if (commandValue === "queue-ready" || commandValue === "--mode=queue-ready") throw new Error("queue-ready conversion belongs to Phase B and is not supported by Phase A issue materialization.");
  if (commandValue !== "dry-run" && commandValue !== "apply") throw new Error(`Unknown command: ${commandValue}\n${usage()}`);

  let sourcePath: string | undefined;
  let overwrite = false;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--source") {
      sourcePath = rest[++index];
    } else if (arg === "--overwrite") {
      overwrite = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    } else if (arg === "--mode" && rest[index + 1] === "queue-ready") {
      throw new Error("queue-ready conversion belongs to Phase B and is not supported by Phase A issue materialization.");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!sourcePath) throw new Error("--source is required.");
  if (commandValue === "dry-run" && overwrite) throw new Error("--overwrite is only valid with apply.");
  return { command: commandValue, sourcePath, overwrite, json };
}

export async function runHarnessIssueMaterialize(options: HarnessIssueMaterializeOptions) {
  return materializeIssueArtifacts({
    repoRoot: options.repoRoot ?? process.cwd(),
    command: options.command,
    sourcePath: options.sourcePath,
    overwrite: options.overwrite,
  });
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const result = await runHarnessIssueMaterialize(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderIssueMaterializationResult(result)}\n`);
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
    process.stderr.write(`harness-issue-materialize failed: ${message}\n`);
    process.exitCode = 1;
  });
}
