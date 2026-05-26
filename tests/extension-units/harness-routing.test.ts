import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import harnessRouting from "../../.pi/agent/extensions/harness-routing.ts";
import { deriveDomainOwnershipForDomains } from "../../.pi/agent/extensions/domain-ownership.ts";
import {
  parseHarnessRoutingConfig,
  resolveHarnessCapability,
  resolveHarnessRoute,
} from "../../.pi/agent/extensions/harness-routing.ts";
import { FakePi, makeCtx, makeTempRepo } from "./test-utils.ts";

async function makeTempRepoWithModelsJson(prefix: string): Promise<string> {
  const cwd = await makeTempRepo(prefix);
  const raw = await readFile(".pi/agent/models.json", "utf8");
  await mkdir(join(cwd, ".pi", "agent"), { recursive: true });
  await writeFile(join(cwd, ".pi", "agent", "models.json"), raw);
  return cwd;
}

function registerHarnessRoutingTools() {
  const pi = new FakePi("feat/resolve-harness-capability");
  harnessRouting(pi as any);
  return pi;
}

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

test("models.json declares strong_reasoning and economy_reasoning capabilities", async () => {
  const config = await repoConfig();
  assert.ok(config.capabilities.strong_reasoning, "strong_reasoning capability present");
  assert.ok(config.capabilities.economy_reasoning, "economy_reasoning capability present");
  assert.ok(config.capabilities.strong_reasoning.model_ids.length > 0);
  assert.ok(config.capabilities.economy_reasoning.model_ids.length > 0);
});

test("resolveHarnessCapability returns configured candidates in order", async () => {
  const config = await repoConfig();
  const result = resolveHarnessCapability(config, { capability: "strong_reasoning" });
  assert.deepEqual(result.candidates, config.capabilities.strong_reasoning.model_ids);
  assert.equal(result.firstAvailable, config.capabilities.strong_reasoning.model_ids[0]);
  assert.equal(result.capability, "strong_reasoning");
});

test("resolveHarnessCapability filters unavailable candidates and falls through to the next", async () => {
  const config = await repoConfig();
  const [first, second] = config.capabilities.strong_reasoning.model_ids;
  const result = resolveHarnessCapability(config, {
    capability: "strong_reasoning",
    unavailableModels: [first],
  });
  assert.equal(result.firstAvailable, second);
  assert.ok(!result.candidates.includes(first));
});

test("resolveHarnessCapability returns null firstAvailable when every candidate is unavailable", async () => {
  const config = await repoConfig();
  const result = resolveHarnessCapability(config, {
    capability: "economy_reasoning",
    unavailableModels: config.capabilities.economy_reasoning.model_ids,
  });
  assert.equal(result.firstAvailable, null);
  assert.deepEqual(result.candidates, []);
});

test("resolveHarnessCapability rejects unknown capability ids", async () => {
  const config = await repoConfig();
  assert.throws(
    () => resolveHarnessCapability(config, { capability: "nonexistent" }),
    /Unknown capability: nonexistent/,
  );
});

test("parseHarnessRoutingConfig accepts legacy string-array fallback_order without a capabilities block", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const legacy = clone(raw);
  delete legacy.capabilities;
  for (const role of Object.keys(legacy.routing_defaults)) {
    legacy.routing_defaults[role].fallback_order = [
      "openai-codex/gpt-5.5",
      "anthropic/claude-opus-4-7",
    ];
  }
  const config = parseHarnessRoutingConfig(legacy);
  assert.deepEqual(config.capabilities, {});
  assert.deepEqual(config.routing_defaults.orchestrator.fallback_order, [
    "openai-codex/gpt-5.5",
    "anthropic/claude-opus-4-7",
  ]);
});

test("parseHarnessRoutingConfig expands capability refs inside fallback_order", async () => {
  const config = await repoConfig();
  assert.deepEqual(config.routing_defaults.orchestrator.fallback_order, [
    "openai-codex/gpt-5.5",
    "openai-codex/gpt-5.3-codex-spark",
    "anthropic/claude-opus-4-7",
    "anthropic/claude-sonnet-4-6",
  ]);
  assert.deepEqual(config.routing_defaults.backend_worker.fallback_order, [
    "openai-codex/gpt-5.3-codex-spark",
    "openai-codex/gpt-5.5",
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-opus-4-7",
  ]);
});

test("parseHarnessRoutingConfig preserves order when fallback_order mixes literal model ids and capability refs", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const mixed = clone(raw);
  mixed.routing_defaults.orchestrator.fallback_order = [
    "openai-codex/gpt-5.4-mini",
    { capability: "routing_reasoning_first" },
    "anthropic/claude-haiku-4-5",
  ];
  const config = parseHarnessRoutingConfig(mixed);
  assert.deepEqual(config.routing_defaults.orchestrator.fallback_order, [
    "openai-codex/gpt-5.4-mini",
    "openai-codex/gpt-5.5",
    "openai-codex/gpt-5.3-codex-spark",
    "anthropic/claude-opus-4-7",
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-haiku-4-5",
  ]);
});

test("parseHarnessRoutingConfig rejects unknown capability ref in fallback_order", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalid = clone(raw);
  invalid.routing_defaults.orchestrator.fallback_order = [{ capability: "nonexistent_capability" }];
  assert.throws(
    () => parseHarnessRoutingConfig(invalid),
    /Unknown fallback_order capability "nonexistent_capability" for role orchestrator/,
  );
});

test("parseHarnessRoutingConfig rejects malformed fallback_order entries", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalid = clone(raw);
  invalid.routing_defaults.orchestrator.fallback_order = [42];
  assert.throws(
    () => parseHarnessRoutingConfig(invalid),
    /Invalid fallback_order entry for role orchestrator/,
  );
});

test("parseHarnessRoutingConfig rejects capability with empty model_ids", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalid = clone(raw);
  invalid.capabilities.strong_reasoning.model_ids = [];
  assert.throws(
    () => parseHarnessRoutingConfig(invalid),
    /strong_reasoning requires a non-empty model_ids/,
  );
});

test("parseHarnessRoutingConfig rejects capability model_ids without provider prefix", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalid = clone(raw);
  invalid.capabilities.strong_reasoning.model_ids = ["claude-opus-4-7"];
  assert.throws(
    () => parseHarnessRoutingConfig(invalid),
    /must be fully qualified as "<provider>\/<model>"/,
  );
});

test("resolve_harness_capability tool is registered alongside resolve_harness_route", () => {
  const pi = registerHarnessRoutingTools();
  const capability = pi.getTool("resolve_harness_capability");
  const route = pi.getTool("resolve_harness_route");
  assert.equal(capability.name, "resolve_harness_capability");
  assert.equal(route.name, "resolve_harness_route");
});

test("resolve_harness_capability tool returns ordered candidates for a known capability", async () => {
  const pi = registerHarnessRoutingTools();
  const tool = pi.getTool("resolve_harness_capability");
  const cwd = await makeTempRepoWithModelsJson("resolve-capability-happy-");
  const result = await tool.execute(
    "tool-call-id",
    { capability: "strong_reasoning" },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.equal(result.details.ok, true);
  assert.equal(result.details.capability, "strong_reasoning");
  assert.deepEqual(result.details.candidates, [
    "anthropic/claude-opus-4-7",
    "openai-codex/gpt-5.5",
    "anthropic/claude-sonnet-4-6",
  ]);
  assert.equal(result.details.firstAvailable, "anthropic/claude-opus-4-7");
});

test("resolve_harness_capability tool filters out unavailable models", async () => {
  const pi = registerHarnessRoutingTools();
  const tool = pi.getTool("resolve_harness_capability");
  const cwd = await makeTempRepoWithModelsJson("resolve-capability-filter-");
  const result = await tool.execute(
    "tool-call-id",
    {
      capability: "economy_reasoning",
      unavailableModels: ["openai-codex/gpt-5.4-mini"],
    },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.equal(result.details.ok, true);
  assert.equal(result.details.firstAvailable, "github-copilot/gpt-5.4-mini");
  assert.ok(!result.details.candidates.includes("openai-codex/gpt-5.4-mini"));
});

test("resolve_harness_capability tool returns ok:false on unknown capability id", async () => {
  const pi = registerHarnessRoutingTools();
  const tool = pi.getTool("resolve_harness_capability");
  const cwd = await makeTempRepoWithModelsJson("resolve-capability-unknown-");
  const result = await tool.execute(
    "tool-call-id",
    { capability: "nonexistent_capability" },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.equal(result.details.ok, false);
  assert.match(String(result.details.error), /Unknown capability: nonexistent_capability/);
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
