import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildHarnessOperatorLeases,
  clearStaleHarnessOperatorLeases,
  renderHarnessOperatorLeases,
} from "../../scripts/harness-operator-leases.ts";
import { makeTempRepo } from "../extension-units/test-utils.ts";

async function seedLeases(cwd: string) {
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "leases.json"),
    `${JSON.stringify(
      {
        version: 1,
        leases: [
          {
            id: "lease-active-queue",
            scope: "queue-session",
            owner: "active-worker",
            acquiredAt: "2026-05-07T00:00:00.000Z",
            expiresAt: "2999-01-01T00:00:00.000Z",
            heartbeatAt: null,
          },
          {
            id: "lease-stale-queue",
            scope: "queue-session-stale-proof",
            owner: "stale-worker",
            acquiredAt: "2026-05-06T00:00:00.000Z",
            expiresAt: "2026-05-06T00:01:00.000Z",
            heartbeatAt: null,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function readLeaseIds(cwd: string): Promise<string[]> {
  const raw = JSON.parse(await readFile(join(cwd, ".pi", "agent", "state", "runtime", "leases.json"), "utf8")) as {
    leases: Array<{ id: string }>;
  };
  return raw.leases.map((lease) => lease.id);
}

test("operator lease list shows active leases in text and stable JSON", async () => {
  const cwd = await makeTempRepo("operator-leases-list-");
  await seedLeases(cwd);

  const view = await buildHarnessOperatorLeases({ cwd, now: "2026-05-07T00:00:00.000Z" });
  const rendered = renderHarnessOperatorLeases(view);
  const serialized = JSON.parse(JSON.stringify(view)) as typeof view;

  assert.equal(view.summary.totalLeaseCount, 2);
  assert.equal(view.summary.activeLeaseCount, 1);
  assert.equal(view.summary.staleLeaseCount, 1);
  assert.equal(view.leases[0]?.id, "lease-active-queue");
  assert.equal(view.leases[0]?.stale, false);
  assert.equal(view.leases[1]?.id, "lease-stale-queue");
  assert.equal(view.leases[1]?.stale, true);
  assert.match(rendered, /Harness Operator Leases/);
  assert.match(rendered, /lease-active-queue/);
  assert.match(rendered, /active-worker/);
  assert.equal(serialized.summary.activeLeaseCount, 1);
});

test("operator lease list handles empty lease state clearly", async () => {
  const cwd = await makeTempRepo("operator-leases-empty-");

  const view = await buildHarnessOperatorLeases({ cwd, now: "2026-05-07T00:00:00.000Z" });
  const rendered = renderHarnessOperatorLeases(view);

  assert.equal(view.summary.totalLeaseCount, 0);
  assert.match(rendered, /leases: none/);
});

test("clear-stale removes stale leases while preserving active leases", async () => {
  const cwd = await makeTempRepo("operator-leases-clear-stale-");
  await seedLeases(cwd);

  const result = await clearStaleHarnessOperatorLeases({ cwd, now: "2026-05-07T00:00:00.000Z" });
  const remainingLeaseIds = await readLeaseIds(cwd);

  assert.deepEqual(result.removedLeaseIds, ["lease-stale-queue"]);
  assert.deepEqual(result.retainedLeaseIds, ["lease-active-queue"]);
  assert.deepEqual(remainingLeaseIds, ["lease-active-queue"]);
});

test("clear-stale leaves active-only lease state intact", async () => {
  const cwd = await makeTempRepo("operator-leases-clear-active-");
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "leases.json"),
    `${JSON.stringify(
      {
        version: 1,
        leases: [
          {
            id: "lease-active-only",
            scope: "queue-session",
            owner: "active-worker",
            acquiredAt: "2026-05-07T00:00:00.000Z",
            expiresAt: "2999-01-01T00:00:00.000Z",
            heartbeatAt: null,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const result = await clearStaleHarnessOperatorLeases({ cwd, now: "2026-05-07T00:00:00.000Z" });
  const remainingLeaseIds = await readLeaseIds(cwd);

  assert.deepEqual(result.removedLeaseIds, []);
  assert.deepEqual(result.retainedLeaseIds, ["lease-active-only"]);
  assert.deepEqual(remainingLeaseIds, ["lease-active-only"]);
});
