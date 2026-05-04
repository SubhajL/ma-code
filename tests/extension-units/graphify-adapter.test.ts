import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import graphifyAdapter from "../../.pi/agent/extensions/graphify-adapter.ts";
import { FakePi, makeCtx, makeTempRepo, textContent } from "./test-utils.ts";

async function withEnv<T>(updates: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(updates)) {
    previous.set(key, process.env[key]);
    if (updates[key] === undefined) delete process.env[key];
    else process.env[key] = updates[key];
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function makeFakeGraphifyBinary(scriptBody = "") {
  const binDir = await mkdtemp(join(tmpdir(), "fake-graphify-bin-"));
  const binaryPath = join(binDir, "graphify");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node\n${scriptBody || "console.log(JSON.stringify({ ok: true, argv: process.argv.slice(2) }));\n"}`,
  );
  await chmod(binaryPath, 0o755);
  return { binDir, binaryPath };
}

function registerGraphifyTool() {
  const pi = new FakePi("feat/graphify-adapter");
  graphifyAdapter(pi as any);
  return pi.getTool("graphify_adapter");
}

function initCleanGitRepo(cwd: string): string {
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "graphify-test@example.test"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Graphify Test"], { cwd, stdio: "ignore" });
  execFileSync("git", ["add", ".gitignore"], { cwd, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd, stdio: "ignore" });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
}

test("reports installed Graphify when a fake binary is available", async () => {
  const { binDir } = await makeFakeGraphifyBinary();
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-installed-");

  await withEnv({ GRAPHIFY_BIN: undefined, PATH: binDir }, async () => {
    const result = await tool.execute("tool-call-id", { action: "status" }, undefined, undefined, makeCtx(cwd));

    assert.match(textContent(result), /Graphify installed/);
    assert.equal(result.details.installed, true);
    assert.match(result.details.binaryPath, /graphify$/);
  });
});

test("reports missing Graphify without auto-installing or mutating the Python environment", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-missing-");

  await withEnv({ GRAPHIFY_BIN: undefined, PATH: "" }, async () => {
    const result = await tool.execute("tool-call-id", { action: "status" }, undefined, undefined, makeCtx(cwd));

    assert.match(textContent(result), /Graphify not installed/);
    assert.match(textContent(result), /pip install graphifyy/);
    assert.equal(result.details.installed, false);
    assert.equal(result.details.autoInstallAttempted, false);
  });
});

test("queries an existing managed graph.json with freshness and edge-confidence guidance", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-query-");
  const outputDir = join(cwd, ".pi", "agent", "artifacts", "graphify", "task-query");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        generatedAt: "2026-05-02T00:00:00.000Z",
        headCommit: "abc123",
        sourcePath: cwd,
        outputPath: outputDir,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(outputDir, "graph.json"),
    JSON.stringify(
      {
        edges: [
          { from: "src/a.ts", to: "src/b.ts", confidence: "EXTRACTED" },
          { from: "src/b.ts", to: "src/c.ts", confidence: "INFERRED" },
          { from: "src/c.ts", to: "src/d.ts", confidence: "AMBIGUOUS" },
        ],
      },
      null,
      2,
    ),
  );

  const result = await tool.execute(
    "tool-call-id",
    { action: "query", taskId: "task-query", query: "module seams" },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.match(textContent(result), /EXTRACTED=1/);
  assert.match(textContent(result), /INFERRED=1/);
  assert.match(textContent(result), /AMBIGUOUS=1/);
  assert.match(textContent(result), /verify important Graphify-derived claims with direct file inspection/);
  assert.equal(result.details.graphFreshness.headCommit, "abc123");
  assert.equal(result.details.citationPolicy.inferred, "lead_only_verify_before_planning_or_acceptance");
  assert.deepEqual(result.details.querySummary, {
    query: "module seams",
    graphPath: result.details.graphPath,
    outputPath: result.details.outputPath,
    edgeCount: 3,
    nodeCount: 4,
    edgeConfidenceCounts: { EXTRACTED: 1, INFERRED: 1, AMBIGUOUS: 1, UNKNOWN: 0 },
    freshnessStatus: "metadata_present",
    verificationRequired: true,
    verificationReminder: "Verify important Graphify-derived claims with direct file inspection before implementation, acceptance, or architecture decisions.",
  });
});

test("freshness helper recommends preflight and scan when managed graph is missing", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-freshness-missing-graph-");

  const result = await tool.execute(
    "tool-call-id",
    { action: "freshness", taskId: "task-missing-graph", cadencePhase: "before_broad_planning" },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.match(textContent(result), /missing managed Graphify graph/i);
  assert.equal(result.details.status, "completed");
  assert.equal(result.details.graphPresent, false);
  assert.equal(result.details.metadataPresent, false);
  assert.equal(result.details.freshnessStatus, "missing_graph");
  assert.equal(result.details.recommendedNextAction, "run_preflight_then_scan");
});

test("freshness helper warns dirty worktree graph may be stale", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-freshness-dirty-");
  await writeFile(join(cwd, ".gitignore"), ".pi/agent/artifacts/\n");
  const headCommit = initCleanGitRepo(cwd);
  const outputDir = join(cwd, ".pi", "agent", "artifacts", "graphify", "task-dirty");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "metadata.json"), JSON.stringify({ headCommit, sourcePath: cwd, outputPath: outputDir }, null, 2));
  await writeFile(join(outputDir, "graph.json"), JSON.stringify({ edges: [] }, null, 2));
  await writeFile(join(cwd, "local-change.ts"), "export const dirty = true;\n");

  const result = await tool.execute(
    "tool-call-id",
    { action: "freshness", taskId: "task-dirty", cadencePhase: "implementation_loop" },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.match(textContent(result), /Dirty worktree detected/i);
  assert.equal(result.details.graphPresent, true);
  assert.equal(result.details.metadataPresent, true);
  assert.equal(result.details.metadataHeadCommit, headCommit);
  assert.equal(result.details.currentHead, headCommit);
  assert.equal(result.details.dirtyWorktree, true);
  assert.equal(result.details.freshnessStatus, "dirty_worktree");
  assert.equal(result.details.recommendedNextAction, "do_not_rescan_for_small_loop");
});

test("freshness helper distinguishes missing metadata and stale head states", async () => {
  const tool = registerGraphifyTool();
  const missingMetadataCwd = await makeTempRepo("graphify-freshness-missing-metadata-");
  const missingMetadataOutput = join(missingMetadataCwd, ".pi", "agent", "artifacts", "graphify", "task-missing-metadata");
  await mkdir(missingMetadataOutput, { recursive: true });
  await writeFile(join(missingMetadataOutput, "graph.json"), JSON.stringify({ edges: [] }, null, 2));

  const missingMetadata = await tool.execute(
    "tool-call-id",
    { action: "freshness", taskId: "task-missing-metadata" },
    undefined,
    undefined,
    makeCtx(missingMetadataCwd),
  );
  assert.equal(missingMetadata.details.graphPresent, true);
  assert.equal(missingMetadata.details.metadataPresent, false);
  assert.equal(missingMetadata.details.freshnessStatus, "missing_metadata");
  assert.equal(missingMetadata.details.recommendedNextAction, "run_preflight_then_scan");

  const staleCwd = await makeTempRepo("graphify-freshness-stale-head-");
  await writeFile(join(staleCwd, ".gitignore"), ".pi/agent/artifacts/\n");
  const currentHead = initCleanGitRepo(staleCwd);
  const staleOutput = join(staleCwd, ".pi", "agent", "artifacts", "graphify", "task-stale");
  await mkdir(staleOutput, { recursive: true });
  await writeFile(join(staleOutput, "metadata.json"), JSON.stringify({ headCommit: "old-head", sourcePath: staleCwd, outputPath: staleOutput }, null, 2));
  await writeFile(join(staleOutput, "graph.json"), JSON.stringify({ edges: [] }, null, 2));

  const stale = await tool.execute(
    "tool-call-id",
    { action: "freshness", taskId: "task-stale", cadencePhase: "after_structural_change" },
    undefined,
    undefined,
    makeCtx(staleCwd),
  );
  assert.equal(stale.details.metadataHeadCommit, "old-head");
  assert.equal(stale.details.currentHead, currentHead);
  assert.equal(stale.details.dirtyWorktree, false);
  assert.equal(stale.details.freshnessStatus, "stale_head");
  assert.equal(stale.details.recommendedNextAction, "run_preflight_then_scan");
});

test("freshness helper recommends query and direct verification before final validation", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-freshness-final-validation-");
  await writeFile(join(cwd, ".gitignore"), ".pi/agent/artifacts/\n");
  const headCommit = initCleanGitRepo(cwd);
  const outputDir = join(cwd, ".pi", "agent", "artifacts", "graphify", "task-final");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "metadata.json"), JSON.stringify({ headCommit, sourcePath: cwd, outputPath: outputDir }, null, 2));
  await writeFile(join(outputDir, "graph.json"), JSON.stringify({ edges: [{ from: "src/a.ts", to: "src/b.ts", confidence: "EXTRACTED" }] }, null, 2));

  const result = await tool.execute(
    "tool-call-id",
    { action: "freshness", taskId: "task-final", cadencePhase: "before_final_validation" },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.match(textContent(result), /Recommended next action: query_then_direct_verify/);
  assert.equal(result.details.graphPresent, true);
  assert.equal(result.details.metadataPresent, true);
  assert.equal(result.details.metadataHeadCommit, headCommit);
  assert.equal(result.details.currentHead, headCommit);
  assert.equal(result.details.dirtyWorktree, false);
  assert.equal(result.details.freshnessStatus, "fresh");
  assert.equal(result.details.recommendedNextAction, "query_then_direct_verify");
});

test("queries a real-CLI nested managed graphify-out graph.json", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-nested-query-");
  const outputDir = join(cwd, ".pi", "agent", "artifacts", "graphify", "task-nested-query");
  await mkdir(join(outputDir, "source-snapshot", "graphify-out"), { recursive: true });
  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify({ generatedAt: "2026-05-02T00:00:00.000Z", headCommit: "nested123", sourcePath: cwd, outputPath: outputDir }, null, 2),
  );
  await writeFile(
    join(outputDir, "source-snapshot", "graphify-out", "graph.json"),
    JSON.stringify({ edges: [{ from: "src/a.ts", to: "src/b.ts", confidence: "EXTRACTED" }] }, null, 2),
  );

  const result = await tool.execute("tool-call-id", { action: "query", taskId: "task-nested-query" }, undefined, undefined, makeCtx(cwd));

  assert.equal(result.details.status, "completed");
  assert.match(result.details.graphPath, /graphify-out\/graph\.json$/);
  assert.equal(result.details.graphFreshness.headCommit, "nested123");
});

test("blocks Graphify preflight and scan without a broad discovery purpose", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-purpose-missing-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  const preflight = await tool.execute(
    "tool-call-id",
    { action: "preflight", taskId: "task-purpose-missing", sourcePath: "." },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.match(textContent(preflight), /broad Graphify purpose is required/i);
  assert.equal(preflight.details.status, "blocked_missing_purpose");

  const scan = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-purpose-missing", sourcePath: ".", approvedLargeCorpus: true },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.match(textContent(scan), /broad Graphify purpose is required/i);
  assert.equal(scan.details.status, "blocked_missing_purpose");
});

test("blocks narrow Graphify purpose values for preflight and scan", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-purpose-narrow-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  for (const action of ["preflight", "scan"] as const) {
    const result = await tool.execute(
      "tool-call-id",
      { action, taskId: "task-purpose-narrow", sourcePath: ".", purpose: "exact_verification", approvedLargeCorpus: true },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.match(textContent(result), /not a broad Graphify discovery purpose/i);
    assert.equal(result.details.status, "blocked_invalid_purpose");
    assert.equal(result.details.purpose, "exact_verification");
  }
});

test("preflights a Graphify scan without creating artifacts or invoking Graphify", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-preflight-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "one.ts"), "export const one = 1;\n");
  await writeFile(join(cwd, "src", "two.ts"), "export const two = 2;\n");

  await withEnv({ GRAPHIFY_BIN: undefined, PATH: "" }, async () => {
    const result = await tool.execute(
      "tool-call-id",
      { action: "preflight", taskId: "task-preflight", sourcePath: "src", purpose: "architecture_review", maxFilesWithoutApproval: 5 },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.match(textContent(result), /Graphify preflight ok/);
    assert.equal(result.details.status, "preflight_ok");
    assert.equal(result.details.wouldRun, false);
    assert.equal(result.details.wouldCreateArtifacts, false);
    assert.equal(result.details.fileCount, 2);
    assert.equal(result.details.purpose, "architecture_review");
    assert.equal(result.details.installed, false);
    assert.deepEqual(result.details.commandPreview, ["graphify", "update", "<managed-source-snapshot>"]);
    assert.match(result.details.outputPath, /\.pi\/agent\/artifacts\/graphify\/task-preflight$/);

    await assert.rejects(stat(result.details.outputPath));
    await assert.rejects(readFile(join(cwd, ".pi", "agent", "artifacts", "graphify", "task-preflight", "metadata.json"), "utf8"));
  });
});

test("requires explicit approval before scanning a large corpus", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-large-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "one.ts"), "export const one = 1;\n");
  await writeFile(join(cwd, "src", "two.ts"), "export const two = 2;\n");

  const result = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-large", sourcePath: "src", purpose: "large_subsystem_mapping", maxFilesWithoutApproval: 1 },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.match(textContent(result), /requires explicit approval/);
  assert.equal(result.details.status, "blocked_approval_required");
  assert.equal(result.details.fileCount, 2);
});

test("blocks Graphify background or side-effect modes by default", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-forbidden-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  const result = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-forbidden", sourcePath: ".", purpose: "drift_analysis", approvedLargeCorpus: true, extraArgs: ["--watch"] },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.match(textContent(result), /forbidden by default/);
  assert.equal(result.details.status, "blocked_forbidden_args");
  assert.deepEqual(result.details.forbiddenArgs, ["--watch"]);
});

test("blocks output override and semantic/deep extraction extra args by default", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-forbidden-extra-args-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  for (const extraArgs of [["--output=/tmp/graphify-out"], ["--deep"], ["--semantic"], ["--multimodal"], ["--url", "https://example.test"]]) {
    const result = await tool.execute(
      "tool-call-id",
      { action: "scan", taskId: "task-forbidden-extra", sourcePath: ".", purpose: "dependency_exploration", approvedLargeCorpus: true, extraArgs },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.match(textContent(result), /forbidden by default/);
    assert.equal(result.details.status, "blocked_forbidden_args");
  }
});

test("blocks Graphify scan without a matching preflight token", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-preflight-token-block-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  const missing = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-token-block", sourcePath: ".", purpose: "architecture_review", approvedLargeCorpus: true },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.match(textContent(missing), /preflightToken is required/i);
  assert.equal(missing.details.status, "blocked_missing_preflight_token");

  const wrong = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-token-block", sourcePath: ".", purpose: "architecture_review", approvedLargeCorpus: true, preflightToken: "wrong-token" },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.match(textContent(wrong), /preflightToken does not match/i);
  assert.equal(wrong.details.status, "blocked_invalid_preflight_token");
});

test("uses a matching preflight token for a managed Graphify scan", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-preflight-token-success-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  const preflight = await tool.execute(
    "tool-call-id",
    { action: "preflight", taskId: "task-token-success", sourcePath: ".", purpose: "architecture_review", approvedLargeCorpus: true, extraArgs: ["--quiet"] },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.equal(preflight.details.status, "preflight_ok");
  assert.equal(typeof preflight.details.preflightToken, "string");
  assert.ok(preflight.details.preflightToken.length > 20);
  await assert.rejects(stat(preflight.details.outputPath));

  const repeat = await tool.execute(
    "tool-call-id",
    { action: "preflight", taskId: "task-token-success", sourcePath: ".", purpose: "architecture_review", approvedLargeCorpus: true, extraArgs: ["--quiet"] },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.equal(repeat.details.preflightToken, preflight.details.preflightToken);

  const { binaryPath } = await makeFakeGraphifyBinary(
    "const fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2); if (args[0] !== 'update') process.exit(7); const out = path.join(args[1], 'graphify-out'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'graph.json'), JSON.stringify({ edges: [] })); console.log(JSON.stringify({ ok: true }));\n",
  );

  await withEnv({ GRAPHIFY_BIN: binaryPath }, async () => {
    const accepted = await tool.execute(
      "tool-call-id",
      { action: "scan", taskId: "task-token-success", sourcePath: ".", purpose: "architecture_review", approvedLargeCorpus: true, extraArgs: ["--quiet"], preflightToken: preflight.details.preflightToken },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.equal(accepted.details.status, "completed");
    assert.equal(accepted.details.preflightTokenStatus, "matched");
    const metadataRaw = await readFile(join(accepted.details.outputPath, "metadata.json"), "utf8");
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.preflightToken, preflight.details.preflightToken);
  });
});

test("keeps scan output inside the managed Graphify artifact directory", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-managed-output-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  const rejected = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-managed", sourcePath: ".", outputPath: "graphify-out", purpose: "curated_research", approvedLargeCorpus: true },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.match(textContent(rejected), /managed output path/);
  assert.equal(rejected.details.status, "blocked_unmanaged_output_path");

  const { binaryPath } = await makeFakeGraphifyBinary(
    "const fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2); if (args[0] !== 'update') process.exit(7); const out = path.join(args[1], 'graphify-out'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'graph.json'), JSON.stringify({ edges: [] })); console.log(JSON.stringify({ ok: true }));\n",
  );

  const preflight = await tool.execute(
    "tool-call-id",
    { action: "preflight", taskId: "task-managed", sourcePath: ".", purpose: "curated_research", approvedLargeCorpus: true },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.equal(preflight.details.status, "preflight_ok");

  await withEnv({ GRAPHIFY_BIN: binaryPath }, async () => {
    const accepted = await tool.execute(
      "tool-call-id",
      { action: "scan", taskId: "task-managed", sourcePath: ".", purpose: "curated_research", approvedLargeCorpus: true, preflightToken: preflight.details.preflightToken },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.equal(accepted.details.status, "completed");
    assert.match(accepted.details.outputPath, /\.pi\/agent\/artifacts\/graphify\/task-managed$/);
    assert.match(accepted.details.graphPath, /\.pi\/agent\/artifacts\/graphify\/task-managed\/source-snapshot\/graphify-out\/graph\.json$/);
    const metadataRaw = await readFile(join(accepted.details.outputPath, "metadata.json"), "utf8");
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.outputPath, accepted.details.outputPath);
    assert.equal(metadata.graphifyCommand, "update");
    assert.equal(metadata.graphifyWorkingDirectory, accepted.details.outputPath);
    assert.equal(metadata.purpose, "curated_research");
    assert.equal(metadata.edgeConfidencePolicy.inferred, "lead_only_verify_before_planning_or_acceptance");
  });
});
