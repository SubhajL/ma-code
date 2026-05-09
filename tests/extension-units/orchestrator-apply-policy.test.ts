import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCreatedFilesWithinAllowlist,
  buildOrchestratorApplyPlan,
  rejectUnsafeApplyVerb,
  type OrchestratorApplyPath,
} from "../../.pi/agent/extensions/orchestrator-apply-policy.ts";

test("stitch_prompt apply builds one exact allowlisted command", () => {
  const plan = buildOrchestratorApplyPlan({ path: "stitch_prompt", initiative: "checkout", sliceId: "slice-001" });

  assert.equal(plan.selectedPath, "stitch_prompt");
  assert.equal(plan.delegatedCommand, "npm run harness:stitch-prompt -- --initiative checkout --slice slice-001 --apply --json");
  assert.deepEqual(plan.call, {
    command: plan.delegatedCommand,
    executable: "npm",
    args: ["run", "harness:stitch-prompt", "--", "--initiative", "checkout", "--slice", "slice-001", "--apply", "--json"],
  });
  assert.deepEqual(plan.requiredArgs, ["initiative", "sliceId"]);
  assert.deepEqual(plan.allowedWritePaths, ["docs/initiatives/checkout/stitch-prompts/slice-001.*"]);
  assert.equal(plan.approval.required, false);
});

test("missing required arguments block before delegation", () => {
  assert.throws(() => buildOrchestratorApplyPlan({ path: "stitch_prompt", initiative: "checkout" }), /--slice is required/);
  assert.throws(() => buildOrchestratorApplyPlan({ path: "issue_materialization", source: "" }), /--source is required/);
  assert.throws(() => buildOrchestratorApplyPlan({ path: "product_intake", initiative: "checkout" }), /--description is required/);
});

test("approval-required screen approval blocks without approval ref, identity, and note or reason", () => {
  assert.throws(() => buildOrchestratorApplyPlan({ path: "screen_approval", action: "approve", initiative: "checkout", sliceId: "slice-001", by: "reviewer", note: "ok" }), /--approval-ref is required/);
  assert.throws(() => buildOrchestratorApplyPlan({ path: "screen_approval", action: "approve", initiative: "checkout", sliceId: "slice-001", approvalRef: "human-1", note: "ok" }), /--by is required/);
  assert.throws(() => buildOrchestratorApplyPlan({ path: "screen_approval", action: "approve", initiative: "checkout", sliceId: "slice-001", approvalRef: "human-1", by: "reviewer" }), /--note is required/);
  assert.throws(() => buildOrchestratorApplyPlan({ path: "screen_approval", action: "reject", initiative: "checkout", sliceId: "slice-001", approvalRef: "human-1", by: "reviewer" }), /--reason is required/);

  const plan = buildOrchestratorApplyPlan({ path: "screen_approval", action: "reject", initiative: "checkout", sliceId: "slice-001", approvalRef: "human-1", by: "reviewer", reason: "missing states" });
  assert.equal(plan.delegatedCommand, "npm run harness:screen-approval -- reject --initiative checkout --slice slice-001 --by reviewer --reason 'missing states' --json");
  assert.deepEqual(plan.approval, { required: true, approvalRef: "human-1" });
});

test("unsafe verbs and generic command strings are rejected", () => {
  for (const verb of ["run", "create", "merge", "sync-main", "git"] as const) {
    assert.throws(() => rejectUnsafeApplyVerb(verb), /not supported by harness-orchestrate apply|raw git/i);
  }
  assert.throws(() => buildOrchestratorApplyPlan({ path: "stitch_prompt", initiative: "checkout", sliceId: "slice-001", command: "npm run harness:merge -- apply --pr 1" }), /generic command strings are not accepted/i);
});

test("all apply targets declare commands, required args, write allowlists, approval policy, and next safe action", () => {
  const cases: Array<[OrchestratorApplyPath, Parameters<typeof buildOrchestratorApplyPlan>[0]]> = [
    ["product_intake", { path: "product_intake", initiative: "checkout", description: "Checkout users can pay with saved cards safely." }],
    ["issue_materialization", { path: "issue_materialization", source: "docs/initiatives/checkout/source/approved-g-issues.json" }],
    ["product_pipeline", { path: "product_pipeline", initiative: "checkout" }],
    ["stitch_prompt", { path: "stitch_prompt", initiative: "checkout", sliceId: "slice-001" }],
    ["stitch_artifact", { path: "stitch_artifact", initiative: "checkout", sliceId: "slice-001" }],
    ["screen_approval", { path: "screen_approval", action: "approve", initiative: "checkout", sliceId: "slice-001", approvalRef: "human-1", by: "reviewer", note: "approved" }],
    ["slice_contract", { path: "slice_contract", initiative: "checkout", sliceId: "slice-001" }],
    ["frontend_packet", { path: "frontend_packet", initiative: "checkout", sliceId: "slice-001" }],
    ["backend_packet", { path: "backend_packet", initiative: "checkout", sliceId: "slice-001" }],
    ["afk_queue_materialization", { path: "afk_queue_materialization", initiative: "checkout" }],
  ];

  for (const [path, input] of cases) {
    const plan = buildOrchestratorApplyPlan(input);
    assert.equal(plan.selectedPath, path);
    assert.match(plan.delegatedCommand, /^npm run harness:/);
    assert.ok(plan.requiredArgs.length > 0);
    assert.ok(plan.allowedWritePaths.length > 0);
    assert.ok("required" in plan.approval);
    assert.ok(plan.nextSafeActions.length > 0);
  }
});

test("AFK queue materialization always includes apply --queue-only and never run", () => {
  const plan = buildOrchestratorApplyPlan({ path: "afk_queue_materialization", initiative: "checkout" });
  assert.equal(plan.delegatedCommand, "npm run harness:afk-orchestrate -- apply --queue-only --initiative checkout --json");
  assert.ok(plan.call.args.includes("--queue-only"));
  assert.deepEqual(plan.call.args.slice(3, 5), ["apply", "--queue-only"]);
  assert.equal(plan.call.args.includes("worker-execute"), false);
});

test("created file verification fails closed outside the declared allowlist", () => {
  const plan = buildOrchestratorApplyPlan({ path: "stitch_prompt", initiative: "checkout", sliceId: "slice-001" });

  assert.deepEqual(assertCreatedFilesWithinAllowlist(plan, ["docs/initiatives/checkout/stitch-prompts/slice-001.prompt.md"]), [
    "docs/initiatives/checkout/stitch-prompts/slice-001.prompt.md",
  ]);
  assert.throws(() => assertCreatedFilesWithinAllowlist(plan, []), /did not report created files/i);
  assert.throws(() => assertCreatedFilesWithinAllowlist(plan, ["src/app.ts"]), /outside allowed write paths/i);
});
