import assert from "node:assert/strict";
import test from "node:test";

import { withAtomicQueueAndTasksMutation } from "../../.pi/agent/extensions/lib/coordinated-state.ts";
import {
  closeRuntimeDb,
  openRuntimeDb,
  type RuntimeDb,
} from "../../.pi/agent/extensions/lib/sqlite-state.ts";
import {
  mutateTasksState,
  readTasksState,
  writeTasksState,
  type TasksStateShape,
} from "../../.pi/agent/extensions/lib/tasks-state.ts";
import {
  mutateQueueState,
  readQueueState,
  writeQueueState,
  type QueueStateShape,
} from "../../.pi/agent/extensions/lib/queue-state.ts";
import { makeTempRepo } from "./test-utils.ts";

interface FixtureTask {
  id: string;
  status: string;
}

interface FixtureJob {
  id: string;
  status: string;
  linkedTaskId?: string;
}

function withDb<T>(cwd: string, fn: (db: RuntimeDb) => T): T {
  const db = openRuntimeDb(cwd);
  try {
    return fn(db);
  } finally {
    closeRuntimeDb(db);
  }
}

function seedInitialState(cwd: string): void {
  withDb(cwd, (db) => {
    db.handle
      .prepare(`INSERT INTO tasks (id, payload_json, status, updated_at) VALUES (?, ?, ?, ?)`)
      .run("task-A", JSON.stringify({ id: "task-A", status: "queued" }), "queued", Date.now());
    db.handle
      .prepare(`INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run("job-1", JSON.stringify({ id: "job-1", status: "queued" }), "queued", Date.now(), Date.now());
  });
}

test("withAtomicQueueAndTasksMutation commits both task and queue changes atomically", async () => {
  const cwd = await makeTempRepo("coord-state-commit-");
  seedInitialState(cwd);

  await withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, ({ tasksState, queueState }) => {
    tasksState.tasks.push({ id: "task-B", status: "queued" });
    queueState.jobs.push({ id: "job-2", status: "queued", linkedTaskId: "task-B" });
    tasksState.activeTaskId = "task-B";
    queueState.activeJobId = "job-2";
  });

  const tasks = await readTasksState<FixtureTask>(cwd);
  const queue = await readQueueState<FixtureJob>(cwd);
  assert.equal(tasks.tasks.length, 2);
  assert.ok(tasks.tasks.find((t) => t.id === "task-B"));
  assert.equal(tasks.activeTaskId, "task-B");
  assert.equal(queue.jobs.length, 2);
  assert.ok(queue.jobs.find((j) => j.id === "job-2"));
  assert.equal(queue.activeJobId, "job-2");
});

test("withAtomicQueueAndTasksMutation rolls back BOTH tasks and queue on throw", async () => {
  const cwd = await makeTempRepo("coord-state-rollback-");
  seedInitialState(cwd);

  await assert.rejects(
    withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, ({ tasksState, queueState }) => {
      tasksState.tasks.push({ id: "task-B", status: "queued" });
      queueState.jobs.push({ id: "job-2", status: "queued" });
      tasksState.activeTaskId = "task-B";
      throw new Error("simulated mid-mutation failure");
    }),
    /simulated mid-mutation failure/,
  );

  const tasks = await readTasksState<FixtureTask>(cwd);
  const queue = await readQueueState<FixtureJob>(cwd);
  // Both states must be unchanged from seedInitialState: 1 task, 1 job, no active pointers.
  assert.equal(tasks.tasks.length, 1);
  assert.equal(tasks.tasks[0]?.id, "task-A");
  assert.equal(tasks.activeTaskId, null);
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0]?.id, "job-1");
  assert.equal(queue.activeJobId, null);
});

// Parameterized re-entry coverage: every single-entity write entry must
// refuse to run inside a coordinated scope with a clear, caller-specific
// error message. If a future refactor accidentally drops one of the four
// assertNotInsideCoordinatedScope calls, the corresponding row here goes
// red.
const nestedWriteEntries: Array<{
  label: string;
  invoke: (cwd: string) => Promise<unknown>;
}> = [
  {
    label: "mutateTasksState",
    invoke: (cwd) =>
      mutateTasksState<FixtureTask, void>(cwd, (state) => {
        state.tasks.push({ id: "task-nested", status: "queued" });
      }),
  },
  {
    label: "writeTasksState",
    invoke: (cwd) =>
      writeTasksState<FixtureTask>(cwd, { version: 1, activeTaskId: null, tasks: [] }),
  },
  {
    label: "mutateQueueState",
    invoke: (cwd) =>
      mutateQueueState<FixtureJob, void>(cwd, (state) => {
        state.jobs.push({ id: "job-nested", status: "queued" });
      }),
  },
  {
    label: "writeQueueState",
    invoke: (cwd) =>
      writeQueueState<FixtureJob>(cwd, { version: 1, paused: false, activeJobId: null, jobs: [] }),
  },
];

for (const entry of nestedWriteEntries) {
  test(`withAtomicQueueAndTasksMutation rejects nested ${entry.label} with a caller-named error`, async () => {
    const cwd = await makeTempRepo(`coord-state-nested-${entry.label}-`);
    seedInitialState(cwd);

    await assert.rejects(
      withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, async ({ tasksState }) => {
        tasksState.tasks.push({ id: "task-inside", status: "queued" });
        // The forbidden pattern: opening a second mutation transaction while
        // one is already in flight would deadlock the DB. The re-entry guard
        // must surface this as an explicit error naming the offending caller.
        await entry.invoke(cwd);
      }),
      (error: Error) =>
        error.message.includes(entry.label) &&
        error.message.includes("withAtomicQueueAndTasksMutation"),
    );

    // After the rejection, neither the outer mutation nor the nested write
    // should have committed.
    const tasks = await readTasksState<FixtureTask>(cwd);
    assert.equal(tasks.tasks.length, 1);
    assert.equal(tasks.tasks[0]?.id, "task-A");
  });
}

test("withAtomicQueueAndTasksMutation rejects nested coordinated calls with a clear error", async () => {
  const cwd = await makeTempRepo("coord-state-double-");
  seedInitialState(cwd);

  await assert.rejects(
    withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, async () => {
      await withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, () => {});
    }),
    (error: Error) =>
      error.message.includes("withAtomicQueueAndTasksMutation cannot be nested"),
  );
});

test("withAtomicQueueAndTasksMutation propagates the callback's return value to the caller", async () => {
  const cwd = await makeTempRepo("coord-state-return-");
  seedInitialState(cwd);

  const sentinel = { picked: "task-A" as const, by: "coordinated callback" } satisfies Record<string, unknown>;
  const sync = await withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, typeof sentinel>(cwd, () => sentinel);
  assert.deepEqual(sync, sentinel);

  const asyncResult = await withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, typeof sentinel>(cwd, async () => {
    await Promise.resolve();
    return sentinel;
  });
  assert.deepEqual(asyncResult, sentinel);
});

test("read-side path inside coordinated callback does NOT race the outer transaction (backfill skipped)", async () => {
  // Reads via readTasksState/readQueueState normally trigger
  // backfillFromJsonIfPresent, which opens its own BEGIN IMMEDIATE on a
  // second connection. If that fires inside a coordinated scope it races
  // the outer write lock. The fix is to skip backfill when inside the
  // scope; this test pins that contract by triggering a read inside the
  // callback after seeding state.
  const cwd = await makeTempRepo("coord-state-read-inside-");
  seedInitialState(cwd);

  let observedTasks = -1;
  let observedJobs = -1;
  await withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, async () => {
    const snapshotTasks = await readTasksState<FixtureTask>(cwd);
    const snapshotQueue = await readQueueState<FixtureJob>(cwd);
    observedTasks = snapshotTasks.tasks.length;
    observedJobs = snapshotQueue.jobs.length;
  });
  assert.equal(observedTasks, 1);
  assert.equal(observedJobs, 1);
});

test("withAtomicQueueAndTasksMutation releases the re-entry guard so subsequent calls work", async () => {
  const cwd = await makeTempRepo("coord-state-release-");
  seedInitialState(cwd);

  await assert.rejects(
    withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, () => {
      throw new Error("first call fails");
    }),
    /first call fails/,
  );

  // After the rejection, the re-entry guard must be cleared so a follow-up
  // mutateQueueState call (which should also be guarded) can proceed.
  await mutateQueueState<FixtureJob, void>(cwd, (state) => {
    state.jobs.push({ id: "job-after", status: "queued" });
  });

  const queue = await readQueueState<FixtureJob>(cwd);
  assert.equal(queue.jobs.length, 2);
  assert.ok(queue.jobs.find((j) => j.id === "job-after"));
});

// Tests below confirm that single-entity helpers still work normally OUTSIDE
// any coordinated scope. They are guard-rail regression checks: the new
// assertNotInsideCoordinatedScope helper must not break unrelated callers.

test("mutateTasksState still works normally when no coordinated transaction is active", async () => {
  const cwd = await makeTempRepo("coord-state-tasks-standalone-");
  await mutateTasksState<FixtureTask, void>(cwd, (state) => {
    state.tasks.push({ id: "task-standalone", status: "queued" });
  });
  const tasks = await readTasksState<FixtureTask>(cwd);
  assert.equal(tasks.tasks.length, 1);
  assert.equal(tasks.tasks[0]?.id, "task-standalone");
});

test("mutateQueueState still works normally when no coordinated transaction is active", async () => {
  const cwd = await makeTempRepo("coord-state-queue-standalone-");
  await mutateQueueState<FixtureJob, void>(cwd, (state) => {
    state.jobs.push({ id: "job-standalone", status: "queued" });
  });
  const queue = await readQueueState<FixtureJob>(cwd);
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0]?.id, "job-standalone");
});

// Reference test: confirms the new helper actually exposes the same state
// shapes that the existing single-entity readers expose, so call sites can
// be migrated incrementally.
test("withAtomicQueueAndTasksMutation snapshot matches the single-entity readers", async () => {
  const cwd = await makeTempRepo("coord-state-snapshot-shape-");
  seedInitialState(cwd);

  let snapshotTasks: TasksStateShape<FixtureTask> | null = null;
  let snapshotQueue: QueueStateShape<FixtureJob> | null = null;
  await withAtomicQueueAndTasksMutation<FixtureTask, FixtureJob, void>(cwd, ({ tasksState, queueState }) => {
    snapshotTasks = JSON.parse(JSON.stringify(tasksState));
    snapshotQueue = JSON.parse(JSON.stringify(queueState));
  });

  const directTasks = await readTasksState<FixtureTask>(cwd);
  const directQueue = await readQueueState<FixtureJob>(cwd);
  assert.deepEqual(snapshotTasks, directTasks);
  assert.deepEqual(snapshotQueue, directQueue);
});
