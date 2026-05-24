import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  RUNTIME_DB_FILE,
  RUNTIME_DB_SCHEMA_DDL,
  closeRuntimeDb,
  heartbeatLease,
  listLeases,
  openRuntimeDb,
  purgeExpiredLeases,
  releaseLease,
  tryAcquireLease,
} from "../../.pi/agent/extensions/lib/sqlite-state.ts";

async function makeTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

test("RUNTIME_DB_FILE points at .pi/agent/state/runtime/pi.db relative path", () => {
  assert.equal(RUNTIME_DB_FILE, ".pi/agent/state/runtime/pi.db");
});

test("RUNTIME_DB_SCHEMA_DDL declares the four runtime tables (tasks, queue_jobs, leases, audit_log)", () => {
  assert.match(RUNTIME_DB_SCHEMA_DDL, /CREATE TABLE IF NOT EXISTS tasks\b/);
  assert.match(RUNTIME_DB_SCHEMA_DDL, /CREATE TABLE IF NOT EXISTS queue_jobs\b/);
  assert.match(RUNTIME_DB_SCHEMA_DDL, /CREATE TABLE IF NOT EXISTS leases\b/);
  assert.match(RUNTIME_DB_SCHEMA_DDL, /CREATE TABLE IF NOT EXISTS audit_log\b/);
  assert.match(RUNTIME_DB_SCHEMA_DDL, /UNIQUE\s*\(\s*scope\s*\)|scope\s+TEXT\s+PRIMARY KEY/i);
});

test("openRuntimeDb creates the database file at the runtime path", async () => {
  const cwd = await makeTempRoot("sqlite-state-open-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      const expected = resolve(cwd, RUNTIME_DB_FILE);
      assert.equal(existsSync(expected), true, `expected DB at ${expected}`);
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("openRuntimeDb is idempotent across re-opens (state persists)", async () => {
  const cwd = await makeTempRoot("sqlite-state-idempotent-");
  try {
    const first = openRuntimeDb(cwd);
    const acquired = tryAcquireLease(first, {
      scope: "scope:integrate:branch-a",
      owner: "worker-1",
      ttlMs: 60_000,
      now: 1000,
    });
    assert.ok(acquired);
    closeRuntimeDb(first);

    const second = openRuntimeDb(cwd);
    try {
      const leases = listLeases(second);
      assert.equal(leases.length, 1);
      assert.equal(leases[0].scope, "scope:integrate:branch-a");
      assert.equal(leases[0].owner, "worker-1");
    } finally {
      closeRuntimeDb(second);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("tryAcquireLease grants exclusive lease for a free scope", async () => {
  const cwd = await makeTempRoot("sqlite-state-acquire-free-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      const lease = tryAcquireLease(db, {
        scope: "scope:queue:lane-1",
        owner: "worker-A",
        ttlMs: 30_000,
        now: 1000,
      });
      assert.ok(lease);
      assert.equal(lease.scope, "scope:queue:lane-1");
      assert.equal(lease.owner, "worker-A");
      assert.equal(lease.acquiredAt, 1000);
      assert.equal(lease.expiresAt, 1000 + 30_000);
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("tryAcquireLease rejects when scope held by another owner and unexpired", async () => {
  const cwd = await makeTempRoot("sqlite-state-acquire-conflict-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      tryAcquireLease(db, { scope: "s1", owner: "A", ttlMs: 30_000, now: 1000 });
      const second = tryAcquireLease(db, { scope: "s1", owner: "B", ttlMs: 30_000, now: 2000 });
      assert.equal(second, null);

      const leases = listLeases(db);
      assert.equal(leases.length, 1);
      assert.equal(leases[0].owner, "A");
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("tryAcquireLease succeeds for the same owner (re-entry refreshes TTL)", async () => {
  const cwd = await makeTempRoot("sqlite-state-reentry-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      const first = tryAcquireLease(db, { scope: "s1", owner: "A", ttlMs: 30_000, now: 1000 });
      assert.ok(first);
      assert.equal(first.expiresAt, 31_000);

      const second = tryAcquireLease(db, { scope: "s1", owner: "A", ttlMs: 60_000, now: 5000 });
      assert.ok(second);
      assert.equal(second.owner, "A");
      assert.equal(second.expiresAt, 65_000, "re-entry should refresh expiresAt");
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("tryAcquireLease succeeds when the held lease has expired", async () => {
  const cwd = await makeTempRoot("sqlite-state-acquire-expired-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      tryAcquireLease(db, { scope: "s1", owner: "A", ttlMs: 10_000, now: 1000 });
      const stolen = tryAcquireLease(db, { scope: "s1", owner: "B", ttlMs: 30_000, now: 20_000 });
      assert.ok(stolen, "expired lease should be acquirable by a new owner");
      assert.equal(stolen.owner, "B");
      assert.equal(stolen.expiresAt, 50_000);

      const leases = listLeases(db);
      assert.equal(leases.length, 1);
      assert.equal(leases[0].owner, "B");
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("releaseLease deletes the lease only when caller owns it", async () => {
  const cwd = await makeTempRoot("sqlite-state-release-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      tryAcquireLease(db, { scope: "s1", owner: "A", ttlMs: 30_000, now: 1000 });

      assert.equal(releaseLease(db, { scope: "s1", owner: "wrong" }), false);
      assert.equal(listLeases(db).length, 1, "non-owner release must not delete");

      assert.equal(releaseLease(db, { scope: "s1", owner: "A" }), true);
      assert.equal(listLeases(db).length, 0);

      assert.equal(releaseLease(db, { scope: "s1", owner: "A" }), false, "second release is a no-op");
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("heartbeatLease extends expiresAt only for the owner", async () => {
  const cwd = await makeTempRoot("sqlite-state-heartbeat-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      tryAcquireLease(db, { scope: "s1", owner: "A", ttlMs: 10_000, now: 1000 });

      const updated = heartbeatLease(db, {
        scope: "s1",
        owner: "A",
        ttlMs: 60_000,
        now: 5000,
      });
      assert.ok(updated);
      assert.equal(updated.expiresAt, 65_000);
      assert.equal(updated.heartbeatAt, 5000);

      const wrong = heartbeatLease(db, {
        scope: "s1",
        owner: "wrong",
        ttlMs: 60_000,
        now: 6000,
      });
      assert.equal(wrong, null, "non-owner heartbeat must not extend the lease");

      const leases = listLeases(db);
      assert.equal(leases[0].owner, "A");
      assert.equal(leases[0].expiresAt, 65_000);
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("purgeExpiredLeases removes only expired entries and returns the count", async () => {
  const cwd = await makeTempRoot("sqlite-state-purge-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      tryAcquireLease(db, { scope: "old-1", owner: "A", ttlMs: 5_000, now: 1000 });
      tryAcquireLease(db, { scope: "old-2", owner: "B", ttlMs: 5_000, now: 2000 });
      tryAcquireLease(db, { scope: "live-1", owner: "C", ttlMs: 60_000, now: 3000 });

      const removed = purgeExpiredLeases(db, { now: 30_000 });
      assert.equal(removed, 2);

      const remaining = listLeases(db);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].scope, "live-1");
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("listLeases returns leases sorted by acquiredAt ascending", async () => {
  const cwd = await makeTempRoot("sqlite-state-list-sort-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      tryAcquireLease(db, { scope: "s-c", owner: "A", ttlMs: 60_000, now: 3000 });
      tryAcquireLease(db, { scope: "s-a", owner: "A", ttlMs: 60_000, now: 1000 });
      tryAcquireLease(db, { scope: "s-b", owner: "A", ttlMs: 60_000, now: 2000 });

      const leases = listLeases(db);
      assert.deepEqual(
        leases.map((l) => l.scope),
        ["s-a", "s-b", "s-c"],
      );
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("tryAcquireLease stores optional metadata as JSON", async () => {
  const cwd = await makeTempRoot("sqlite-state-metadata-");
  try {
    const db = openRuntimeDb(cwd);
    try {
      const lease = tryAcquireLease(db, {
        scope: "s1",
        owner: "A",
        ttlMs: 60_000,
        now: 1000,
        metadata: { taskId: "task-42", branch: "feat/x" },
      });
      assert.ok(lease);
      assert.deepEqual(lease.metadata, { taskId: "task-42", branch: "feat/x" });

      const leases = listLeases(db);
      assert.deepEqual(leases[0].metadata, { taskId: "task-42", branch: "feat/x" });
    } finally {
      closeRuntimeDb(db);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
