import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-product-intake.ts");
const clearDescription =
  "Redesign checkout so shoppers can review cart totals in the UI, choose saved payment methods, call the payments API, and recover from failed card authorization before placing an order.";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeInitiativeTemplates(repoPath: string): Promise<void> {
  const templateDir = join(repoPath, "docs", "initiatives", "TEMPLATE");
  await mkdir(templateDir, { recursive: true });
  await writeFile(join(templateDir, "prd.md"), "# PRD\n", "utf8");
  await writeFile(join(templateDir, "backlog.md"), "# Backlog\n", "utf8");
  await writeFile(join(templateDir, "decisions.md"), "# Decisions\n", "utf8");
}

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function runProductIntake(repoPath: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], {
    cwd: repoPath,
    encoding: "utf8",
  });
}

test("harness-product-intake dry-run reports planned files without writing", async () => {
  const repoPath = await makeTempDir("harness-product-intake-dry-run-");
  await writeInitiativeTemplates(repoPath);

  const result = await runProductIntake(repoPath, [
    "--slug",
    "checkout-redesign",
    "--description",
    clearDescription,
    "--dry-run",
    "--json",
  ]);
  const json = JSON.parse(result.stdout) as {
    mode: string;
    status: string;
    plannedFiles: string[];
    intake: { status: string; sourceDescription: string; domains: string[] };
  };

  assert.equal(json.mode, "dry-run");
  assert.equal(json.status, "ready_for_prd");
  assert.equal(json.intake.status, "ready_for_prd");
  assert.equal(json.intake.sourceDescription, clearDescription);
  assert.deepEqual(json.intake.domains, ["frontend", "backend"]);
  assert.deepEqual(json.plannedFiles, [
    "docs/initiatives/checkout-redesign/prd.md",
    "docs/initiatives/checkout-redesign/backlog.md",
    "docs/initiatives/checkout-redesign/decisions.md",
    "docs/initiatives/checkout-redesign/intake.json",
  ]);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign")), false);
});

test("harness-product-intake apply creates initiative artifacts and stable intake state", async () => {
  const repoPath = await makeTempDir("harness-product-intake-apply-");
  await writeInitiativeTemplates(repoPath);

  const result = await runProductIntake(repoPath, [
    "--slug",
    "checkout-redesign",
    "--description",
    clearDescription,
    "--apply",
    "--json",
  ]);
  const json = JSON.parse(result.stdout) as {
    mode: string;
    status: string;
    createdFiles: string[];
    intake: Record<string, unknown>;
  };

  assert.equal(json.mode, "apply");
  assert.equal(json.status, "ready_for_prd");
  assert.deepEqual(json.createdFiles, [
    "docs/initiatives/checkout-redesign/prd.md",
    "docs/initiatives/checkout-redesign/backlog.md",
    "docs/initiatives/checkout-redesign/decisions.md",
    "docs/initiatives/checkout-redesign/intake.json",
  ]);

  await access(join(repoPath, "docs", "initiatives", "checkout-redesign", "prd.md"));
  await access(join(repoPath, "docs", "initiatives", "checkout-redesign", "backlog.md"));
  await access(join(repoPath, "docs", "initiatives", "checkout-redesign", "decisions.md"));

  const intakePath = join(repoPath, "docs", "initiatives", "checkout-redesign", "intake.json");
  const intake = JSON.parse(await readFile(intakePath, "utf8"));
  assert.equal(intake.version, 1);
  assert.equal(intake.initiativeId, "checkout-redesign");
  assert.equal(intake.sourceDescription, clearDescription);
  assert.equal(intake.intakeTier, "tier3_full_intake");
  assert.equal(intake.status, "ready_for_prd");
  assert.deepEqual(intake.recommendedNextSkills, ["g-grill", "g-prd", "g-issues"]);
  assert.deepEqual(intake.blockingQuestions, []);
  assert.deepEqual(intake.domains, ["frontend", "backend"]);
  assert.match(intake.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(intake.artifacts, {
    prdPath: "docs/initiatives/checkout-redesign/prd.md",
    backlogPath: "docs/initiatives/checkout-redesign/backlog.md",
    decisionsPath: "docs/initiatives/checkout-redesign/decisions.md",
  });
  assert.deepEqual(intake.nextDisallowedActions, ["stitch_generation", "task_packet_generation", "queue_dispatch"]);
  assert.deepEqual(json.intake, intake);
});

test("harness-product-intake ambiguous apply records blocked intake only", async () => {
  const repoPath = await makeTempDir("harness-product-intake-blocked-");
  await writeInitiativeTemplates(repoPath);

  const result = await runProductIntake(repoPath, [
    "--slug",
    "checkout-redesign",
    "--description",
    "make it better",
    "--apply",
    "--json",
  ]);
  const json = JSON.parse(result.stdout) as {
    status: string;
    createdFiles: string[];
    intake: { status: string; blockingQuestions: string[] };
  };

  assert.equal(json.status, "blocked");
  assert.equal(json.intake.status, "blocked");
  assert.ok(json.intake.blockingQuestions.length > 0);
  assert.deepEqual(json.createdFiles, ["docs/initiatives/checkout-redesign/intake.json"]);
  await access(join(repoPath, "docs", "initiatives", "checkout-redesign", "intake.json"));
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "prd.md")), false);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "backlog.md")), false);
  assert.equal(await exists(join(repoPath, "docs", "initiatives", "checkout-redesign", "decisions.md")), false);
});

test("harness-product-intake preserves duplicate initiative protection", async () => {
  const repoPath = await makeTempDir("harness-product-intake-duplicate-");
  await writeInitiativeTemplates(repoPath);

  await runProductIntake(repoPath, ["--slug", "checkout-redesign", "--description", clearDescription, "--apply"]);

  await assert.rejects(
    runProductIntake(repoPath, ["--slug", "checkout-redesign", "--description", clearDescription, "--apply"]),
    /Initiative folder already exists/,
  );
});

test("harness-product-intake rejects invalid modes and empty descriptions", async () => {
  const repoPath = await makeTempDir("harness-product-intake-invalid-");
  await writeInitiativeTemplates(repoPath);

  await assert.rejects(
    runProductIntake(repoPath, ["--slug", "checkout-redesign", "--description", clearDescription]),
    /Choose exactly one of --dry-run or --apply/,
  );
  await assert.rejects(
    runProductIntake(repoPath, ["--slug", "checkout-redesign", "--description", "   ", "--dry-run"]),
    /--description is required/,
  );
});
