import assert from "node:assert/strict";
import test from "node:test";

import {
  decideGraphifyOrchestration,
  GRAPHIFY_ORCHESTRATION_ACTIONS,
} from "../../.pi/agent/extensions/graphify-orchestration-decision.ts";

test("Graphify orchestration decision exposes explicit actions", () => {
  assert.deepEqual([...GRAPHIFY_ORCHESTRATION_ACTIONS], [
    "not_needed",
    "use_local_verification",
    "graphify_unavailable",
    "run_preflight",
    "request_approval",
    "run_scan",
    "check_freshness",
    "query_graph",
    "verify_sources",
    "ready",
    "blocked",
  ]);
});

test("no discovery need returns not_needed", () => {
  const result = decideGraphifyOrchestration({ need: "none" });

  assert.equal(result.action, "not_needed");
  assert.equal(result.shouldUseGraphify, false);
  assert.equal(result.blocking, false);
});

test("exact verification uses local verification instead of Graphify", () => {
  const result = decideGraphifyOrchestration({ need: "exact_verification", graphifyAvailable: true });

  assert.equal(result.action, "use_local_verification");
  assert.equal(result.shouldUseGraphify, false);
});

test("broad discovery blocks when Graphify is unavailable and no local fallback is allowed", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: false,
    localFallbackAllowed: false,
  });

  assert.equal(result.action, "graphify_unavailable");
  assert.equal(result.blocking, true);
});

test("missing graph needs preflight before scan", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: false,
    purpose: "architecture_review",
  });

  assert.equal(result.action, "run_preflight");
  assert.equal(result.requiresPreflight, true);
});

test("large corpus without approval requests approval before scan", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: false,
    purpose: "architecture_review",
    preflightTokenPresent: true,
    largeCorpus: true,
    approvedLargeCorpus: false,
  });

  assert.equal(result.action, "request_approval");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.blocking, true);
});

test("preflighted missing graph with approval can run one bounded scan", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: false,
    purpose: "architecture_review",
    preflightTokenPresent: true,
    largeCorpus: true,
    approvedLargeCorpus: true,
  });

  assert.equal(result.action, "run_scan");
  assert.equal(result.shouldUseGraphify, true);
});

test("stale graph checks freshness before reuse", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: true,
    freshnessStatus: "stale_head",
  });

  assert.equal(result.action, "check_freshness");
  assert.equal(result.requiresFreshnessCheck, true);
});

test("dirty worktree prefers local verification instead of rescan", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: true,
    freshnessStatus: "dirty_worktree",
  });

  assert.equal(result.action, "use_local_verification");
  assert.equal(result.shouldUseGraphify, false);
});

test("fresh graph needs query proof before planning or validation", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: true,
    freshnessStatus: "fresh",
    latestRelevantGraphQueried: false,
  });

  assert.equal(result.action, "query_graph");
  assert.equal(result.requiresQuery, true);
});

test("queried graph needs direct source verification before ready", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: true,
    freshnessStatus: "fresh",
    latestRelevantGraphQueried: true,
    importantClaimsSourceVerified: false,
  });

  assert.equal(result.action, "verify_sources");
  assert.equal(result.requiresSourceVerification, true);
});

test("fresh queried graph with source verification is ready", () => {
  const result = decideGraphifyOrchestration({
    need: "broad_structure",
    graphifyAvailable: true,
    graphPresent: true,
    freshnessStatus: "fresh",
    latestRelevantGraphQueried: true,
    importantClaimsSourceVerified: true,
  });

  assert.equal(result.action, "ready");
  assert.equal(result.ready, true);
  assert.equal(result.blocking, false);
});
