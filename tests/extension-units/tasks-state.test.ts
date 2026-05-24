import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  TASKS_FILE,
  ensureTasksState,
  mutateTasksState,
  readTasksState,
  writeTasksState,
} from "../../.pi/agent/extensions/lib/tasks-state.ts";
import { makeTempRepo } from "./test-utils.ts";

interface Task {
  id: string;
  title: string;
}

test("TASKS_FILE points at the legacy JSON path", () => {
  assert.equal(TASKS_FILE, ".pi/agent/state/runtime/tasks.json");
});

test("readTasksState returns default state when nothing has been written", async () => {
  const cwd = await makeTempRepo("tasks-state-default-");
  const state = await readTasksState<Task>(cwd);
  assert.deepEqual(state, { version: 1, activeTaskId: null, tasks: [] });
});

test("writeTasksState + readTasksState round-trip preserves array order", async () => {
  const cwd = await makeTempRepo("tasks-state-roundtrip-");
  await writeTasksState<Task>(cwd, {
    version: 1,
    activeTaskId: "task-b",
    tasks: [
      { id: "task-a", title: "A" },
      { id: "task-b", title: "B" },
      { id: "task-c", title: "C" },
    ],
  });
  const state = await readTasksState<Task>(cwd);
  assert.equal(state.version, 1);
  assert.equal(state.activeTaskId, "task-b");
  assert.deepEqual(
    state.tasks.map((t) => t.id),
    ["task-a", "task-b", "task-c"],
  );
});

test("writeTasksState clears activeTaskId when set to null", async () => {
  const cwd = await makeTempRepo("tasks-state-active-null-");
  await writeTasksState<Task>(cwd, {
    version: 1,
    activeTaskId: "task-x",
    tasks: [{ id: "task-x", title: "X" }],
  });
  await writeTasksState<Task>(cwd, {
    version: 1,
    activeTaskId: null,
    tasks: [{ id: "task-x", title: "X" }],
  });
  const state = await readTasksState<Task>(cwd);
  assert.equal(state.activeTaskId, null);
});

test("writeTasksState replaces existing tasks (no leftovers from prior write)", async () => {
  const cwd = await makeTempRepo("tasks-state-replace-");
  await writeTasksState<Task>(cwd, {
    version: 1,
    activeTaskId: null,
    tasks: [
      { id: "task-old-1", title: "old1" },
      { id: "task-old-2", title: "old2" },
    ],
  });
  await writeTasksState<Task>(cwd, {
    version: 1,
    activeTaskId: null,
    tasks: [{ id: "task-new", title: "new" }],
  });
  const state = await readTasksState<Task>(cwd);
  assert.deepEqual(
    state.tasks.map((t) => t.id),
    ["task-new"],
  );
});

test("mutateTasksState applies mutation and persists", async () => {
  const cwd = await makeTempRepo("tasks-state-mutate-");
  await writeTasksState<Task>(cwd, {
    version: 1,
    activeTaskId: null,
    tasks: [{ id: "task-1", title: "first" }],
  });
  const returnValue = await mutateTasksState<Task, string>(cwd, (state) => {
    state.tasks.push({ id: "task-2", title: "second" });
    state.activeTaskId = "task-2";
    return "ok";
  });
  assert.equal(returnValue, "ok");
  const state = await readTasksState<Task>(cwd);
  assert.equal(state.activeTaskId, "task-2");
  assert.deepEqual(
    state.tasks.map((t) => t.id),
    ["task-1", "task-2"],
  );
});

test("ensureTasksState creates a default state without overwriting existing data", async () => {
  const cwd = await makeTempRepo("tasks-state-ensure-");
  await ensureTasksState(cwd);
  const first = await readTasksState<Task>(cwd);
  assert.deepEqual(first, { version: 1, activeTaskId: null, tasks: [] });

  await writeTasksState<Task>(cwd, {
    version: 1,
    activeTaskId: "t",
    tasks: [{ id: "t", title: "kept" }],
  });
  await ensureTasksState(cwd);
  const after = await readTasksState<Task>(cwd);
  assert.equal(after.activeTaskId, "t");
  assert.equal(after.tasks.length, 1);
});

test("first open backfills tasks.json into SQLite then archives the JSON", async () => {
  const cwd = await makeTempRepo("tasks-state-backfill-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  const jsonPath = join(runtimeDir, "tasks.json");
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        version: 1,
        activeTaskId: "legacy-active",
        tasks: [
          { id: "legacy-1", title: "Legacy one" },
          { id: "legacy-active", title: "Legacy active" },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const state = await readTasksState<Task>(cwd);
  assert.equal(state.activeTaskId, "legacy-active");
  assert.deepEqual(
    state.tasks.map((t) => t.id),
    ["legacy-1", "legacy-active"],
  );
  assert.equal(existsSync(jsonPath), false, "tasks.json should be archived after backfill");
  const dirEntries = await readdir(runtimeDir);
  const archived = dirEntries.filter((name) => name.startsWith("tasks.json.migrated-"));
  assert.equal(archived.length, 1, "expected exactly one migrated archive file");
  assert.equal(existsSync(join(runtimeDir, "pi.db")), true);
});

test("backfill is idempotent across multiple opens", async () => {
  const cwd = await makeTempRepo("tasks-state-backfill-idempotent-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  await writeFile(
    join(runtimeDir, "tasks.json"),
    JSON.stringify({
      version: 1,
      activeTaskId: null,
      tasks: [{ id: "legacy", title: "Legacy" }],
    }),
    "utf8",
  );

  await readTasksState<Task>(cwd);
  await readTasksState<Task>(cwd);
  const state = await readTasksState<Task>(cwd);

  assert.equal(state.tasks.length, 1, "no duplication after multiple opens");
  const dirEntries = await readdir(runtimeDir);
  const archived = dirEntries.filter((name) => name.startsWith("tasks.json.migrated-"));
  assert.equal(archived.length, 1, "JSON archived exactly once");
});

test("backfill leaves malformed tasks.json in place for operator inspection", async () => {
  const cwd = await makeTempRepo("tasks-state-backfill-malformed-");
  const runtimeDir = join(cwd, ".pi", "agent", "state", "runtime");
  const jsonPath = join(runtimeDir, "tasks.json");
  await writeFile(jsonPath, "definitely not json {{{", "utf8");

  const state = await readTasksState<Task>(cwd);
  assert.deepEqual(state, { version: 1, activeTaskId: null, tasks: [] });
  assert.equal(existsSync(jsonPath), true, "malformed JSON must NOT be archived");
});
