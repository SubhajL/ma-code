import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseHarnessRoutingConfig } from "../../.pi/agent/extensions/harness-routing.ts";
import { parseRecoveryPolicy } from "../../.pi/agent/extensions/recovery-policy.ts";
import recoveryRuntime, { resolveRecoveryRuntimeDecision } from "../../.pi/agent/extensions/recovery-runtime.ts";
import { FakePi, makeCtx, makeTempRepo } from "./test-utils.ts";

async function readFixture(relativePath: string): Promise<string> {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  return readFile(url, "utf8");
}

async function copyFixtureRepoFile(cwd: string, relativePath: string): Promise<void> {
  const source = new URL(`../../${relativePath}`, import.meta.url);
  const destination = join(cwd, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function loadPolicyAndRouting() {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const policy = parseRecoveryPolicy(JSON.parse(await readFixture(".pi/agent/recovery/recovery-policy.json")));
  return { routingConfig, policy };
}

test("runtime decision allows a first same-lane retry for bounded validation failure", async () => {
  const { policy, routingConfig } = await loadPolicyAndRouting();

  const decision = resolveRecoveryRuntimeDecision(policy, routingConfig, {
    role: "backend_worker",
    currentModelId: "openai-codex/gpt-5.4",
    task: {
      id: "task-first-retry",
      title: "Fix failing validator",
      status: "failed",
      taskClass: "implementation",
      retryCount: 0,
      evidence: ["reports/validation/failure.md"],
      notes: [],
      validation: {
        decision: "fail",
      },
    },
  });

  assert.equal(decision.recommendedAction, "retry_same_lane");
  assert.equal(decision.haltAutonomy, false);
  assert.equal(decision.retryPlan.nextModelId, "openai-codex/gpt-5.4");
  assert.equal(decision.rollback.recommended, false);
});

test("runtime decision recommends rollback after repeated validation failure", async () => {
  const { policy, routingConfig } = await loadPolicyAndRouting();

  const decision = resolveRecoveryRuntimeDecision(policy, routingConfig, {
    role: "backend_worker",
    currentModelId: "openai-codex/gpt-5.4",
    task: {
      id: "task-repeat-failure",
      title: "Fix failing validator again",
      status: "failed",
      taskClass: "implementation",
      retryCount: 1,
      evidence: ["reports/validation/failure.md"],
      notes: ["validator rejected previous retry"],
      validation: {
        decision: "fail",
      },
    },
  });

  assert.equal(decision.recommendedAction, "rollback");
  assert.equal(decision.haltAutonomy, true);
  assert.equal(decision.rollback.recommended, true);
  assert.equal(decision.rollback.scope, "current_task_lane");
  assert.match(decision.rollback.reason ?? "", /repeated validation failure/i);
});

test("runtime decision uses stricter role retry rules for validator worker", async () => {
  const { policy, routingConfig } = await loadPolicyAndRouting();

  const decision = resolveRecoveryRuntimeDecision(policy, routingConfig, {
    role: "validator_worker",
    currentModelId: "openai-codex/gpt-5.4",
    task: {
      id: "task-validator",
      title: "Validator follow-up",
      status: "failed",
      taskClass: "runtime_safety",
      retryCount: 0,
      evidence: ["reports/validation/runtime.md"],
      notes: [],
      validation: {
        decision: "fail",
      },
    },
  });

  assert.equal(decision.recommendedAction, "retry_stronger_model");
  assert.equal(decision.retryPlan.nextModelId, "anthropic/claude-opus-4-5");
  assert.match(decision.decisionReasons.join("\n"), /role-specific/i);
});

test("runtime decision uses provider retry limits to prefer provider switch", async () => {
  const { policy, routingConfig } = await loadPolicyAndRouting();

  const decision = resolveRecoveryRuntimeDecision(policy, routingConfig, {
    role: "research_worker",
    currentModelId: "openai-codex/gpt-5.4-mini",
    providerFailureState: "model_unavailable",
    providerRetryCounts: {
      "openai-codex": 1,
    },
  });

  assert.equal(decision.recommendedAction, "switch_provider");
  assert.equal(decision.retryPlan.nextProvider, "anthropic");
  assert.equal(decision.retryPlan.nextModelId, "anthropic/claude-sonnet-4-6");
  assert.match(decision.decisionReasons.join("\n"), /provider-specific/i);
});

test("runtime decision stops autonomy when approval is required before rollback or retry", async () => {
  const { policy, routingConfig } = await loadPolicyAndRouting();

  const decision = resolveRecoveryRuntimeDecision(policy, routingConfig, {
    role: "backend_worker",
    currentModelId: "openai-codex/gpt-5.4",
    approvalRequired: true,
    task: {
      id: "task-approval-stop",
      title: "Needs approval",
      status: "failed",
      taskClass: "implementation",
      retryCount: 0,
      evidence: ["reports/validation/failure.md"],
      notes: ["awaiting approval"],
      validation: {
        decision: "fail",
      },
    },
  });

  assert.equal(decision.recommendedAction, "stop");
  assert.equal(decision.haltAutonomy, true);
  assert.match(decision.stop.reason ?? "", /approval/i);
});

test("recovery runtime tool reuses task state evidence via taskId", async () => {
  const cwd = await makeTempRepo("recovery-runtime-");
  await copyFixtureRepoFile(cwd, ".pi/agent/models.json");
  await copyFixtureRepoFile(cwd, ".pi/agent/recovery/recovery-policy.json");
  await mkdir(join(cwd, "logs"), { recursive: true });
  await writeFile(
    join(cwd, ".pi", "agent", "state", "runtime", "tasks.json"),
    JSON.stringify(
      {
        version: 1,
        activeTaskId: null,
        tasks: [
          {
            id: "task-from-state",
            title: "State-backed retry evidence",
            owner: "assistant",
            status: "failed",
            taskClass: "implementation",
            acceptance: ["Fix the validator"],
            evidence: ["reports/validation/failure.md"],
            dependencies: [],
            retryCount: 1,
            validation: {
              tier: "standard",
              decision: "fail",
              source: "validator",
              checklist: {
                acceptance: "partial",
                tests: "met",
                diff_review: "met",
                evidence: "met",
              },
              approvalRef: null,
              updatedAt: "2026-04-20T00:00:00.000Z",
            },
            notes: ["validator rejected the previous retry"],
            timestamps: {
              createdAt: "2026-04-20T00:00:00.000Z",
              updatedAt: "2026-04-20T00:05:00.000Z",
            },
          },
        ],
      },
      null,
      2,
    ),
  );

  const pi = new FakePi("feat/recovery-runtime");
  recoveryRuntime(pi as any);
  const tool = pi.getTool("resolve_recovery_runtime_decision");
  const result = await tool.execute(
    "tool-call-id",
    {
      taskId: "task-from-state",
      role: "backend_worker",
      currentModelId: "openai-codex/gpt-5.4",
    },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  const details = (result as any).details.decision;
  assert.equal(details.recommendedAction, "rollback");
  assert.equal(details.taskContext?.taskId, "task-from-state");
  assert.equal(details.taskContext?.retryCount, 1);
  assert.equal(details.taskContext?.validationDecision, "fail");
});
