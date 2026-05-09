import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const scriptPath = join(repoRoot, "scripts", "harness-orchestrate.ts");
const operatorPath = join(repoRoot, "scripts", "harness-operator.ts");

async function makeRepo(prefix: string): Promise<string> {
  const repoPath = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(repoPath, "scripts"), { recursive: true });
  await writeFile(
    join(repoPath, "scripts", "fake-afk.mjs"),
    "console.log(JSON.stringify({ mode: 'run', runId: 'afk-test', startedQueueJobs: ['afk-greenfield-scaffold-issue-001'], lastAction: 'stopReason=max_steps' }));\n",
    "utf8",
  );
  await writeFile(
    join(repoPath, "scripts", "fake-worker.mjs"),
    "console.log(JSON.stringify({ status: 'review_ready', runId: 'worker-test', queueJobId: 'afk-greenfield-scaffold-issue-001', prBoundary: { allowPrCreate: true, prCreated: false } }));\n",
    "utf8",
  );
  await writeFile(
    join(repoPath, "scripts", "fake-pr.mjs"),
    `const command = process.argv[2];
const base = { runId: 'pr-worker-test', pr: { url: 'https://github.com/acme/repo/pull/7', number: 7 } };
if (command === 'create') console.log(JSON.stringify({ ...base, status: 'pr_created' }));
else if (command === 'gate') console.log(JSON.stringify({ ...base, status: 'gate_passed', pr: { ...base.pr, gateStatus: 'passed' } }));
else if (command === 'merge-ready') console.log(JSON.stringify({ ...base, status: 'gate_passed', lifecycle: { mergeReady: true } }));
else if (command === 'merge') console.log(JSON.stringify({ ...base, status: 'merged', merge: { mergeCommit: 'abc123' } }));
else if (command === 'sync-main') console.log(JSON.stringify({ ...base, status: 'synced', merge: { syncedMainSha: 'def456' } }));
else { console.error('unexpected pr command: ' + command); process.exit(1); }
`,
    "utf8",
  );
  await writeFile(
    join(repoPath, "package.json"),
    `${JSON.stringify(
      {
        scripts: {
          "harness:afk-orchestrate": "node scripts/fake-afk.mjs",
          "harness:worker-execute": "node scripts/fake-worker.mjs",
          "harness:pr-lifecycle": "node scripts/fake-pr.mjs",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return repoPath;
}

async function writeAutoLandPolicy(repoPath: string): Promise<void> {
  const policyDir = join(repoPath, ".pi", "agent", "routing");
  await mkdir(policyDir, { recursive: true });
  await writeFile(join(policyDir, "orchestrator-auto-land-policy.json"), `${JSON.stringify({
    version: 1,
    enabled: true,
    lanes: ["worker_job"],
    approvalRef: "policy-approval-123",
    syncMain: true,
    mergeMethod: "squash",
  }, null, 2)}\n`, "utf8");
}

async function snapshotFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(relativeDir: string): Promise<void> {
    const entries = await readdir(join(root, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      const rel = join(relativeDir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) await walk(rel);
      else result.push(rel);
    }
  }
  await walk("");
  return result.sort();
}

async function runCli(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, TSX_IMPORT_PATH: tsxImportPath, HARNESS_TSX_IMPORT: tsxImportPath },
  });
}

async function runOperator(cwd: string, args: string[]) {
  return execFile(process.execPath, ["--import", tsxImportPath, operatorPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, TSX_IMPORT_PATH: tsxImportPath, HARNESS_TSX_IMPORT: tsxImportPath },
  });
}

test("harness-orchestrate run delegates queue-level lane and writes no orchestrator files", async () => {
  const cwd = await makeRepo("harness-orchestrate-run-");
  const before = await snapshotFiles(cwd);

  const result = await runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--max-steps", "3", "--max-runtime-seconds", "300", "--json"]);
  const after = await snapshotFiles(cwd);
  const json = JSON.parse(result.stdout) as { mode: string; selectedLane: string; delegatedCommand: string; status: string; merge: { attempted: boolean } };

  assert.equal(json.mode, "run");
  assert.equal(json.selectedLane, "queue_level");
  assert.match(json.delegatedCommand, /harness:afk-orchestrate/);
  assert.equal(json.status, "stopped");
  assert.equal(json.merge.attempted, false);
  assert.deepEqual(after, before);
});

test("worker run approval boundary blocks before delegation without approval ref", async () => {
  const cwd = await makeRepo("harness-orchestrate-run-approval-");
  try {
    await runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-001", "--max-steps", "3", "--max-runtime-seconds", "300", "--allow-pr-create", "--json"]);
    assert.fail("expected missing approval ref to fail");
  } catch (error) {
    const failure = error as { stdout?: string };
    assert.match(failure.stdout ?? "", /approval-ref/);
  }

  const result = await runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-001", "--max-steps", "3", "--max-runtime-seconds", "300", "--allow-pr-create", "--approval-ref", "human-123", "--json"]);
  const json = JSON.parse(result.stdout) as { selectedLane: string; delegatedCommand: string; stopReason: string; merge: { attempted: boolean } };
  assert.equal(json.selectedLane, "worker_job");
  assert.match(json.delegatedCommand, /harness:worker-execute/);
  assert.equal(json.stopReason, "approval_boundary");
  assert.equal(json.merge.attempted, false);
});



test("CLI run auto-land chains worker PR lifecycle merge and sync with approval", async () => {
  const cwd = await makeRepo("orch-run-auto-land-");

  const result = await runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-001", "--max-steps", "3", "--max-runtime-seconds", "300", "--auto-land", "--approval-ref", "human-123", "--sync-main", "--json"]);
  const json = JSON.parse(result.stdout) as { status: string; pr: { created: boolean; url: string | null }; merge: { attempted: boolean; allowed: boolean }; autoLand?: { syncedMain: boolean; commands: string[] } };

  assert.equal(json.status, "completed");
  assert.equal(json.pr.created, true);
  assert.equal(json.pr.url, "https://github.com/acme/repo/pull/7");
  assert.equal(json.merge.attempted, true);
  assert.equal(json.merge.allowed, true);
  assert.equal(json.autoLand?.syncedMain, true);
  assert.equal(json.autoLand?.commands.length, 5);
});



test("CLI run uses default auto-land policy for eligible worker jobs", async () => {
  const cwd = await makeRepo("orch-run-policy-auto-land-");
  await writeAutoLandPolicy(cwd);

  const result = await runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-001", "--max-steps", "3", "--max-runtime-seconds", "300", "--json"]);
  const json = JSON.parse(result.stdout) as { status: string; autoLand?: { enabled: boolean; syncedMain: boolean; commands: string[] }; delegatedCommand: string };

  assert.equal(json.status, "completed");
  assert.equal(json.autoLand?.enabled, true);
  assert.equal(json.autoLand?.syncedMain, true);
  assert.match(json.delegatedCommand, /--no-stop-before-pr --allow-pr-create --approval-ref policy-approval-123/);
  assert.equal(json.autoLand?.commands.length, 5);
});

test("CLI run --no-auto-land disables default policy", async () => {
  const cwd = await makeRepo("orch-run-policy-disabled-");
  await writeAutoLandPolicy(cwd);

  const result = await runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--job-id", "afk-greenfield-scaffold-issue-001", "--max-steps", "3", "--max-runtime-seconds", "300", "--no-auto-land", "--json"]);
  const json = JSON.parse(result.stdout) as { status: string; autoLand?: unknown; delegatedCommand: string; stopReason: string };

  assert.equal(json.status, "stopped");
  assert.equal(json.autoLand, undefined);
  assert.match(json.delegatedCommand, /--stop-before-pr/);
  assert.equal(json.stopReason, "approval_boundary");
});

test("operator wrapper delegates orchestrate run", async () => {
  const cwd = await makeRepo("harness-operator-run-");

  const result = await runOperator(cwd, ["orchestrate", "run", "--initiative", "greenfield-scaffold", "--max-steps", "3", "--max-runtime-seconds", "300", "--json"]);
  const json = JSON.parse(result.stdout) as { selectedLane: string; delegatedCommand: string };

  assert.equal(json.selectedLane, "queue_level");
  assert.match(json.delegatedCommand, /harness:afk-orchestrate/);
});

test("run rejects missing bounded limits", async () => {
  const cwd = await makeRepo("harness-orchestrate-run-limits-");
  try {
    await runCli(cwd, ["run", "--initiative", "greenfield-scaffold", "--max-steps", "3", "--json"]);
    assert.fail("expected missing max runtime to fail");
  } catch (error) {
    const failure = error as { stdout?: string };
    assert.match(failure.stdout ?? "", /max-runtime-seconds/);
  }
});
