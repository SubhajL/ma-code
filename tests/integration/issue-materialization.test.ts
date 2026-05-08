import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-issue-materialize.ts");

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function makeIssue(index: number) {
  const issueId = `issue-${String(index).padStart(3, "0")}`;
  return {
    issueId,
    title: `Greenfield scaffold slice ${index}`,
    type: index === 1 || index === 5 ? "HITL" : "AFK",
    status: "planned",
    dependencies: index === 2 || index === 3 ? ["issue-001"] : index === 4 ? ["issue-002", "issue-003"] : [],
    userStoriesCovered: [`story-${index}`],
    whatToBuild: `Build slice ${index}.`,
    acceptanceCriteria: [`slice ${index} acceptance`],
    validationProof: index === 1 || index === 5 ? [] : [`slice ${index} validation`],
    domains: ["backend"],
    filesToModify: [`app/greenfield/slice-${String(index).padStart(3, "0")}.ts`],
    allowedPaths: [`app/greenfield/slice-${String(index).padStart(3, "0")}`],
    schemaPaths: [],
    migrationPaths: [],
    configPaths: [],
    testPaths: [`tests/greenfield/slice-${String(index).padStart(3, "0")}.test.ts`],
    fixturePaths: [],
    hitlGates: index === 1 || index === 5 ? ["human approval"] : [],
    queueReadiness: "not_ready",
  };
}

async function makeRepo(prefix: string, options: { approved?: boolean } = {}): Promise<{ cwd: string; sourcePath: string }> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(cwd, "inputs"), { recursive: true });
  const sourcePath = join(cwd, "inputs", "approved-g-issues.json");
  await writeFile(sourcePath, `${JSON.stringify({
    version: 1,
    initiativeId: "greenfield-scaffold",
    source: {
      kind: "g-issues",
      capturedAt: "2026-05-09T00:00:00.000Z",
      approvedBy: options.approved === false ? "" : "integration-approver",
      approvalRef: options.approved === false ? "" : "approval://integration-test",
    },
    issues: Array.from({ length: 18 }, (_, offset) => makeIssue(offset + 1)),
  }, null, 2)}\n`, "utf8");
  return { cwd, sourcePath };
}

async function run(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], { cwd, encoding: "utf8" });
}

test("harness-issue-materialize dry-run validates source and writes nothing", async () => {
  const { cwd, sourcePath } = await makeRepo("issue-materialize-cli-dry-run-");

  const result = await run(cwd, ["dry-run", "--source", sourcePath, "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "dry_run");
  assert.equal(json.initiativeId, "greenfield-scaffold");
  assert.equal(json.issueCount, 18);
  assert.equal(json.writtenArtifacts.length, 0);
  assert.ok(json.plannedArtifacts.includes("docs/initiatives/greenfield-scaffold/issues.json"));
  assert.equal(await exists(join(cwd, "docs")), false);
});

test("harness-issue-materialize apply writes artifact set and report only under initiative directory", async () => {
  const { cwd, sourcePath } = await makeRepo("issue-materialize-cli-apply-");

  const result = await run(cwd, ["apply", "--source", sourcePath, "--json"]);
  const json = JSON.parse(result.stdout);

  assert.equal(json.mode, "apply");
  assert.equal(json.issueCount, 18);
  assert.ok(json.writtenArtifacts.every((artifact: string) => artifact.startsWith("docs/initiatives/greenfield-scaffold/")));
  assert.equal(JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/issues.json"), "utf8")).issues[3].dependencies.join(","), "issue-002,issue-003");
  assert.equal((await readdir(join(cwd, "docs/initiatives/greenfield-scaffold/materialization-runs"))).length, 2);
  assert.equal(await exists(join(cwd, ".pi", "agent", "state", "runtime", "queue.json")), false);
});

test("harness-issue-materialize apply requires approval metadata and explicit overwrite", async () => {
  const missingApproval = await makeRepo("issue-materialize-cli-approval-", { approved: false });
  await assert.rejects(run(missingApproval.cwd, ["apply", "--source", missingApproval.sourcePath, "--json"]), /approvedBy and approvalRef are required/);

  const { cwd, sourcePath } = await makeRepo("issue-materialize-cli-overwrite-");
  await run(cwd, ["apply", "--source", sourcePath, "--json"]);
  await assert.rejects(run(cwd, ["apply", "--source", sourcePath, "--json"]), /Refusing to overwrite existing initiative artifacts/);
  const overwritten = await run(cwd, ["apply", "--source", sourcePath, "--overwrite", "--json"]);
  assert.equal(JSON.parse(overwritten.stdout).mode, "apply");
});

test("harness operator delegates issue-materialize subcommand", async () => {
  const { cwd, sourcePath } = await makeRepo("issue-materialize-operator-");
  const operatorPath = join(repoRoot, "scripts", "harness-operator.ts");

  const result = await execFile(process.execPath, ["--import", tsxImportPath, operatorPath, "issue-materialize", "dry-run", "--source", sourcePath, "--json"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARNESS_TSX_IMPORT: tsxImportPath },
  });
  const json = JSON.parse(result.stdout);

  assert.equal(json.initiativeId, "greenfield-scaffold");
  assert.equal(json.mode, "dry_run");
});

test("queue-ready mode is explicitly deferred to Phase B", async () => {
  const { cwd, sourcePath } = await makeRepo("issue-materialize-queue-ready-");

  await assert.rejects(run(cwd, ["queue-ready", "--source", sourcePath, "--json"]), /queue-ready conversion belongs to Phase B/);
});
