import { spawn, type StdioOptions } from "node:child_process";
import { resolve } from "node:path";

import type { HarnessRunner } from "./harness-runner.ts";

export interface SpawnRunnerOptions {
  tsxImport?: string;
  nodeLoader?: string | null;
  stdio?: StdioOptions;
}

function normalizePassthroughArgs(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

export function createSpawnHarnessRunner(scriptPath: string, options: SpawnRunnerOptions = {}): HarnessRunner {
  const tsxImport = options.tsxImport ?? process.env.HARNESS_TSX_IMPORT?.trim() ?? "tsx";
  const nodeLoaderEnv = process.env.HARNESS_NODE_LOADER?.trim() ?? "";
  const nodeLoader = options.nodeLoader === undefined ? (nodeLoaderEnv || null) : options.nodeLoader;
  const stdio: StdioOptions = options.stdio ?? "inherit";
  const absoluteScript = resolve(scriptPath);

  return async function spawnRunner(argv: string[]): Promise<number> {
    const passthroughArgs = normalizePassthroughArgs(argv);
    const nodeArgs = [
      ...(nodeLoader ? ["--experimental-loader", nodeLoader] : []),
      "--import",
      tsxImport,
      absoluteScript,
      ...passthroughArgs,
    ];

    const child = spawn(process.execPath, nodeArgs, { stdio });

    return await new Promise<number>((resolveCode, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal) {
          resolveCode(1);
          return;
        }
        resolveCode(code ?? 0);
      });
    });
  };
}
