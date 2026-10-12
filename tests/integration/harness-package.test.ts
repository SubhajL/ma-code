import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

import {
  bootstrapHarnessPackage,
  installHarnessPackage,
  listBootstrapWrites,
  loadHarnessPackageManifest,
  parseHarnessPackageManifest,
  renderHarnessPackageInstall,
} from "../../scripts/harness-package.ts";

const execFile = promisify(execFileCallback);
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");

// validate-harness-package.sh runs these tests from a scratch runtime and points
// HARNESS_SOURCE_ROOT at the real checkout; a direct run uses this checkout.
function requireSourceRoot(): string {
  const sourceRoot = process.env.HARNESS_SOURCE_ROOT ?? fileURLToPath(new URL("../..", import.meta.url));
  assert(
    existsSync(join(sourceRoot, ".pi", "agent", "package", "harness-package.json")),
    `HARNESS_SOURCE_ROOT must point at a harness checkout with .pi/agent/package/harness-package.json (got ${sourceRoot}).`,
  );
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
  assert.ok(result.copiedAssets.includes("scripts/harness-product-intake.ts"));
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
  assert.equal(packageJson.scripts["harness:product-intake"], "node --import tsx scripts/harness-product-intake.ts");
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

  const productIntakeResult = await execFile(
    process.execPath,
    [
      "--import",
      tsxImportPath,
      join(destinationRoot, "scripts", "harness-product-intake.ts"),
      "--slug",
      "returns-redesign",
      "--description",
      "Redesign returns so customers can choose items in the UI, call the orders API, and track refund status before submitting requests.",
      "--apply",
      "--json",
    ],
    {
      cwd: destinationRoot,
      encoding: "utf8",
    },
  );
  const productIntakeJson = JSON.parse(productIntakeResult.stdout) as { status: string; createdFiles: string[] };
  assert.equal(productIntakeJson.status, "ready_for_prd");
  assert.ok(productIntakeJson.createdFiles.includes("docs/initiatives/returns-redesign/intake.json"));

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

const SOURCE_ONLY_TESTS = [
  "tests/integration/auth-boundary.test.ts",
  "tests/integration/health-handshake.test.ts",
  "tests/integration/observability.test.ts",
  "tests/integration/greenfield-phase-b-queue-readiness.test.ts",
  "tests/integration/greenfield-phase-c-worker-proof.test.ts",
  "tests/integration/orchestrator-context.test.ts",
  "tests/extension-units/second-model-opus.test.ts",
  "tests/extension-units/project-model-settings.test.ts",
];
const RUNTIME_IGNORE_LINES = [
  ".pi/agent/pi-session-*.html",
  ".pi/agent/artifacts/",
  ".pi/agent/state/runtime/*.json",
  ".pi/agent/state/runtime/*.lock",
  "**/.pi/agent/state/runtime/pi.db*",
  "logs/harness-actions.jsonl*",
  "**/logs/harness-actions.jsonl*",
];
// The tsx config path is absolute because integration tests spawn harness scripts from temp directories.
const HARNESS_CHECK =
  'tsc --noEmit -p tsconfig.harness.json && TSX_TSCONFIG_PATH="$PWD/tsconfig.harness.json" node --experimental-sqlite --import tsx --test tests/extension-units/*.test.ts && TSX_TSCONFIG_PATH="$PWD/tsconfig.harness.json" node scripts/run-integration-tests.mjs';

test("an installed repo gets what npm run check and the pre-push hook need", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-check-");

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  const packageJson = JSON.parse(await readFile(join(destinationRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    engines?: Record<string, string>;
  };
  // Harness-owned names only, so a target's own check/typecheck/test scripts are never shadowed or reused.
  assert.equal(packageJson.scripts["harness:check"], HARNESS_CHECK);
  assert.equal(packageJson.scripts["harness:hooks:install"], "node scripts/harness-hooks-install.mjs");
  for (const generic of ["check", "typecheck", "test:integration", "hooks:install"]) {
    assert.equal(packageJson.scripts[generic], undefined, `the template must not claim the generic ${generic} script`);
  }
  assert.equal(packageJson.engines?.node, ">=22.13 <23 || >=23.4");
  assert.ok(((await stat(join(destinationRoot, ".githooks", "pre-push"))).mode & 0o111) !== 0, "pre-push must be executable");
  assert.match(await readFile(join(destinationRoot, ".githooks", "pre-push"), "utf8"), /npm run --silent harness:check/);
  assert.ok(result.generatedFiles.includes(".githooks/pre-push"));
  assert.ok(result.generatedFiles.includes("tsconfig.harness.json"));
  for (const policy of [
    ".pi/agent/intake/intake-trigger-policy.json",
    ".pi/agent/lifecycle/slice-lifecycle-policy.json",
    ".pi/agent/release/merge-release-policy.json",
  ]) {
    assert.equal(await exists(join(destinationRoot, policy)), true, `${policy} should ship`);
  }
  for (const sourceOnly of SOURCE_ONLY_TESTS) {
    assert.equal(await exists(join(destinationRoot, sourceOnly)), false, `${sourceOnly} tests this repo's own fixtures and must not ship`);
  }
  // Every test file a shipped script names must exist in the target.
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    for (const testFile of command.match(/tests\/[\w./-]+\.test\.ts/g) ?? []) {
      assert.equal(await exists(join(destinationRoot, testFile)), true, `script ${name} names missing ${testFile}`);
    }
  }
  const gitignore = (await readFile(join(destinationRoot, ".gitignore"), "utf8")).split("\n");
  for (const line of RUNTIME_IGNORE_LINES) assert.ok(gitignore.includes(line), `.gitignore should contain ${line}`);
});

test("harness package bootstrap appends only the missing runtime ignore lines to an existing .gitignore", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-gitignore-");
  await writeFile(join(destinationRoot, ".gitignore"), `node_modules/\r\n${RUNTIME_IGNORE_LINES[4]}\r\n`, "utf8");

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  const content = await readFile(join(destinationRoot, ".gitignore"), "utf8");
  assert.equal(content.replace(/\r\n/g, "").includes("\n"), false, "a CRLF .gitignore keeps CRLF line endings");
  const lines = content.split("\r\n");
  assert.equal(lines[0], "node_modules/");
  for (const line of RUNTIME_IGNORE_LINES) assert.equal(lines.filter((entry) => entry === line).length, 1, line);
  assert.deepEqual(result.gitignoreEntriesAdded, RUNTIME_IGNORE_LINES.filter((line) => line !== RUNTIME_IGNORE_LINES[4]));
});

test("harness package bootstrap leaves a .gitignore alone when it un-ignores harness paths or already has every line", async () => {
  const sourceRoot = requireSourceRoot();
  // A negation for runtime state skips only the runtime-state lines; other harness lines still go in.
  const negated = await makeTempDir("harness-package-gitignore-negated-");
  const negation = "!.pi/agent/state/runtime/scheduled-workflows.json\n";
  await writeFile(join(negated, ".gitignore"), negation, "utf8");
  const negatedResult = await bootstrapHarnessPackage({ sourceRoot, destinationRoot: negated });
  // Only the lines whose scope holds the negated file are skipped; the pi.db line still goes in.
  assert.deepEqual(
    negatedResult.gitignoreEntriesAdded,
    RUNTIME_IGNORE_LINES.filter((line) => !line.startsWith(".pi/agent/state/runtime/*")),
  );
  assert.match(negatedResult.warnings.join("\n"), /un-ignores paths under \.pi\/agent\/state\/runtime\/\*\.json/);

  // A broad `!.pi/agent/` (as in a `.pi/*` + `!.pi/agent/` pair) does not stop the specific runtime lines.
  const broad = await makeTempDir("harness-package-gitignore-broad-");
  await writeFile(join(broad, ".gitignore"), ".pi/*\n!.pi/agent/\n", "utf8");
  const broadResult = await bootstrapHarnessPackage({ sourceRoot, destinationRoot: broad });
  assert.deepEqual(broadResult.gitignoreEntriesAdded, RUNTIME_IGNORE_LINES);

  // Git treats leading spaces as part of a pattern, so " **/...pi.db*" does not count as present.
  const leadingSpace = await makeTempDir("harness-package-gitignore-space-");
  await writeFile(join(leadingSpace, ".gitignore"), ` ${RUNTIME_IGNORE_LINES[4]}\n`, "utf8");
  const leadingSpaceResult = await bootstrapHarnessPackage({ sourceRoot, destinationRoot: leadingSpace });
  assert.ok(leadingSpaceResult.gitignoreEntriesAdded.includes(RUNTIME_IGNORE_LINES[4]));

  // A symlinked .gitignore that already has every line needs no write, so it does not stop the install.
  const complete = await makeTempDir("harness-package-gitignore-complete-");
  const shared = join(await makeTempDir("harness-package-gitignore-shared-"), "gitignore");
  await writeFile(shared, `${RUNTIME_IGNORE_LINES.join("\n")}\n`, "utf8");
  await symlink(shared, join(complete, ".gitignore"));
  const completeResult = await bootstrapHarnessPackage({ sourceRoot, destinationRoot: complete });
  assert.deepEqual(completeResult.gitignoreEntriesAdded, []);
});

test("harness package bootstrap keeps a target's own pre-push hook and package scripts, and refuses managed-file collisions up front", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-own-hook-");
  await mkdir(join(destinationRoot, ".githooks"), { recursive: true });
  await writeFile(join(destinationRoot, ".githooks", "pre-push"), "#!/bin/sh\nexit 0\n", "utf8");
  await writeFile(
    join(destinationRoot, "package.json"),
    `${JSON.stringify({ name: "target", scripts: { check: "eslint ." }, engines: { node: ">=18" } }, null, 2)}\n`,
    "utf8",
  );

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  assert.ok(result.preservedFiles.includes(".githooks/pre-push"));
  assert.equal(await readFile(join(destinationRoot, ".githooks", "pre-push"), "utf8"), "#!/bin/sh\nexit 0\n");
  const packageJson = JSON.parse(await readFile(join(destinationRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    engines: Record<string, string>;
  };
  assert.equal(packageJson.scripts.check, "eslint .");
  assert.equal(packageJson.scripts["harness:check"], HARNESS_CHECK);
  assert.equal(packageJson.engines.node, ">=18");
  assert.match(result.warnings.join("\n"), /Preserved existing package\.json engines\.node/);

  const commonjs = await makeTempDir("harness-package-commonjs-");
  await writeFile(join(commonjs, "package.json"), `${JSON.stringify({ name: "t", type: "commonjs" })}\n`, "utf8");
  const commonjsResult = await bootstrapHarnessPackage({ sourceRoot, destinationRoot: commonjs });
  assert.match(commonjsResult.warnings.join("\n"), /"type": "commonjs".*ES modules/);

  const npmOnly = await makeTempDir("harness-package-engines-npm-");
  await writeFile(join(npmOnly, "package.json"), `${JSON.stringify({ name: "t", engines: { npm: ">=10" } })}\n`, "utf8");
  const npmOnlyResult = await bootstrapHarnessPackage({ sourceRoot, destinationRoot: npmOnly });
  const npmOnlyJson = JSON.parse(await readFile(join(npmOnly, "package.json"), "utf8")) as { engines: Record<string, string> };
  assert.deepEqual(npmOnlyJson.engines, { npm: ">=10", node: ">=22.13 <23 || >=23.4" });
  assert.doesNotMatch(npmOnlyResult.warnings.join("\n"), /engines/);

  const collision = await makeTempDir("harness-package-collision-");
  await mkdir(join(collision, "scripts"), { recursive: true });
  await writeFile(join(collision, "scripts", "harness-package.ts"), "// the target's own file\n", "utf8");
  const before = (await readdir(collision, { recursive: true })).sort();
  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot: collision }), /already contains .*scripts\/harness-package\.ts/);
  assert.deepEqual((await readdir(collision, { recursive: true })).sort(), before, "nothing written before the refusal");
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

// The harness's own extension entries: every source entry under agent/extensions/. All of them
// must ship. (The source may itself be an installed repo with entries of its own elsewhere.)
async function harnessExtensionEntries(sourceRoot: string): Promise<string[]> {
  const sourceSettings = JSON.parse(await readFile(join(sourceRoot, ".pi", "settings.json"), "utf8")) as { extensions: string[] };
  return sourceSettings.extensions.filter((entry) => entry.startsWith("agent/extensions/"));
}

test("harness package bootstrap gives the target pi's project config, so pi loads the harness extensions there", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-pi-config-");

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  assert.equal(result.piSettings, "generated");
  assert.ok(result.generatedFiles.includes(".pi/APPEND_SYSTEM.md"));
  const shipped = await harnessExtensionEntries(sourceRoot);
  assert.ok(shipped.includes("agent/extensions/safe-bash.ts"));
  for (const entry of shipped) {
    assert.equal(await exists(join(destinationRoot, ".pi", entry)), true, `${entry} should ship to the target`);
  }
  const settings = JSON.parse(await readFile(join(destinationRoot, ".pi", "settings.json"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(settings.extensions, shipped);
  for (const key of ["skills", "prompts"]) {
    for (const entry of (settings[key] as string[] | undefined) ?? []) {
      assert.equal(await exists(join(destinationRoot, ".pi", entry)), true, `pi settings ${key} entry ${entry} should exist in the target`);
    }
  }
  for (const key of ["defaultProvider", "defaultModel", "enabledModels"]) {
    assert.equal(key in settings, false, `${key} is the source operator's choice and must not override the target's`);
  }
  assert.equal(
    await readFile(join(destinationRoot, ".pi", "agent", "models.json"), "utf8"),
    await readFile(join(sourceRoot, ".pi", "agent", "models.json"), "utf8"),
    "the target should get the live routing map, not a stale template",
  );
  const record = JSON.parse(await readFile(join(destinationRoot, result.versionRecordPath), "utf8")) as { piSettings?: string };
  assert.equal(record.piSettings, "generated");

  // pi's own loader, run in the target with the source's dependencies.
  await symlink(join(sourceRoot, "node_modules"), join(destinationRoot, "node_modules"), "dir");
  const loader = new DefaultResourceLoader({
    cwd: destinationRoot,
    agentDir: await makeTempDir("harness-package-pi-agent-"),
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors.map((entry) => `${entry.path}: ${entry.error}`), []);
  assert.equal(loaded.extensions.length, shipped.length);
  assert.match(loader.getAppendSystemPrompt().join("\n"), /^# Pi Project System Guidance$/m);
});

test("harness package bootstrap merges harness entries into existing pi settings without overwriting the repo's values", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-pi-merge-");
  await mkdir(join(destinationRoot, ".pi"), { recursive: true });
  await writeFile(
    join(destinationRoot, ".pi", "settings.json"),
    `${JSON.stringify({ defaultModel: "repo-model", enableSkillCommands: false, extensions: ["repo-extension.ts"] }, null, 2)}\n`,
    "utf8",
  );

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  assert.equal(result.piSettings, "merged");
  const settings = JSON.parse(await readFile(join(destinationRoot, ".pi", "settings.json"), "utf8")) as Record<string, unknown>;
  assert.equal(settings.defaultModel, "repo-model");
  assert.equal(settings.enableSkillCommands, false);
  assert.equal("defaultProvider" in settings, false);
  assert.deepEqual(settings.extensions, ["repo-extension.ts", ...(await harnessExtensionEntries(sourceRoot))]);
  assert.match(result.warnings.join("\n"), /Preserved existing pi setting enableSkillCommands/);
});

test("harness package bootstrap rejects malformed pi settings before copying anything", async () => {
  const sourceRoot = requireSourceRoot();
  for (const [label, content] of [
    ["array", "[]\n"],
    ["invalid JSON", "{ \"extensions\": [], }\n"],
  ] as const) {
    const destinationRoot = await makeTempDir("harness-package-pi-malformed-");
    await mkdir(join(destinationRoot, ".pi"), { recursive: true });
    await writeFile(join(destinationRoot, ".pi", "settings.json"), content, "utf8");

    await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot }), /\.pi\/settings\.json/, label);
    assert.equal(await exists(join(destinationRoot, ".pi", "agent")), false, `${label}: nothing should be copied`);
    assert.equal(await readFile(join(destinationRoot, ".pi", "settings.json"), "utf8"), content, `${label}: settings untouched`);
  }
});

test("harness package bootstrap keeps a resource value that is not a list, such as pi's legacy skills object", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-pi-legacy-");
  const legacySkills = { enableSkillCommands: false, customDirectories: ["repo-skills"] };
  await mkdir(join(destinationRoot, ".pi"), { recursive: true });
  await writeFile(join(destinationRoot, ".pi", "settings.json"), `${JSON.stringify({ skills: legacySkills })}\n`, "utf8");

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  const settings = JSON.parse(await readFile(join(destinationRoot, ".pi", "settings.json"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(settings.skills, legacySkills);
  assert.equal("enableSkillCommands" in settings, false, "a top-level key would override the legacy skills.enableSkillCommands");
  assert.deepEqual(settings.extensions, await harnessExtensionEntries(sourceRoot));
  assert.match(result.warnings.join("\n"), /Kept existing pi setting skills/);
});

test("harness package bootstrap refuses a symlinked .pi directory before writing anything", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-pi-dir-symlink-");
  const external = await makeTempDir("harness-package-pi-external-");
  await symlink(external, join(destinationRoot, ".pi"));

  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot }), /\.pi is a symlink/);
  assert.deepEqual(await readdir(external), []);
  assert.equal(await exists(join(destinationRoot, "package.json")), false);
});

test("harness package bootstrap refuses a dangling .pi symlink, a .pi file and a settings directory", async () => {
  const sourceRoot = requireSourceRoot();
  const dangling = await makeTempDir("harness-package-pi-dangling-");
  await symlink(join(dangling, "missing-dir"), join(dangling, ".pi"));
  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot: dangling }), /\.pi is a symlink/);

  const piFile = await makeTempDir("harness-package-pi-file-");
  await writeFile(join(piFile, ".pi"), "not a directory\n", "utf8");
  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot: piFile }), /\.pi exists but is not a directory/);

  const settingsDir = await makeTempDir("harness-package-pi-settings-dir-");
  await mkdir(join(settingsDir, ".pi", "settings.json"), { recursive: true });
  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot: settingsDir }), /settings\.json is not a file/);
  assert.equal(await exists(join(settingsDir, "package.json")), false);
});

test("harness package bootstrap refuses to write through any symlink inside the target", async () => {
  const sourceRoot = requireSourceRoot();
  const cases: Array<[string, (destinationRoot: string, external: string) => Promise<void>]> = [
    ["symlinked .pi/agent", async (destinationRoot, external) => {
      await mkdir(join(destinationRoot, ".pi"), { recursive: true });
      await symlink(external, join(destinationRoot, ".pi", "agent"));
    }],
    ["symlinked scripts directory", async (destinationRoot, external) => {
      await symlink(external, join(destinationRoot, "scripts"));
    }],
    ["dangling symlink at a generated file", async (destinationRoot, external) => {
      await symlink(join(external, "AGENTS.md"), join(destinationRoot, "AGENTS.md"));
    }],
    ["symlinked package.json", async (destinationRoot, external) => {
      await mkdir(join(external, "shared"));
      await writeFile(join(external, "shared", "package.json"), "{}\n", "utf8");
      await symlink(join(external, "shared", "package.json"), join(destinationRoot, "package.json"));
    }],
  ];
  for (const [label, arrange] of cases) {
    const destinationRoot = await makeTempDir("harness-package-symlink-write-");
    const external = await makeTempDir("harness-package-symlink-external-");
    await arrange(destinationRoot, external);
    const before = (await readdir(destinationRoot, { recursive: true })).sort();

    await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot }), /goes through a symlink/, label);
    const externalEntries = (await readdir(external)).filter((entry) => entry !== "shared");
    assert.deepEqual(externalEntries, [], `${label}: nothing written outside the target`);
    assert.deepEqual((await readdir(destinationRoot, { recursive: true })).sort(), before, `${label}: nothing written inside the target`);
    if (label === "symlinked package.json") {
      assert.equal(await readFile(join(external, "shared", "package.json"), "utf8"), "{}\n", `${label}: shared file untouched`);
    }
  }
});

test("harness package bootstrap refuses manifest paths that resolve outside the target or hide a symlink behind ..", async () => {
  const external = await makeTempDir("harness-package-manifest-external-");
  for (const [label, target] of [
    ["absolute generated target", join(external, "absolute.md")],
    ["escaping generated target", "../escaped.md"],
    ["symlink hidden behind ..", "missing/../escape/pwn.md"],
  ] as const) {
    const sourceRoot = await makeTempDir("harness-package-manifest-source-");
    const parent = await makeTempDir("harness-package-manifest-parent-");
    const destinationRoot = join(parent, "repo");
    await mkdir(destinationRoot);
    await symlink(external, join(destinationRoot, "escape"));
    await mkdir(join(sourceRoot, ".pi", "agent", "package"), { recursive: true });
    await writeFile(join(sourceRoot, "AGENTS.template.md"), "# rules\n", "utf8");
    await writeFile(join(sourceRoot, "package.template.json"), "{}\n", "utf8");
    await writeFile(
      join(sourceRoot, ".pi", "agent", "package", "harness-package.json"),
      JSON.stringify({
        version: 1,
        packageName: "fake",
        packageVersion: "0.0.0",
        reusableAssets: [],
        generatedFiles: [{ target, template: "AGENTS.template.md", mode: "create_if_missing" }],
        packageJsonTemplate: "package.template.json",
        versionRecordTarget: ".pi/agent/package/installed-package.json",
        excludedPaths: [],
      }),
      "utf8",
    );

    await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot }), /outside the target|goes through a symlink/, label);
    assert.deepEqual(await readdir(external), [], `${label}: nothing written outside the target`);
    assert.deepEqual(await readdir(parent), ["repo"], `${label}: nothing written beside the target`);
  }
});

test("a manifest whose reusable asset is the whole source root still installs", async () => {
  const sourceRoot = await makeTempDir("harness-package-root-asset-source-");
  const destinationRoot = await makeTempDir("harness-package-root-asset-dest-");
  await mkdir(join(sourceRoot, ".pi", "agent", "package"), { recursive: true });
  await writeFile(join(sourceRoot, "hello.txt"), "hello\n", "utf8");
  await writeFile(join(sourceRoot, "AGENTS.template.md"), "# rules\n", "utf8");
  await writeFile(join(sourceRoot, "package.template.json"), "{}\n", "utf8");
  await writeFile(
    join(sourceRoot, ".pi", "agent", "package", "harness-package.json"),
    JSON.stringify({
      version: 1,
      packageName: "fake",
      packageVersion: "0.0.0",
      reusableAssets: ["."],
      generatedFiles: [{ target: "AGENTS.md", template: "AGENTS.template.md", mode: "create_if_missing" }],
      packageJsonTemplate: "package.template.json",
      versionRecordTarget: ".pi/agent/package/installed-package.json",
      excludedPaths: [".pi", "AGENTS.template.md", "package.template.json"],
    }),
    "utf8",
  );

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  assert.ok(result.copiedAssets.includes("hello.txt"));
  assert.equal(await readFile(join(destinationRoot, "hello.txt"), "utf8"), "hello\n");
});

test("harness package bootstrap allows a symlinked target root and keeps a generated file linked to a real one", async () => {
  const sourceRoot = requireSourceRoot();
  const realRoot = await makeTempDir("harness-package-real-root-");
  const linkedRoot = join(await makeTempDir("harness-package-link-parent-"), "repo");
  await symlink(realRoot, linkedRoot);
  await writeFile(join(realRoot, "CLAUDE.md"), "# shared rules\n", "utf8");
  await symlink("CLAUDE.md", join(realRoot, "AGENTS.md"));

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot: linkedRoot });

  assert.ok(result.preservedFiles.includes("AGENTS.md"));
  assert.equal(await readFile(join(realRoot, "CLAUDE.md"), "utf8"), "# shared rules\n");
  assert.equal(await exists(join(realRoot, ".pi", "settings.json")), true);
});

test("harness package bootstrap names a target path component that is a file, not a directory", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-file-component-");
  await writeFile(join(destinationRoot, "scripts"), "not a directory\n", "utf8");

  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot }), /scripts exists but is not a directory/);
  assert.deepEqual(await readdir(destinationRoot), ["scripts"], "nothing written before the refusal");

  const dirAtFile = await makeTempDir("harness-package-dir-at-file-");
  await mkdir(join(dirAtFile, "package.json"));
  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot: dirAtFile }), /package\.json exists but is not a file/);
  assert.deepEqual(await readdir(dirAtFile), ["package.json"], "nothing written before the refusal");

  const loop = await makeTempDir("harness-package-link-loop-");
  await symlink("AGENTS.md", join(loop, "AGENTS.md"));
  await assert.rejects(bootstrapHarnessPackage({ sourceRoot, destinationRoot: loop }), /goes through a symlink/);
});

test("every file a bootstrap creates was in the plan its symlink check covered", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-plan-coverage-");
  const planned = new Set(await listBootstrapWrites({ sourceRoot, destinationRoot }));

  await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  const unplanned: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (!planned.has(relative(destinationRoot, absolute).split(sep).join("/"))) unplanned.push(absolute);
    }
  };
  await walk(destinationRoot);
  assert.deepEqual(unplanned, []);
});

test("harness package bootstrap leaves symlinked pi settings alone and says so", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-pi-symlink-");
  const shared = join(await makeTempDir("harness-package-pi-shared-"), "settings.json");
  await writeFile(shared, "{\n  \"extensions\": []\n}\n", "utf8");
  await mkdir(join(destinationRoot, ".pi"), { recursive: true });
  await symlink(shared, join(destinationRoot, ".pi", "settings.json"));

  const result = await installHarnessPackage({ sourceRoot, destinationRoot, skipNpmInstall: true, skipValidators: true });

  assert.equal(result.bootstrap.piSettings, "skipped");
  assert.equal(await readFile(shared, "utf8"), "{\n  \"extensions\": []\n}\n");
  assert.match(result.nextSteps.join("\n"), /symlink/);
});

test("harness package bootstrap keeps pi pattern entries and skips machine-specific or unshipped paths", async () => {
  const sourceRoot = await makeTempDir("harness-package-fake-source-");
  // Target and an "outside" file share one temp parent, so the test leaves nothing in the shared tmpdir.
  const parent = await makeTempDir("harness-package-fake-target-");
  const destinationRoot = join(parent, "repo");
  await mkdir(destinationRoot);
  await mkdir(join(sourceRoot, ".pi", "agent", "package"), { recursive: true });
  await writeFile(join(sourceRoot, "AGENTS.template.md"), "# rules\n", "utf8");
  await writeFile(join(sourceRoot, "package.template.json"), "{}\n", "utf8");
  // An existing file outside the target, reached with ../ from the target's .pi directory.
  const outsideName = "outside.ts";
  await writeFile(join(parent, outsideName), "export default function outside() {}\n", "utf8");
  await writeFile(
    join(sourceRoot, ".pi", "settings.json"),
    JSON.stringify({
      extensions: [
        "!agent/extensions/packets.ts",
        "/abs/extension.ts",
        "~/extension.ts",
        "agent/extensions/unshipped.ts",
        `../../${outsideName}`,
        "+/abs/forced.ts",
        "!../../outside/**/*.ts",
        "C:\\Users\\alice\\*.ts",
        "\\\\server\\share\\extension.ts",
      ],
    }),
    "utf8",
  );
  await writeFile(
    join(sourceRoot, ".pi", "agent", "package", "harness-package.json"),
    JSON.stringify({
      version: 1,
      packageName: "fake",
      packageVersion: "0.0.0",
      reusableAssets: [],
      generatedFiles: [{ target: "AGENTS.md", template: "AGENTS.template.md", mode: "create_if_missing" }],
      packageJsonTemplate: "package.template.json",
      piSettingsTemplate: ".pi/settings.json",
      piSettingsKeys: ["extensions"],
      versionRecordTarget: ".pi/agent/package/installed-package.json",
      excludedPaths: [],
    }),
    "utf8",
  );

  const result = await bootstrapHarnessPackage({ sourceRoot, destinationRoot });

  const settings = JSON.parse(await readFile(join(destinationRoot, ".pi", "settings.json"), "utf8")) as { extensions: string[] };
  assert.deepEqual(settings.extensions, ["!agent/extensions/packets.ts"]);
  const warnings = result.warnings.join("\n");
  assert.match(warnings, /\/abs\/extension\.ts: a machine-specific path/);
  assert.match(warnings, /~\/extension\.ts: a machine-specific path/);
  assert.match(warnings, /agent\/extensions\/unshipped\.ts: not shipped to the target repo/);
  assert.match(warnings, /\.\.\/\.\.\/outside\.ts: outside the target repo/);
  assert.match(warnings, /\+\/abs\/forced\.ts: a machine-specific path/);
  assert.match(warnings, /!\.\.\/\.\.\/outside\/\*\*\/\*\.ts: outside the target repo/);
  assert.match(warnings, /C:\\Users\\alice\\\*\.ts: a machine-specific path/);
  assert.match(warnings, /\\\\server\\share\\extension\.ts: a machine-specific path/);
});

test("an older manifest without pi settings support leaves the target's settings alone, even malformed ones", async () => {
  const sourceRoot = await makeTempDir("harness-package-old-source-");
  const destinationRoot = await makeTempDir("harness-package-old-dest-");
  await mkdir(join(sourceRoot, ".pi", "agent", "package"), { recursive: true });
  await writeFile(join(sourceRoot, "AGENTS.template.md"), "# rules\n", "utf8");
  await writeFile(join(sourceRoot, "package.template.json"), "{}\n", "utf8");
  await writeFile(
    join(sourceRoot, ".pi", "agent", "package", "harness-package.json"),
    JSON.stringify({
      version: 1,
      packageName: "old",
      packageVersion: "0.0.0",
      reusableAssets: [],
      generatedFiles: [{ target: "AGENTS.md", template: "AGENTS.template.md", mode: "create_if_missing" }],
      packageJsonTemplate: "package.template.json",
      versionRecordTarget: ".pi/agent/package/installed-package.json",
      excludedPaths: [],
    }),
    "utf8",
  );
  await mkdir(join(destinationRoot, ".pi"), { recursive: true });
  await writeFile(join(destinationRoot, ".pi", "settings.json"), "{ not json\n", "utf8");

  const result = await installHarnessPackage({ sourceRoot, destinationRoot, skipNpmInstall: true, skipValidators: true });

  assert.equal(result.bootstrap.piSettings, "skipped");
  assert.equal(await readFile(join(destinationRoot, ".pi", "settings.json"), "utf8"), "{ not json\n");
  assert.match(result.nextSteps.join("\n"), /no piSettingsTemplate/);
  assert.doesNotMatch(result.nextSteps.join("\n"), /symlink/);
});

test("harness package manifests from before pi settings support still load", async () => {
  const manifest = await loadHarnessPackageManifest(requireSourceRoot());
  const { piSettingsTemplate: _template, piSettingsKeys: _keys, ...older } = manifest;

  const parsed = parseHarnessPackageManifest(older);

  assert.equal(parsed.piSettingsTemplate, null);
  assert.deepEqual(parsed.piSettingsKeys, ["extensions", "skills", "prompts", "enableSkillCommands"]);
});

test("harness package install wraps bootstrap, records skipped npm install + validators, and enumerates files-to-review from manifest", async () => {
  const sourceRoot = requireSourceRoot();
  const manifest = await loadHarnessPackageManifest(sourceRoot);
  const destinationRoot = await makeTempDir("harness-package-install-");

  const previousOpenai = process.env.OPENAI_API_KEY;
  const previousAnthropic = process.env.ANTHROPIC_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-token-fixture";

    await mkdir(join(destinationRoot, ".pi"), { recursive: true });
    await writeFile(join(destinationRoot, ".pi", "settings.json"), "{\n  \"enableSkillCommands\": false\n}\n", "utf8");
    const result = await installHarnessPackage({
      sourceRoot,
      destinationRoot,
      skipNpmInstall: true,
      skipValidators: true,
    });

    assert.equal(result.version, 1);
    assert.equal(result.bootstrap.packageVersion, manifest.packageVersion);
    assert.ok(result.bootstrap.copiedAssets.includes(".pi/agent/extensions/safe-bash.ts"));
    assert.ok(result.bootstrap.generatedFiles.includes("AGENTS.md"));

    assert.equal(result.npmInstall.skipped, true);
    assert.equal(result.npmInstall.status, "skipped");
    assert.equal(result.npmInstall.skipReason, "user_request");
    assert.equal(result.npmInstall.exitCode, null);

    assert.equal(result.validators.length, 3);
    const validatorNames = result.validators.map((entry) => entry.name);
    assert.deepEqual(validatorNames, [
      "validate:harness-package",
      "validate:core-workflows",
      "validate:harness-routing",
    ]);
    for (const validator of result.validators) {
      assert.equal(validator.status, "skipped");
      assert.equal(validator.exitCode, null);
      assert.equal(validator.skipReason, "user_request");
      assert.equal(validator.stderrTail, undefined);
    }

    assert.equal(result.providerEnv.openaiApiKey, "missing");
    assert.equal(result.providerEnv.anthropicApiKey, "set");

    const expectedReviewFiles = [
      ...manifest.generatedFiles.filter((rule) => rule.requiredReview).map((rule) => rule.target),
      ".pi/settings.json",
    ];
    assert.deepEqual(result.filesToReview.slice().sort(), expectedReviewFiles.slice().sort());
    assert.ok(result.filesToReview.includes("AGENTS.md"));
    assert.ok(result.filesToReview.includes("SYSTEM.md"));
    assert.ok(result.filesToReview.includes(".pi/APPEND_SYSTEM.md"));
    assert.ok(result.filesToReview.includes(".pi/settings.json"));
    assert.ok(result.filesToReview.includes(".pi/agent/models.json"));
    assert.ok(result.filesToReview.includes("docs/product/intake-policy.md"));

    assert.ok(result.nextSteps.some((line) => line.includes("harness:product-intake")));
    assert.ok(result.nextSteps.some((line) => line.includes("npm run harness:hooks:install")));

    const rendered = renderHarnessPackageInstall(result);
    assert.match(rendered, /Harness Package Install/);
    assert.match(rendered, /npm install: skipped/);
    assert.match(rendered, /validate:harness-package: skipped \(reason: user_request\)/);
    assert.match(rendered, /OPENAI_API_KEY: missing/);
    assert.match(rendered, /ANTHROPIC_API_KEY: set/);
    assert.match(rendered, /AGENTS\.md/);
    assert.match(rendered, /harness:product-intake/);
    assert.match(rendered, /pi settings \(\.pi\/settings\.json\): merged/);
    assert.match(rendered, /warnings:\n(- .*\n)*- Preserved existing pi setting enableSkillCommands/);
  } finally {
    if (previousOpenai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenai;
    if (previousAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropic;
  }
});

test("harness package install rejects flag-like value for --dest instead of treating the flag as the path", async () => {
  const sourceRoot = requireSourceRoot();
  await assert.rejects(
    execFile(
      process.execPath,
      [
        "--import",
        tsxImportPath,
        join(sourceRoot, "scripts", "harness-package.ts"),
        "install",
        "--dest",
        "--skip-install",
        "--json",
      ],
      {
        cwd: sourceRoot,
        encoding: "utf8",
      },
    ),
    /--dest requires a value/,
  );
});

test("harness package install CLI emits JSON when --json is passed and includes filesToReview + providerEnv", async () => {
  const sourceRoot = requireSourceRoot();
  const destinationRoot = await makeTempDir("harness-package-install-cli-");

  const installResult = await execFile(
    process.execPath,
    [
      "--import",
      tsxImportPath,
      join(sourceRoot, "scripts", "harness-package.ts"),
      "install",
      "--source-root",
      sourceRoot,
      "--dest",
      destinationRoot,
      "--skip-install",
      "--skip-validators",
      "--json",
    ],
    {
      cwd: sourceRoot,
      encoding: "utf8",
      env: { ...process.env, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
    },
  );

  const installJson = JSON.parse(installResult.stdout) as {
    version: number;
    bootstrap: { piSettings: string };
    npmInstall: { status: string; skipped: boolean };
    validators: Array<{ name: string; status: string }>;
    providerEnv: { openaiApiKey: string; anthropicApiKey: string };
    filesToReview: string[];
    nextSteps: string[];
  };

  assert.equal(installJson.version, 1);
  assert.equal(installJson.npmInstall.status, "skipped");
  assert.equal(installJson.validators.length, 3);
  assert.equal(installJson.providerEnv.openaiApiKey, "missing");
  assert.equal(installJson.providerEnv.anthropicApiKey, "missing");
  assert.ok(installJson.filesToReview.includes("AGENTS.md"));
  assert.ok(installJson.filesToReview.includes("SYSTEM.md"));
  assert.ok(installJson.filesToReview.includes(".pi/settings.json"));
  assert.equal(installJson.bootstrap.piSettings, "generated");
  assert.ok(installJson.filesToReview.includes(".pi/agent/models.json"));
  assert.ok(installJson.nextSteps.some((line) => line.includes("harness:product-intake")));
});

test("harness package install CLI rejects missing --dest", async () => {
  const sourceRoot = requireSourceRoot();
  await assert.rejects(
    execFile(
      process.execPath,
      [
        "--import",
        tsxImportPath,
        join(sourceRoot, "scripts", "harness-package.ts"),
        "install",
        "--skip-install",
        "--skip-validators",
      ],
      {
        cwd: sourceRoot,
        encoding: "utf8",
      },
    ),
    /install requires --dest/,
  );
});

async function exists(pathValue: string): Promise<boolean> {
  try {
    await readFile(pathValue, "utf8");
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}
