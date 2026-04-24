import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import safeBash from "../../.pi/agent/extensions/safe-bash.ts";
import { FakePi, makeCtx, makeTempRepo, readAuditLog } from "./test-utils.ts";

const ACTIVE_TASK_ID = "task-123";
const ACTIVE_TASK_TITLE = "Write on main auto branch";
const ACTIVE_TASK_BRANCH = "task/task-123-write-on-main-auto-branch";

async function seedActiveTask(cwd: string, title = ACTIVE_TASK_TITLE) {
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
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

test("safe-bash write/edit target worktree branch is evaluated from target path directory", async () => {
  const sessionCwd = await makeTempRepo("safe-bash-session-main-");
  const targetCwd = await makeTempRepo("safe-bash-target-branch-");
  await seedActiveTask(targetCwd);

  const sharedCommonDir = "/tmp/repos/shared-common-dir";
  const pi = new FakePi("main", {
    cwdStates: {
      [sessionCwd]: { branch: "main", gitCommonDir: sharedCommonDir },
      [targetCwd]: { branch: "feat/target-worktree", gitCommonDir: sharedCommonDir },
    },
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const writeResult = await onToolCall(
    { toolName: "write", input: { path: join(targetCwd, "feature.txt") } },
    makeCtx(sessionCwd),
  );
  const editResult = await onToolCall(
    { toolName: "edit", input: { path: join(targetCwd, "feature.txt") } },
    makeCtx(sessionCwd),
  );

  assert.equal(writeResult, undefined);
  assert.equal(editResult, undefined);
  assert.equal(pi.getCurrentBranchName(sessionCwd), "main");
  assert.equal(pi.getCurrentBranchName(targetCwd), "feat/target-worktree");

  const audit = await readAuditLog(targetCwd);
  assert.match(audit, /"tool":"write"/);
  assert.match(audit, /"tool":"edit"/);
  assert.match(audit, /"branch":"feat\/target-worktree"/);
  assert.doesNotMatch(audit, /"action":"auto-branch"/);
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

test("safe-bash leading cd uses target worktree branch for mutation safety", async () => {
  const sessionCwd = await makeTempRepo("safe-bash-cd-session-");
  const targetCwd = await makeTempRepo("safe-bash-cd-target-");
  await seedActiveTask(targetCwd);

  const sharedCommonDir = "/tmp/repos/shared-common-dir";
  const pi = new FakePi("main", {
    cwdStates: {
      [sessionCwd]: { branch: "main", gitCommonDir: sharedCommonDir },
      [targetCwd]: { branch: "feat/target-worktree", gitCommonDir: sharedCommonDir },
    },
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: `cd ${targetCwd} && touch file.txt` } },
    makeCtx(sessionCwd),
  );

  assert.equal(result, undefined);
  assert.equal(pi.getCurrentBranchName(sessionCwd), "main");
  assert.equal(pi.getCurrentBranchName(targetCwd), "feat/target-worktree");

  const audit = await readAuditLog(targetCwd);
  assert.match(audit, /"command":"cd .* && touch file.txt"/);
  assert.match(audit, /"classificationCommand":"touch file.txt"/);
  assert.match(audit, /"action":"allowed-mutation"/);
});

test("safe-bash leading cd to target main still remains blocked by main-branch protections", async () => {
  const sessionCwd = await makeTempRepo("safe-bash-cd-main-session-");
  const targetCwd = await makeTempRepo("safe-bash-cd-main-target-");

  const sharedCommonDir = "/tmp/repos/shared-common-dir";
  const pi = new FakePi("feat/session", {
    cwdStates: {
      [sessionCwd]: { branch: "feat/session", gitCommonDir: sharedCommonDir },
      [targetCwd]: { branch: "main", gitCommonDir: sharedCommonDir },
    },
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: `cd ${targetCwd} && touch file.txt` } },
    makeCtx(sessionCwd),
  );

  assert.deepEqual(result, {
    block: true,
    reason:
      "Blocked mutating bash command on `main`. Auto-branch requires an active task and safe repo state (no unexpected dirty tracked files); otherwise create or switch to a non-main branch first. No active task is in progress with an owner and acceptance criteria.",
  });
  assert.equal(pi.getCurrentBranchName(targetCwd), "main");

  const audit = await readAuditLog(targetCwd);
  assert.match(audit, /"action":"auto-branch"/);
  assert.match(audit, /"outcome":"skipped"/);
  assert.match(audit, /"classificationCommand":"touch file.txt"/);
});

test("safe-bash blocks cross-repo write target paths clearly", async () => {
  const sessionCwd = await makeTempRepo("safe-bash-cross-repo-session-");
  const targetCwd = await makeTempRepo("safe-bash-cross-repo-target-");

  const pi = new FakePi("feat/session", {
    cwdStates: {
      [sessionCwd]: { branch: "feat/session", gitCommonDir: "/tmp/repos/session-common-dir" },
      [targetCwd]: { branch: "feat/other", gitCommonDir: "/tmp/repos/other-common-dir" },
    },
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "write", input: { path: join(targetCwd, "feature.txt") } },
    makeCtx(sessionCwd),
  );

  assert.deepEqual(result, {
    block: true,
    reason:
      "Blocked write: Blocked target outside the current repo/worktree family: target path/cwd resolves to a different git common-dir than the session.",
  });

  const audit = await readAuditLog(sessionCwd);
  assert.match(audit, /target repo family differs from session repo family/);
  assert.match(audit, /"action":"blocked"/);
});

test("safe-bash blocks leading cd into non-repo context clearly", async () => {
  const sessionCwd = await makeTempRepo("safe-bash-non-repo-session-");
  const targetCwd = await makeTempRepo("safe-bash-non-repo-target-");

  const pi = new FakePi("feat/session", {
    cwdStates: {
      [sessionCwd]: { branch: "feat/session", gitCommonDir: "/tmp/repos/shared-common-dir" },
      [targetCwd]: { branch: null, gitCommonDir: null },
    },
  });
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: `cd ${targetCwd} && touch file.txt` } },
    makeCtx(sessionCwd),
  );

  assert.deepEqual(result, {
    block: true,
    reason:
      "Blocked bash command: Blocked target outside the current repo/worktree family: git context could not be resolved for the session or target path, so mutation safety cannot verify the target repo.",
  });

  const audit = await readAuditLog(sessionCwd);
  assert.match(audit, /git repo context could not be resolved/);
  assert.match(audit, /"action":"blocked"/);
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
