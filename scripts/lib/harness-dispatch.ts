import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { HarnessDispatchTable, HarnessRunner } from "./harness-runner.ts";
import { createSpawnHarnessRunner } from "./harness-runner-spawn.ts";

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function inProcess(loader: () => Promise<{ runFromArgv: HarnessRunner }>): () => Promise<HarnessRunner> {
  return async () => {
    const mod = await loader();
    return mod.runFromArgv;
  };
}

function spawned(scriptFile: string): () => Promise<HarnessRunner> {
  return async () => createSpawnHarnessRunner(resolve(SCRIPTS_DIR, scriptFile));
}

export const DEFAULT_HARNESS_DISPATCH: HarnessDispatchTable = {
  status: inProcess(() => import("../harness-operator-status.ts")),
  leases: inProcess(() => import("../harness-operator-leases.ts")),
  "queue-session": inProcess(() => import("../harness-queue-session.ts")),
  worktree: inProcess(() => import("../harness-worktree.ts")),
  "worker-session": inProcess(() => import("../harness-worker-session.ts")),
  "product-pipeline": inProcess(() => import("../harness-product-pipeline.ts")),
  "parallel-worker-lanes": spawned("harness-parallel-worker-lanes.ts"),
  "issue-materialize": inProcess(() => import("../harness-issue-materialize.ts")),
  "afk-orchestrate": inProcess(() => import("../harness-afk-orchestrate.ts")),
  "worker-execute": spawned("harness-worker-execute.ts"),
  "pr-lifecycle": inProcess(() => import("../harness-pr-lifecycle.ts")),
  orchestrate: spawned("harness-orchestrate.ts"),
};

export const HARNESS_IN_PROCESS_SUBCOMMANDS: readonly string[] = [
  "status",
  "leases",
  "queue-session",
  "worktree",
  "worker-session",
  "product-pipeline",
  "issue-materialize",
  "afk-orchestrate",
  "pr-lifecycle",
] as const;
