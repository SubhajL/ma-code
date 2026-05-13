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

test("backend phase lane uses high-thinking fallback while gpt-5.5 is unverified", async () => {
  const result = resolveHarnessRoute(await repoConfig(), {
    role: "backend_worker",
    phaseLane: "backend_implementation",
  });

  assert.equal(result.phaseLane, "backend_implementation");
  assert.equal(result.phaseRoutingSource, "fallback_until_verified");
  assert.equal(result.requestedModelVerificationStatus, "unverified");
  assert.equal(result.requestedModelTarget, "gpt-5.5");
  assert.equal(result.selectedModelId, "github-copilot/gpt-5.4");
  assert.equal(result.thinking, "high");
  assert.notEqual(result.selectedModelId, "github-copilot/gpt-5.5");
  assert.match(result.policyNotes.join("\n"), /using verified fallback github-copilot\/gpt-5\.4/);
});

test("screen and frontend phase lanes use verified fallback while opus-4.7 is unverified", async () => {
  const config = await repoConfig();
  for (const [role, phaseLane] of [
    ["planning_lead", "screen_design"],
    ["frontend_worker", "frontend_implementation"],
  ] as const) {
    const result = resolveHarnessRoute(config, { role, phaseLane });
    assert.equal(result.phaseLane, phaseLane);
    assert.equal(result.phaseRoutingSource, "fallback_until_verified");
    assert.equal(result.requestedModelVerificationStatus, "unverified");
    assert.equal(result.requestedModelTarget, "opus-4.7");
    assert.equal(result.selectedModelId, "anthropic/claude-opus-4-5");
    assert.equal(result.thinking, "high");
    assert.notEqual(result.selectedModelId, "anthropic/opus-4.7");
  }
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
  assert.equal(result.selectedModelId, "anthropic/claude-opus-4-5");
  assert.match(result.policyNotes.join("\n"), /unavailable/);
});

test("explicit allowed modelOverride takes precedence over phase lane", async () => {
  const result = resolveHarnessRoute(await repoConfig(), {
    role: "backend_worker",
    reason: "human_override",
    modelOverride: "github-copilot/gpt-5.4",
    phaseLane: "backend_implementation",
  });

  assert.equal(result.selectedModelId, "github-copilot/gpt-5.4");
  assert.equal(result.source, "default");
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
  assert.equal(result.thinking, "minimal");
  assert.equal(result.phaseLane, null);
  assert.equal(result.phaseRoutingSource, "none");
  assert.equal(result.requestedModelVerificationStatus, null);
});

test("parser rejects unverified targets as active fallbacks", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalidRaw = clone(raw);
  invalidRaw.phase_routing_profiles.backend_implementation.fallbackModelId = "openai-codex/gpt-5.5";

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
