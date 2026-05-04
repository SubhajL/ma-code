import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import graphifyAdapter from "../../.pi/agent/extensions/graphify-adapter.ts";
import { FakePi, makeCtx, makeTempRepo, textContent } from "../extension-units/test-utils.ts";

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

test("Graphify adapter invokes fake binary with real CLI update shape in managed artifact cwd", async () => {
  const cwd = await makeTempRepo("graphify-integration-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "entry.ts"), "export const entry = true;\n");
  await writeFile(join(cwd, ".env.local"), "SECRET=do-not-scan\n");

  const fakeRoot = await mkdtemp(join(tmpdir(), "graphify-integration-bin-"));
  const fakeBinary = join(fakeRoot, "graphify");
  const argLog = join(fakeRoot, "args.json");
  await writeFile(
    fakeBinary,
    `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst args = process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(argLog)}, JSON.stringify({ args, cwd: process.cwd() }, null, 2));\nconst output = path.join(args[1], 'graphify-out');\nfs.mkdirSync(output, { recursive: true });\nfs.writeFileSync(path.join(output, 'graph.json'), JSON.stringify({ edges: [{ from: 'src/entry.ts', to: 'README.md', confidence: 'EXTRACTED' }] }, null, 2));\nconsole.log(JSON.stringify({ ok: true, output }));\n`,
  );
  await chmod(fakeBinary, 0o755);

  const pi = new FakePi("feat/graphify-integration");
  graphifyAdapter(pi as any);
  const tool = pi.getTool("graphify_adapter");

  const preflight = await tool.execute(
    "tool-call-id",
    { action: "preflight", taskId: "task-integration", sourcePath: ".", purpose: "architecture_review", approvedLargeCorpus: true },
    undefined,
    undefined,
    makeCtx(cwd),
  );
  assert.equal(preflight.details.status, "preflight_ok");
  assert.equal(typeof preflight.details.preflightToken, "string");

  await withEnv({ GRAPHIFY_BIN: fakeBinary }, async () => {
    const result = await tool.execute(
      "tool-call-id",
      { action: "scan", taskId: "task-integration", sourcePath: ".", purpose: "architecture_review", approvedLargeCorpus: true, preflightToken: preflight.details.preflightToken },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.match(textContent(result), /Graphify scan completed/);
    assert.equal(result.details.status, "completed");
    assert.match(result.details.outputPath, /\.pi\/agent\/artifacts\/graphify\/task-integration$/);
    assert.match(result.details.graphPath, /\.pi\/agent\/artifacts\/graphify\/task-integration\/source-snapshot\/graphify-out\/graph\.json$/);

    const invocation = JSON.parse(await readFile(argLog, "utf8"));
    assert.deepEqual(invocation.args, ["update", join(result.details.outputPath, "source-snapshot")]);
    assert.equal(await realpath(invocation.cwd), await realpath(result.details.outputPath));
    assert.equal(existsSync(join(result.details.outputPath, "source-snapshot", ".env.local")), false);
    assert.equal(existsSync(join(result.details.outputPath, "source-snapshot", "src", "entry.ts")), true);

    const metadata = JSON.parse(await readFile(join(result.details.outputPath, "metadata.json"), "utf8"));
    assert.equal(metadata.sourcePath, cwd);
    assert.equal(metadata.graphifyCommand, "update");
    assert.equal(metadata.graphifyWorkingDirectory, result.details.outputPath);
    assert.equal(metadata.sanitizedSourcePath, join(result.details.outputPath, "source-snapshot"));
    assert.equal(metadata.purpose, "architecture_review");
    assert.equal(metadata.edgeConfidencePolicy.ambiguous, "requires_direct_file_inspection_before_use");
  });
});
