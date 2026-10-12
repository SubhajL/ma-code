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
const FRONTEND_WORKER_MODEL = "anthropic/claude-opus-4-7";
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

test("frontend implementation worker uses Claude Opus high by default", async () => {
  const config = await repoConfig();
  const result = resolveHarnessRoute(config, { role: "frontend_worker" });
  assert.equal(result.selectedModelId, FRONTEND_WORKER_MODEL, "frontend_worker default model");
  assert.equal(result.selectedProvider, "anthropic", "frontend_worker provider");
  assert.equal(result.thinking, "high", "frontend_worker thinking");
  assert.equal(result.source, "default", "frontend_worker source");
});

test("backend and infra implementation workers keep codex spark high by default", async () => {
  const config = await repoConfig();
  for (const role of ["backend_worker", "infra_worker"] as const) {
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

test("screen phase uses default gpt-5.5 while frontend implementation uses Claude Opus", async () => {
  const config = await repoConfig();
  const screen = resolveHarnessRoute(config, { role: "planning_lead", phaseLane: "screen_design" });
  const frontend = resolveHarnessRoute(config, { role: "frontend_worker", phaseLane: "frontend_implementation" });

  assert.equal(screen.phaseRoutingSource, "verified_model");
  assert.equal(screen.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(screen.thinking, "high");
  assert.equal(frontend.phaseRoutingSource, "verified_model");
  assert.equal(frontend.selectedModelId, FRONTEND_WORKER_MODEL);
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

test("parseHarnessRoutingConfig accepts legacy string-array fallback_order, allowed_overrides, and budget_overrides without a capabilities block", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const legacy = clone(raw);
  delete legacy.capabilities;
  for (const role of Object.keys(legacy.routing_defaults)) {
    legacy.routing_defaults[role].fallback_order = [
      "openai-codex/gpt-5.5",
      "anthropic/claude-opus-4-7",
    ];
    legacy.routing_defaults[role].allowed_overrides = [
      "anthropic/claude-sonnet-4-6",
    ];
    legacy.routing_defaults[role].budget_overrides = [];
  }
  const config = parseHarnessRoutingConfig(legacy);
  assert.deepEqual(config.capabilities, {});
  assert.deepEqual(config.routing_defaults.orchestrator.fallback_order, [
    "openai-codex/gpt-5.5",
    "anthropic/claude-opus-4-7",
  ]);
  assert.deepEqual(config.routing_defaults.orchestrator.allowed_overrides, [
    "anthropic/claude-sonnet-4-6",
  ]);
  assert.deepEqual(config.routing_defaults.orchestrator.budget_overrides, []);
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

test("parseHarnessRoutingConfig expands allowed_overrides capability refs minus the role default", async () => {
  const config = await repoConfig();
  // Reasoning-led role: default is gpt-5.5; allowed_overrides should be routing_reasoning_first minus gpt-5.5.
  assert.deepEqual(config.routing_defaults.orchestrator.allowed_overrides, [
    "openai-codex/gpt-5.3-codex-spark",
    "anthropic/claude-opus-4-7",
    "anthropic/claude-sonnet-4-6",
  ]);
  // Implementation role: default is spark; allowed_overrides should be routing_implementation_first minus spark.
  assert.deepEqual(config.routing_defaults.backend_worker.allowed_overrides, [
    "openai-codex/gpt-5.5",
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-opus-4-7",
  ]);
});

test("parseHarnessRoutingConfig keeps every role's allowed_overrides identical to the pre-migration arrays", async () => {
  const config = await repoConfig();
  const reasoningRoles = [
    "orchestrator",
    "planning_lead",
    "build_lead",
    "quality_lead",
    "research_worker",
    "reviewer_worker",
    "validator_worker",
    "docs_worker",
    "recovery_worker",
  ] as const;
  const codexImplementationRoles = ["backend_worker", "infra_worker"] as const;
  const reasoningExpected = ["openai-codex/gpt-5.3-codex-spark", "anthropic/claude-opus-4-7", "anthropic/claude-sonnet-4-6"];
  const codexImplementationExpected = ["openai-codex/gpt-5.5", "anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-7"];
  const frontendExpected = ["openai-codex/gpt-5.3-codex-spark", "openai-codex/gpt-5.5", "anthropic/claude-sonnet-4-6"];
  for (const role of reasoningRoles) {
    assert.deepEqual(config.routing_defaults[role].allowed_overrides, reasoningExpected, `${role} allowed_overrides`);
  }
  assert.deepEqual(config.routing_defaults.frontend_worker.allowed_overrides, frontendExpected, "frontend_worker allowed_overrides");
  for (const role of codexImplementationRoles) {
    assert.deepEqual(config.routing_defaults[role].allowed_overrides, codexImplementationExpected, `${role} allowed_overrides`);
  }
});

test("parseHarnessRoutingConfig rejects excludeDefaultModel when no default is available (fallback_order context)", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalid = clone(raw);
  invalid.routing_defaults.orchestrator.fallback_order = [
    { capability: "routing_reasoning_first", excludeDefaultModel: true },
  ];
  assert.throws(
    () => parseHarnessRoutingConfig(invalid),
    /fallback_order capability "routing_reasoning_first".*cannot use excludeDefaultModel/,
  );
});

test("parseHarnessRoutingConfig rejects unknown allowed_overrides capability", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalid = clone(raw);
  invalid.routing_defaults.orchestrator.allowed_overrides = [{ capability: "nonexistent_capability" }];
  assert.throws(
    () => parseHarnessRoutingConfig(invalid),
    /Unknown allowed_overrides capability "nonexistent_capability" for role orchestrator/,
  );
});

test("parseHarnessRoutingConfig allows mixed allowed_overrides entries (literals plus capability refs)", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const mixed = clone(raw);
  mixed.routing_defaults.orchestrator.allowed_overrides = [
    "anthropic/claude-haiku-4-5",
    { capability: "routing_reasoning_first", excludeDefaultModel: true },
  ];
  const config = parseHarnessRoutingConfig(mixed);
  assert.deepEqual(config.routing_defaults.orchestrator.allowed_overrides, [
    "anthropic/claude-haiku-4-5",
    "openai-codex/gpt-5.3-codex-spark",
    "anthropic/claude-opus-4-7",
    "anthropic/claude-sonnet-4-6",
  ]);
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

test("models.json declares budget_implementation capability with the canonical cheap model", async () => {
  const config = await repoConfig();
  assert.ok(config.capabilities.budget_implementation, "budget_implementation capability present");
  assert.deepEqual(config.capabilities.budget_implementation.model_ids, [
    "github-copilot/gpt-5.4-mini",
  ]);
});

test("parseHarnessRoutingConfig expands budget_overrides capability refs for implementation roles", async () => {
  const config = await repoConfig();
  for (const role of ["build_lead", "frontend_worker", "backend_worker"] as const) {
    assert.deepEqual(
      config.routing_defaults[role].budget_overrides,
      ["github-copilot/gpt-5.4-mini"],
      `${role} budget_overrides`,
    );
  }
});

test("parseHarnessRoutingConfig keeps budget_overrides empty for non-budget roles", async () => {
  const config = await repoConfig();
  const nonBudgetRoles = [
    "orchestrator",
    "planning_lead",
    "quality_lead",
    "research_worker",
    "infra_worker",
    "reviewer_worker",
    "validator_worker",
    "docs_worker",
    "recovery_worker",
  ] as const;
  for (const role of nonBudgetRoles) {
    assert.deepEqual(config.routing_defaults[role].budget_overrides, [], `${role} budget_overrides`);
  }
});

test("parseHarnessRoutingConfig accepts legacy string-array budget_overrides for backward compat", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const legacy = clone(raw);
  legacy.routing_defaults.backend_worker.budget_overrides = ["github-copilot/gpt-5.4-mini"];
  const config = parseHarnessRoutingConfig(legacy);
  assert.deepEqual(config.routing_defaults.backend_worker.budget_overrides, [
    "github-copilot/gpt-5.4-mini",
  ]);
});

test("parseHarnessRoutingConfig rejects unknown budget_overrides capability", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const invalid = clone(raw);
  invalid.routing_defaults.backend_worker.budget_overrides = [
    { capability: "nonexistent_budget_capability" },
  ];
  assert.throws(
    () => parseHarnessRoutingConfig(invalid),
    /Unknown budget_overrides capability "nonexistent_budget_capability" for role backend_worker/,
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

test("a harder frontend task stays on Claude Opus instead of moving to the second fallback", async () => {
  const result = resolveHarnessRoute(await repoConfig(), { role: "frontend_worker", reason: "task_harder", budgetMode: "high" });

  assert.equal(result.selectedModelId, FRONTEND_WORKER_MODEL);
  assert.equal(result.source, "default");
  assert.equal(result.thinking, "xhigh");
  const note = result.policyNotes.find((entry) => entry.includes("allow_stronger_override"));
  assert.ok(note, result.policyNotes.join("\n"));
  assert.doesNotMatch(note, /\//, "the note must not name a model; the final selection can still change");
});

test("a harder backend task still moves from spark to the stronger fallback", async () => {
  const result = resolveHarnessRoute(await repoConfig(), { role: "backend_worker", reason: "task_harder" });

  assert.equal(result.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(result.source, "stronger_override");
});

test("after an Opus failure the frontend role and the frontend phase lane agree on gpt-5.5", async () => {
  const config = await repoConfig();
  const failedModels = [FRONTEND_WORKER_MODEL];
  const role = resolveHarnessRoute(config, { role: "frontend_worker", failedModels });
  const lane = resolveHarnessRoute(config, { role: "frontend_worker", phaseLane: "frontend_implementation", failedModels });

  assert.equal(role.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(lane.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(lane.source, "phase_fallback");
  assert.equal(lane.phaseRoutingSource, "failed_model_fallback");
});

test("a lane whose model failed uses its own fallback, not a budget or stronger role override", async () => {
  const config = await repoConfig();
  const budget = resolveHarnessRoute(config, {
    role: "frontend_worker",
    reason: "budget_pressure",
    budgetMode: "conserve",
    phaseLane: "frontend_implementation",
    failedModels: [FRONTEND_WORKER_MODEL],
  });
  const harder = resolveHarnessRoute(config, {
    role: "backend_worker",
    reason: "task_harder",
    phaseLane: "backend_implementation",
    failedModels: [CODING_WORKER_MODEL],
  });

  for (const result of [budget, harder]) {
    assert.equal(result.selectedModelId, DEFAULT_HIGH_MODEL);
    assert.equal(result.source, "phase_fallback");
    assert.equal(result.phaseRoutingSource, "failed_model_fallback");
  }
});

test("a bare failed model id matches that model under any provider", async () => {
  const config = await repoConfig();
  const lane = resolveHarnessRoute(config, {
    role: "backend_worker",
    phaseLane: "frontend_implementation",
    failedModels: ["claude-opus-4-7"],
  });
  const role = resolveHarnessRoute(config, { role: "frontend_worker", failedModels: ["claude-opus-4-7", "gpt-5.5"] });

  assert.equal(lane.selectedModelId, DEFAULT_HIGH_MODEL, "the lane's own fallback");
  assert.equal(lane.phaseRoutingSource, "failed_model_fallback");
  assert.equal(role.selectedModelId, CODING_WORKER_MODEL);
});

test("a phase lane never re-selects a model reported as failed", async () => {
  const config = await repoConfig();
  for (const [role, phaseLane, model] of [
    ["frontend_worker", "frontend_implementation", FRONTEND_WORKER_MODEL],
    ["backend_worker", "backend_implementation", CODING_WORKER_MODEL],
    ["planning_lead", "screen_design", DEFAULT_HIGH_MODEL],
  ] as const) {
    const result = resolveHarnessRoute(config, { role, phaseLane, failedModels: [model] });
    assert.ok(!result.failedModels.includes(result.selectedModelId), `${phaseLane} re-selected failed ${result.selectedModelId}`);
    assert.equal(result.phaseRoutingSource, "failed_model_fallback", `${phaseLane} routing source`);
  }
});

test("an unverified phase lane skips a failed fallback model too", async () => {
  const raw = clone(JSON.parse(await readFile(".pi/agent/models.json", "utf8")));
  raw.phase_routing_profiles.frontend_implementation.verificationStatus = "unverified";
  raw.phase_routing_profiles.frontend_implementation.verifiedModelId = null;
  const config = parseHarnessRoutingConfig(raw);
  const fallback = raw.phase_routing_profiles.frontend_implementation.fallbackModelId as string;

  const result = resolveHarnessRoute(config, { role: "frontend_worker", phaseLane: "frontend_implementation", failedModels: [fallback] });

  assert.notEqual(result.selectedModelId, fallback);
  assert.notEqual(result.selectedModelId, FRONTEND_WORKER_MODEL, "an unverified lane target stays off-limits");
  assert.equal(result.phaseRoutingSource, "failed_model_fallback");
});

test("the frontend phase fallback matches the frontend role's first fallback", async () => {
  const raw = JSON.parse(await readFile(".pi/agent/models.json", "utf8"));
  const config = await repoConfig();

  assert.equal(
    raw.phase_routing_profiles.frontend_implementation.fallbackModelId,
    config.routing_defaults.frontend_worker.fallback_order[1],
  );
});

test("allow_stronger_override must be a boolean when present", async () => {
  const raw = clone(JSON.parse(await readFile(".pi/agent/models.json", "utf8")));
  raw.routing_defaults.frontend_worker.allow_stronger_override = "no";

  assert.throws(() => parseHarnessRoutingConfig(raw), /allow_stronger_override for role frontend_worker must be a boolean/);
});

test("a bare failed id also blocks an unverified lane's fallback and an explicit override of that model", async () => {
  const raw = clone(JSON.parse(await readFile(".pi/agent/models.json", "utf8")));
  raw.phase_routing_profiles.frontend_implementation.verificationStatus = "unverified";
  raw.phase_routing_profiles.frontend_implementation.verifiedModelId = null;
  const lane = resolveHarnessRoute(parseHarnessRoutingConfig(raw), {
    role: "frontend_worker",
    phaseLane: "frontend_implementation",
    failedModels: ["gpt-5.5"],
  });
  const override = resolveHarnessRoute(await repoConfig(), {
    role: "frontend_worker",
    reason: "human_override",
    modelOverride: DEFAULT_HIGH_MODEL,
    failedModels: ["gpt-5.5"],
  });

  assert.equal(lane.selectedModelId, CODING_WORKER_MODEL, "first role fallback that is neither failed nor the unverified target");
  assert.equal(override.selectedModelId, FRONTEND_WORKER_MODEL, "the failed override is refused");
  assert.notEqual(override.source, "explicit_override");
  assert.match(override.blockedAdjustments.join("\n"), /not permitted/);
});

test("budget mode high alone keeps frontend on Opus and still moves backend to the stronger fallback", async () => {
  const config = await repoConfig();
  const frontend = resolveHarnessRoute(config, { role: "frontend_worker", budgetMode: "high" });
  const backend = resolveHarnessRoute(config, { role: "backend_worker", budgetMode: "high" });

  assert.equal(frontend.selectedModelId, FRONTEND_WORKER_MODEL);
  assert.equal(backend.selectedModelId, DEFAULT_HIGH_MODEL);
  assert.equal(backend.source, "stronger_override");
});

test("an unverified lane throws rather than fall back to its own unverified target", async () => {
  const raw = clone(JSON.parse(await readFile(".pi/agent/models.json", "utf8")));
  raw.phase_routing_profiles.frontend_implementation.verificationStatus = "unverified";
  raw.phase_routing_profiles.frontend_implementation.verifiedModelId = null;
  const config = parseHarnessRoutingConfig(raw);
  const failedModels = config.routing_defaults.frontend_worker.fallback_order.filter((modelId) => modelId !== FRONTEND_WORKER_MODEL);

  assert.throws(
    () => resolveHarnessRoute(config, { role: "frontend_worker", phaseLane: "frontend_implementation", failedModels }),
    /on phase lane frontend_implementation/,
  );
});
