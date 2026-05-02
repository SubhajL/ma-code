import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
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

test("Graphify adapter invokes a fake binary in one-shot managed-artifact mode", async () => {
  const cwd = await makeTempRepo("graphify-integration-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "entry.ts"), "export const entry = true;\n");
  await writeFile(join(cwd, ".env.local"), "SECRET=do-not-scan\n");

  const fakeRoot = await mkdtemp(join(tmpdir(), "graphify-integration-bin-"));
  const fakeBinary = join(fakeRoot, "graphify");
  const argLog = join(fakeRoot, "args.json");
  await writeFile(
    fakeBinary,
    `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst args = process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(argLog)}, JSON.stringify(args, null, 2));\nconst output = args[args.indexOf('--output') + 1];\nfs.mkdirSync(output, { recursive: true });\nfs.writeFileSync(path.join(output, 'graph.json'), JSON.stringify({ edges: [{ from: 'src/entry.ts', to: 'README.md', confidence: 'EXTRACTED' }] }, null, 2));\nconsole.log(JSON.stringify({ ok: true, output }));\n`,
  );
  await chmod(fakeBinary, 0o755);

  const pi = new FakePi("feat/graphify-integration");
  graphifyAdapter(pi as any);
  const tool = pi.getTool("graphify_adapter");

  await withEnv({ GRAPHIFY_BIN: fakeBinary }, async () => {
    const result = await tool.execute(
      "tool-call-id",
      { action: "scan", taskId: "task-integration", sourcePath: "src", approvedLargeCorpus: true, extraArgs: ["--mode", "ast-only"] },
      undefined,
      undefined,
      makeCtx(cwd),
    );

    assert.match(textContent(result), /Graphify scan completed/);
    assert.equal(result.details.status, "completed");
    assert.match(result.details.outputPath, /\.pi\/agent\/artifacts\/graphify\/task-integration$/);

    const args = JSON.parse(await readFile(argLog, "utf8"));
    assert.deepEqual(args.slice(0, 5), ["scan", join(cwd, "src"), "--output", result.details.outputPath, "--format"]);
    assert.ok(args.includes("--exclude"));
    assert.ok(args.includes(".env*"));
    assert.ok(args.includes(".pi/agent/state/runtime/"));
    assert.ok(args.includes("--mode"));
    assert.ok(args.includes("ast-only"));

    const metadata = JSON.parse(await readFile(join(result.details.outputPath, "metadata.json"), "utf8"));
    assert.equal(metadata.sourcePath, join(cwd, "src"));
    assert.equal(metadata.outputPath, result.details.outputPath);
    assert.equal(metadata.edgeConfidencePolicy.ambiguous, "requires_direct_file_inspection_before_use");
  });
});
