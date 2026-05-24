import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { parseHarnessRoutingConfig, resolveHarnessRoute } from "../../.pi/agent/extensions/harness-routing.ts";
import { parseActivationPolicy, parseTeamDefinition, resolveTeamActivation } from "../../.pi/agent/extensions/team-activation.ts";
import { generateTaskPacket, parsePacketPolicy, validateTaskPacketShape } from "../../.pi/agent/extensions/packets.ts";
import { generateHandoff, parseHandoffPolicy, validateStructuredHandoff } from "../../.pi/agent/extensions/handoffs.ts";

async function readFixture(relativePath: string): Promise<string> {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  return readFile(url, "utf8");
}

function implementationTddSlice(label: string, boundaryDependencies: string[] = [".pi/agent/extensions/task-packets.ts"]): {
  firstTracerBehavior: string;
  publicInterface: string;
  testSurface: string[];
  boundaryDependencies: string[];
  mockPlan: string;
  outOfScopeBehaviors: string[];
} {
  return {
    firstTracerBehavior: `${label} starts with one observable implementation behavior before broader changes.`,
    publicInterface: "generate_task_packet plus the rendered packet/handoff output",
    testSurface: ["tests/extension-units/orchestration-helpers.test.ts", "scripts/validate-task-packets.sh"],
    boundaryDependencies,
    mockPlan: "Reuse real routing/team/policy fixtures only; no extra mocks.",
    outOfScopeBehaviors: ["Do not widen beyond this bounded implementation slice.", "Do not require TDD metadata outside implementation packets."],
  };
}

test("harness-routing resolves backend budget pressure to mini model with calibrated minimal thinking", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const result = resolveHarnessRoute(config, {
    role: "backend_worker",
    reason: "budget_pressure",
    budgetMode: "conserve",
  });

  assert.equal(result.selectedModelId, "github-copilot/gpt-5.4-mini");
  assert.equal(result.source, "budget_override");
  assert.equal(result.thinking, "low");
});


test("harness-routing keeps critical roles at high thinking under cost pressure", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const result = resolveHarnessRoute(config, {
    role: "orchestrator",
    reason: "budget_pressure",
    budgetMode: "conserve",
  });

  assert.equal(result.selectedModelId, "openai-codex/gpt-5.5");
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

  assert.equal(result.selectedModelId, "openai-codex/gpt-5.5");
  assert.equal(result.source, "stronger_override");
  assert.equal(result.thinking, "xhigh");
});

test("harness-routing allows build lead budget pressure to use the mini override", async () => {
  const config = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const result = resolveHarnessRoute(config, {
    role: "build_lead",
    reason: "budget_pressure",
    budgetMode: "conserve",
  });

  assert.equal(result.selectedModelId, "github-copilot/gpt-5.4-mini");
  assert.equal(result.source, "budget_override");
  assert.equal(result.thinking, "low");
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
  assert.match(result.policyNotes.join("\n"), /Mixed-domain work/i);
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
    tddSlice: implementationTddSlice("Add extension unit tests", [".pi/agent/extensions/task-packets.ts", "tests/extension-units/orchestration-helpers.test.ts"]),
    dependencies: [],
    routeReason: "budget_pressure",
    budgetMode: "conserve",
  });

  validateTaskPacketShape(generated.packet);
  assert.equal(generated.packet.assignedRole, "backend_worker");
  assert.equal(generated.packet.goal, "Prove task packets keep planning-completeness details explicit.");
  assert.deepEqual(generated.packet.filesToModify, ["tests/extension-units/orchestration-helpers.test.ts"]);
  assert.equal(generated.packet.routing.selectedModelId, "github-copilot/gpt-5.4-mini");
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
    tddSlice: implementationTddSlice("Tighten task packet defaults", [".pi/agent/extensions/task-packets.ts", ".pi/agent/packets/packet-policy.json"]),
  });

  validateTaskPacketShape(generated.packet);
  assert.equal(generated.packet.goal, "Tighten task packet defaults");
  assert.ok(generated.packet.nonGoals.length >= 1);
  assert.deepEqual(generated.packet.filesToInspect, [".pi/agent/extensions/task-packets.ts", ".pi/agent/packets/packet-policy.json"]);
  assert.deepEqual(generated.packet.filesToModify, [".pi/agent/extensions/task-packets.ts", ".pi/agent/packets/packet-policy.json"]);
  assert.ok(generated.packet.expectedProof.length >= 1);
  assert.match(generated.packet.migrationPathNote, /Not applicable/);
});

test("task packets and handoffs preserve optional Graphify evidence", async () => {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const packetPolicy = parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json")));
  const handoffPolicy = parseHandoffPolicy(JSON.parse(await readFixture(".pi/agent/handoffs/handoff-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  const packetGraphifyEvidence = {
    graphifyBackedClaim: true,
    claimScope: "graphify_backed_claim",
    policy: "required_for_graphify_backed_claims",
    required: true,
    latestRelevantGraphQueried: true,
    importantClaimsSourceVerified: true,
    graphifyValidationState: "pass",
    graphifyOrchestrationAction: "query_graph",
    graphifyAdapterAction: "query",
    graphifyArtifactPath: ".pi/agent/artifacts/graphify/task-graphify-evidence/graph.json",
    sourceVerificationNotes: ["Verified architecture claim against .pi/agent/extensions/task-packets.ts"],
  };

  const generated = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "harness-graphify-evidence",
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Carry Graphify proof through packets",
    scope: "Only packet and handoff Graphify evidence fields.",
    workType: "implementation",
    domains: ["backend"],
    allowedPaths: [".pi/agent/extensions/task-packets.ts", ".pi/agent/extensions/handoffs.ts"],
    acceptanceCriteria: ["Graphify evidence is preserved in packet and handoff output"],
    tddSlice: implementationTddSlice("Carry Graphify proof through packets", [".pi/agent/extensions/task-packets.ts", ".pi/agent/extensions/handoffs.ts"]),
    graphifyEvidence: packetGraphifyEvidence,
  } as any);

  validateTaskPacketShape(generated.packet);
  assert.deepEqual((generated.packet as any).graphifyEvidence, packetGraphifyEvidence);
  assert.match(generated.renderedPacket, /## Graphify Evidence/);
  assert.match(generated.renderedPacket, /graphify validation state: pass/);
  assert.match(generated.renderedPacket, /graphify adapter action: query/);

  const handoffGraphifyEvidence = {
    graphifyValidationState: "pass",
    latestRelevantGraphQueried: true,
    importantClaimsSourceVerified: true,
    sourceVerificationNotes: ["Quality handoff preserved source verification proof."],
  };

  const handoff = generateHandoff(handoffPolicy, {
    handoffType: "worker_to_quality",
    sourcePacket: generated.packet,
    fromRole: "backend_worker",
    toRole: "quality_lead",
    changedFiles: [".pi/agent/extensions/task-packets.ts", ".pi/agent/extensions/handoffs.ts"],
    acceptanceCoverage: ["Graphify evidence fields are preserved through worker handoff."],
    evidence: ["targeted orchestration helper test output PASS"],
    commandsRun: ["npx --yes tsx --test tests/extension-units/orchestration-helpers.test.ts"],
    wiringVerification: ["generate_handoff preserves packet Graphify evidence and detail Graphify evidence."],
    graphifyEvidence: handoffGraphifyEvidence,
  } as any);

  validateStructuredHandoff(handoff.handoff);
  assert.deepEqual((handoff.handoff.preservedPacket as any).graphifyEvidence, packetGraphifyEvidence);
  assert.deepEqual((handoff.handoff.details as any).graphifyEvidence, handoffGraphifyEvidence);
  assert.match(handoff.renderedHandoff, /## Graphify Evidence/);
  assert.match(handoff.renderedHandoff, /Quality handoff preserved source verification proof/);
});

test("task packets and handoffs preserve optional TDD slice", async () => {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const packetPolicy = parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json")));
  const handoffPolicy = parseHandoffPolicy(JSON.parse(await readFixture(".pi/agent/handoffs/handoff-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  const tddSlice = {
    firstTracerBehavior: "Generating a build packet preserves the first observable behavior to implement.",
    publicInterface: "generate_task_packet and the rendered packet markdown",
    testSurface: ["tests/extension-units/orchestration-helpers.test.ts", "scripts/validate-task-packets.sh"],
    boundaryDependencies: [".pi/agent/extensions/task-packets.ts", ".pi/agent/extensions/handoffs.ts"],
    mockPlan: "No extra mocks; reuse real routing/team/policy fixtures only.",
    outOfScopeBehaviors: ["Do not add queue/runtime gating in this slice.", "Do not require TDD metadata outside implementation packets."],
  };

  const generated = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "harness-tdd-slice",
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Carry TDD slice through packets",
    scope: "Only packet and handoff TDD slice fields.",
    workType: "implementation",
    domains: ["backend"],
    allowedPaths: [".pi/agent/extensions/task-packets.ts", ".pi/agent/extensions/handoffs.ts"],
    acceptanceCriteria: ["TDD slice is preserved in packet and handoff output"],
    tddSlice,
  } as any);

  validateTaskPacketShape(generated.packet);
  assert.deepEqual((generated.packet as any).tddSlice, tddSlice);
  assert.match(generated.renderedPacket, /## TDD Slice/);
  assert.match(generated.renderedPacket, /first tracer behavior: Generating a build packet preserves the first observable behavior to implement\./);
  assert.match(generated.renderedPacket, /public interface: generate_task_packet and the rendered packet markdown/);

  const handoff = generateHandoff(handoffPolicy, {
    handoffType: "worker_to_quality",
    sourcePacket: generated.packet,
    fromRole: "backend_worker",
    toRole: "quality_lead",
    changedFiles: [".pi/agent/extensions/task-packets.ts", ".pi/agent/extensions/handoffs.ts"],
    acceptanceCoverage: ["TDD slice fields are preserved through worker handoff."],
    evidence: ["targeted orchestration helper test output PASS"],
    commandsRun: ["npx --yes tsx --test tests/extension-units/orchestration-helpers.test.ts"],
    wiringVerification: ["generate_handoff preserves packet TDD slice evidence."],
  } as any);

  validateStructuredHandoff(handoff.handoff);
  assert.deepEqual((handoff.handoff.preservedPacket as any).tddSlice, tddSlice);
  assert.match(handoff.renderedHandoff, /## TDD Slice/);
  assert.match(handoff.renderedHandoff, /mock plan: No extra mocks; reuse real routing\/team\/policy fixtures only\./);
});

test("implementation task packets require a TDD slice", async () => {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const packetPolicy = parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  assert.throws(
    () => generateTaskPacket(packetPolicy, teams, routingConfig, {
      sourceGoalId: "harness-tdd-required",
      assignedTeam: "build",
      assignedRole: "backend_worker",
      title: "Reject missing implementation TDD slice",
      scope: "Only prove implementation packets require explicit TDD metadata.",
      workType: "implementation",
      domains: ["backend"],
      allowedPaths: [".pi/agent/extensions/task-packets.ts"],
      acceptanceCriteria: ["implementation packets without tddSlice are rejected"],
    }),
    /implementation packets require tddSlice/i,
  );
});

test("non-implementation task packets remain valid without a TDD slice", async () => {
  const routingConfig = parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json")));
  const packetPolicy = parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json")));
  const teams = {
    planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
    build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
    quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
    recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
  };

  const generated = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "harness-tdd-optional-non-implementation",
    assignedTeam: "planning",
    assignedRole: "planning_lead",
    title: "Allow missing TDD slice for planning work",
    scope: "Only prove non-implementation packets still allow omitted TDD metadata.",
    workType: "mixed",
    domains: ["research"],
    allowedPaths: ["README.md"],
    acceptanceCriteria: ["non-implementation packets still validate without tddSlice"],
  });

  validateTaskPacketShape(generated.packet);
  assert.equal((generated.packet as any).tddSlice ?? null, null);
  assert.match(generated.renderedPacket, /## TDD Slice/);
  assert.match(generated.renderedPacket, /- none/);
});

test("handoffs preserve stronger planning context for worker-to-quality flow", async () => {
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
    goal: "Preserve stronger packet context through quality handoffs.",
    scope: "tests only under tests/extension-units",
    nonGoals: ["Do not change runtime queue behavior."],
    workType: "implementation",
    domains: ["backend"],
    filesToInspect: ["tests/extension-units/orchestration-helpers.test.ts", ".pi/agent/extensions/handoffs.ts"],
    filesToModify: ["tests/extension-units/orchestration-helpers.test.ts"],
    allowedPaths: ["tests/extension-units", "scripts"],
    acceptanceCriteria: ["Unit tests exist and pass"],
    expectedProof: ["Generated handoff output includes quality-facing scope and proof context."],
    migrationPathNote: "Not applicable; improve the current handoff contract in place.",
    tddSlice: implementationTddSlice("Preserve stronger packet context through quality handoffs", [".pi/agent/extensions/handoffs.ts", "tests/extension-units/orchestration-helpers.test.ts"]),
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
    commandsRun: ["bash scripts/validate-extension-unit-tests.sh"],
    wiringVerification: ["generate_handoff preserved packet wiring checks"],
  });

  validateStructuredHandoff(generated.handoff);
  assert.equal(generated.handoff.preservedPacket.scope, packet.scope);
  assert.deepEqual(generated.handoff.preservedPacket.filesToInspect, ["tests/extension-units/orchestration-helpers.test.ts", ".pi/agent/extensions/handoffs.ts"]);
  assert.equal(generated.handoff.details.changedFiles[0], "tests/extension-units/till-done.test.ts");
  assert.match(generated.renderedHandoff, /## Work Summary/);
  assert.match(generated.renderedHandoff, /## Scope Boundaries/);
  assert.match(generated.renderedHandoff, /## Evidence Expectations/);
});

test("quality-to-validator and recovery handoffs require stronger validation and migration structure", async () => {
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
    sourceGoalId: "harness-045",
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Tighten handoff completeness",
    scope: "Only change handoff policy, templates, and validation surfaces.",
    workType: "implementation",
    domains: ["backend"],
    allowedPaths: [".pi/agent/extensions/handoffs.ts", ".pi/agent/handoffs/handoff-policy.json"],
    acceptanceCriteria: ["handoff structure is stronger and still readable"],
    tddSlice: implementationTddSlice("Tighten handoff completeness", [".pi/agent/extensions/handoffs.ts", ".pi/agent/handoffs/handoff-policy.json"]),
  });

  const validatorHandoff = generateHandoff(handoffPolicy, {
    handoffType: "quality_to_validator",
    sourcePacket: packet,
    fromRole: "quality_lead",
    toRole: "validator_worker",
    validationScope: ["validate stronger quality/recovery handoff completeness"],
    expectedProof: ["validator output names missing structure clearly"],
    validationQuestions: ["Does the handoff preserve scope boundaries, wiring checks, and exact proof expectations?"],
    knownGaps: ["Validator should challenge whether any proof or review-risk wording remains too vague."],
  });

  validateStructuredHandoff(validatorHandoff.handoff);
  assert.match(validatorHandoff.renderedHandoff, /## Validation Questions/);
  assert.match(validatorHandoff.renderedHandoff, /## Wiring Checks/);

  const recoveryPacket = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "harness-045",
    assignedTeam: "recovery",
    assignedRole: "recovery_worker",
    title: "Escalate architectural drift",
    scope: "Recovery review only.",
    workType: "review_only",
    domains: ["research"],
    allowedPaths: [".pi/agent/extensions/handoffs.ts"],
    acceptanceCriteria: ["recovery recommendation is explicit"],
    migrationPathNote: "If escalation is chosen, keep migration bounded: tighten templates and validator first, then broaden runtime only if proof remains insufficient.",
  });

  const recoveryHandoff = generateHandoff(handoffPolicy, {
    handoffType: "recovery_to_orchestrator_or_lead",
    sourcePacket: recoveryPacket.packet,
    fromRole: "recovery_worker",
    toRole: "orchestrator",
    failureType: "architecture_drift",
    likelyCauses: ["handoff structure did not preserve enough review context"],
    recoveryOptions: ["tighten templates and validator", "escalate with bounded migration note"],
    recommendedAction: "escalate",
    migrationPathNote: "Escalate only with bounded migration: tighten handoff templates and validator now, then revisit broader orchestration only if drift persists.",
    stopThreshold: "stop after one more contradictory architectural escalation without stronger proof",
  });

  validateStructuredHandoff(recoveryHandoff.handoff);
  assert.match(recoveryHandoff.renderedHandoff, /## Migration Path Note/);
});
