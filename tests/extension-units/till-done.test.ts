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

test("Graphify-backed acceptance cannot validate pass without graph freshness/query and source verification proof", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({
    action: "create",
    title: "graphify validation task",
    acceptance: ["Graphify-backed acceptance must verify architecture claims"],
  });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: docs.md"] });
  await execute({ action: "review", id: taskId });

  const validateResult = await execute({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
  });

  assert.match(textContent(validateResult), /Graphify-backed acceptance cannot pass/i);
  assert.equal((validateResult as any).details.graphifyValidation.state, "blocked");
  assert.deepEqual((validateResult as any).details.graphifyValidation.missingProof, [
    "latest_relevant_graph_queried_or_freshness_cadence_checked",
    "important_claims_verified_with_direct_source_inspection",
  ]);
});

test("Graphify-backed acceptance validates pass with freshness or query proof and source verification", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({
    action: "create",
    title: "graphify validation task",
    acceptance: ["Graphify-backed acceptance must verify architecture claims"],
  });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: docs.md"] });
  await execute({ action: "review", id: taskId });

  const validateResult = await execute({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
    graphifyValidation: {
      graphifyBackedClaim: true,
      required: true,
      freshnessOrCadenceChecked: true,
      importantClaimsSourceVerified: true,
    },
  });

  assert.equal(textContent(validateResult), `Validation passed for ${taskId}`);
  assert.equal((validateResult as any).details.graphifyValidation.state, "pass");
  assert.ok((validateResult as any).details.task.evidence.some((item: string) => item.includes("Graphify validation decision: pass")));
});

test("Graphify-backed acceptance consumes orchestration evidence during validation", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({
    action: "create",
    title: "graphify evidence validation task",
    acceptance: ["Graphify-backed acceptance must verify architecture claims"],
  });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: docs.md"] });
  await execute({ action: "review", id: taskId });

  const validateResult = await execute({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
    graphifyEvidence: {
      graphifyBackedClaim: true,
      required: true,
      graphifyOrchestrationAction: "query_graph",
      graphifyAdapterAction: "query",
      importantClaimsSourceVerified: true,
      sourceVerificationNotes: ["verified important architecture claim in docs.md"],
    },
  });

  assert.equal(textContent(validateResult), `Validation passed for ${taskId}`);
  assert.equal((validateResult as any).details.graphifyValidation.state, "pass");
  assert.ok((validateResult as any).details.task.evidence.some((item: string) => item.includes("Graphify validation decision: pass")));
});

test("Graphify orchestration evidence still blocks when source verification is missing", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({
    action: "create",
    title: "graphify missing source validation task",
    acceptance: ["Graphify-backed acceptance must verify architecture claims"],
  });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: docs.md"] });
  await execute({ action: "review", id: taskId });

  const validateResult = await execute({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
    graphifyEvidence: {
      graphifyBackedClaim: true,
      required: true,
      graphifyOrchestrationAction: "query_graph",
      graphifyAdapterAction: "query",
    },
  });

  assert.match(textContent(validateResult), /Graphify-backed acceptance cannot pass/i);
  assert.equal((validateResult as any).details.graphifyValidation.state, "required_missing");
  assert.deepEqual((validateResult as any).details.graphifyValidation.missingProof, [
    "important_claims_verified_with_direct_source_inspection",
  ]);
});

test("explicit Graphify validation input takes precedence over orchestration evidence", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({
    action: "create",
    title: "graphify precedence validation task",
    acceptance: ["Graphify-backed acceptance must verify architecture claims"],
  });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: docs.md"] });
  await execute({ action: "review", id: taskId });

  const validateResult = await execute({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
    graphifyValidation: {
      graphifyBackedClaim: true,
      required: true,
      freshnessOrCadenceChecked: true,
      importantClaimsSourceVerified: true,
    },
    graphifyEvidence: {
      graphifyBackedClaim: true,
      required: true,
      graphifyOrchestrationAction: "query_graph",
      graphifyAdapterAction: "query",
      importantClaimsSourceVerified: false,
    },
  });

  assert.equal(textContent(validateResult), `Validation passed for ${taskId}`);
  assert.equal((validateResult as any).details.graphifyValidation.state, "pass");
});

test("Graphify required_for_architecture_review policy blocks only architecture review scope", async () => {
  const { execute } = await setupTillDone();

  const createResult = await execute({
    action: "create",
    title: "architecture validation task",
    acceptance: ["Validate architecture claims"],
  });
  const taskId = (createResult as any).details.task.id as string;

  await execute({ action: "claim", id: taskId, owner: "assistant" });
  await execute({ action: "start", id: taskId });
  await execute({ action: "evidence", id: taskId, evidence: ["Changed files: architecture.md"] });
  await execute({ action: "review", id: taskId });

  const blocked = await execute({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
    graphifyValidation: {
      graphifyBackedClaim: true,
      claimScope: "architecture_review",
      policy: "required_for_architecture_review",
    },
  });

  assert.match(textContent(blocked), /Graphify-backed acceptance cannot pass/i);
  assert.equal((blocked as any).details.graphifyValidation.policy, "required_for_architecture_review");
  assert.equal((blocked as any).details.graphifyValidation.state, "blocked");

  const nonScoped = await execute({
    action: "validate",
    id: taskId,
    validationSource: "validator",
    validationDecision: "pass",
    validationChecklist: {
      acceptance: "met",
      tests: "met",
      diff_review: "met",
      evidence: "met",
    },
    graphifyValidation: {
      graphifyBackedClaim: true,
      claimScope: "graphify_backed_claim",
      policy: "required_for_architecture_review",
    },
  });

  assert.equal(textContent(nonScoped), `Validation passed for ${taskId}`);
  assert.equal((nonScoped as any).details.graphifyValidation.state, "optional_skipped");
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
