import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  acquireExecutionLease,
  readExecutionLeaseState,
  releaseExecutionLease,
  summarizeExecutionLeases,
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
