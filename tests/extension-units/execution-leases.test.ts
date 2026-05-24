import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  LOCAL_MAIN_INTEGRATION_LEASE_SCOPE,
  QUEUE_SESSION_LEASE_SCOPE,
  WORKER_LANE_LEASE_TYPE,
  acquireExecutionLease,
  acquireLocalMainIntegrationLease,
  acquireWorkerLaneLease,
  clearStaleExecutionLeases,
  findWorkerLaneLease,
  readExecutionLeaseState,
  releaseExecutionLease,
  releaseLocalMainIntegrationLease,
  releaseWorkerLaneLease,
  summarizeExecutionLeases,
  workerLaneLeaseScope,
} from "../../.pi/agent/extensions/execution-leases.ts";
import { makeTempRepo } from "./test-utils.ts";

test("load defaults when the lease file is absent or empty fixture state is used", async () => {
  const cwd = await makeTempRepo("execution-leases-default-");

  const absentState = await readExecutionLeaseState(cwd);
  assert.deepEqual(absentState, { version: 1, leases: [] });

  await writeFile(join(cwd, ".pi", "agent", "state", "runtime", "leases.json"), "{}\n", "utf8");
  const normalizedState = await readExecutionLeaseState(cwd);
  assert.deepEqual(normalizedState, { version: 1, leases: [] });
});

test("acquiring one lease succeeds, conflicting acquire is rejected, and release clears it", async () => {
  const cwd = await makeTempRepo("execution-leases-");

  const acquired = await acquireExecutionLease(cwd, {
    id: "lease-1",
    scope: "queue:task-1",
    owner: "assistant",
    acquiredAt: "2026-05-06T00:00:00.000Z",
    expiresAt: "2026-05-06T00:05:00.000Z",
  });

  assert.equal(acquired.acquired, true);
  assert.equal(acquired.conflict, null);
  assert.equal(acquired.state.leases.length, 1);
  assert.equal(acquired.state.leases[0]?.id, "lease-1");

  const conflicting = await acquireExecutionLease(cwd, {
    id: "lease-2",
    scope: "queue:task-1",
    owner: "other-worker",
    acquiredAt: "2026-05-06T00:01:00.000Z",
    expiresAt: "2026-05-06T00:06:00.000Z",
  });

  assert.equal(conflicting.acquired, false);
  assert.equal(conflicting.conflict?.id, "lease-1");
  assert.equal(conflicting.state.leases.length, 1);

  const released = await releaseExecutionLease(cwd, "lease-1");
  assert.equal(released.released, true);

  const state = await readExecutionLeaseState(cwd);
  assert.deepEqual(state, { version: 1, leases: [] });
});

test("queue-session lease scope remains a generic reusable lease scope", async () => {
  const cwd = await makeTempRepo("execution-leases-queue-session-");

  const acquired = await acquireExecutionLease(cwd, {
    id: "lease-queue-session",
    scope: QUEUE_SESSION_LEASE_SCOPE,
    owner: "assistant",
    acquiredAt: "2026-05-06T00:00:00.000Z",
    expiresAt: "2026-05-06T00:05:00.000Z",
  });

  assert.equal(QUEUE_SESSION_LEASE_SCOPE, "queue-session");
  assert.equal(acquired.acquired, true);
  assert.equal(acquired.state.leases[0]?.scope, QUEUE_SESSION_LEASE_SCOPE);
});

test("local-main integration lease helpers acquire and release one scoped lease", async () => {
  const cwd = await makeTempRepo("execution-leases-integration-");

  const acquired = await acquireLocalMainIntegrationLease(cwd, {
    id: "lease-integration-main",
    owner: "assistant",
    acquiredAt: "2026-05-07T00:00:00.000Z",
    expiresAt: "2026-05-07T00:30:00.000Z",
  });

  assert.equal(LOCAL_MAIN_INTEGRATION_LEASE_SCOPE, "local-main-integration");
  assert.equal(acquired.acquired, true);
  assert.equal(acquired.lease?.scope, LOCAL_MAIN_INTEGRATION_LEASE_SCOPE);

  const released = await releaseLocalMainIntegrationLease(cwd, "lease-integration-main");
  assert.equal(released.released, true);
  assert.deepEqual((await readExecutionLeaseState(cwd)).leases, []);
});

test("worker-lane lease helpers acquire, find, and release metadata-bearing leases", async () => {
  const cwd = await makeTempRepo("execution-leases-worker-lane-");

  const acquired = await acquireWorkerLaneLease(cwd, {
    id: "worker-lease-1",
    scopeKey: "harness-064",
    owner: "assistant",
    acquiredAt: "2026-05-07T00:00:00.000Z",
    expiresAt: "2026-05-08T00:00:00.000Z",
    jobId: "job-1",
    taskId: "task-1",
    worktreePath: "/tmp/worker-lane",
    branchName: "worker/harness-064-worker-lane",
  });

  assert.equal(acquired.acquired, true);
  assert.equal(workerLaneLeaseScope("harness-064"), "worker_lane:harness-064");
  assert.equal(acquired.lease?.scope, "worker_lane:harness-064");
  assert.equal(acquired.lease?.metadata?.leaseType, WORKER_LANE_LEASE_TYPE);
  assert.equal(acquired.lease?.metadata?.worktreePath, "/tmp/worker-lane");

  const found = await findWorkerLaneLease(cwd, { scopeKey: "harness-064", owner: "assistant" });
  assert.equal(found?.id, "worker-lease-1");

  const released = await releaseWorkerLaneLease(cwd, { scopeKey: "harness-064" });
  assert.equal(released.released, true);
  assert.equal((await findWorkerLaneLease(cwd, { scopeKey: "harness-064" })), null);
});

test("clearStaleExecutionLeases removes only expired leases", async () => {
  const cwd = await makeTempRepo("execution-leases-clear-stale-");

  await acquireExecutionLease(cwd, {
    id: "lease-active",
    scope: "queue:active",
    owner: "assistant",
    acquiredAt: "2026-05-06T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z",
  });
  await acquireExecutionLease(cwd, {
    id: "lease-stale",
    scope: "queue:stale",
    owner: "assistant",
    acquiredAt: "2026-05-06T00:00:00.000Z",
    expiresAt: "2026-05-06T00:01:00.000Z",
  });

  const cleared = await clearStaleExecutionLeases(cwd, "2026-05-07T00:00:00.000Z");
  const state = await readExecutionLeaseState(cwd);

  assert.deepEqual(cleared.removedLeases.map((lease) => lease.id), ["lease-stale"]);
  assert.deepEqual(cleared.retainedLeases.map((lease) => lease.id), ["lease-active"]);
  assert.deepEqual(state.leases.map((lease) => lease.id), ["lease-active"]);
});

test("first open backfills leases.json into SQLite then archives the JSON file", async () => {
  const cwd = await makeTempRepo("execution-leases-backfill-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  const jsonPath = join(runtimeDir, "leases.json");
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        version: 1,
        leases: [
          {
            id: "legacy-1",
            scope: "queue:legacy-1",
            owner: "legacy-owner",
            acquiredAt: "2026-05-01T00:00:00.000Z",
            expiresAt: "2099-01-01T00:00:00.000Z",
            heartbeatAt: null,
            metadata: { lane: "A" },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const state = await readExecutionLeaseState(cwd);
  assert.equal(state.leases.length, 1);
  assert.equal(state.leases[0].id, "legacy-1");
  assert.equal(state.leases[0].scope, "queue:legacy-1");
  assert.equal(state.leases[0].owner, "legacy-owner");
  assert.equal(state.leases[0].metadata?.lane, "A");

  // Original leases.json should now be archived
  assert.equal(existsSync(jsonPath), false, "leases.json should be moved aside after backfill");
  const dirEntries = await readdir(runtimeDir);
  const archived = dirEntries.filter((name) => name.startsWith("leases.json.migrated-"));
  assert.equal(archived.length, 1, "expected exactly one migrated archive file");

  // SQLite DB file should exist
  assert.equal(existsSync(join(runtimeDir, "pi.db")), true);
});

test("backfill is idempotent — re-reads do not duplicate leases or re-archive", async () => {
  const cwd = await makeTempRepo("execution-leases-backfill-idempotent-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  await writeFile(
    join(runtimeDir, "leases.json"),
    JSON.stringify({
      version: 1,
      leases: [
        {
          id: "legacy-x",
          scope: "queue:legacy-x",
          owner: "legacy",
          acquiredAt: "2026-05-01T00:00:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
          heartbeatAt: null,
        },
      ],
    }),
    "utf8",
  );

  await readExecutionLeaseState(cwd);
  await readExecutionLeaseState(cwd);
  const state = await readExecutionLeaseState(cwd);

  assert.equal(state.leases.length, 1, "no duplication after multiple opens");
  const dirEntries = await readdir(runtimeDir);
  const archived = dirEntries.filter((name) => name.startsWith("leases.json.migrated-"));
  assert.equal(archived.length, 1, "JSON archived exactly once");
});

test("backfill leaves malformed leases.json in place for operator inspection", async () => {
  const cwd = await makeTempRepo("execution-leases-backfill-malformed-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  const jsonPath = join(runtimeDir, "leases.json");
  await writeFile(jsonPath, "this is not valid json {{{", "utf8");

  const state = await readExecutionLeaseState(cwd);
  assert.deepEqual(state, { version: 1, leases: [] });
  assert.equal(existsSync(jsonPath), true, "malformed JSON must NOT be archived");
});

test("expired lease is pruned before a new acquire and summary reflects active leases", async () => {
  const cwd = await makeTempRepo("execution-leases-prune-");

  await acquireExecutionLease(cwd, {
    id: "lease-expired",
    scope: "queue:task-2",
    owner: "assistant",
    acquiredAt: "2026-05-06T00:00:00.000Z",
    expiresAt: "2026-05-06T00:01:00.000Z",
  });

  const acquired = await acquireExecutionLease(cwd, {
    id: "lease-next",
    scope: "queue:task-2",
    owner: "assistant",
    acquiredAt: "2026-05-06T00:02:00.000Z",
    expiresAt: "2026-05-06T00:07:00.000Z",
    now: "2026-05-06T00:02:00.000Z",
  });

  assert.equal(acquired.acquired, true);
  assert.equal(acquired.conflict, null);
  assert.deepEqual(acquired.state.leases.map((lease) => lease.id), ["lease-next"]);

  const summary = summarizeExecutionLeases(acquired.state);
  assert.equal(summary.activeLeaseCount, 1);
  assert.deepEqual(summary.activeScopes, ["queue:task-2"]);
  assert.equal(summary.leases[0]?.id, "lease-next");
  assert.equal(summary.leases[0]?.owner, "assistant");
});
