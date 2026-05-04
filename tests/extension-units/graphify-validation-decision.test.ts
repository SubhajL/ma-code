import assert from "node:assert/strict";
import test from "node:test";

import {
  decideGraphifyValidation,
  GRAPHIFY_VALIDATION_DECISION_STATES,
  GRAPHIFY_VALIDATION_POLICIES,
} from "../../.pi/agent/extensions/graphify-validation-decision.ts";

test("Graphify validation decision exposes the full explicit state set", () => {
  assert.deepEqual([...GRAPHIFY_VALIDATION_DECISION_STATES], [
    "not_applicable",
    "optional_skipped",
    "required_missing",
    "freshness_checked",
    "queried",
    "source_verified",
    "pass",
    "fail",
    "blocked",
  ]);
});

test("required Graphify-backed claim without freshness/query/source proof is blocked", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: true,
    required: true,
    freshnessOrCadenceChecked: false,
    latestRelevantGraphQueried: false,
    importantClaimsSourceVerified: false,
  });

  assert.equal(result.state, "blocked");
  assert.equal(result.pass, false);
  assert.equal(result.blocking, true);
  assert.match(result.reason, /cannot pass/i);
  assert.deepEqual(result.missingProof, [
    "latest_relevant_graph_queried_or_freshness_cadence_checked",
    "important_claims_verified_with_direct_source_inspection",
  ]);
});

test("non-Graphify-backed claim is not applicable", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: false,
    required: true,
  });

  assert.equal(result.state, "not_applicable");
  assert.equal(result.pass, true);
  assert.equal(result.blocking, false);
});

test("optional Graphify-backed claim without Graphify evidence is skipped without blocking acceptance", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: true,
    required: false,
  });

  assert.equal(result.state, "optional_skipped");
  assert.equal(result.pass, true);
  assert.equal(result.blocking, false);
});

test("required Graphify-backed claim with freshness check and source verification passes", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: true,
    required: true,
    freshnessOrCadenceChecked: true,
    importantClaimsSourceVerified: true,
  });

  assert.equal(result.state, "pass");
  assert.equal(result.pass, true);
  assert.equal(result.blocking, false);
});

test("policy exposes all supported mandatory modes", () => {
  assert.deepEqual([...GRAPHIFY_VALIDATION_POLICIES], [
    "optional_default",
    "required_for_graphify_backed_claims",
    "required_for_architecture_review",
    "disabled",
  ]);

  const result = decideGraphifyValidation({
    graphifyBackedClaim: false,
    policy: "optional_default",
  });

  assert.equal(result.policy, "optional_default");
});

test("required_for_architecture_review blocks architecture-review Graphify claim without proof", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: true,
    claimScope: "architecture_review",
    policy: "required_for_architecture_review",
  });

  assert.equal(result.state, "blocked");
  assert.equal(result.pass, false);
  assert.equal(result.blocking, true);
  assert.equal(result.policy, "required_for_architecture_review");
});

test("required_for_architecture_review does not block non-architecture Graphify claim", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: true,
    claimScope: "graphify_backed_claim",
    policy: "required_for_architecture_review",
  });

  assert.equal(result.state, "optional_skipped");
  assert.equal(result.blocking, false);
});

test("disabled policy leaves Graphify validation non-blocking", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: true,
    claimScope: "architecture_review",
    policy: "disabled",
  });

  assert.equal(result.state, "optional_skipped");
  assert.equal(result.blocking, false);
  assert.equal(result.policy, "disabled");
});

test("source verification evidence is represented before final pass when graph freshness/query proof is missing", () => {
  const result = decideGraphifyValidation({
    graphifyBackedClaim: true,
    required: false,
    importantClaimsSourceVerified: true,
  });

  assert.equal(result.state, "source_verified");
  assert.equal(result.pass, false);
  assert.equal(result.blocking, false);
});
