import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const CHECKER = resolve("scripts/check-no-frontier-literals.sh");

function runChecker(root: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("bash", [CHECKER, "--root", root], { encoding: "utf8" });
  return {
    code: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function makeFile(root: string, relPath: string, content: string): Promise<void> {
  const full = join(root, relPath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content);
}

async function newTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "frontier-literal-check-"));
}

test("flags a provider-qualified frontier literal in a non-allowed source file", async () => {
  const root = await newTempRoot();
  await makeFile(root, ".pi/agent/extensions/rogue.ts", `export const model = "openai-codex/gpt-5.5";\n`);
  const result = runChecker(root);
  assert.equal(result.code, 1, `expected non-zero exit, got ${result.code}. stderr: ${result.stderr}`);
  assert.match(result.stderr, /rogue\.ts/);
  assert.match(result.stderr, /gpt-5\.5/);
});

test("flags a quoted bare frontier literal in a non-allowed source file", async () => {
  const root = await newTempRoot();
  await makeFile(root, "scripts/rogue-tool.ts", `const id = "claude-opus-4-7";\n`);
  const result = runChecker(root);
  assert.equal(result.code, 1, `expected non-zero exit, got ${result.code}. stderr: ${result.stderr}`);
  assert.match(result.stderr, /rogue-tool\.ts/);
});

test("does not flag literals inside .pi/agent/models.json (the source of truth)", async () => {
  const root = await newTempRoot();
  await makeFile(root, ".pi/agent/models.json", `{ "default": "openai-codex/gpt-5.5", "alt": "anthropic/claude-opus-4-7" }\n`);
  const result = runChecker(root);
  assert.equal(result.code, 0, `expected pass, got ${result.code}. stderr: ${result.stderr}`);
});

test("does not flag literals inside scripts/validate-harness-routing.sh (fixture by design)", async () => {
  const root = await newTempRoot();
  await makeFile(root, "scripts/validate-harness-routing.sh", `expected: { selectedModelId: "openai-codex/gpt-5.5" }\n`);
  const result = runChecker(root);
  assert.equal(result.code, 0, `expected pass, got ${result.code}. stderr: ${result.stderr}`);
});

test("does not flag literals inside tests/ tree (regression fixtures)", async () => {
  const root = await newTempRoot();
  await makeFile(root, "tests/extension-units/some.test.ts", `assert.equal(model, "anthropic/claude-sonnet-4-6");\n`);
  const result = runChecker(root);
  assert.equal(result.code, 0, `expected pass, got ${result.code}. stderr: ${result.stderr}`);
});

test("does not flag literals inside coding-logs/ or logs/ history", async () => {
  const root = await newTempRoot();
  await makeFile(root, "coding-logs/2026-01-01-old.md", `We used openai-codex/gpt-5.5 here.\n`);
  await makeFile(root, "logs/coding/old.md", `Then we switched to anthropic/claude-opus-4-7.\n`);
  const result = runChecker(root);
  assert.equal(result.code, 0, `expected pass, got ${result.code}. stderr: ${result.stderr}`);
});

test("does not match capability name strings that contain no model literal", async () => {
  const root = await newTempRoot();
  await makeFile(root, ".pi/agent/extensions/some.ts", `const cap = "routing_reasoning_first"; const other = "strong_reasoning";\n`);
  const result = runChecker(root);
  assert.equal(result.code, 0, `expected pass, got ${result.code}. stderr: ${result.stderr}`);
});

test("the live repo currently has zero unallowed frontier literals", () => {
  const result = runChecker(process.cwd());
  assert.equal(result.code, 0, `expected live repo to pass, got ${result.code}. stderr:\n${result.stderr}`);
});
