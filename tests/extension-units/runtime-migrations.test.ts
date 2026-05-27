import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_MIGRATIONS,
  applyRuntimeMigrations,
  appliedMigrationNames,
  type RuntimeMigration,
} from "../../.pi/agent/extensions/lib/runtime-migrations.ts";
import {
  getActiveTaskId,
  setActiveTaskId,
} from "../../.pi/agent/extensions/lib/runtime-typed-ops.ts";
import {
  closeRuntimeDb,
  openRuntimeDb,
  type RuntimeDb,
} from "../../.pi/agent/extensions/lib/sqlite-state.ts";
import { makeTempRepo } from "./test-utils.ts";

function withDb<T>(cwd: string, fn: (db: RuntimeDb) => T): T {
  const db = openRuntimeDb(cwd);
  try {
    return fn(db);
  } finally {
    closeRuntimeDb(db);
  }
}

test("applyRuntimeMigrations applies all migrations on a fresh DB", async () => {
  const cwd = await makeTempRepo("mig-fresh-");
  withDb(cwd, (db) => {
    // openRuntimeDb itself runs migrations; assert post-state.
    const applied = appliedMigrationNames(db);
    const expected = RUNTIME_MIGRATIONS.map((m) => m.name);
    assert.deepEqual(applied, expected);
  });
});

test("applyRuntimeMigrations is idempotent (running twice applies nothing the second time)", async () => {
  const cwd = await makeTempRepo("mig-idem-");
  withDb(cwd, (db) => {
    const firstApplied = applyRuntimeMigrations(db);
    const secondApplied = applyRuntimeMigrations(db);
    // First call after openRuntimeDb already ran them — both should be empty newly-applied lists.
    assert.deepEqual(firstApplied, []);
    assert.deepEqual(secondApplied, []);

    const finalState = appliedMigrationNames(db);
    assert.deepEqual(finalState, RUNTIME_MIGRATIONS.map((m) => m.name));
  });
});

test("schema_migrations table records name and applied_at for each migration", async () => {
  const cwd = await makeTempRepo("mig-records-");
  withDb(cwd, (db) => {
    const rows = db.handle
      .prepare(`SELECT name, applied_at FROM schema_migrations ORDER BY applied_at ASC`)
      .all() as Array<{ name: string; applied_at: number }>;
    assert.equal(rows.length, RUNTIME_MIGRATIONS.length);
    for (const row of rows) {
      assert.equal(typeof row.name, "string");
      assert.ok(row.applied_at > 0, `applied_at should be positive, got ${row.applied_at}`);
    }
  });
});

test("queue_jobs.linked_task_id FK rejects unknown task id", async () => {
  const cwd = await makeTempRepo("mig-fk-");
  withDb(cwd, (db) => {
    // Seed a real task so the FK-positive path is available to other tests.
    db.handle
      .prepare(`INSERT INTO tasks (id, payload_json, status, updated_at) VALUES (?, ?, ?, ?)`)
      .run("task-1", JSON.stringify({ id: "task-1" }), "queued", Date.now());

    // Positive case: existing task id is accepted.
    db.handle
      .prepare(
        `INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at, linked_task_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("job-ok", JSON.stringify({ id: "job-ok" }), "queued", Date.now(), Date.now(), "task-1");

    // Negative case: unknown task id violates FK.
    assert.throws(
      () => {
        db.handle
          .prepare(
            `INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at, linked_task_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("job-bad", JSON.stringify({ id: "job-bad" }), "queued", Date.now(), Date.now(), "task-missing");
      },
      /FOREIGN KEY constraint failed/i,
    );
  });
});

test("queue_jobs.linked_task_id ON DELETE SET NULL clears references when task is deleted", async () => {
  const cwd = await makeTempRepo("mig-fk-cascade-");
  withDb(cwd, (db) => {
    db.handle
      .prepare(`INSERT INTO tasks (id, payload_json, status, updated_at) VALUES (?, ?, ?, ?)`)
      .run("task-X", JSON.stringify({ id: "task-X" }), "queued", Date.now());
    db.handle
      .prepare(
        `INSERT INTO queue_jobs (id, payload_json, status, enqueued_at, updated_at, linked_task_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("job-cascade", JSON.stringify({ id: "job-cascade" }), "queued", Date.now(), Date.now(), "task-X");

    db.handle.prepare(`DELETE FROM tasks WHERE id = ?`).run("task-X");

    const row = db.handle
      .prepare(`SELECT linked_task_id FROM queue_jobs WHERE id = ?`)
      .get("job-cascade") as { linked_task_id: string | null } | undefined;
    assert.ok(row, "job-cascade row should still exist after parent delete");
    assert.equal(row!.linked_task_id, null);
  });
});

test("setActiveTaskId and getActiveTaskId roundtrip through the active_task singleton", async () => {
  const cwd = await makeTempRepo("mig-typed-ops-");
  withDb(cwd, (db) => {
    db.handle
      .prepare(`INSERT INTO tasks (id, payload_json, status, updated_at) VALUES (?, ?, ?, ?)`)
      .run("task-active", JSON.stringify({ id: "task-active" }), "running", Date.now());

    assert.equal(getActiveTaskId(db), null, "empty DB has no active task");

    setActiveTaskId(db, "task-active");
    assert.equal(getActiveTaskId(db), "task-active");

    setActiveTaskId(db, null);
    assert.equal(getActiveTaskId(db), null, "setting null clears the active task");
  });
});

test("setActiveTaskId rejects an unknown task id (FK enforcement on active_task)", async () => {
  const cwd = await makeTempRepo("mig-active-fk-");
  withDb(cwd, (db) => {
    assert.throws(
      () => setActiveTaskId(db, "task-missing"),
      /FOREIGN KEY constraint failed/i,
    );
    assert.equal(getActiveTaskId(db), null);
  });
});

test("RUNTIME_MIGRATIONS has stable, kebab-case-prefixed, deterministically-ordered names", () => {
  const names = RUNTIME_MIGRATIONS.map((m) => m.name);
  for (const name of names) {
    assert.match(name, /^[0-9]{3}_[a-z0-9_]+$/, `migration name ${name} must match NNN_snake_case`);
  }
  const sorted = [...names].sort();
  assert.deepEqual(names, sorted, "RUNTIME_MIGRATIONS must already be in lexical order");
  // No duplicates:
  const uniq = new Set(names);
  assert.equal(uniq.size, names.length, "no duplicate migration names");
});

test("applyRuntimeMigrations returns newly-applied migrations on a pre-bootstrap DB", async () => {
  // Open a fresh DB but disable the auto-apply by passing a custom path that
  // does not have schema_migrations yet. We simulate by deleting the table
  // we already applied and re-running explicitly.
  const cwd = await makeTempRepo("mig-newly-applied-");
  withDb(cwd, (db) => {
    db.handle.exec(`DELETE FROM schema_migrations`);
    const newly = applyRuntimeMigrations(db);
    const expected = RUNTIME_MIGRATIONS.map((m) => m.name);
    assert.deepEqual(newly, expected);
  });
});

test("a custom migration in a list can extend RUNTIME_MIGRATIONS via applyRuntimeMigrations options", async () => {
  const cwd = await makeTempRepo("mig-custom-");
  withDb(cwd, (db) => {
    const customMig: RuntimeMigration = {
      name: "999_test_only_custom",
      up(handle) {
        handle.exec(`CREATE TABLE IF NOT EXISTS test_only_marker (k TEXT PRIMARY KEY)`);
        handle.prepare(`INSERT INTO test_only_marker (k) VALUES (?)`).run("ok");
      },
    };
    db.handle.exec(`DELETE FROM schema_migrations`);
    const newly = applyRuntimeMigrations(db, { migrations: [...RUNTIME_MIGRATIONS, customMig] });
    assert.ok(newly.includes("999_test_only_custom"));
    const row = db.handle.prepare(`SELECT k FROM test_only_marker`).get() as { k: string };
    assert.equal(row.k, "ok");
  });
});
