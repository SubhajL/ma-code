import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseHarnessRoutingConfig } from "../../.pi/agent/extensions/harness-routing.ts";
import { loadRecoveryPolicy, resolveRecoveryPolicy } from "../../.pi/agent/extensions/recovery-policy.ts";

// Kept apart from harness-routing.test.ts, which validate-harness-routing.sh runs without recovery-policy.
test("recovery policy and the resolver agree that a bare failed id rules out that model", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFile(".pi/agent/models.json", "utf8")));
  const assessment = resolveRecoveryPolicy(await loadRecoveryPolicy(process.cwd()), config, {
    role: "frontend_worker",
    failedModels: ["gpt-5.5"],
  });

  assert.notEqual(assessment.retryEligibility.retry_stronger_model.nextModelId, "openai-codex/gpt-5.5");
});
