import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applyQueueStateToDb, type QueueStateShape } from "../../.pi/agent/extensions/lib/queue-state.ts";
import { applyRuntimeMigrations } from "../../.pi/agent/extensions/lib/runtime-migrations.ts";
import {
  RUNTIME_DB_SCHEMA_DDL,
  type RuntimeDb,
} from "../../.pi/agent/extensions/lib/sqlite-state.ts";
import { applyTasksStateToDb, type TasksStateShape } from "../../.pi/agent/extensions/lib/tasks-state.ts";

interface FixtureTask {
  id: string;
  status: string;
  updatedAt: number;
  evidence?: string[];
}

interface FixtureJob {
  id: string;
  status: string;
  enqueuedAt: number;
  updatedAt: number;
  linkedTaskId: string | null;
  note?: string;
}

function openMemoryDb(): RuntimeDb {
  const handle = new DatabaseSync(":memory:");
  handle.exec("PRAGMA foreign_keys = ON");
  handle.exec(RUNTIME_DB_SCHEMA_DDL);
  const db: RuntimeDb = { handle, cwd: ":memory:", file: ":memory:" };
  applyRuntimeMigrations(db);
  return db;
}

function tasks(tasks: FixtureTask[]): TasksStateShape<FixtureTask> {
  return { version: 1, activeTaskId: tasks[0]?.id ?? null, tasks };
}

function queue(jobs: FixtureJob[]): QueueStateShape<FixtureJob> {
  return { version: 1, paused: false, activeJobId: jobs[0]?.id ?? null, jobs };
}

function inTransaction(db: RuntimeDb, fn: () => void): void {
  db.handle.exec("BEGIN IMMEDIATE");
  try {
    fn();
    db.handle.exec("COMMIT");
  } catch (error) {
    db.handle.exec("ROLLBACK");
    throw error;
  }
}

function readQueueLink(db: RuntimeDb): { linked_task_id: string | null; payload_json: string } {
  return db.handle
    .prepare(`SELECT linked_task_id, payload_json FROM queue_jobs WHERE id = 'j1'`)
    .get() as unknown as { linked_task_id: string | null; payload_json: string };
}

test("queue/task persistence preserves typed FK until intentional task deletion", () => {
  const db = openMemoryDb();
  const task = { id: "t1", status: "in_progress", updatedAt: 1 };
  const job = {
    id: "j1",
    status: "running",
    enqueuedAt: 1,
    updatedAt: 1,
    linkedTaskId: "t1",
  };

  try {
    inTransaction(db, () => {
      applyTasksStateToDb(db, tasks([task]));
      applyQueueStateToDb(db, queue([job]));
    });

    let row = readQueueLink(db);
    assert.equal(row.linked_task_id, "t1");
    assert.equal((JSON.parse(row.payload_json) as FixtureJob).linkedTaskId, "t1");

    inTransaction(db, () => {
      applyTasksStateToDb(db, tasks([{ ...task, status: "review", updatedAt: 2, evidence: ["tests pass"] }]));
    });
    row = readQueueLink(db);
    assert.equal(row.linked_task_id, "t1", "ordinary task updates must not delete/recreate the parent row");

    inTransaction(db, () => {
      applyQueueStateToDb(db, queue([{ ...job, status: "done", updatedAt: 3, note: "finished" }]));
    });
    row = readQueueLink(db);
    assert.equal(row.linked_task_id, "t1");
    assert.equal((JSON.parse(row.payload_json) as FixtureJob).linkedTaskId, "t1");

    inTransaction(db, () => {
      applyTasksStateToDb(db, tasks([]));
    });
    row = readQueueLink(db);
    assert.equal(row.linked_task_id, null);
    assert.equal((JSON.parse(row.payload_json) as FixtureJob).linkedTaskId, null);
  } finally {
    db.handle.close();
  }
});

test("queue persistence rejects a linkedTaskId without a parent and rolls back", () => {
  const db = openMemoryDb();
  const job = {
    id: "j1",
    status: "queued",
    enqueuedAt: 1,
    updatedAt: 1,
    linkedTaskId: "missing",
  };

  try {
    assert.throws(
      () => inTransaction(db, () => applyQueueStateToDb(db, queue([job]))),
      /FOREIGN KEY constraint failed/i,
    );
    const row = db.handle.prepare(`SELECT COUNT(*) AS count FROM queue_jobs`).get() as unknown as { count: number };
    assert.equal(row.count, 0);
  } finally {
    db.handle.close();
  }
});
