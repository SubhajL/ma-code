import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
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
});

test("requires explicit approval before scanning a large corpus", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-large-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "one.ts"), "export const one = 1;\n");
  await writeFile(join(cwd, "src", "two.ts"), "export const two = 2;\n");

  const result = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-large", sourcePath: "src", maxFilesWithoutApproval: 1 },
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
    { action: "scan", taskId: "task-forbidden", sourcePath: ".", approvedLargeCorpus: true, extraArgs: ["--watch"] },
    undefined,
    undefined,
    makeCtx(cwd),
  );

  assert.match(textContent(result), /forbidden by default/);
  assert.equal(result.details.status, "blocked_forbidden_args");
  assert.deepEqual(result.details.forbiddenArgs, ["--watch"]);
});

test("keeps scan output inside the managed Graphify artifact directory", async () => {
  const tool = registerGraphifyTool();
  const cwd = await makeTempRepo("graphify-managed-output-");
  await writeFile(join(cwd, "index.ts"), "export const value = 1;\n");

  const rejected = await tool.execute(
    "tool-call-id",
    { action: "scan", taskId: "task-managed", sourcePath: ".", outputPath: "graphify-out", approvedLargeCorpus: true },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.match(textContent(rejected), /managed output path/);
  assert.equal(rejected.details.status, "blocked_unmanaged_output_path");

  const { binaryPath } = await makeFakeGraphifyBinary(
    "const fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2); const out = args[args.indexOf('--output') + 1]; fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'graph.json'), JSON.stringify({ edges: [] })); console.log(JSON.stringify({ ok: true }));\n",
  );

  await withEnv({ GRAPHIFY_BIN: binaryPath }, async () => {
    const accepted = await tool.execute(
      "tool-call-id",
      { action: "scan", taskId: "task-managed", sourcePath: ".", approvedLargeCorpus: true },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.equal(accepted.details.status, "completed");
    assert.match(accepted.details.outputPath, /\.pi\/agent\/artifacts\/graphify\/task-managed$/);
    const metadataRaw = await readFile(join(accepted.details.outputPath, "metadata.json"), "utf8");
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.outputPath, accepted.details.outputPath);
    assert.equal(metadata.edgeConfidencePolicy.inferred, "lead_only_verify_before_planning_or_acceptance");
  });
});
