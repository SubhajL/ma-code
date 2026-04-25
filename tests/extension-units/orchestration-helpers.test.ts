import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { parseHarnessRoutingConfig, resolveHarnessRoute } from "../../.pi/agent/extensions/harness-routing.ts";
import { parseActivationPolicy, parseTeamDefinition, resolveTeamActivation } from "../../.pi/agent/extensions/team-activation.ts";
import { generateTaskPacket, parsePacketPolicy, validateTaskPacketShape } from "../../.pi/agent/extensions/task-packets.ts";
import { generateHandoff, parseHandoffPolicy, validateStructuredHandoff } from "../../.pi/agent/extensions/handoffs.ts";

async function readFixture(relativePath: string): Promise<string> {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  return readFile(url, "utf8");
}

test("harness-routing resolves backend budget pressure to mini model with calibrated minimal thinking", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const result = resolveHarnessRoute(config, {
    role: "backend_worker",
    reason: "budget_pressure",
    budgetMode: "conserve",
  });

  assert.equal(result.selectedModelId, "openai-codex/gpt-5.4-mini");
  assert.equal(result.source, "budget_override");
  assert.equal(result.thinking, "minimal");
});


test("harness-routing keeps critical roles at high thinking under cost pressure", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const result = resolveHarnessRoute(config, {
    role: "orchestrator",
    reason: "budget_pressure",
    budgetMode: "conserve",
  });

  assert.equal(result.selectedModelId, "openai-codex/gpt-5.4");
  assert.equal(result.thinking, "high");
  assert.match(result.blockedAdjustments.join("\n"), /budget_pressure/);
});


test("harness-routing raises cheaper build-worker defaults back to high thinking for harder tasks", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const result = resolveHarnessRoute(config, {
    role: "frontend_worker",
    reason: "task_harder",
    budgetMode: "high",
  });

  assert.equal(result.selectedModelId, "anthropic/claude-sonnet-4-6");
  assert.equal(result.source, "stronger_override");
  assert.equal(result.thinking, "high");
});

test("harness-routing allows build lead budget pressure to use the mini override", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const result = resolveHarnessRoute(config, {
    role: "build_lead",
    reason: "budget_pressure",
    budgetMode: "conserve",
  });

  assert.equal(result.selectedModelId, "openai-codex/gpt-5.4-mini");
  assert.equal(result.source, "budget_override");
  assert.equal(result.thinking, "minimal");
});

test("team-activation resolves a planning-first path for ambiguous mixed work", async () => {
  const policy = parseActivationPolicy(JSON.parse(await readFixture(".pi/agent/teams/activation-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  const result = resolveTeamActivation(policy, teams, {
    workType: "mixed",
    requirementsClarity: "ambiguous",
    scopeClarity: "unclear",
    acceptanceCriteria: "missing",
    repoImpact: "unclear",
    domains: ["backend", "infra"],
  });

  assert.equal(result.initialTeam, "planning");
  assert.deepEqual(result.sequence, ["planning"]);
  assert.match(result.policyNotes.join("\n"), /planning/i);
});

test("task-packets generates a valid packet from real policies", async () => {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const packetPolicy = parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  const generated = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "harness-037",
    parentTaskId: null,
    parentPacketId: null,
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Add extension unit tests",
    goal: "Prove task packets keep planning-completeness details explicit.",
    scope: "tests only under tests/extension-units",
    nonGoals: ["Do not change runtime routing behavior."],
    workType: "implementation",
    domains: ["backend"],
    filesToInspect: ["tests/extension-units/orchestration-helpers.test.ts", ".pi/agent/extensions/task-packets.ts"],
    filesToModify: ["tests/extension-units/orchestration-helpers.test.ts"],
    allowedPaths: ["tests/extension-units", "scripts"],
    acceptanceCriteria: ["Unit tests exist and pass"],
    expectedProof: ["Targeted extension unit test output shows PASS."],
    migrationPathNote: "Not applicable; tighten the existing task-packet contract in place.",
    dependencies: [],
    routeReason: "budget_pressure",
    budgetMode: "conserve",
  });

  validateTaskPacketShape(generated.packet);
  assert.equal(generated.packet.assignedRole, "backend_worker");
  assert.equal(generated.packet.goal, "Prove task packets keep planning-completeness details explicit.");
  assert.deepEqual(generated.packet.filesToModify, ["tests/extension-units/orchestration-helpers.test.ts"]);
  assert.equal(generated.packet.routing.selectedModelId, "openai-codex/gpt-5.4-mini");
  assert.match(generated.packet.packetId, /^packet-backend-worker-harness-037-/);
  assert.match(generated.renderedPacket, /## Files to Inspect/);
});

test("task-packets default planning-completeness fields remain explicit for bounded build work", async () => {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const packetPolicy = parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  const generated = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "harness-044",
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Tighten task packet defaults",
    scope: "Only change task-packet policy and generator surfaces.",
    workType: "implementation",
    domains: ["backend"],
    allowedPaths: [".pi/agent/extensions/task-packets.ts", ".pi/agent/packets/packet-policy.json"],
    acceptanceCriteria: ["packet defaults remain explicit and bounded"],
  });

  validateTaskPacketShape(generated.packet);
  assert.equal(generated.packet.goal, "Tighten task packet defaults");
  assert.ok(generated.packet.nonGoals.length >= 1);
  assert.deepEqual(generated.packet.filesToInspect, [".pi/agent/extensions/task-packets.ts", ".pi/agent/packets/packet-policy.json"]);
  assert.deepEqual(generated.packet.filesToModify, [".pi/agent/extensions/task-packets.ts", ".pi/agent/packets/packet-policy.json"]);
  assert.ok(generated.packet.expectedProof.length >= 1);
  assert.match(generated.packet.migrationPathNote, /Not applicable/);
});

test("handoffs preserve packet structure for worker-to-quality flow", async () => {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const packetPolicy = parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json")));
  const handoffPolicy = parseHandoffPolicy(JSON.parse(await readFixture(".pi/agent/handoffs/handoff-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  const { packet } = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "harness-037",
    parentTaskId: null,
    parentPacketId: null,
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Add extension unit tests",
    scope: "tests only under tests/extension-units",
    workType: "implementation",
    domains: ["backend"],
    allowedPaths: ["tests/extension-units", "scripts"],
    acceptanceCriteria: ["Unit tests exist and pass"],
    dependencies: [],
  });

  const generated = generateHandoff(handoffPolicy, {
    handoffType: "worker_to_quality",
    sourcePacket: packet,
    fromRole: "backend_worker",
    toRole: "quality_lead",
    changedFiles: ["tests/extension-units/till-done.test.ts"],
    acceptanceCoverage: ["Implementation task validation gate covered"],
    evidence: ["node --test output PASS"],
  });

  validateStructuredHandoff(generated.handoff);
  assert.equal(generated.handoff.preservedPacket.scope, packet.scope);
  assert.equal(generated.handoff.details.changedFiles[0], "tests/extension-units/till-done.test.ts");
  assert.match(generated.renderedHandoff, /## Work Summary/);
});
