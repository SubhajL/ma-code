import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import safeBash from "../../.pi/agent/extensions/safe-bash.ts";
import { FakePi, makeCtx, makeTempRepo, readAuditLog } from "./test-utils.ts";

const ACTIVE_TASK_ID = "task-123";
const ACTIVE_TASK_TITLE = "Write on main auto branch";
const ACTIVE_TASK_BRANCH = "task/task-123-write-on-main-auto-branch";

async function seedActiveTask(cwd: string, title = ACTIVE_TASK_TITLE) {
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"),
    `${JSON.stringify(
      {
        version: 1,
        activeTaskId: ACTIVE_TASK_ID,
        tasks: [
          {
            id: ACTIVE_TASK_ID,
            title,
            owner: "assistant",
            status: "in_progress",
            taskClass: "implementation",
            acceptance: ["Allow bounded auto-branching on main"],
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
              createdAt: "2026-04-23T00:00:00.000Z",
              updatedAt: "2026-04-23T00:00:00.000Z",
              startedAt: "2026-04-23T00:00:00.000Z",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

test("safe-bash blocks protected write paths", async () => {
  const cwd = await makeTempRepo("safe-bash-protected-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "write", input: { path: ".env" } }, makeCtx(cwd));

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked write: secret/env files are protected",
  });

  const audit = await readAuditLog(cwd);
  assert.match(audit, /"extension":"safe-bash"/);
  assert.match(audit, /secret\/env files are protected/);
});

test("safe-bash write on main with active task auto-branches and is allowed", async () => {
  const cwd = await makeTempRepo("safe-bash-main-write-auto-");
  await seedActiveTask(cwd);
  const pi = new FakePi("main", {
    statusPorcelain: " M .pi/agent/state/runtime/tasks.json\n M logs/harness-actions.jsonl\n",
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "write", input: { path: "feature.txt" } }, makeCtx(cwd));

  assert.equal(result, undefined);
  assert.equal(pi.getCurrentBranchName(), ACTIVE_TASK_BRANCH);

  const audit = await readAuditLog(cwd);
  assert.match(audit, /"action":"auto-branch"/);
  assert.match(audit, /"outcome":"created"/);
  assert.match(audit, /"toBranch":"task\/task-123-write-on-main-auto-branch"/);
  assert.match(audit, /"action":"allowed-mutation"/);
});

test("safe-bash write on main without active task stays blocked with clear reason", async () => {
  const cwd = await makeTempRepo("safe-bash-main-write-no-task-");
  const pi = new FakePi("main");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "write", input: { path: "feature.txt" } }, makeCtx(cwd));

  assert.deepEqual(result, {
    block: true,
    reason:
      "Blocked write on `main`. Auto-branch requires an active task and safe repo state (no unexpected dirty tracked files); otherwise create or switch to a non-main branch first. No active task is in progress with an owner and acceptance criteria.",
  });
  assert.equal(pi.getCurrentBranchName(), "main");

  const audit = await readAuditLog(cwd);
  assert.match(audit, /"action":"auto-branch"/);
  assert.match(audit, /"outcome":"skipped"/);
  assert.match(audit, /active in-progress task/);
  assert.match(audit, /"action":"blocked"/);
});

test("safe-bash write on main with unexpected dirty tracked file stays blocked", async () => {
  const cwd = await makeTempRepo("safe-bash-main-write-dirty-");
  await seedActiveTask(cwd);
  const pi = new FakePi("main", {
    statusPorcelain: " M src/unexpected.ts\n M logs/harness-actions.jsonl\n",
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "write", input: { path: "feature.txt" } }, makeCtx(cwd));

  assert.deepEqual(result, {
    block: true,
    reason:
      "Blocked write on `main`. Auto-branch requires an active task and safe repo state (no unexpected dirty tracked files); otherwise create or switch to a non-main branch first. Unexpected dirty tracked files: src/unexpected.ts.",
  });
  assert.equal(pi.getCurrentBranchName(), "main");
});

test("safe-bash touch on main auto-branches and is allowed", async () => {
  const cwd = await makeTempRepo("safe-bash-main-touch-auto-");
  await seedActiveTask(cwd);
  const pi = new FakePi("main", {
    statusPorcelain: " M .pi/agent/state/runtime/tasks.json\n",
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "bash", input: { command: "touch main-bash-check.txt" } }, makeCtx(cwd));

  assert.equal(result, undefined);
  assert.equal(pi.getCurrentBranchName(), ACTIVE_TASK_BRANCH);

  const audit = await readAuditLog(cwd);
  assert.match(audit, /"tool":"bash"/);
  assert.match(audit, /"action":"auto-branch"/);
  assert.match(audit, /"action":"allowed-mutation"/);
});

test("safe-bash git commit on main still blocks with branch guidance", async () => {
  const cwd = await makeTempRepo("safe-bash-main-git-commit-");
  await seedActiveTask(cwd);
  const pi = new FakePi("main");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git commit -m 'checkpoint'" } },
    makeCtx(cwd),
  );

  assert.deepEqual(result, {
    block: true,
    reason:
      "Blocked mutating bash command on `main`. Auto-branch requires an active task and safe repo state (no unexpected dirty tracked files); otherwise create or switch to a non-main branch first. Command is not eligible for automatic branching.",
  });
  assert.equal(pi.getCurrentBranchName(), "main");

  const audit = await readAuditLog(cwd);
  assert.match(audit, /"action":"auto-branch"/);
  assert.match(audit, /"outcome":"skipped"/);
  assert.match(audit, /not eligible for automatic branching/);
  assert.match(audit, /"action":"blocked"/);
});

test("safe-bash blocks hard-dangerous bash commands", async () => {
  const cwd = await makeTempRepo("safe-bash-hard-block-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, makeCtx(cwd));

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked bash command: destructive git reset is blocked",
  });
});

test("safe-bash blocks warn-level commands in non-interactive mode", async () => {
  const cwd = await makeTempRepo("safe-bash-warn-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "bash", input: { command: "npm install left-pad" } }, makeCtx(cwd));

  assert.deepEqual(result, {
    block: true,
    reason: "Risky bash command blocked in non-interactive mode: dependency surface is changing",
  });
});

test("safe-bash allows safe non-mutating bash commands", async () => {
  const cwd = await makeTempRepo("safe-bash-allow-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall({ toolName: "bash", input: { command: "pwd" } }, makeCtx(cwd));

  assert.equal(result, undefined);
});
