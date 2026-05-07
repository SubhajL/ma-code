import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { bootstrapHarnessPackage, loadHarnessPackageManifest } from "../../scripts/harness-package.ts";

const execFile = promisify(execFileCallback);
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");

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
  assert.ok(result.copiedAssets.includes(".pi/agent/governance/domain-governance-policy.json"));
  assert.ok(result.copiedAssets.includes(".pi/agent/skills/frontend-safety/SKILL.md"));
  assert.ok(result.copiedAssets.includes("scripts/harness-operator-status.ts"));
  assert.ok(result.copiedAssets.includes("scripts/harness-init-feature.ts"));
  assert.ok(result.copiedAssets.includes("tests/integration/core-workflows.test.ts"));
  assert.ok(result.generatedFiles.includes("AGENTS.md"));
  assert.ok(result.generatedFiles.includes("SYSTEM.md"));
  assert.ok(result.generatedFiles.includes(".pi/agent/models.json"));
  assert.ok(result.generatedFiles.includes(".pi/agent/state/runtime/tasks.json"));
  assert.ok(result.generatedFiles.includes(".pi/agent/state/runtime/queue.json"));
  assert.ok(result.generatedFiles.includes(".pi/agent/state/runtime/scheduled-workflows.json"));
  assert.ok(result.generatedFiles.includes(".pi/agent/state/runtime/leases.json"));
  assert.ok(result.generatedFiles.includes("docs/product/intake-policy.md"));
  assert.ok(result.generatedFiles.includes("docs/initiatives/README.md"));
  assert.ok(result.generatedFiles.includes("docs/initiatives/TEMPLATE/prd.md"));
  assert.ok(result.generatedFiles.includes("docs/initiatives/TEMPLATE/backlog.md"));
  assert.ok(result.generatedFiles.includes("docs/initiatives/TEMPLATE/decisions.md"));
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
  assert.equal(packageJson.scripts["validate:domain-governance"], "./scripts/validate-domain-governance.sh");
  assert.equal(packageJson.scripts["harness:init-feature"], "node --import tsx scripts/harness-init-feature.ts");
  assert.equal(packageJson.devDependencies.tsx, "^4.20.5");

  const initFeatureResult = await execFile(
    process.execPath,
    [
      "--import",
      tsxImportPath,
      join(destinationRoot, "scripts", "harness-init-feature.ts"),
      "--slug",
      "payments-redesign",
      "--json",
    ],
    {
      cwd: destinationRoot,
      encoding: "utf8",
    },
  );
  const initFeatureJson = JSON.parse(initFeatureResult.stdout) as {
    slug: string;
    createdFiles: string[];
    recommendedSkills: string[];
  };
  assert.equal(initFeatureJson.slug, "payments-redesign");
  assert.deepEqual(initFeatureJson.recommendedSkills, ["g-grill", "g-prd", "g-issues"]);
  assert.ok(initFeatureJson.createdFiles.includes("docs/initiatives/payments-redesign/prd.md"));

  const taskState = JSON.parse(
    await readFile(join(destinationRoot, ".pi", "agent", "state", "runtime", "tasks.json"), "utf8"),
  ) as { version: number; activeTaskId: string | null; tasks: unknown[] };
  assert.deepEqual(taskState, { version: 1, activeTaskId: null, tasks: [] });

  const queueState = JSON.parse(
    await readFile(join(destinationRoot, ".pi", "agent", "state", "runtime", "queue.json"), "utf8"),
  ) as { version: number; paused: boolean; activeJobId: string | null; jobs: unknown[] };
  assert.deepEqual(queueState, { version: 1, paused: false, activeJobId: null, jobs: [] });

  const leaseState = JSON.parse(
    await readFile(join(destinationRoot, ".pi", "agent", "state", "runtime", "leases.json"), "utf8"),
  ) as { version: number; leases: unknown[] };
  assert.deepEqual(leaseState, { version: 1, leases: [] });

  const intakePolicy = await readFile(join(destinationRoot, "docs", "product", "intake-policy.md"), "utf8");
  assert.match(intakePolicy, /Tier 1/i);
  assert.match(intakePolicy, /Tier 2/i);
  assert.match(intakePolicy, /Tier 3/i);

  const initiativesReadme = await readFile(join(destinationRoot, "docs", "initiatives", "README.md"), "utf8");
  assert.match(initiativesReadme, /major feature/i);

  const prdTemplate = await readFile(join(destinationRoot, "docs", "initiatives", "TEMPLATE", "prd.md"), "utf8");
  const backlogTemplate = await readFile(join(destinationRoot, "docs", "initiatives", "TEMPLATE", "backlog.md"), "utf8");
  const decisionsTemplate = await readFile(join(destinationRoot, "docs", "initiatives", "TEMPLATE", "decisions.md"), "utf8");
  assert.match(prdTemplate, /PRD/i);
  assert.match(backlogTemplate, /backlog/i);
  assert.match(decisionsTemplate, /decisions/i);

  assert.equal(await exists(join(destinationRoot, "docs", "frontend")), false);
  assert.equal(await exists(join(destinationRoot, "docs", "backend")), false);

  const frontendInit = await execFile(
    process.execPath,
    [
      "--import",
      tsxImportPath,
      join(destinationRoot, "scripts", "harness-init-feature.ts"),
      "--slug",
      "checkout-ui",
      "--domains",
      "frontend",
      "--json",
    ],
    {
      cwd: destinationRoot,
      encoding: "utf8",
    },
  );
  const frontendInitJson = JSON.parse(frontendInit.stdout) as { createdFiles: string[]; domains: string[] };
  assert.deepEqual(frontendInitJson.domains, ["frontend"]);
  assert.ok(frontendInitJson.createdFiles.includes("docs/frontend/README.md"));
  assert.equal(await exists(join(destinationRoot, "docs", "frontend", "README.md")), true);
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
