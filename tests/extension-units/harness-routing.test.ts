import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { deriveDomainOwnershipForDomains } from "../../.pi/agent/extensions/domain-ownership.ts";
import { parseHarnessRoutingConfig, resolveHarnessRoute } from "../../.pi/agent/extensions/harness-routing.ts";

async function repoConfig() {
  return parseHarnessRoutingConfig(JSON.parse(await readFile(".pi/agent/models.json", "utf8")));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const DEFAULT_HIGH_MODEL = "openai-codex/gpt-5.5";
const CODING_WORKER_MODEL = "openai-codex/gpt-5.3-codex-spark";

test("default g-check and subsequent routes use gpt-5.5 high", async () => {
  const config = await repoConfig();
  for (const role of ["reviewer_worker", "validator_worker", "quality_lead", "orchestrator"] as const) {
    const result = resolveHarnessRoute(config, { role });
    assert.equal(result.selectedModelId, DEFAULT_HIGH_MODEL, `${role} default model`);
    assert.equal(result.thinking, "high", `${role} default thinking`);
    assert.equal(result.source, "default", `${role} source`);
  }
});

test("g-coding implementation workers use codex spark high by default", async () => {
  const config = await repoConfig();
  for (const role of ["frontend_worker", "backend_worker", "infra_worker"] as const) {
    const result = resolveHarnessRoute(config, { role });
    assert.equal(result.selectedModelId, CODING_WORKER_MODEL, `${role} default model`);
    assert.equal(result.selectedProvider, "openai-codex", `${role} provider`);
    assert.equal(result.thinking, "high", `${role} thinking`);
    assert.equal(result.source, "default", `${role} source`);
  }
});

test("subsequent default review route reverts after g-coding worker route", async () => {
  const config = await repoConfig();
  const coding = resolveHarnessRoute(config, { role: "backend_worker" });
  const review = resolveHarnessRoute(config, { role: "reviewer_worker" });

  assert.equal(coding.selectedModelId, CODING_WORKER_MODEL);
  assert.equal(coding.thinking, "high");
  assert.equal(review.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(review.thinking, "high");
});

test("backend phase lane uses verified g-coding spark high", async () => {
  const result = resolveHarnessRoute(await repoConfig(), {
    role: "backend_worker",
    phaseLane: "backend_implementation",
  });

  assert.equal(result.phaseLane, "backend_implementation");
  assert.equal(result.phaseRoutingSource, "verified_model");
  assert.equal(result.requestedModelVerificationStatus, "verified");
  assert.equal(result.requestedModelTarget, CODING_WORKER_MODEL.replace("openai-codex/", ""));
  assert.equal(result.selectedModelId, CODING_WORKER_MODEL);
  assert.equal(result.thinking, "high");
});

test("screen phase uses default gpt-5.5 while frontend implementation uses spark", async () => {
  const config = await repoConfig();
  const screen = resolveHarnessRoute(config, { role: "planning_lead", phaseLane: "screen_design" });
  const frontend = resolveHarnessRoute(config, { role: "frontend_worker", phaseLane: "frontend_implementation" });

  assert.equal(screen.phaseRoutingSource, "verified_model");
  assert.equal(screen.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(screen.thinking, "high");
  assert.equal(frontend.phaseRoutingSource, "verified_model");
  assert.equal(frontend.selectedModelId, CODING_WORKER_MODEL);
  assert.equal(frontend.thinking, "high");
});

test("verified phase profile activates verifiedModelId", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const verifiedRaw = clone(raw);
  verifiedRaw.phase_routing_profiles.backend_implementation.verificationStatus = "verified";
  verifiedRaw.phase_routing_profiles.backend_implementation.verifiedModelId = "openai-codex/gpt-5.5";
  const result = resolveHarnessRoute(parseHarnessRoutingConfig(verifiedRaw), {
    role: "backend_worker",
    phaseLane: "backend_implementation",
  });

  assert.equal(result.phaseRoutingSource, "verified_model");
  assert.equal(result.requestedModelVerificationStatus, "verified");
  assert.equal(result.selectedModelId, "openai-codex/gpt-5.5");
  assert.equal(result.thinking, "high");
});

test("unavailable phase profile falls back with warning", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const unavailableRaw = clone(raw);
  unavailableRaw.phase_routing_profiles.frontend_implementation.verificationStatus = "unavailable";
  unavailableRaw.phase_routing_profiles.frontend_implementation.verifiedModelId = null;
  const result = resolveHarnessRoute(parseHarnessRoutingConfig(unavailableRaw), {
    role: "frontend_worker",
    phaseLane: "frontend_implementation",
  });

  assert.equal(result.phaseRoutingSource, "fallback_unavailable");
  assert.equal(result.requestedModelVerificationStatus, "unavailable");
  assert.equal(result.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.match(result.policyNotes.join("\n"), /unavailable/);
});

test("explicit allowed modelOverride takes precedence over phase lane", async () => {
  const result = resolveHarnessRoute(await repoConfig(), {
    role: "backend_worker",
    reason: "human_override",
    modelOverride: DEFAULT_HIGH_MODEL,
    phaseLane: "backend_implementation",
  });

  assert.equal(result.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(result.source, "explicit_override");
  assert.equal(result.phaseRoutingSource, "explicit_override_precedence");
  assert.match(result.policyNotes.join("\n"), /Explicit model override takes precedence/);
});

test("unknown phase lane is rejected safely", async () => {
  const config = await repoConfig();
  assert.throws(
    () => resolveHarnessRoute(config, { role: "backend_worker", phaseLane: "mobile_implementation" } as never),
    /Unknown phase lane: mobile_implementation/,
  );
});

test("role-only routing remains backward compatible", async () => {
  const result = resolveHarnessRoute(await repoConfig(), {
    role: "backend_worker",
    reason: "budget_pressure",
    budgetMode: "conserve",
  });

  assert.equal(result.selectedModelId, "github-copilot/gpt-5.4-mini");
  assert.equal(result.source, "budget_override");
  assert.equal(result.thinking, "low");
  assert.equal(result.phaseLane, null);
  assert.equal(result.phaseRoutingSource, "none");
  assert.equal(result.requestedModelVerificationStatus, null);
});

test("parser rejects unverified targets as active fallbacks", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalidRaw = clone(raw);
  invalidRaw.phase_routing_profiles.backend_implementation.verificationStatus = "unverified";
  invalidRaw.phase_routing_profiles.backend_implementation.verifiedModelId = null;
  invalidRaw.phase_routing_profiles.backend_implementation.fallbackModelId = CODING_WORKER_MODEL;

  assert.throws(
    () => parseHarnessRoutingConfig(invalidRaw),
    /unverified targetModelRequest cannot also be the active fallbackModelId/,
  );
});

test("mixed frontend/backend ownership selects backend worker before route resolution", async () => {
  const config = await repoConfig();
  const assignment = deriveDomainOwnershipForDomains(["frontend", "backend"]);
  const result = resolveHarnessRoute(config, { role: assignment.assignedRole, reason: "default", budgetMode: "balanced" });

  assert.equal(assignment.assignedRole, "backend_worker");
  assert.deepEqual(assignment.domainOwnership, {
    mode: "mixed_domain",
    owningDomain: "backend",
    owningRole: "backend_worker",
    supportingDomains: ["frontend"],
  });
  assert.equal(result.role, "backend_worker");
  assert.match(result.selectedModelId, /\S/);
});
