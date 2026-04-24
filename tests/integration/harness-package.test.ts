import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bootstrapHarnessPackage, loadHarnessPackageManifest } from "../../scripts/harness-package.ts";

function requireSourceRoot(): string {
  const sourceRoot = process.env.HARNESS_SOURCE_ROOT;
  assert(sourceRoot, "HARNESS_SOURCE_ROOT must be set for harness-package integration tests.");
  return sourceRoot;
}

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

test("harness package bootstrap copies reusable assets and generates fresh repo-local placeholders", async () => {
  const sourceRoot = requireSourceRoot();
  const manifest = await loadHarnessPackageManifest(sourceRoot);
  const destinationRoot = await makeTempDir("harness-package-bootstrap-");

  await writeFile(
    join(destinationRoot, "package.json"),
    JSON.stringify(
      {
        name: "target-repo",
        private: true,
        type: "module",
        scripts: {
          test: "echo existing-test-script",
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  assert.equal(result.packageVersion, manifest.packageVersion);
  assert.equal(result.mergedPackageJson, true);
  assert.ok(result.copiedAssets.includes(".pi/agent/extensions/safe-bash.ts"));
  assert.ok(result.copiedAssets.includes("scripts/harness-operator-status.ts"));
  assert.ok(result.copiedAssets.includes("tests/integration/core-workflows.test.ts"));
  assert.ok(result.generatedFiles.includes("AGENTS.md"));
  assert.ok(result.generatedFiles.includes("SYSTEM.md"));
  assert.ok(result.generatedFiles.includes(".pi/agent/models.json"));
  assert.ok(result.generatedFiles.includes(".pi/agent/state/runtime/tasks.json"));
  assert.ok(result.generatedFiles.includes(".pi/agent/state/runtime/queue.json"));
  assert.ok(result.generatedFiles.includes(".pi/agent/state/runtime/scheduled-workflows.json"));
  assert.match(result.versionRecordPath, /installed-package\.json$/);

  const installedRecord = JSON.parse(
    await readFile(join(destinationRoot, ".pi", "agent", "package", "installed-package.json"), "utf8"),
  ) as { packageVersion: string; copiedAssets: string[]; generatedFiles: string[] };
  assert.equal(installedRecord.packageVersion, manifest.packageVersion);
  assert.ok(installedRecord.copiedAssets.includes(".pi/agent/extensions/safe-bash.ts"));
  assert.ok(installedRecord.generatedFiles.includes("AGENTS.md"));

  const packageJson = JSON.parse(await readFile(join(destinationRoot, "package.json"), "utf8")) as {
    name: string;
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.equal(packageJson.name, "target-repo");
  assert.equal(packageJson.scripts.test, "echo existing-test-script");
  assert.equal(packageJson.scripts["harness:package"], "node --import tsx scripts/harness-package.ts manifest");
  assert.equal(packageJson.devDependencies.tsx, "^4.20.5");

  const taskState = JSON.parse(
    await readFile(join(destinationRoot, ".pi", "agent", "state", "runtime", "tasks.json"), "utf8"),
  ) as { version: number; activeTaskId: string | null; tasks: unknown[] };
  assert.deepEqual(taskState, { version: 1, activeTaskId: null, tasks: [] });

  const queueState = JSON.parse(
    await readFile(join(destinationRoot, ".pi", "agent", "state", "runtime", "queue.json"), "utf8"),
  ) as { version: number; paused: boolean; activeJobId: string | null; jobs: unknown[] };
  assert.deepEqual(queueState, { version: 1, paused: false, activeJobId: null, jobs: [] });

  assert.equal(await exists(join(destinationRoot, "logs", "harness-actions.jsonl")), false);
  assert.equal(await exists(join(destinationRoot, "reports", "validation")), false);
});

test("harness package bootstrap preserves existing repo-local files instead of overwriting them", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-preserve-");
  await mkdir(join(destinationRoot, ".pi", "agent"), { recursive: true });
  await writeFile(join(destinationRoot, "AGENTS.md"), "# existing rules\n", "utf8");
  await writeFile(join(destinationRoot, ".pi", "agent", "models.json"), "{\n  \"custom\": true\n}\n", "utf8");

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });
  assert.ok(result.preservedFiles.includes("AGENTS.md"));
  assert.ok(result.preservedFiles.includes(".pi/agent/models.json"));
  assert.match(result.warnings.join("\n"), /Preserved existing repo-local file: AGENTS\.md/);
  assert.match(result.warnings.join("\n"), /Preserved existing repo-local file: \.pi\/agent\/models\.json/);

  const agents = await readFile(join(destinationRoot, "AGENTS.md"), "utf8");
  assert.equal(agents, "# existing rules\n");
  const models = await readFile(join(destinationRoot, ".pi", "agent", "models.json"), "utf8");
  assert.match(models, /"custom": true/);
});

async function exists(pathValue: string): Promise<boolean> {
  try {
    await readFile(pathValue, "utf8");
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}
