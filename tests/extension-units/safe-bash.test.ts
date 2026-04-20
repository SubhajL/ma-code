import assert from "node:assert/strict";
import test from "node:test";

import safeBash from "../../.pi/agent/extensions/safe-bash.ts";
import { FakePi, makeCtx, makeTempRepo, readAuditLog } from "./test-utils.ts";

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
