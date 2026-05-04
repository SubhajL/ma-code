import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import graphifyOrchestrator from "../../.pi/agent/extensions/graphify-orchestrator.ts";
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

async function makeFakeGraphifyBinary() {
  const binDir = await mkdtemp(join(tmpdir(), "fake-graphify-orchestrator-bin-"));
  const binaryPath = join(binDir, "graphify");
  await writeFile(
    binaryPath,
    "#!/usr/bin/env node\nconst fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2); if (args.includes('--watch')) process.exit(9); const out = path.join(args[1], 'graphify-out'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'graph.json'), JSON.stringify({ edges: [] })); console.log(JSON.stringify({ ok: true }));\n",
  );
  await chmod(binaryPath, 0o755);
  return { binDir, binaryPath };
}

function registerTool() {
  const pi = new FakePi("feat/graphify-orchestrator");
  graphifyOrchestrator(pi as any);
  return pi.getTool("run_graphify_orchestration");
}

test("registers runtime command that delegates missing graph preflight to existing graphify_adapter", async () => {
  const tool = registerTool();
  const cwd = await makeTempRepo("graphify-orchestrator-preflight-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "entry.ts"), "export const entry = true;\n");

  await withEnv({ GRAPHIFY_BIN: undefined, PATH: "" }, async () => {
    const result = await tool.execute(
      "tool-call-id",
      {
        need: "broad_structure",
        graphPresent: false,
        taskId: "task-orchestrator-preflight",
        sourcePath: "src",
        purpose: "architecture_review",
        maxFilesWithoutApproval: 5,
      },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.match(textContent(result), /Graphify orchestration action: run_preflight/);
    assert.equal(result.details.decision.action, "run_preflight");
    assert.equal(result.details.adapterAction, "preflight");
    assert.equal(result.details.adapterResult.details.status, "preflight_ok");
    assert.match(result.details.adapterResult.details.outputPath, /task-orchestrator-preflight$/);
  });
});

test("delegates preflighted missing graph scan to existing graphify_adapter", async () => {
  const tool = registerTool();
  const cwd = await makeTempRepo("graphify-orchestrator-scan-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");
  const { binaryPath } = await makeFakeGraphifyBinary();

  await withEnv({ GRAPHIFY_BIN: binaryPath }, async () => {
    const preflight = await tool.execute(
      "tool-call-id",
      {
        need: "broad_structure",
        graphPresent: false,
        taskId: "task-orchestrator-scan",
        sourcePath: ".",
        purpose: "architecture_review",
        maxFilesWithoutApproval: 5,
      },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    const result = await tool.execute(
      "tool-call-id",
      {
        need: "broad_structure",
        graphPresent: false,
        taskId: "task-orchestrator-scan",
        sourcePath: ".",
        purpose: "architecture_review",
        preflightToken: preflight.details.adapterResult.details.preflightToken,
        preflightTokenPresent: true,
        maxFilesWithoutApproval: 5,
      },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.equal(result.details.decision.action, "run_scan");
    assert.equal(result.details.adapterAction, "scan");
    assert.equal(result.details.adapterResult.details.status, "completed");
    assert.match(result.details.adapterResult.details.graphPath, /source-snapshot\/graphify-out\/graph\.json$/);
  });
});

test("delegates stale graph freshness check to existing graphify_adapter", async () => {
  const tool = registerTool();
  const cwd = await makeTempRepo("graphify-orchestrator-freshness-");

  const result = await tool.execute(
    "tool-call-id",
    {
      need: "broad_structure",
      graphPresent: true,
      freshnessStatus: "stale_head",
      taskId: "task-orchestrator-freshness",
      cadencePhase: "after_structural_change",
    },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.equal(result.details.decision.action, "check_freshness");
  assert.equal(result.details.adapterAction, "freshness");
  assert.equal(result.details.adapterResult.details.status, "completed");
  assert.equal(result.details.adapterResult.details.freshnessStatus, "missing_graph");
});

test("delegates fresh unqueried graph query to existing graphify_adapter", async () => {
  const tool = registerTool();
  const cwd = await makeTempRepo("graphify-orchestrator-query-");
  const outputDir = join(cwd, ".pi", "agent", "artifacts", "graphify", "task-orchestrator-query");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "metadata.json"), JSON.stringify({ headCommit: "abc", sourcePath: cwd, outputPath: outputDir }, null, 2));
  await writeFile(join(outputDir, "graph.json"), JSON.stringify({ edges: [{ from: "src/a.ts", to: "src/b.ts", confidence: "EXTRACTED" }] }, null, 2));

  const result = await tool.execute(
    "tool-call-id",
    {
      need: "broad_structure",
      graphPresent: true,
      freshnessStatus: "fresh",
      latestRelevantGraphQueried: false,
      taskId: "task-orchestrator-query",
      query: "module edges",
    },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.equal(result.details.decision.action, "query_graph");
  assert.equal(result.details.adapterAction, "query");
  assert.equal(result.details.adapterResult.details.status, "completed");
  assert.equal(result.details.adapterResult.details.querySummary.query, "module edges");
});

test("local-verification decisions do not call graphify_adapter", async () => {
  const tool = registerTool();
  const cwd = await makeTempRepo("graphify-orchestrator-local-");

  const result = await tool.execute(
    "tool-call-id",
    {
      need: "exact_verification",
      graphifyAvailable: true,
      graphPresent: true,
    },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.equal(result.details.decision.action, "use_local_verification");
  assert.equal(result.details.adapterAction, null);
  assert.equal(result.details.adapterResult, null);
});

test("runtime command still relies on graphify_adapter to block watch args", async () => {
  const tool = registerTool();
  const cwd = await makeTempRepo("graphify-orchestrator-watch-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");
  const { binaryPath } = await makeFakeGraphifyBinary();

  await withEnv({ GRAPHIFY_BIN: binaryPath }, async () => {
    const result = await tool.execute(
      "tool-call-id",
      {
        need: "broad_structure",
        graphPresent: false,
        taskId: "task-orchestrator-watch",
        sourcePath: ".",
        purpose: "architecture_review",
        preflightToken: "intentionally-wrong",
        preflightTokenPresent: true,
        approvedLargeCorpus: true,
        extraArgs: ["--watch"],
      },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.equal(result.details.status, "blocked");
    assert.equal(result.details.decision.action, "run_scan");
    assert.equal(result.details.adapterAction, "scan");
    assert.equal(result.details.adapterResult.details.status, "blocked_forbidden_args");
    assert.deepEqual(result.details.adapterResult.details.forbiddenArgs, ["--watch"]);
  });
});
