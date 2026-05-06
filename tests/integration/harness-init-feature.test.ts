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
const scriptPath = join(repoRoot, "scripts", "harness-init-feature.ts");

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

test("harness-init-feature creates initiative docs from repo-local templates", async () => {
  const repoPath = await makeTempDir("harness-init-feature-");
  await writeInitiativeTemplates(repoPath);

  const result = await execFile(process.execPath, ["--import", tsxImportPath, scriptPath, "--slug", "payments-redesign"], {
    cwd: repoPath,
    encoding: "utf8",
  });

  assert.match(result.stdout, /payments-redesign/);
  assert.match(result.stdout, /g-grill/);
  assert.match(result.stdout, /g-prd/);
  assert.match(result.stdout, /g-issues/);
  await access(join(repoPath, "docs", "initiatives", "payments-redesign", "prd.md"));
  await access(join(repoPath, "docs", "initiatives", "payments-redesign", "backlog.md"));
  await access(join(repoPath, "docs", "initiatives", "payments-redesign", "decisions.md"));

  const prd = await readFile(join(repoPath, "docs", "initiatives", "payments-redesign", "prd.md"), "utf8");
  const backlog = await readFile(join(repoPath, "docs", "initiatives", "payments-redesign", "backlog.md"), "utf8");
  const decisions = await readFile(join(repoPath, "docs", "initiatives", "payments-redesign", "decisions.md"), "utf8");
  assert.equal(prd, "# PRD\n");
  assert.equal(backlog, "# Backlog\n");
  assert.equal(decisions, "# Decisions\n");
});

test("harness-init-feature refuses to overwrite an existing initiative folder", async () => {
  const repoPath = await makeTempDir("harness-init-feature-duplicate-");
  await writeInitiativeTemplates(repoPath);

  await execFile(process.execPath, ["--import", tsxImportPath, scriptPath, "--slug", "payments-redesign"], {
    cwd: repoPath,
    encoding: "utf8",
  });

  await assert.rejects(
    execFile(process.execPath, ["--import", tsxImportPath, scriptPath, "--slug", "payments-redesign"], {
      cwd: repoPath,
      encoding: "utf8",
    }),
    /already exists/,
  );
});

test("harness-init-feature fails clearly when initiative templates are missing", async () => {
  const repoPath = await makeTempDir("harness-init-feature-missing-");
  await mkdir(join(repoPath, "docs", "initiatives", "TEMPLATE"), { recursive: true });
  await writeFile(join(repoPath, "docs", "initiatives", "TEMPLATE", "prd.md"), "# PRD\n", "utf8");

  await assert.rejects(
    execFile(process.execPath, ["--import", tsxImportPath, scriptPath, "--slug", "payments-redesign"], {
      cwd: repoPath,
      encoding: "utf8",
    }),
    /Missing required initiative template/,
  );
});
