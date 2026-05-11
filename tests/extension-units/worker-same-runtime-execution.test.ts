import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkerExecutionPlanCommand, describeWorkerExecutionPlan } from "../../.pi/agent/extensions/worker-same-runtime-execution.ts";

test("buildWorkerExecutionPlanCommand wraps same-runtime bridge execution deterministically", () => {
  const plan = {
    strategy: "same_runtime_prompt",
    prompt: "Implement the bounded AFK worker slice.",
    toolProfile: "coding",
    includeProjectExtensions: false,
    includeContextFiles: true,
    provider: "github-copilot",
    modelId: "gpt-5.4",
    thinkingLevel: "high",
  } as const;

  const command = buildWorkerExecutionPlanCommand(plan);

  assert.match(command, /^node -e /);
  assert.match(command, /same-runtime-bridge\.ts/);
  assert.match(command, /run_same_runtime_probe/);
  assert.match(command, /__PI_OK__/);
  assert.match(command, /github-copilot\/gpt-5\.4/);
  assert.match(command, /--thinking/);
  assert.match(command, /high/);
  assert.doesNotMatch(command, /\/skill:g-coding/);
  assert.match(describeWorkerExecutionPlan(plan), /same_runtime_prompt/);
});
