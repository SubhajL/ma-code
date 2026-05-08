import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { decideSliceParallelism, type SliceDependencySummary } from "../../.pi/agent/extensions/slice-dependency-decision.ts";

const sourceRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function slice(overrides: Partial<SliceDependencySummary> = {}): SliceDependencySummary {
  const id = overrides.sliceId ?? "slice-001";
  return {
    sliceId: id,
    filesToModify: [`app/${id}/feature.ts`],
    allowedPaths: [`app/${id}`],
    contracts: [{ path: `docs/initiatives/demo/contracts/${id}.contract.json`, hash: `${id}-hash` }],
    schemaPaths: [`schemas/${id}.schema.json`],
    migrationPaths: [`migrations/${id}.sql`],
    configPaths: [`config/${id}.json`],
    testPaths: [`tests/${id}.test.ts`],
    fixturePaths: [`tests/fixtures/${id}.json`],
    ...overrides,
  };
}

function blockerTypesFor(decision: ReturnType<typeof decideSliceParallelism>): string[] {
  return decision.blockers.map((blocker) => blocker.type);
}

test("shared filesToModify paths block parallelism", () => {
  const decision = decideSliceParallelism({
    slices: [
      slice({ sliceId: "slice-001", filesToModify: ["app/checkout/page.tsx"] }),
      slice({ sliceId: "slice-002", filesToModify: ["app/checkout/page.tsx"] }),
    ],
  });

  assert.equal(decision.parallelAllowed, false);
  assert.equal(decision.decision, "blocked");
  assert.equal(decision.recommendedExecution, "sequential");
  assert.equal(decision.proof.disjointFilesToModify, false);
  assert.ok(decision.blockers.some((blocker) => blocker.type === "shared_file" && blocker.paths.includes("app/checkout/page.tsx")));
});

test("fully disjoint slices are parallel candidates", () => {
  const decision = decideSliceParallelism({ slices: [slice({ sliceId: "slice-001" }), slice({ sliceId: "slice-002" })] });

  assert.equal(decision.parallelAllowed, true);
  assert.equal(decision.decision, "allowed");
  assert.deepEqual(decision.sliceIds, ["slice-001", "slice-002"]);
  assert.equal(decision.recommendedExecution, "parallel_candidate");
  assert.deepEqual(decision.blockers, []);
  assert.deepEqual(decision.proof, {
    distinctSlices: true,
    disjointFilesToModify: true,
    disjointAllowedPaths: true,
    disjointContracts: true,
    noSharedSchemaOrMigration: true,
    noSharedConfig: true,
    noSharedTestsOrFixtures: true,
    leaseConflictCheckAvailable: false,
  });
});

test("same-slice comparison always blocks", () => {
  const decision = decideSliceParallelism({ slices: [slice({ sliceId: "slice-001" }), slice({ sliceId: "slice-001", filesToModify: ["other/file.ts"], allowedPaths: ["other"] })] });

  assert.equal(decision.parallelAllowed, false);
  assert.ok(blockerTypesFor(decision).includes("same_slice"));
  assert.equal(decision.proof.distinctSlices, false);
});

test("fewer than two slice artifacts blocks", () => {
  const decision = decideSliceParallelism({ slices: [slice({ sliceId: "slice-001" })] });

  assert.equal(decision.parallelAllowed, false);
  assert.equal(decision.proof.distinctSlices, false);
  assert.ok(decision.blockers.some((blocker) => blocker.type === "missing_proof" && /At least two/.test(blocker.reason)));
});

test("missing artifact and missing required path proof block", () => {
  const decision = decideSliceParallelism({
    slices: [
      { artifactPath: "docs/initiatives/demo/packets/missing.packet.json", missing: true },
      { sliceId: "slice-002", filesToModify: ["app/two.ts"] },
      { sliceId: "slice-003", allowedPaths: ["app/three"] },
    ],
  });

  assert.equal(decision.parallelAllowed, false);
  assert.equal(decision.proof.distinctSlices, false);
  assert.equal(decision.proof.disjointFilesToModify, false);
  assert.equal(decision.proof.disjointAllowedPaths, false);
  assert.equal(blockerTypesFor(decision).filter((type) => type === "missing_proof").length, 3);
  assert.match(decision.blockers.map((blocker) => blocker.reason).join("\n"), /Missing slice artifact/);
  assert.match(decision.blockers.map((blocker) => blocker.reason).join("\n"), /Missing allowedPaths proof for slice-002/);
  assert.match(decision.blockers.map((blocker) => blocker.reason).join("\n"), /Missing filesToModify proof for slice-003/);
});

test("overlapping mutating allowedPaths block, but read-only overlaps are allowed", () => {
  const blocked = decideSliceParallelism({
    slices: [
      slice({ sliceId: "slice-001", allowedPaths: ["app/shared"] }),
      slice({ sliceId: "slice-002", allowedPaths: ["app/shared/components"] }),
    ],
  });
  assert.equal(blocked.parallelAllowed, false);
  assert.equal(blocked.proof.disjointFilesToModify, true);
  assert.equal(blocked.proof.disjointAllowedPaths, false);
  assert.ok(blocked.blockers.some((blocker) => blocker.type === "shared_file" && /allowedPaths/.test(blocker.reason)));

  const allowed = decideSliceParallelism({
    slices: [
      slice({ sliceId: "slice-001", allowedPaths: [{ path: "app/shared", access: "read_only" }] }),
      slice({ sliceId: "slice-002", allowedPaths: ["app/shared/components"] }),
    ],
  });
  assert.equal(allowed.parallelAllowed, true);
  assert.equal(allowed.proof.disjointAllowedPaths, true);
});

test("shared contract path or hash blocks", () => {
  const pathDecision = decideSliceParallelism({
    slices: [
      slice({ sliceId: "slice-001", contracts: [{ path: "docs/contracts/shared.contract.json", hash: "a" }] }),
      slice({ sliceId: "slice-002", contracts: [{ path: "docs/contracts/shared.contract.json", hash: "b" }] }),
    ],
  });
  assert.equal(pathDecision.parallelAllowed, false);
  assert.equal(pathDecision.proof.disjointContracts, false);
  assert.ok(blockerTypesFor(pathDecision).includes("shared_contract"));

  const hashDecision = decideSliceParallelism({
    slices: [
      slice({ sliceId: "slice-001", contracts: [{ path: "docs/contracts/one.contract.json", hash: "shared-hash" }] }),
      slice({ sliceId: "slice-002", contracts: [{ path: "docs/contracts/two.contract.json", hash: "shared-hash" }] }),
    ],
  });
  assert.equal(hashDecision.parallelAllowed, false);
  assert.equal(hashDecision.proof.disjointContracts, false);
  assert.ok(hashDecision.blockers.some((blocker) => blocker.paths.includes("hash:shared-hash")));
});

test("shared schema, migration, config, test, or fixture paths block", () => {
  const cases: Array<{ label: string; overrides: [Partial<SliceDependencySummary>, Partial<SliceDependencySummary>]; blockerType: string; proofKey: keyof ReturnType<typeof decideSliceParallelism>["proof"] }> = [
    { label: "schema", overrides: [{ schemaPaths: ["schemas/shared.json"] }, { schemaPaths: ["schemas/shared.json"] }], blockerType: "shared_schema", proofKey: "noSharedSchemaOrMigration" },
    { label: "migration", overrides: [{ migrationPaths: ["migrations/shared.sql"] }, { migrationPaths: ["migrations/shared.sql"] }], blockerType: "shared_schema", proofKey: "noSharedSchemaOrMigration" },
    { label: "config", overrides: [{ configPaths: ["config/shared.json"] }, { configPaths: ["config/shared.json"] }], blockerType: "shared_config", proofKey: "noSharedConfig" },
    { label: "test", overrides: [{ testPaths: ["tests/shared.test.ts"] }, { testPaths: ["tests/shared.test.ts"] }], blockerType: "shared_test", proofKey: "noSharedTestsOrFixtures" },
    { label: "fixture", overrides: [{ fixturePaths: ["tests/fixtures/shared.json"] }, { fixturePaths: ["tests/fixtures/shared.json"] }], blockerType: "shared_test", proofKey: "noSharedTestsOrFixtures" },
  ];

  for (const testCase of cases) {
    const decision = decideSliceParallelism({ slices: [slice({ sliceId: "slice-001", ...testCase.overrides[0] }), slice({ sliceId: "slice-002", ...testCase.overrides[1] })] });
    assert.equal(decision.parallelAllowed, false, testCase.label);
    assert.ok(blockerTypesFor(decision).includes(testCase.blockerType), testCase.label);
    assert.equal(decision.proof[testCase.proofKey], false, testCase.label);
  }
});

test("unknown lease conflict state blocks only when scheduling readiness is requested", () => {
  const advisory = decideSliceParallelism({ slices: [slice({ sliceId: "slice-001" }), slice({ sliceId: "slice-002" })] });
  assert.equal(advisory.parallelAllowed, true);
  assert.equal(advisory.proof.leaseConflictCheckAvailable, false);

  const scheduling = decideSliceParallelism({ schedulingReadiness: true, slices: [slice({ sliceId: "slice-001" }), slice({ sliceId: "slice-002" })] });
  assert.equal(scheduling.parallelAllowed, false);
  assert.equal(scheduling.proof.leaseConflictCheckAvailable, false);
  assert.ok(blockerTypesFor(scheduling).includes("lease_conflict_unknown"));

  const checked = decideSliceParallelism({ schedulingReadiness: true, leaseConflictCheckAvailable: true, slices: [slice({ sliceId: "slice-001" }), slice({ sliceId: "slice-002" })] });
  assert.equal(checked.parallelAllowed, true);
  assert.equal(checked.proof.leaseConflictCheckAvailable, true);
});

test("decision schema declares blocker/proof/output contract", async () => {
  const schema = JSON.parse(await readFile(join(sourceRepoRoot, ".pi", "agent", "state", "schemas", "slice-dependency-decision.schema.json"), "utf8"));
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.properties.decision.enum, ["blocked", "allowed"]);
  for (const type of ["shared_file", "shared_contract", "shared_schema", "shared_config", "shared_test", "same_slice", "missing_proof", "lease_conflict_unknown"]) {
    assert.ok(schema.$defs.blocker.properties.type.enum.includes(type), type);
  }
  for (const key of ["distinctSlices", "disjointFilesToModify", "disjointAllowedPaths", "disjointContracts", "noSharedSchemaOrMigration", "noSharedConfig", "noSharedTestsOrFixtures", "leaseConflictCheckAvailable"]) {
    assert.ok(schema.$defs.proof.required.includes(key), key);
  }
});

test("helper source stays pure and avoids queue, lease, task, or filesystem mutation", async () => {
  const source = await readFile(join(sourceRepoRoot, ".pi", "agent", "extensions", "slice-dependency-decision.ts"), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:fs|from\s+["']node:fs\/promises|writeFile|mkdir|task_update|run_next_queue_job|acquireLease|claimExecutionLease/);
});
