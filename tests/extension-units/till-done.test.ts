import assert from "node:assert/strict";
import test from "node:test";

import tillDone from "../../.pi/agent/extensions/till-done.ts";
import { FakePi, makeCtx, makeTempRepo, textContent } from "./test-utils.ts";

async function setupTillDone(branch = "feat/till-done") {
  const cwd = await makeTempRepo("till-done-");
  const pi = new FakePi(branch);
  tillDone(pi as any);
  const tool = pi.getTool("task_update");
  const onToolCall = pi.getHandler("tool_call");

  const execute = async (params: Record<string, unknown>) => {
    return tool.execute("tool-call-id", params, undefined, undefined, makeCtx(cwd));
  };

  return { cwd, pi, execute, onToolCall };
}

test("till-done blocks mutation without an active runnable task", async () => {
  const { cwd, onToolCall } = await setupTillDone();
  const result = await onToolCall({ toolName: "write", input: { path: "demo.txt" } }, makeCtx(cwd));

  assert.deepEqual(result, {
    block: true,
    reason: "Mutating actions require an active task in `in_progress` status with an owner and acceptance criteria.",
  });
});

test("implementation tasks cannot complete without validation", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({ action: "create", title: "impl task", acceptance: ["Implement queue runner later"] });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: impl.ts"] });
  await execute({ action: "review", id: taskId });
  const doneResult = await execute({ action: "done", id: taskId });

  assert.equal(
    textContent(doneResult),
    "Task cannot be completed until validation passes for task class implementation.",
  );
});

test("docs tasks can use lighter review-backed validation and complete", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({
    action: "create",
    title: "docs task",
    taskClass: "docs",
    acceptance: ["Document the queue workflow"],
  });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: docs.md"] });
  await execute({ action: "review", id: taskId });
  const validateResult = await execute({
    action: "validate",
    id: taskId,
    validationSource: "review",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "not_applicable",
      diff_review: "not_applicable",
      evidence: "met",
    },
  });
  assert.equal(textContent(validateResult), `Validation passed for ${taskId}`);

  const doneResult = await execute({ action: "done", id: taskId });
  assert.equal(textContent(doneResult), `Completed ${taskId}`);
});

test("active runnable tasks allow write/edit mutation path", async () => {
  const { cwd, execute, onToolCall } = await setupTillDone();

  const createResult = await execute({ action: "create", title: "active task", acceptance: ["Allow mutation while active"] });
  const taskId = (createResult as any).details.task.id as string;
  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });

  const result = await onToolCall({ toolName: "write", input: { path: "demo.txt" } }, makeCtx(cwd));
  assert.equal(result, undefined);
});
