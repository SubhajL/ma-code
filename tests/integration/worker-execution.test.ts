import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);

function resolveNodeImportSpecifier(specifier: string): string {
  try {
    const resolved = import.meta.resolve(specifier);
    return resolved.startsWith("file:") ? fileURLToPath(resolved) : resolved;
  } catch {
    return specifier;
  }
}

function resolvedTsxImport(): string {
  if (process.env.TSX_IMPORT_PATH) return resolveNodeImportSpecifier(process.env.TSX_IMPORT_PATH);
  const repoLocalTsx = join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
  const resolved = resolveNodeImportSpecifier("tsx");
  return resolved === "tsx" ? repoLocalTsx : resolved;
}

const tsxImport = resolvedTsxImport();

async function git(cwd: string, args: string[]): Promise<void> {
  await execFile("git", args, { cwd });
}

async function writeFixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "worker-execution-cli-"));
  await mkdir(join(cwd, "docs", "initiatives", "greenfield-scaffold", "slices"), { recursive: true });
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  await writeFile(join(cwd, "README.md"), "fixture\n", "utf8");
  const issue = {
    issueId: "issue-002",
    title: "Docs issue",
    type: "AFK",
    status: "planned",
    dependencies: [],
    acceptanceCriteria: ["docs updated"],
    validationProof: ["node -e \"process.exit(0)\""],
    domains: ["docs"],
    filesToModify: ["docs/initiatives/greenfield-scaffold/notes.md"],
    allowedPaths: ["docs/initiatives/greenfield-scaffold"],
    hitlGates: [],
    approvalRequired: false,
  };
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/issues.json"), `${JSON.stringify({ version: 1, initiativeId: "greenfield-scaffold", issues: [issue] }, null, 2)}\n`, "utf8");
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/slice-plan.json"), "{\"version\":1}\n", "utf8");
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/pipeline.json"), "{\"version\":1}\n", "utf8");
  await writeFile(join(cwd, "docs/initiatives/greenfield-scaffold/slices/issue-002.summary.json"), "{\"version\":1}\n", "utf8");
  await writeFile(join(cwd, ".pi/agent/state/runtime/queue.json"), `${JSON.stringify({ version: 1, paused: false, activeJobId: null, jobs: [{
    id: "afk-greenfield-scaffold-issue-002",
    goal: "Update docs",
    priority: "medium",
    status: "queued",
    team: "build",
    approvalRequired: false,
    acceptanceCriteria: ["docs updated"],
    taskClass: "implementation",
    workType: "implementation",
    domains: ["docs"],
    allowedPaths: ["docs/initiatives/greenfield-scaffold"],
    assignedRole: "docs_worker",
    implementationCommand: "node -e \"require('fs').writeFileSync('docs/initiatives/greenfield-scaffold/notes.md','phase-c-proof\\n')\"",
    queueJobSource: { kind: "issue-materialization", initiativeId: "greenfield-scaffold", issueId: "issue-002" }
  }] }, null, 2)}\n`, "utf8");
  await git(cwd, ["init", "-b", "main"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "fixture"]);
  await git(cwd, ["checkout", "-b", "task/worker-cli-fixture"]);
  return cwd;
}

async function runCli(cwd: string, args: string[]) {
  return execFile("node", ["--import", tsxImport, join(repoRoot, "scripts", "harness-worker-execute.ts"), ...args], { cwd });
}

test("CLI dry-run/status/explain-run and run enforce Phase C boundaries", async () => {
  const cwd = await writeFixture();

  const dry = JSON.parse((await runCli(cwd, ["dry-run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-002", "--json"])).stdout);
  assert.equal(dry.status, "planned");
  assert.equal(dry.prBoundary.stopBeforePr, true);

  await assert.rejects(runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--max-steps", "1", "--max-runtime-seconds", "5"]), /requires --job-id/);
  await assert.rejects(runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-002"]), /require --max-steps and --max-runtime-seconds/);
  await assert.rejects(runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-002", "--max-steps", "1", "--max-runtime-seconds", "5", "--allow-pr-create"]), /requires --approval-ref/);
  await assert.rejects(runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-002", "--max-steps", "4", "--max-runtime-seconds", "5", "--no-stop-before-pr"]), /requires --allow-pr-create and --approval-ref/);

  const run = JSON.parse((await runCli(cwd, [
    "run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-002", "--run-id", "worker-cli",
    "--base-ref", "main", "--max-steps", "4", "--max-runtime-seconds", "10",
    "--validation-command", "node -e \"process.exit(0)\"", "--json",
  ])).stdout);
  assert.equal(run.status, "review_ready");
  assert.equal(run.prBoundary.prCreated, false);

  const status = JSON.parse((await runCli(cwd, ["status", "--initiative", "greenfield-scaffold", "--run-id", "worker-cli", "--json"])).stdout);
  assert.equal(status.runId, "worker-cli");
  const explained = JSON.parse((await runCli(cwd, ["explain-run", "--initiative", "greenfield-scaffold", "--run-id", "worker-cli", "--json"])).stdout);
  assert.match(explained.nextOperatorAction, /Explain worker-cli/);
  assert.equal(JSON.parse(await readFile(join(cwd, "docs/initiatives/greenfield-scaffold/worker-runs/worker-cli.json"), "utf8")).status, "review_ready");
});
