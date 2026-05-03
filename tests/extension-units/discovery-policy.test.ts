import assert from "node:assert/strict";
import test from "node:test";

import { selectDiscoveryPolicy } from "../../.pi/agent/extensions/discovery-policy.ts";

test("discovery-policy selects Auggie for bounded repo semantic discovery", () => {
  const result = selectDiscoveryPolicy({
    need: "repo_semantic",
    auggieAvailable: true,
    graphifyAvailable: true,
  });

  assert.equal(result.selectedTool, "auggie");
  assert.match(result.rationale.join("\n"), /bounded repo-local semantic discovery/i);
  assert.ok(result.requiredVerification.some((item) => item.includes("direct file verification")));
});

test("discovery-policy selects Graphify for broad structure when bounded and available", () => {
  const result = selectDiscoveryPolicy({
    need: "broad_structure",
    auggieAvailable: true,
    graphifyAvailable: true,
    graphifyFresh: true,
  });

  assert.equal(result.selectedTool, "graphify");
  assert.match(result.rationale.join("\n"), /broad repo\/corpus structure/i);
  assert.ok(result.requiredVerification.some((item) => item.includes("freshness/confidence")));
});

test("discovery-policy selects local read/rg/find for exact verification", () => {
  const result = selectDiscoveryPolicy({
    need: "exact_verification",
    auggieAvailable: true,
    graphifyAvailable: true,
    externalCurrentInfoNeeded: true,
  });

  assert.equal(result.selectedTool, "local");
  assert.deepEqual(result.localTools, ["read", "rg", "find"]);
  assert.match(result.rationale.join("\n"), /exact verification/i);
});

test("discovery-policy selects Exa for current external web information", () => {
  const result = selectDiscoveryPolicy({
    need: "external_current_info",
    auggieAvailable: true,
    graphifyAvailable: true,
    localTargetsKnown: true,
  });

  assert.equal(result.selectedTool, "exa");
  assert.match(result.rationale.join("\n"), /current external web information/i);
  assert.ok(result.requiredVerification.some((item) => item.includes("source URLs")));
});

test("discovery-policy falls back to local when indexed discovery is unavailable", () => {
  const result = selectDiscoveryPolicy({
    need: "repo_semantic",
    auggieAvailable: false,
    graphifyAvailable: false,
  });

  assert.equal(result.selectedTool, "local");
  assert.match(result.rationale.join("\n"), /fallback/i);
});
