import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  buildIssueMaterializationPlan,
  materializeIssueArtifacts,
  parseIssueMaterializationSource,
  type IssueMaterializationSource,
} from "../../.pi/agent/extensions/issue-materialization.ts";
import { decideSliceParallelism } from "../../.pi/agent/extensions/slice-dependency-decision.ts";

const sourceRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function issue(index: number, overrides: Partial<IssueMaterializationSource["issues"][number]> = {}): IssueMaterializationSource["issues"][number] {
  const issueId = `issue-${String(index).padStart(3, "0")}`;
  return {
    issueId,
    title: `Greenfield scaffold slice ${index}`,
    type: index === 1 || index === 5 ? "HITL" : "AFK",
    status: "planned",
    dependencies: index === 2 || index === 3 ? ["issue-001"] : index === 4 ? ["issue-002", "issue-003"] : [],
    userStoriesCovered: [`story-${index}`],
    whatToBuild: `Build bounded scaffold capability ${index}.`,
    acceptanceCriteria: [`slice ${index} has durable artifacts`],
    validationProof: index === 1 || index === 5 ? [] : [`npm run test:issue-materialize -- slice ${index}`],
    domains: [index % 2 === 0 ? "frontend" : "backend"],
    filesToModify: [`app/slice-${String(index).padStart(3, "0")}/index.ts`],
    allowedPaths: [`app/slice-${String(index).padStart(3, "0")}`],
    schemaPaths: [`schemas/slice-${String(index).padStart(3, "0")}.schema.json`],
    migrationPaths: [],
    configPaths: [],
    testPaths: [`tests/slice-${String(index).padStart(3, "0")}.test.ts`],
    fixturePaths: [],
    hitlGates: index === 1 || index === 5 ? ["human approves scaffold direction"] : [],
    queueReadiness: "not_ready",
    ...overrides,
  };
}

function source(overrides: Partial<IssueMaterializationSource> = {}): IssueMaterializationSource {
  return {
    version: 1,
    initiativeId: "greenfield-scaffold",
    source: {
      kind: "g-issues",
      capturedAt: "2026-05-09T00:00:00.000Z",
      approvedBy: "test-approver",
      approvalRef: "approval://phase-a-test",
    },
    issues: Array.from({ length: 18 }, (_, offset) => issue(offset + 1)),
    ...overrides,
  };
}

async function writeSource(cwd: string, value: IssueMaterializationSource): Promise<string> {
  const path = join(cwd, "approved-g-issues.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

test("valid 18-issue input normalizes Phase A issue metadata", () => {
  const parsed = parseIssueMaterializationSource(source());

  assert.equal(parsed.issues.length, 18);
  assert.equal(parsed.issues[1].dependencies[0], "issue-001");
  assert.equal(parsed.issues[2].dependencies[0], "issue-001");
  assert.deepEqual(parsed.issues[3].dependencies, ["issue-002", "issue-003"]);
  assert.ok(parsed.issues.every((entry) => entry.queueReadiness === "not_ready"));
  assert.ok(parsed.issues.some((entry) => entry.type === "HITL"));
  assert.ok(parsed.issues.some((entry) => entry.type === "AFK"));
});

test("source validation rejects missing required issue fields", () => {
  assert.throws(() => parseIssueMaterializationSource(source({ issues: [issue(1, { issueId: "" })] })), /issueId is required/);
  assert.throws(() => parseIssueMaterializationSource(source({ issues: [{ ...issue(1), type: undefined as unknown as "AFK" }] })), /type must be HITL or AFK/);
  const withoutDependencies = { ...issue(1) } as Record<string, unknown>;
  delete withoutDependencies.dependencies;
  assert.throws(() => parseIssueMaterializationSource(source({ issues: [withoutDependencies as IssueMaterializationSource["issues"][number]] })), /dependencies field is required/);
  assert.throws(() => parseIssueMaterializationSource(source({ issues: [issue(1, { acceptanceCriteria: [] })] })), /acceptanceCriteria is required/);
  assert.throws(() => parseIssueMaterializationSource(source({ issues: [issue(2, { validationProof: [] })] })), /AFK issue issue-002 requires validationProof/);
});

test("build plan renders markdown/json artifacts with source hash and Phase B queue-readiness boundary", () => {
  const rawSource = `${JSON.stringify(source(), null, 2)}\n`;
  const plan = buildIssueMaterializationPlan({ source: source(), rawSource, sourcePath: "approved-g-issues.json", now: "2026-05-09T00:00:00.000Z" });

  assert.equal(plan.initiativeId, "greenfield-scaffold");
  assert.match(plan.sourceHash, /^[a-f0-9]{64}$/);
  assert.ok(plan.plannedArtifacts.includes("docs/initiatives/greenfield-scaffold/backlog.md"));
  assert.ok(plan.plannedArtifacts.includes("docs/initiatives/greenfield-scaffold/issues.json"));
  assert.ok(plan.plannedArtifacts.includes("docs/initiatives/greenfield-scaffold/slices/issue-018.summary.json"));
  assert.match(plan.files["docs/initiatives/greenfield-scaffold/backlog.md"], /Issue Materialization Backlog/);
  const issues = JSON.parse(plan.files["docs/initiatives/greenfield-scaffold/issues.json"]);
  assert.equal(issues.issues.length, 18);
  assert.ok(issues.issues.every((entry: { queueReadiness: string }) => entry.queueReadiness === "not_ready"));
  assert.match(plan.files["docs/initiatives/greenfield-scaffold/pipeline.json"], /stitch_prompt/);
  assert.match(plan.files["docs/initiatives/greenfield-scaffold/materialization-runs/run-20260509T000000Z.json"], /sourceHash/);
});

test("dry-run reports planned artifacts and writes no files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "issue-materialize-dry-run-"));
  const sourcePath = await writeSource(cwd, source());

  const result = await materializeIssueArtifacts({ repoRoot: cwd, command: "dry-run", sourcePath, now: "2026-05-09T00:00:00.000Z" });

  assert.equal(result.mode, "dry_run");
  assert.equal(result.writtenArtifacts.length, 0);
  assert.equal((await readdir(cwd)).sort().join(","), "approved-g-issues.json");
});

test("apply writes only initiative artifacts, refuses overwrite, and does not mutate runtime state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "issue-materialize-apply-"));
  const sourcePath = await writeSource(cwd, source());

  const result = await materializeIssueArtifacts({ repoRoot: cwd, command: "apply", sourcePath, now: "2026-05-09T00:00:00.000Z" });

  assert.equal(result.mode, "apply");
  assert.equal(result.writtenArtifacts.length, result.plannedArtifacts.length);
  assert.ok(result.writtenArtifacts.every((artifact) => artifact.startsWith("docs/initiatives/greenfield-scaffold/")));
  assert.equal(JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/issues.json"), "utf8")).issues.length, 18);
  assert.equal(JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/slices/issue-002.summary.json"), "utf8")).summary.sliceId, "issue-002");
  await assert.rejects(
    materializeIssueArtifacts({ repoRoot: cwd, command: "apply", sourcePath, now: "2026-05-09T00:00:00.000Z" }),
    /Refusing to overwrite existing initiative artifacts/,
  );
  await assert.rejects(readFile(join(cwd, ".pi/agent/state/runtime/queue.json"), "utf8"), /ENOENT/);
});

test("generated slice summaries are compatible with slice-dependencies parallel-safety checks", () => {
  const plan = buildIssueMaterializationPlan({ source: source(), rawSource: JSON.stringify(source()), sourcePath: "approved-g-issues.json", now: "2026-05-09T00:00:00.000Z" });
  const left = JSON.parse(plan.files["docs/initiatives/greenfield-scaffold/slices/issue-002.summary.json"]).summary;
  const right = JSON.parse(plan.files["docs/initiatives/greenfield-scaffold/slices/issue-003.summary.json"]).summary;
  const allowed = decideSliceParallelism({ slices: [left, right] });
  const conservative = decideSliceParallelism({ slices: [{ sliceId: "issue-x", filesToModify: ["app/x.ts"] }, { sliceId: "issue-y", allowedPaths: ["app/y"] }] });

  assert.equal(allowed.parallelAllowed, true);
  assert.equal(conservative.parallelAllowed, false);
  assert.ok(conservative.blockers.some((blocker) => /Missing allowedPaths proof|Missing filesToModify proof/.test(blocker.reason)));
});

test("issue materialization schema declares stable source and queue-readiness contract", async () => {
  const schema = JSON.parse(await readFile(join(sourceRepoRoot, ".pi", "agent", "state", "schemas", "issue-materialization-source.schema.json"), "utf8"));
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.properties.issues.items.properties.type.enum, ["HITL", "AFK"]);
  assert.equal(schema.properties.issues.items.properties.queueReadiness.const, "not_ready");
  for (const required of ["issueId", "title", "type", "dependencies", "acceptanceCriteria", "validationProof", "filesToModify", "allowedPaths"]) {
    assert.ok(schema.properties.issues.items.required.includes(required), required);
  }
});

test("helper source stays bounded away from queue, task packet, worker, and runtime mutation APIs", async () => {
  const helperSource = await readFile(join(sourceRepoRoot, ".pi", "agent", "extensions", "issue-materialization.ts"), "utf8");
  assert.doesNotMatch(helperSource, /run_next_queue_job|task_update|generate_task_packet|worker-session|queue\.json|tasks\.json|\.pi\/agent\/state\/runtime/);
});
