import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";

import { readTasksState, writeTasksState } from "../../.pi/agent/extensions/lib/tasks-state.ts";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const tsxImport = process.env.TSX_IMPORT_PATH ?? join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");

interface ReconcileTask {
  id: string;
  status: string;
  validation: { decision: string };
  evidence: string[];
  notes: string[];
}

async function writeFixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "task-reconcile-"));
  // Seed the canonical SQLite task store (ADR-0001), not the legacy tasks.json export.
  await writeTasksState(cwd, {
    version: 1,
    activeTaskId: "task-active",
    tasks: [
      {
        id: "task-blocked",
        title: "historical blocked task",
        owner: "assistant",
        status: "blocked",
        taskClass: "implementation",
        acceptance: ["prove current behavior"],
        evidence: [],
        notes: ["old blocker"],
        retryCount: 0,
        validation: { tier: "standard", decision: "pending", checklist: null, source: null, updatedAt: null },
        timestamps: { createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" },
      },
      {
        id: "task-active",
        title: "current active task",
        owner: "assistant",
        status: "in_progress",
        taskClass: "implementation",
        acceptance: ["stay active"],
        evidence: [],
        notes: [],
        retryCount: 0,
        validation: { tier: "standard", decision: "pending", checklist: null, source: null, updatedAt: null },
        timestamps: { createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" },
      },
    ],
  });
  return cwd;
}

test("harness task reconcile supersedes a blocked historical task without disturbing active task", async () => {
  const cwd = await writeFixture();
  const result = await execFile(process.execPath, [
    "--import", tsxImport,
    join(repoRoot, "scripts/harness-task-reconcile.ts"),
    "supersede-blocked",
    "--cwd", cwd,
    "--task-id", "task-blocked",
    "--approval-ref", "test-approval",
    "--reason", "current evidence supersedes stale blocker",
    "--evidence-command", "node -e \"process.exit(0)\"",
    "--json",
  ], { cwd });

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.taskId, "task-blocked");
  assert.equal(payload.previousStatus, "blocked");
  assert.equal(payload.status, "done");

  const state = await readTasksState<ReconcileTask>(cwd);
  const task = state.tasks.find((candidate) => candidate.id === "task-blocked");
  assert.ok(task);
  assert.equal(state.activeTaskId, "task-active");
  assert.equal(task.status, "done");
  assert.equal(task.validation.decision, "overridden");
  assert.match(task.evidence.at(-1), /Superseded stale blocked task/);
  assert.match(task.notes.at(-1), /Reconciled stale blocked task/);
});

test("harness task reconcile refuses when evidence fails", async () => {
  const cwd = await writeFixture();
  await assert.rejects(execFile(process.execPath, [
    "--import", tsxImport,
    join(repoRoot, "scripts/harness-task-reconcile.ts"),
    "supersede-blocked",
    "--cwd", cwd,
    "--task-id", "task-blocked",
    "--approval-ref", "test-approval",
    "--reason", "should not reconcile without proof",
    "--evidence-command", "node -e \"process.exit(9)\"",
  ], { cwd }), /evidence command failed/);

  const state = await readTasksState<ReconcileTask>(cwd);
  const task = state.tasks.find((candidate) => candidate.id === "task-blocked");
  assert.ok(task);
  assert.equal(task.status, "blocked");
});
