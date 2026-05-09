import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TSX_IMPORT = process.env.HARNESS_TSX_IMPORT?.trim() || "tsx";
const DEFAULT_NODE_LOADER = process.env.HARNESS_NODE_LOADER?.trim() || null;

const SUBCOMMANDS: Record<string, string> = {
  status: "harness-operator-status.ts",
  "queue-session": "harness-queue-session.ts",
  leases: "harness-operator-leases.ts",
  worktree: "harness-worktree.ts",
  "worker-session": "harness-worker-session.ts",
  "product-pipeline": "harness-product-pipeline.ts",
  "parallel-worker-lanes": "harness-parallel-worker-lanes.ts",
  "issue-materialize": "harness-issue-materialize.ts",
  "afk-orchestrate": "harness-afk-orchestrate.ts",
  "worker-execute": "harness-worker-execute.ts",
  "pr-lifecycle": "harness-pr-lifecycle.ts",
  orchestrate: "harness-orchestrate.ts",
};

function printUsage(): void {
  process.stdout.write(
    `Usage: node --import tsx scripts/harness-operator.ts <subcommand> [args...]\n\nSubcommands:\n  status          Delegate to the operator status surface\n  queue-session   Delegate to the bounded queue-session surface\n  leases          Delegate to the lease inspection surface\n  worktree        Delegate to the bounded worktree helper\n  worker-session  Delegate to the worker-lane lifecycle surface\n  product-pipeline Delegate to the bounded product pipeline surface\n  parallel-worker-lanes Delegate to bounded foreground parallel worker lanes\n  issue-materialize Delegate to Phase A issue materialization\n  afk-orchestrate Delegate to Phase B AFK queue orchestration\n  worker-execute Delegate to Phase C bounded worker execution\n  pr-lifecycle  Delegate to Phase D PR lifecycle automation\n  orchestrate   Delegate to Phase 2 master orchestrator classify/dry-run planner\n  help            Show this help text\n\nNotes:\n  - harness:operator is the preferred front door\n  - legacy operator commands remain supported\n`,
  );
}

function normalizePassthroughArgs(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

async function delegate(subcommand: string, args: string[]): Promise<number> {
  const target = SUBCOMMANDS[subcommand];
  if (!target) {
    process.stderr.write(`harness-operator failed: Unknown subcommand: ${subcommand}\n`);
    return 1;
  }

  const passthroughArgs = normalizePassthroughArgs(args);
  const nodeArgs = [
    ...(DEFAULT_NODE_LOADER ? ["--experimental-loader", DEFAULT_NODE_LOADER] : []),
    "--import",
    DEFAULT_TSX_IMPORT,
    resolve(SCRIPT_DIR, target),
    ...passthroughArgs,
  ];

  const child = spawn(process.execPath, nodeArgs, {
    stdio: "inherit",
  });

  return await new Promise<number>((resolveCode, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.stderr.write(`harness-operator failed: delegated process exited from signal ${signal}\n`);
        resolveCode(1);
        return;
      }
      resolveCode(code ?? 0);
    });
  });
}

async function main(): Promise<void> {
  const [firstArg, ...rest] = process.argv.slice(2);
  if (!firstArg || firstArg === "help" || firstArg === "-h" || firstArg === "--help") {
    printUsage();
    return;
  }

  process.exitCode = await delegate(firstArg, rest);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`harness-operator failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
