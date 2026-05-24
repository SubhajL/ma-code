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

test("safe-bash redirects `git commit` via bash to the typed git_commit tool", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-git-commit-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git commit -m 'checkpoint'" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /git_commit/);
  assert.match(result.reason, /instead of bash `git commit`/);

  const audit = await readAuditLog(cwd);
  assert.match(audit, /"action":"blocked"/);
  assert.match(audit, /git_commit/);
  assert.doesNotMatch(audit, /"action":"auto-branch"/);
});

test("safe-bash redirects `git commit` on main to typed tool (no auto-branch attempt)", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-git-commit-main-");
  await seedActiveTask(cwd);
  const pi = new FakePi("main");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git commit -m 'checkpoint'" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /git_commit/);
  assert.equal(pi.getCurrentBranchName(), "main");

  const audit = await readAuditLog(cwd);
  assert.match(audit, /"action":"blocked"/);
  assert.doesNotMatch(audit, /"action":"auto-branch"/);
});

test("safe-bash does NOT redirect `git commit-tree` (false-positive guard)", async () => {
  const cwd = await makeTempRepo("safe-bash-commit-tree-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git commit-tree HEAD^{tree} -m msg" } },
    makeCtx(cwd),
  );

  assert.equal(result, undefined);
});

test("safe-bash redirects `git branch` via bash to the typed git_branch tool", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-git-branch-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git branch --show-current" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /git_branch/);
  assert.match(result.reason, /instead of bash `git branch`/);
});

test("safe-bash redirects `git checkout` and `git switch` via bash to git_checkout", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-git-checkout-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const checkoutResult = await onToolCall(
    { toolName: "bash", input: { command: "git checkout feature/x" } },
    makeCtx(cwd),
  );
  const switchResult = await onToolCall(
    { toolName: "bash", input: { command: "git switch feature/x" } },
    makeCtx(cwd),
  );

  assert.equal(checkoutResult.block, true);
  assert.match(checkoutResult.reason, /git_checkout/);
  assert.equal(switchResult.block, true);
  assert.match(switchResult.reason, /git_checkout/);
});

test("safe-bash redirects `git push` via bash to the typed git_push tool", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-git-push-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git push origin feature/x" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /git_push/);
  assert.match(result.reason, /instead of bash `git push`/);
});

test("safe-bash hard-blocks force push before typed git_push redirect", async () => {
  const cwd = await makeTempRepo("safe-bash-force-push-precedence-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git push --force origin feature/x" } },
    makeCtx(cwd),
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked bash command: force push is blocked",
  });
});

test("safe-bash hard-blocks force branch deletion before git_branch redirect", async () => {
  const cwd = await makeTempRepo("safe-bash-force-branch-delete-precedence-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git branch -D feature/old" } },
    makeCtx(cwd),
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked bash command: force branch deletion is blocked",
  });
});

test("safe-bash does NOT redirect similarly named git commands", async () => {
  const cwd = await makeTempRepo("safe-bash-git-false-positives-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const checkoutIndexResult = await onToolCall(
    { toolName: "bash", input: { command: "git checkout-index --help" } },
    makeCtx(cwd),
  );
  const branchNameResult = await onToolCall(
    { toolName: "bash", input: { command: "git branch-name --help" } },
    makeCtx(cwd),
  );

  assert.equal(checkoutIndexResult, undefined);
  assert.equal(branchNameResult, undefined);
});

test("safe-bash still allows `git add` via bash (not yet typed)", async () => {
  const cwd = await makeTempRepo("safe-bash-git-add-allowed-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "git add src/foo.ts" } },
    makeCtx(cwd),
  );

  assert.equal(result, undefined);
});

test("safe-bash redirects `npm test` via bash to the typed run_test tool", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-npm-test-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "npm test" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /run_test/);
  assert.match(result.reason, /instead of bash `npm test`/);
});

test("safe-bash redirects `npm t` (npm test alias) to run_test", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-npm-t-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "npm t" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /run_test/);
});

test("safe-bash redirects `npm run test:*` to run_test", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-npm-run-test-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "npm run test:extensions" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /run_test/);
});

test("safe-bash redirects `npm run validate:*` to run_test", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-npm-run-validate-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "npm run validate:harness-routing" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /run_test/);
});

test("safe-bash redirects `npm run typecheck` to run_test", async () => {
  const cwd = await makeTempRepo("safe-bash-redirect-npm-run-typecheck-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "npm run typecheck" } },
    makeCtx(cwd),
  );

  assert.equal(result.block, true);
  assert.match(result.reason, /run_test/);
});

test("safe-bash does NOT redirect arbitrary npm scripts like `npm run build`", async () => {
  const cwd = await makeTempRepo("safe-bash-npm-run-build-");
  const pi = new FakePi("feat/safe-bash");
  safeBash(pi as any);

  const onToolCall = pi.getHandler("tool_call");
  const result = await onToolCall(
    { toolName: "bash", input: { command: "npm run build" } },
    makeCtx(cwd),
  );

  assert.equal(result, undefined);
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
