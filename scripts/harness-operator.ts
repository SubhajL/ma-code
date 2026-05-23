import { pathToFileURL } from "node:url";

import { DEFAULT_HARNESS_DISPATCH, HARNESS_IN_PROCESS_SUBCOMMANDS } from "./lib/harness-dispatch.ts";
import { HarnessUnknownSubcommandError, runHarnessCommand } from "./lib/harness-runner.ts";

function printUsage(): void {
  const lines = [
    "Usage: node --import tsx scripts/harness-operator.ts <subcommand> [args...]",
    "",
    "Subcommands:",
    "  status          Delegate to the operator status surface",
    "  queue-session   Delegate to the bounded queue-session surface",
    "  leases          Delegate to the lease inspection surface",
    "  worktree        Delegate to the bounded worktree helper",
    "  worker-session  Delegate to the worker-lane lifecycle surface",
    "  product-pipeline Delegate to the bounded product pipeline surface",
    "  parallel-worker-lanes Delegate to bounded foreground parallel worker lanes",
    "  issue-materialize Delegate to Phase A issue materialization",
    "  afk-orchestrate Delegate to Phase B AFK queue orchestration",
    "  worker-execute Delegate to Phase C bounded worker execution",
    "  pr-lifecycle  Delegate to Phase D PR lifecycle automation",
    "  orchestrate   Delegate to Phase 5 master orchestrator classify/dry-run/apply/run/evidence/merge router",
    "  help            Show this help text",
    "",
    "Notes:",
    "  - harness:operator is the preferred front door",
    "  - legacy operator commands remain supported",
    `  - in-process dispatch enabled for: ${HARNESS_IN_PROCESS_SUBCOMMANDS.join(", ")}`,
    "  - other subcommands still spawn the underlying script for now",
    "",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main(): Promise<number> {
  const [firstArg, ...rest] = process.argv.slice(2);
  if (!firstArg || firstArg === "help" || firstArg === "-h" || firstArg === "--help") {
    printUsage();
    return 0;
  }

  const passthroughArgs = rest[0] === "--" ? rest.slice(1) : rest;
  try {
    return await runHarnessCommand(DEFAULT_HARNESS_DISPATCH, firstArg, passthroughArgs);
  } catch (error) {
    if (error instanceof HarnessUnknownSubcommandError) {
      process.stderr.write(`harness-operator failed: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`harness-operator failed: ${String(error)}\n`);
      process.exitCode = 1;
    });
}
