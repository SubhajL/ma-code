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
  await mkdir(join(repoPath, "docs", "initiatives", "checkout", "stitch-prompts"), { recursive: true });
  await mkdir(join(repoPath, "docs", "initiatives", "checkout", "screen-artifacts"), { recursive: true });
  await mkdir(join(repoPath, "docs", "initiatives", "checkout", "afk-runs"), { recursive: true });
  const helperPath = join(repoPath, "fake-helper.mjs");
  await writeFile(
    helperPath,
    `import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const [script, ...args] = process.argv.slice(2);
await writeFile('helper-call.json', JSON.stringify({ script, args }, null, 2));
let createdFiles = [];
if (script === 'harness:stitch-prompt') {
  const bad = args.includes('--bad-write');
  createdFiles = bad ? ['src/app.ts'] : ['docs/initiatives/checkout/stitch-prompts/slice-001.prompt.md'];
} else if (script === 'harness:screen-approval') {
  createdFiles = ['docs/initiatives/checkout/screen-artifacts/slice-001.approval.json'];
} else if (script === 'harness:afk-orchestrate') {
  createdFiles = ['docs/initiatives/checkout/afk-runs/run-001.json'];
} else {
  createdFiles = ['docs/initiatives/checkout/intake.json'];
}
for (const file of createdFiles) {
  await mkdir(dirname(join(process.cwd(), file)), { recursive: true });
  await writeFile(join(process.cwd(), file), 'created by fake helper\\n');
}
process.stdout.write(JSON.stringify({ mode: 'apply', status: 'ok', runId: 'run-001', createdFiles }) + '\\n');
`,
    "utf8",
  );
  await writeFile(
    join(repoPath, "package.json"),
    `${JSON.stringify(
      {
        scripts: {
          "harness:product-intake": `node ${helperPath} harness:product-intake`,
          "harness:issue-materialize": `node ${helperPath} harness:issue-materialize`,
          "harness:product-pipeline": `node ${helperPath} harness:product-pipeline`,
          "harness:stitch-prompt": `node ${helperPath} harness:stitch-prompt`,
          "harness:stitch-artifact": `node ${helperPath} harness:stitch-artifact`,
          "harness:screen-approval": `node ${helperPath} harness:screen-approval`,
          "harness:slice-contract": `node ${helperPath} harness:slice-contract`,
          "harness:fe-packet": `node ${helperPath} harness:fe-packet`,
          "harness:be-packet": `node ${helperPath} harness:be-packet`,
          "harness:afk-orchestrate": `node ${helperPath} harness:afk-orchestrate`,
          "harness:worker-execute": `node ${helperPath} harness:worker-execute`,
          "harness:pr-lifecycle": `node ${helperPath} harness:pr-lifecycle`,
          "harness:merge": `node ${helperPath} harness:merge`,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return repoPath;
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

test("harness-orchestrate apply delegates stitch_prompt and reports only allowlisted writes", async () => {
  const cwd = await makeRepo("harness-orchestrate-apply-");

  const result = await runCli(cwd, ["apply", "--path", "stitch_prompt", "--initiative", "checkout", "--slice", "slice-001", "--json"]);
  const json = JSON.parse(result.stdout) as { mode: string; selectedPath: string; status: string; delegatedCommand: string; createdFiles: string[]; allowedWritePaths: string[] };

  assert.equal(json.mode, "apply");
  assert.equal(json.selectedPath, "stitch_prompt");
  assert.equal(json.status, "materialized");
  assert.equal(json.delegatedCommand, "npm run harness:stitch-prompt -- --initiative checkout --slice slice-001 --apply --json");
  assert.deepEqual(json.createdFiles, ["docs/initiatives/checkout/stitch-prompts/slice-001.prompt.md"]);
  assert.deepEqual(json.allowedWritePaths, ["docs/initiatives/checkout/stitch-prompts/slice-001.*"]);

  const after = await snapshotFiles(cwd);
  assert.ok(after.includes("docs/initiatives/checkout/stitch-prompts/slice-001.prompt.md"));
  assert.equal(after.some((file) => file.startsWith("src/")), false);
});

test("operator wrapper delegates orchestrate apply", async () => {
  const cwd = await makeRepo("harness-operator-apply-");
  const result = await runOperator(cwd, ["orchestrate", "apply", "--path", "screen_approval", "--action", "approve", "--initiative", "checkout", "--slice", "slice-001", "--approval-ref", "human-1", "--by", "reviewer", "--note", "approved", "--json"]);
  const json = JSON.parse(result.stdout) as { selectedPath: string; status: string; approvalRef: string; createdFiles: string[] };

  assert.equal(json.selectedPath, "screen_approval");
  assert.equal(json.status, "materialized");
  assert.equal(json.approvalRef, "human-1");
  assert.deepEqual(json.createdFiles, ["docs/initiatives/checkout/screen-artifacts/slice-001.approval.json"]);
});

test("apply rejects unsupported unsafe verbs before helper execution", async () => {
  const cwd = await makeRepo("harness-orchestrate-apply-unsafe-");
  for (const command of ["create", "merge", "sync-main", "git"]) {
    await assert.rejects(runCli(cwd, [command, "--path", "stitch_prompt", "--initiative", "checkout", "--slice", "slice-001", "--json"]), /not supported|raw git|Unknown or unsupported command/);
  }
});

test("AFK queue materialization uses apply --queue-only and no worker run command", async () => {
  const cwd = await makeRepo("harness-orchestrate-apply-afk-");
  const result = await runCli(cwd, ["apply", "--path", "afk_queue_materialization", "--initiative", "checkout", "--json"]);
  const json = JSON.parse(result.stdout) as { delegatedCommand: string; createdFiles: string[] };

  assert.equal(json.delegatedCommand, "npm run harness:afk-orchestrate -- apply --queue-only --initiative checkout --json");
  assert.deepEqual(json.createdFiles, ["docs/initiatives/checkout/afk-runs/run-001.json"]);
  assert.doesNotMatch(json.delegatedCommand, /worker-execute|pr-lifecycle|harness:merge/);
});
