import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildScheduledWorkflowStatus,
  loadScheduledWorkflowConfig,
  materializeScheduledWorkflows,
} from "../../scripts/harness-scheduled-workflows.ts";
import { copyFixtureRepoFile, makeTempRepo } from "../extension-units/test-utils.ts";

async function setupScheduledWorkflowRepo(prefix: string): Promise<string> {
  const cwd = await makeTempRepo(prefix);
  await mkdir(join(cwd, ".pi", "agent", "schedules"), { recursive: true });
  await copyFixtureRepoFile(cwd, ".pi/agent/schedules/scheduled-workflows.json");
  return cwd;
}

test("scheduled workflow status reports due, weekday-gated, and manual-disabled items", async () => {
  const cwd = await setupScheduledWorkflowRepo("scheduled-workflows-status-");
  const view = await buildScheduledWorkflowStatus({
    cwd,
    now: new Date("2026-04-26T16:00:00.000Z"),
    workflowIds: ["repo-audit-run", "daily-review-queue", "docs-safe-cleanup"],
  });

  assert.deepEqual(view.dueWorkflowIds, ["repo-audit-run"]);
  assert.deepEqual(view.eligibleWorkflowIds, ["repo-audit-run"]);

  const repoAudit = view.items.find((item) => item.id === "repo-audit-run");
  const dailyReview = view.items.find((item) => item.id === "daily-review-queue");
  const docsCleanup = view.items.find((item) => item.id === "docs-safe-cleanup");

  assert.equal(repoAudit?.due, true);
  assert.equal(repoAudit?.eligibleForMaterialization, true);
  assert.match(repoAudit?.reason ?? "", /explicit operator materialization/i);

  assert.equal(dailyReview?.due, false);
  assert.match(dailyReview?.reason ?? "", /not due on weekends/i);

  assert.equal(docsCleanup?.disabled, true);
  assert.equal(docsCleanup?.approvalRequired, true);
});

test("scheduled workflow materialization is explicit and duplicate-safe", async () => {
  const cwd = await setupScheduledWorkflowRepo("scheduled-workflows-materialize-");
  const now = new Date("2026-04-27T16:30:00.000Z");

  const dryRun = await materializeScheduledWorkflows({
    cwd,
    now,
    workflowIds: ["repo-audit-run", "daily-review-queue"],
    apply: false,
  });
  assert.deepEqual(dryRun.eligibleWorkflowIds, ["repo-audit-run", "daily-review-queue"]);
  assert.deepEqual(dryRun.createdJobIds, []);

  const applied = await materializeScheduledWorkflows({
    cwd,
    now,
    workflowIds: ["repo-audit-run", "daily-review-queue"],
    apply: true,
  });
  assert.deepEqual(applied.createdJobIds, [
    "scheduled-repo-audit-run-2026-04-27",
    "scheduled-daily-review-queue-2026-04-27",
  ]);

  const queue = JSON.parse(await readFile(join(cwd, ".pi", "agent", "state", "runtime", "queue.json"), "utf8")) as {
    jobs: Array<{ id: string; scheduledWorkflowId?: string | null; scheduledRunKey?: string | null; status: string }>;
  };
  assert.equal(queue.jobs.length, 2);
  assert.deepEqual(
    queue.jobs.map((job) => ({ id: job.id, workflow: job.scheduledWorkflowId, runKey: job.scheduledRunKey, status: job.status })),
    [
      {
        id: "scheduled-repo-audit-run-2026-04-27",
        workflow: "repo-audit-run",
        runKey: "2026-04-27",
        status: "queued",
      },
      {
        id: "scheduled-daily-review-queue-2026-04-27",
        workflow: "daily-review-queue",
        runKey: "2026-04-27",
        status: "queued",
      },
    ],
  );

  const repeated = await materializeScheduledWorkflows({
    cwd,
    now,
    workflowIds: ["repo-audit-run", "daily-review-queue"],
    apply: true,
  });
  assert.deepEqual(repeated.createdJobIds, []);
  assert.equal(repeated.skipped.length, 2);
  assert.ok(repeated.skipped.every((entry) => /duplicate materialization is blocked/i.test(entry.reason)));

  const postStatus = await buildScheduledWorkflowStatus({ cwd, now, workflowIds: ["repo-audit-run", "daily-review-queue"] });
  assert.deepEqual(postStatus.eligibleWorkflowIds, []);
  assert.ok(postStatus.items.every((item) => item.alreadyMaterialized));
});

test("scheduled workflow config rejects unsupported schedule types", async () => {
  const cwd = await makeTempRepo("scheduled-workflows-invalid-");
  await mkdir(join(cwd, ".pi", "agent", "schedules"), { recursive: true });
  await writeFile(
    join(cwd, ".pi", "agent", "schedules", "scheduled-workflows.json"),
    JSON.stringify(
      {
        version: 1,
        timezone: "UTC",
        workflows: [
          {
            id: "bad-workflow",
            title: "Bad workflow",
            description: "Invalid schedule type proof",
            schedule: { type: "hourly" },
            queueJobTemplate: {
              goal: "Invalid",
              priority: "low",
              acceptanceCriteria: ["Reject the config"],
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  await assert.rejects(loadScheduledWorkflowConfig(cwd), /must be one of: daily, weekday, manual-disabled/i);
});
