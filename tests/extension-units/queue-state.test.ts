import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ensureQueueState,
  mutateQueueState,
  QUEUE_FILE,
  readQueueState,
  writeQueueState,
} from "../../.pi/agent/extensions/lib/queue-state.ts";
import { makeTempRepo } from "./test-utils.ts";

interface Job {
  id: string;
  title: string;
}

test("QUEUE_FILE points at the legacy JSON path", () => {
  assert.equal(QUEUE_FILE, ".pi/agent/state/runtime/queue.json");
});

test("readQueueState returns default state when nothing has been written", async () => {
  const cwd = await makeTempRepo("queue-state-default-");
  const state = await readQueueState<Job>(cwd);
  assert.deepEqual(state, { version: 1, paused: false, activeJobId: null, jobs: [] });
});

test("writeQueueState + readQueueState round-trip preserves array order, paused, and activeJobId", async () => {
  const cwd = await makeTempRepo("queue-state-roundtrip-");
  await writeQueueState<Job>(cwd, {
    version: 1,
    paused: true,
    activeJobId: "job-b",
    jobs: [
      { id: "job-a", title: "A" },
      { id: "job-b", title: "B" },
      { id: "job-c", title: "C" },
    ],
  });
  const state = await readQueueState<Job>(cwd);
  assert.equal(state.paused, true);
  assert.equal(state.activeJobId, "job-b");
  assert.deepEqual(
    state.jobs.map((j) => j.id),
    ["job-a", "job-b", "job-c"],
  );
});

test("writeQueueState clears activeJobId / paused when set back to defaults", async () => {
  const cwd = await makeTempRepo("queue-state-clear-");
  await writeQueueState<Job>(cwd, {
    version: 1,
    paused: true,
    activeJobId: "job-x",
    jobs: [{ id: "job-x", title: "X" }],
  });
  await writeQueueState<Job>(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [{ id: "job-x", title: "X" }],
  });
  const state = await readQueueState<Job>(cwd);
  assert.equal(state.paused, false);
  assert.equal(state.activeJobId, null);
});

test("writeQueueState replaces existing jobs (no leftovers from prior write)", async () => {
  const cwd = await makeTempRepo("queue-state-replace-");
  await writeQueueState<Job>(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [
      { id: "job-old-1", title: "old1" },
      { id: "job-old-2", title: "old2" },
    ],
  });
  await writeQueueState<Job>(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [{ id: "job-new", title: "new" }],
  });
  const state = await readQueueState<Job>(cwd);
  assert.deepEqual(
    state.jobs.map((j) => j.id),
    ["job-new"],
  );
});

test("mutateQueueState applies mutation and persists", async () => {
  const cwd = await makeTempRepo("queue-state-mutate-");
  await writeQueueState<Job>(cwd, {
    version: 1,
    paused: false,
    activeJobId: null,
    jobs: [{ id: "job-1", title: "first" }],
  });
  const returnValue = await mutateQueueState<Job, string>(cwd, (state) => {
    state.jobs.push({ id: "job-2", title: "second" });
    state.activeJobId = "job-2";
    state.paused = true;
    return "ok";
  });
  assert.equal(returnValue, "ok");
  const state = await readQueueState<Job>(cwd);
  assert.equal(state.activeJobId, "job-2");
  assert.equal(state.paused, true);
  assert.deepEqual(
    state.jobs.map((j) => j.id),
    ["job-1", "job-2"],
  );
});

test("ensureQueueState creates default state without overwriting existing data", async () => {
  const cwd = await makeTempRepo("queue-state-ensure-");
  await ensureQueueState(cwd);
  const first = await readQueueState<Job>(cwd);
  assert.deepEqual(first, { version: 1, paused: false, activeJobId: null, jobs: [] });

  await writeQueueState<Job>(cwd, {
    version: 1,
    paused: true,
    activeJobId: "j",
    jobs: [{ id: "j", title: "kept" }],
  });
  await ensureQueueState(cwd);
  const after = await readQueueState<Job>(cwd);
  assert.equal(after.paused, true);
  assert.equal(after.activeJobId, "j");
  assert.equal(after.jobs.length, 1);
});

test("first open backfills queue.json into SQLite then archives the JSON", async () => {
  const cwd = await makeTempRepo("queue-state-backfill-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  const jsonPath = join(runtimeDir, "queue.json");
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        version: 1,
        paused: true,
        activeJobId: "legacy-active",
        jobs: [
          { id: "legacy-1", title: "Legacy one" },
          { id: "legacy-active", title: "Legacy active" },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const state = await readQueueState<Job>(cwd);
  assert.equal(state.paused, true);
  assert.equal(state.activeJobId, "legacy-active");
  assert.deepEqual(
    state.jobs.map((j) => j.id),
    ["legacy-1", "legacy-active"],
  );
  assert.equal(existsSync(jsonPath), false, "queue.json should be archived after backfill");
  const dirEntries = await readdir(runtimeDir);
  const archived = dirEntries.filter((name) => name.startsWith("queue.json.migrated-"));
  assert.equal(archived.length, 1);
});

test("backfill is idempotent across multiple opens", async () => {
  const cwd = await makeTempRepo("queue-state-backfill-idempotent-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  await writeFile(
    join(runtimeDir, "queue.json"),
    JSON.stringify({
      version: 1,
      paused: false,
      activeJobId: null,
      jobs: [{ id: "legacy", title: "Legacy" }],
    }),
    "utf8",
  );

  await readQueueState<Job>(cwd);
  await readQueueState<Job>(cwd);
  const state = await readQueueState<Job>(cwd);
  assert.equal(state.jobs.length, 1, "no duplication after multiple opens");
  const dirEntries = await readdir(runtimeDir);
  const archived = dirEntries.filter((name) => name.startsWith("queue.json.migrated-"));
  assert.equal(archived.length, 1);
});

test("backfill leaves malformed queue.json in place for operator inspection", async () => {
  const cwd = await makeTempRepo("queue-state-backfill-malformed-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  const jsonPath = join(runtimeDir, "queue.json");
  await writeFile(jsonPath, "not valid json {{{", "utf8");

  const state = await readQueueState<Job>(cwd);
  assert.deepEqual(state, { version: 1, paused: false, activeJobId: null, jobs: [] });
  assert.equal(existsSync(jsonPath), true);
});
