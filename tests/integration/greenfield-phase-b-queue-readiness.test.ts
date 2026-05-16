import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

test("phase B validator reports queue-ready candidates without enabling worker execution", async () => {
  const { stdout } = await execFile(process.execPath, ["scripts/validate-greenfield-phase-b.mjs", "--json"], {
    cwd: repoRoot,
  });

  const report = JSON.parse(stdout) as {
    phase: string;
    workerExecution: string;
    runtimeMutation: string;
    candidates: Array<{ id: string; status: string }>;
  };

  assert.equal(report.phase, "B_queue_readiness");
  assert.equal(report.workerExecution, "disabled");
  assert.equal(report.runtimeMutation, "disabled");
  assert.ok(report.candidates.some((candidate) => candidate.status === "queue_ready_candidate"));
});

test("phase B package script does not mutate runtime queue or task state", async () => {
  const queuePath = resolve(repoRoot, ".pi/agent/state/runtime/queue.json");
  const tasksPath = resolve(repoRoot, ".pi/agent/state/runtime/tasks.json");
  const beforeQueue = await readOptional(queuePath);
  const beforeTasks = await readOptional(tasksPath);

  await execFile("npm", ["run", "validate:greenfield-phase-b"], { cwd: repoRoot });

  assert.equal(await readOptional(queuePath), beforeQueue);
  assert.equal(await readOptional(tasksPath), beforeTasks);
});
