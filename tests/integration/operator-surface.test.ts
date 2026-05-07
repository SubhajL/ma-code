import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildHarnessOperatorStatus, renderHarnessOperatorStatus } from "../../scripts/harness-operator-status.ts";
import { makeTempRepo } from "../extension-units/test-utils.ts";

async function seedOperatorSurfaceRuntime(cwd: string) {
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"),
    `${JSON.stringify(
      {
        version: 1,
        activeTaskId: "task-active",
        tasks: [
          {
            id: "task-active",
            title: "Active implementation task",
            owner: "assistant",
            status: "in_progress",
            taskClass: "implementation",
            acceptance: ["Provide a visible operator snapshot"],
            evidence: [],
            dependencies: [],
            retryCount: 0,
            validation: {
              tier: "standard",
              decision: "pending",
              source: null,
              checklist: null,
              approvalRef: null,
              updatedAt: null,
            },
            notes: [],
            timestamps: {
              createdAt: "2026-04-24T00:00:00.000Z",
              updatedAt: "2026-04-24T00:00:00.000Z",
              startedAt: "2026-04-24T00:00:00.000Z",
            },
          },
          {
            id: "task-blocked",
            title: "Blocked follow-up task",
            owner: "assistant",
            status: "blocked",
            taskClass: "implementation",
            acceptance: ["Keep blockers visible"],
            evidence: [],
            dependencies: [],
            retryCount: 0,
            validation: {
              tier: "standard",
              decision: "pending",
              source: null,
              checklist: null,
              approvalRef: null,
              updatedAt: null,
            },
            notes: ["Awaiting approval"],
            timestamps: {
              createdAt: "2026-04-24T00:10:00.000Z",
              updatedAt: "2026-04-24T00:10:00.000Z",
              startedAt: "2026-04-24T00:10:00.000Z",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "queue.json"),
    `${JSON.stringify(
      {
        version: 1,
        paused: true,
        activeJobId: "job-active",
        jobs: [
          {
            id: "job-old",
            goal: "Already completed job",
            priority: "low",
            status: "done",
          },
          {
            id: "job-active",
            goal: "Active queued implementation",
            priority: "high",
            status: "running",
            linkedTaskId: "task-active",
          },
          {
            id: "job-blocked",
            goal: "Blocked job",
            priority: "medium",
            status: "blocked",
          },
          {
            id: "job-failed",
            goal: "Failed job",
            priority: "medium",
            status: "failed",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "leases.json"),
    `${JSON.stringify(
      {
        version: 1,
        leases: [
          {
            id: "lease-operator-status",
            scope: "queue-session",
            owner: "status-worker",
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
}

test("operator status surface renders a readable queue/task snapshot", async () => {
  const cwd = await makeTempRepo("operator-surface-");
  await seedOperatorSurfaceRuntime(cwd);

  const view = await buildHarnessOperatorStatus({ cwd, recentLimit: 2 });
  const rendered = renderHarnessOperatorStatus(view);

  assert.equal(view.inspection.summary.queuePaused, true);
  assert.equal(view.inspection.summary.activeJob?.id, "job-active");
  assert.equal(view.inspection.summary.activeTask?.id, "task-active");
  assert.equal(view.inspection.summary.activeLeaseCount, 1);
  assert.deepEqual(view.inspection.summary.queueSessionLease, {
    held: true,
    owner: "status-worker",
    acquiredAt: "2026-05-07T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z",
    stale: false,
    scopeKey: "queue-session",
    leaseType: "queue-session",
  });
  assert.match(rendered, /Harness Operator Status/);
  assert.match(rendered, /queue: paused/);
  assert.match(rendered, /active job: job-active \(running\)/);
  assert.match(rendered, /active task: task-active \(in_progress\)/);
  assert.match(rendered, /blocked jobs: job-blocked/);
  assert.match(rendered, /failed jobs: job-failed/);
  assert.match(rendered, /blocked tasks: task-blocked/);
  assert.match(rendered, /active leases: 1/);
  assert.match(rendered, /queue lease: held by status-worker until 2999-01-01T00:00:00.000Z/);
  assert.match(rendered, /recent job ids \(last 2\): job-failed, job-blocked/);
});

test("operator status surface can be serialized as stable JSON data", async () => {
  const cwd = await makeTempRepo("operator-surface-json-");
  await seedOperatorSurfaceRuntime(cwd);

  const view = await buildHarnessOperatorStatus({ cwd, recentLimit: 3 });
  const serialized = JSON.parse(JSON.stringify(view)) as {
    cwd: string;
    recentLimit: number;
    inspection: {
      summary: {
        queuePaused: boolean;
        recentTaskIds: string[];
        activeLeaseCount: number;
        queueSessionLease: {
          held: boolean;
          owner: string | null;
          acquiredAt: string | null;
          expiresAt: string | null;
          stale: boolean;
          scopeKey: string | null;
          leaseType: string | null;
        } | null;
      };
    };
  };

  assert.equal(serialized.cwd, cwd);
  assert.equal(serialized.recentLimit, 3);
  assert.equal(serialized.inspection.summary.queuePaused, true);
  assert.deepEqual(serialized.inspection.summary.recentTaskIds, ["task-blocked", "task-active"]);
  assert.equal(serialized.inspection.summary.activeLeaseCount, 1);
  assert.equal(serialized.inspection.summary.queueSessionLease?.held, true);
  assert.equal(serialized.inspection.summary.queueSessionLease?.owner, "status-worker");
  assert.equal(serialized.inspection.summary.queueSessionLease?.scopeKey, "queue-session");
});
