import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = join(repoRoot, "scripts", "harness-orchestrate.ts");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");

async function makeRepo(prefix: string): Promise<{ cwd: string; pathEnv: string }> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  const binDir = join(cwd, "bin");
  await mkdir(binDir, { recursive: true });
  const npmPath = join(binDir, "npm");
  await writeFile(
    npmPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const command = args.join(' ');
const dashIndex = args.indexOf('--');
const helperArgs = dashIndex === -1 ? [] : args.slice(dashIndex + 1);
const helperCommand = helperArgs[0];
const isAfkOrchestrate = args.includes('harness:afk-orchestrate');
const isWorkerExecute = args.includes('harness:worker-execute');
const getValue = (flag) => {
  const index = helperArgs.indexOf(flag);
  return index === -1 ? null : helperArgs[index + 1];
};
const initiative = getValue('--initiative');
const maxParallel = Number(getValue('--max-parallel') || '1');
if (isAfkOrchestrate && (helperCommand === 'dry-run' || helperCommand === 'apply')) {
  console.log(JSON.stringify({
    version: 1,
    runId: 'afk-' + helperCommand,
    initiativeId: initiative,
    mode: helperCommand === 'dry-run' ? 'dry_run' : 'apply',
    maxParallel,
    eligibleIssues: [{ issueId: 'issue-004', title: 'Issue 004', disposition: 'eligible', reasons: ['ready'], dependencies: ['issue-003'], queueJobId: 'afk-' + initiative + '-issue-004' }],
    blockedIssues: [],
    deferredIssues: [{ issueId: 'issue-005', title: 'Issue 005', disposition: 'deferred', reasons: ['Waiting on issue-004.'], dependencies: ['issue-004'] }],
    skippedIssues: [],
    doneIssues: [{ issueId: 'issue-001', title: 'Issue 001', disposition: 'done', reasons: ['done'], dependencies: [] }],
    parallelDecisions: [],
    materializedQueueJobs: [{
      id: 'afk-' + initiative + '-issue-004',
      title: 'Issue 004',
      status: 'queued',
      sourceIssueId: 'issue-004',
      sourceInitiativeId: initiative,
      taskClass: 'implementation',
      assignedTeam: 'build',
      assignedRole: 'backend_worker',
      acceptanceCriteria: ['pass'],
      domains: ['backend']
    }],
    startedQueueJobs: [],
    lastAction: helperCommand,
    nextOperatorAction: 'next',
    explainIssue: null
  }));
  process.exit(0);
}
if (isWorkerExecute) {
  const jobIdIndex = args.indexOf('--job-id');
  const jobId = jobIdIndex === -1 ? null : args[jobIdIndex + 1];
  console.log(JSON.stringify({
    runId: 'worker-001',
    status: 'review_ready',
    queueJobId: jobId,
    nextOperatorAction: 'Create and review the bounded PR before continuing.'
  }));
  process.exit(0);
}
console.error('unsupported npm invocation:', command);
process.exit(1);
`,
    "utf8",
  );
  await chmod(npmPath, 0o755);
  return { cwd, pathEnv: `${binDir}:${process.env.PATH ?? ""}` };
}

async function runCli(cwd: string, pathEnv: string, args: string[]) {
  return execFile("node", ["--import", tsxImportPath, scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PATH: pathEnv, TSX_IMPORT_PATH: tsxImportPath, HARNESS_TSX_IMPORT: tsxImportPath },
  });
}

test("harness-orchestrate continue materializes queue-only and delegates worker_job", async () => {
  const { cwd, pathEnv } = await makeRepo("harness-orchestrate-continue-");
  const result = await runCli(cwd, pathEnv, ["continue", "--initiative", "mixed-domain-harness-optimization", "--max-slices", "1", "--max-steps", "3", "--max-runtime-seconds", "300", "--json"]);
  const json = JSON.parse(result.stdout) as {
    mode: string;
    status: string;
    stopReason: string;
    selectedIssues: string[];
    selectedQueueJobIds: string[];
    delegatedCommands: string[];
    slices: Array<{ selectedIssueId: string; selectedQueueJobId: string; workerRun: { selectedLane: string; delegatedCommand: string } }>;
  };

  assert.equal(json.mode, "continue");
  assert.equal(json.status, "stopped");
  assert.equal(json.stopReason, "approval_boundary");
  assert.deepEqual(json.selectedIssues, ["issue-004"]);
  assert.deepEqual(json.selectedQueueJobIds, ["afk-mixed-domain-harness-optimization-issue-004"]);
  assert.equal(json.slices[0].selectedIssueId, "issue-004");
  assert.equal(json.slices[0].selectedQueueJobId, "afk-mixed-domain-harness-optimization-issue-004");
  assert.equal(json.slices[0].workerRun.selectedLane, "worker_job");
  assert.match(json.delegatedCommands.join("\n"), /harness:afk-orchestrate -- apply --queue-only --initiative mixed-domain-harness-optimization --max-parallel 1 --json/);
  assert.match(json.slices[0].workerRun.delegatedCommand, /harness:worker-execute -- run --initiative mixed-domain-harness-optimization --job-id afk-mixed-domain-harness-optimization-issue-004/);
});
