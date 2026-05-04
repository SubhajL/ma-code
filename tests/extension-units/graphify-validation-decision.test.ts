import assert from "node:assert/strict";
import test from "node:test";

import {
  decideGraphifyValidation,
  GRAPHIFY_VALIDATION_DECISION_STATES,
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
